import type { FilterRequest, LogEntry, ParserRequest, StoreRequest, WorkerResponse } from './types/app';
import { filterLogIndices, normalizeLog } from './utils/app';

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
  return filterLogIndices(storedLogs, filters);
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
