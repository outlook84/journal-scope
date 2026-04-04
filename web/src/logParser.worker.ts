import type { FilterRequest, LogEntry, ParserRequest, StoreRequest, WorkerResponse } from './types/app';
import { normalizeLog } from './utils/app';

type WorkerRequest =
  | ({ id: number } & ParserRequest)
  | ({ id: number } & FilterRequest)
  | ({ id: number } & StoreRequest);

const ctx: Worker = self as unknown as Worker;
let storedLogs: LogEntry[] = [];

function parseJsonLines(text: string) {
  const logs: LogEntry[] = [];
  const lines = text.split('\n');

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      logs.push(normalizeLog(JSON.parse(line)));
    } catch {
      // Ignore malformed lines from the stream.
    }
  }

  return logs;
}

function parseSseEvents(events: string[]) {
  const logs: LogEntry[] = [];

  for (const event of events) {
    const dataMatch = event.match(/^data:\s*(.+)$/m);
    if (!dataMatch || !dataMatch[1]) continue;
    try {
      logs.push(normalizeLog(JSON.parse(dataMatch[1])));
    } catch {
      // Ignore malformed events from the stream.
    }
  }

  return logs;
}

function trimStoredLogs(entries: LogEntry[], maxLogs?: number) {
  if (!maxLogs || maxLogs <= 0) return entries;
  return entries.length > maxLogs ? entries.slice(0, maxLogs) : entries;
}

function applyStoreUpdate(logs: LogEntry[], mode: StoreRequest['mode'], maxLogs?: number) {
  if (mode === 'replace') {
    storedLogs = trimStoredLogs(logs.slice(), maxLogs);
    return;
  }

  if (mode === 'prepend') {
    storedLogs = trimStoredLogs([...logs, ...storedLogs], maxLogs);
    return;
  }

  storedLogs = trimStoredLogs([...storedLogs, ...logs], maxLogs);
}

function filterLogs(filters: FilterRequest['filters']) {
  const query = filters.query.toLowerCase();
  const result: number[] = [];
  const expressionGroups = filters.expressionFilters.reduce<Record<string, Set<string>>>((groups, filter) => {
    (groups[filter.field] ??= new Set()).add(filter.value);
    return groups;
  }, {});

  for (let index = 0; index < storedLogs.length; index++) {
    const log = storedLogs[index];
    if (filters.priorityFilter !== 'all' && String(log.PRIORITY) !== filters.priorityFilter) continue;
    if (filters.unitFilter !== 'all' && log._SYSTEMD_UNIT !== filters.unitFilter) continue;
    if (filters.syslogFilter !== 'all' && log.SYSLOG_IDENTIFIER !== filters.syslogFilter) continue;
    if (filters.hostnameFilter !== 'all' && String(log._HOSTNAME || '') !== filters.hostnameFilter) continue;
    if (filters.bootIdFilter !== 'all' && String(log._BOOT_ID || '') !== filters.bootIdFilter) continue;
    if (filters.commFilter !== 'all' && String(log._COMM || '') !== filters.commFilter) continue;
    if (filters.transportFilter !== 'all' && String(log._TRANSPORT || '') !== filters.transportFilter) continue;
    if (filters.pidFilter !== '' && String(log._PID || '') !== filters.pidFilter) continue;
    if (filters.uidFilter !== '' && String(log._UID || '') !== filters.uidFilter) continue;
    if (filters.gidFilter !== '' && String(log._GID || '') !== filters.gidFilter) continue;
    let matchesExpressionGroups = true;
    for (const field in expressionGroups) {
      if (!expressionGroups[field].has(String(log[field] ?? '').trim())) {
        matchesExpressionGroups = false;
        break;
      }
    }
    if (!matchesExpressionGroups) continue;

    if (query && !log._s?.includes(query)) continue;

    result.push(index);
  }

  if (filters.sortOrder === 'asc') {
    result.reverse();
  }

  return result;
}

ctx.onmessage = (message: MessageEvent<WorkerRequest>) => {
  const request = message.data;
  const response: WorkerResponse =
    request.kind === 'json-lines'
      ? (() => {
          const logs = parseJsonLines(request.text);
          return { id: request.id, logs };
        })()
      : request.kind === 'sse-events'
        ? (() => {
            const logs = parseSseEvents(request.events);
            return { id: request.id, logs };
          })()
        : request.kind === 'store-logs'
          ? (() => {
              applyStoreUpdate(request.logs, request.mode, request.maxLogs);
              return { id: request.id };
            })()
          : { id: request.id, indices: filterLogs(request.filters) };

  ctx.postMessage(response);
};
