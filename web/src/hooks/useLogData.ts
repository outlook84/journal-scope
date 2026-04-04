import { startTransition, useCallback, useEffect, useRef, useState } from 'react';

import { CLIENT_WINDOW_CAP, FIELD_VALUE_ENDPOINTS, MAX_QUERY_LIMIT } from '../constants/app';
import type { SupportedLocale } from '../i18n-context';
import { getMessages } from '../i18n-context';
import type {
  BootSummary,
  FilterRequest,
  LogEntry,
  ParserRequest,
  PreloadFieldName,
  QueryConfig,
  SelectOption,
  StoreRequest,
  WorkerResponse
} from '../types/app';
import { formatBootIdOption, getNowEndTimeInput, normalizeLog, parseFieldValues, toUnixSeconds } from '../utils/app';

type LogFilters = {
  priorityFilter: string;
  unitFilter: string;
  syslogFilter: string;
  hostnameFilter: string;
  bootIdFilter: string;
  commFilter: string;
  transportFilter: string;
  pidFilter: string;
  uidFilter: string;
  gidFilter: string;
  expressionFilters: Array<{ field: string; value: string }>;
  debouncedSearchQuery: string;
  sortOrder: 'desc' | 'asc';
  queryLimit: number;
  endTimeInput: string;
  isPinnedToNow: boolean;
};

type UseLogDataOptions = {
  apiFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  apiUrl: string;
  authState: string;
  filters: LogFilters;
  hasCleared: boolean;
  isLiveTailing: boolean;
  locale: SupportedLocale;
  onClearExternalState: () => void;
  onSetLastError: (message: string | null) => void;
};

const FAILED_CONNECT_COOLDOWN_MS = 1500;

export function useLogData({
  apiFetch,
  apiUrl,
  authState,
  filters,
  hasCleared,
  isLiveTailing,
  locale,
  onClearExternalState,
  onSetLastError
}: UseLogDataOptions) {
  const copy = getMessages(locale);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filteredLogIndices, setFilteredLogIndices] = useState<number[] | null>(null);
  const [isFiltering, setIsFiltering] = useState(false);
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [windowTruncated, setWindowTruncated] = useState(false);
  const [knownUnits, setKnownUnits] = useState<string[]>([]);
  const [knownSyslogs, setKnownSyslogs] = useState<string[]>([]);
  const [knownHostnames, setKnownHostnames] = useState<string[]>([]);
  const [knownBootIds, setKnownBootIds] = useState<SelectOption[]>([]);
  const [knownComms, setKnownComms] = useState<string[]>([]);
  const [knownTransports, setKnownTransports] = useState<string[]>([]);

  const abortControllerRef = useRef<AbortController | null>(null);
  const lastCursorRef = useRef<string | null>(null);
  const activeQueryRef = useRef<QueryConfig | null>(null);
  const activeQueryKeyRef = useRef<string | null>(null);
  const logsRef = useRef<LogEntry[]>([]);
  const parserWorkerRef = useRef<Worker | null>(null);
  const parserRequestIdRef = useRef(0);
  const parserResolversRef = useRef(new Map<number, (result: WorkerResponse) => void>());
  const filterJobIdRef = useRef(0);
  const knownUnitsRef = useRef<Set<string>>(new Set());
  const knownSyslogsRef = useRef<Set<string>>(new Set());
  const knownHostnamesRef = useRef<Set<string>>(new Set());
  const knownBootIdsRef = useRef<Map<string, SelectOption>>(new Map());
  const knownCommsRef = useRef<Set<string>>(new Set());
  const knownTransportsRef = useRef<Set<string>>(new Set());
  const isLiveTailingRef = useRef(isLiveTailing);
  const statusRef = useRef<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const clearExternalStateRef = useRef(onClearExternalState);
  const setLastErrorRef = useRef(onSetLastError);
  const lastFailedConnectRef = useRef<{ key: string; at: number } | null>(null);

  useEffect(() => {
    const worker = new Worker(new URL('../logParser.worker.ts', import.meta.url), { type: 'module' });
    const resolvers = parserResolversRef.current;
    parserWorkerRef.current = worker;

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const { id } = event.data;
      const resolve = resolvers.get(id);
      if (!resolve) return;
      resolvers.delete(id);
      resolve(event.data);
    };

    return () => {
      worker.terminate();
      parserWorkerRef.current = null;
      resolvers.clear();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  useEffect(() => {
    logsRef.current = logs;
  }, [logs]);

  useEffect(() => {
    isLiveTailingRef.current = isLiveTailing;
  }, [isLiveTailing]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    clearExternalStateRef.current = onClearExternalState;
  }, [onClearExternalState]);

  useEffect(() => {
    setLastErrorRef.current = onSetLastError;
  }, [onSetLastError]);

  const updateKnownTags = useCallback((logsChunk: LogEntry[]) => {
    let changedUnit = false;
    let changedSyslog = false;
    let changedHostname = false;
    let changedBootId = false;
    let changedComm = false;
    let changedTransport = false;

    logsChunk.forEach((log) => {
      if (log._SYSTEMD_UNIT && !knownUnitsRef.current.has(log._SYSTEMD_UNIT)) {
        knownUnitsRef.current.add(log._SYSTEMD_UNIT);
        changedUnit = true;
      }
      if (log.SYSLOG_IDENTIFIER && !knownSyslogsRef.current.has(log.SYSLOG_IDENTIFIER)) {
        knownSyslogsRef.current.add(log.SYSLOG_IDENTIFIER);
        changedSyslog = true;
      }
      if (log._HOSTNAME && !knownHostnamesRef.current.has(log._HOSTNAME)) {
        knownHostnamesRef.current.add(log._HOSTNAME);
        changedHostname = true;
      }
      if (log._BOOT_ID && !knownBootIdsRef.current.has(log._BOOT_ID)) {
        knownBootIdsRef.current.set(log._BOOT_ID, { value: log._BOOT_ID, label: log._BOOT_ID });
        changedBootId = true;
      }
      if (log._COMM && !knownCommsRef.current.has(log._COMM)) {
        knownCommsRef.current.add(log._COMM);
        changedComm = true;
      }
      if (log._TRANSPORT && !knownTransportsRef.current.has(log._TRANSPORT)) {
        knownTransportsRef.current.add(log._TRANSPORT);
        changedTransport = true;
      }
    });

    if (changedUnit) setKnownUnits(Array.from(knownUnitsRef.current).sort());
    if (changedSyslog) setKnownSyslogs(Array.from(knownSyslogsRef.current).sort());
    if (changedHostname) setKnownHostnames(Array.from(knownHostnamesRef.current).sort());
    if (changedBootId) setKnownBootIds(Array.from(knownBootIdsRef.current.values()).sort((a, b) => a.value.localeCompare(b.value)));
    if (changedComm) setKnownComms(Array.from(knownCommsRef.current).sort());
    if (changedTransport) setKnownTransports(Array.from(knownTransportsRef.current).sort());
  }, []);

  const requestWorkerLogs = useCallback((request: ParserRequest | FilterRequest | StoreRequest) => {
    const worker = parserWorkerRef.current;
    if (!worker) {
      const currentLogs = logsRef.current;
      return Promise.resolve<WorkerResponse>(
        request.kind === 'json-lines'
          ? {
            id: -1,
            logs: request.text
              .split('\n')
              .filter((line) => line.trim() !== '')
              .map((line) => {
                try {
                  return normalizeLog(JSON.parse(line));
                } catch {
                  return null;
                }
              })
              .filter(Boolean)
          }
          : request.kind === 'sse-events'
            ? {
              id: -1,
              logs: request.events
                .map((event) => {
                  const dataMatch = event.match(/^data:\s*(.+)$/m);
                  if (!dataMatch || !dataMatch[1]) return null;
                  try {
                    return normalizeLog(JSON.parse(dataMatch[1]));
                  } catch {
                    return null;
                  }
                })
                .filter(Boolean)
            }
            : request.kind === 'store-logs'
              ? { id: -1 }
              : {
                id: -1,
                indices: (() => {
                  const query = request.filters.query.toLowerCase();
                  const result: number[] = [];
                  const expressionGroups = request.filters.expressionFilters.reduce<Record<string, Set<string>>>((groups, filter) => {
                    (groups[filter.field] ??= new Set()).add(filter.value);
                    return groups;
                  }, {});

                  for (let index = 0; index < currentLogs.length; index++) {
                    const log = currentLogs[index];
                    if (request.filters.priorityFilter !== 'all' && String(log.PRIORITY) !== request.filters.priorityFilter) continue;
                    if (request.filters.unitFilter !== 'all' && log._SYSTEMD_UNIT !== request.filters.unitFilter) continue;
                    if (request.filters.syslogFilter !== 'all' && log.SYSLOG_IDENTIFIER !== request.filters.syslogFilter) continue;
                    if (request.filters.hostnameFilter !== 'all' && String(log._HOSTNAME || '') !== request.filters.hostnameFilter) continue;
                    if (request.filters.bootIdFilter !== 'all' && String(log._BOOT_ID || '') !== request.filters.bootIdFilter) continue;
                    if (request.filters.commFilter !== 'all' && String(log._COMM || '') !== request.filters.commFilter) continue;
                    if (request.filters.transportFilter !== 'all' && String(log._TRANSPORT || '') !== request.filters.transportFilter) continue;
                    if (request.filters.pidFilter !== '' && String(log._PID || '') !== request.filters.pidFilter) continue;
                    if (request.filters.uidFilter !== '' && String(log._UID || '') !== request.filters.uidFilter) continue;
                    if (request.filters.gidFilter !== '' && String(log._GID || '') !== request.filters.gidFilter) continue;
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

                  if (request.filters.sortOrder === 'asc') {
                    result.reverse();
                  }

                  return result;
                })()
              }
      );
    }

    const id = ++parserRequestIdRef.current;
    return new Promise<WorkerResponse>((resolve) => {
      parserResolversRef.current.set(id, resolve);
      worker.postMessage({ id, ...request });
    });
  }, []);

  const parseLogsOffThread = useCallback((request: ParserRequest) => requestWorkerLogs(request), [requestWorkerLogs]);
  const syncLogsToWorker = useCallback((request: StoreRequest) => requestWorkerLogs(request), [requestWorkerLogs]);
  const filterLogsOffThread = useCallback((request: FilterRequest) => requestWorkerLogs(request), [requestWorkerLogs]);

  const getResolvedQuery = useCallback((overrides: Partial<QueryConfig> = {}): QueryConfig => {
    const nextLimit = overrides.queryLimit ?? filters.queryLimit;
    const nextEndTimeInput = overrides.endTimeInput ?? (filters.isPinnedToNow ? getNowEndTimeInput() : filters.endTimeInput);
    return {
      endTimeInput: nextEndTimeInput,
      queryLimit: Math.max(1, Math.min(MAX_QUERY_LIMIT, nextLimit)),
      unit: overrides.unit ?? filters.unitFilter,
      syslog: overrides.syslog ?? filters.syslogFilter,
      priority: overrides.priority ?? filters.priorityFilter,
      hostname: overrides.hostname ?? filters.hostnameFilter,
      bootId: overrides.bootId ?? filters.bootIdFilter,
      comm: overrides.comm ?? filters.commFilter,
      transport: overrides.transport ?? filters.transportFilter,
      pid: overrides.pid ?? filters.pidFilter,
      uid: overrides.uid ?? filters.uidFilter,
      gid: overrides.gid ?? filters.gidFilter,
      expressionFilters: overrides.expressionFilters ?? filters.expressionFilters
    };
  }, [
    filters.bootIdFilter,
    filters.commFilter,
    filters.expressionFilters,
    filters.endTimeInput,
    filters.gidFilter,
    filters.hostnameFilter,
    filters.isPinnedToNow,
    filters.pidFilter,
    filters.priorityFilter,
    filters.queryLimit,
    filters.syslogFilter,
    filters.transportFilter,
    filters.uidFilter,
    filters.unitFilter
  ]);

  const trimWindowLogs = useCallback((entries: LogEntry[], cap = CLIENT_WINDOW_CAP) => {
    const nextEntries = entries.length > cap ? entries.slice(0, cap) : entries;
    setWindowTruncated(entries.length > cap);
    return nextEntries;
  }, []);

  useEffect(() => {
    const isDefaultView =
      filters.priorityFilter === 'all' &&
      filters.unitFilter === 'all' &&
      filters.syslogFilter === 'all' &&
      filters.hostnameFilter === 'all' &&
      filters.bootIdFilter === 'all' &&
      filters.commFilter === 'all' &&
      filters.transportFilter === 'all' &&
      filters.pidFilter === '' &&
      filters.uidFilter === '' &&
      filters.gidFilter === '' &&
      filters.debouncedSearchQuery === '' &&
      filters.sortOrder === 'desc';

    if (logs.length === 0) {
      setFilteredLogIndices(null);
      setIsFiltering(false);
      return;
    }

    if (isDefaultView) {
      setFilteredLogIndices(null);
      setIsFiltering(false);
      return;
    }

    let cancelled = false;
    const jobId = ++filterJobIdRef.current;
    setIsFiltering(true);

    syncLogsToWorker({ kind: 'store-logs', logs, mode: 'replace', maxLogs: CLIENT_WINDOW_CAP })
      .then(() => {
        if (cancelled || filterJobIdRef.current !== jobId) return;
        return filterLogsOffThread({
          kind: 'filter-logs',
          filters: {
            priorityFilter: filters.priorityFilter,
            unitFilter: filters.unitFilter,
            syslogFilter: filters.syslogFilter,
            hostnameFilter: filters.hostnameFilter,
            bootIdFilter: filters.bootIdFilter,
            commFilter: filters.commFilter,
            transportFilter: filters.transportFilter,
            pidFilter: filters.pidFilter,
            uidFilter: filters.uidFilter,
            gidFilter: filters.gidFilter,
            query: filters.debouncedSearchQuery,
            expressionFilters: [],
            sortOrder: filters.sortOrder
          }
        });
      })
      .then((result) => {
        if (!result) return;
        if (cancelled || filterJobIdRef.current !== jobId) return;
        startTransition(() => {
          setFilteredLogIndices(result.indices || []);
          setIsFiltering(false);
        });
      })
      .catch(() => {
        if (cancelled || filterJobIdRef.current !== jobId) return;
        setIsFiltering(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    filterLogsOffThread,
    filters.bootIdFilter,
    filters.commFilter,
    filters.debouncedSearchQuery,
    filters.gidFilter,
    filters.hostnameFilter,
    filters.pidFilter,
    filters.priorityFilter,
    filters.sortOrder,
    filters.syslogFilter,
    filters.transportFilter,
    filters.uidFilter,
    filters.unitFilter,
    logs,
    syncLogsToWorker
  ]);

  useEffect(() => {
    void syncLogsToWorker({ kind: 'store-logs', logs, mode: 'replace', maxLogs: CLIENT_WINDOW_CAP });
  }, [logs, syncLogsToWorker]);

  const buildLogQueryParams = useCallback((query: QueryConfig, includeEndTime = true) => {
    const params = new URLSearchParams();
    params.set('limit', String(query.queryLimit));
    if (includeEndTime) {
      const endTimeSec = toUnixSeconds(query.endTimeInput);
      if (endTimeSec !== null) params.set('end_time', String(endTimeSec));
    }
    if (query.unit !== 'all') params.set('unit', query.unit);
    if (query.syslog !== 'all') params.set('syslog_id', query.syslog);
    if (query.priority !== 'all') params.set('priority', query.priority);
    if (query.hostname !== 'all') params.set('hostname', query.hostname);
    if (query.bootId !== 'all') params.set('boot_id', query.bootId);
    if (query.comm !== 'all') params.set('comm', query.comm);
    if (query.transport !== 'all') params.set('transport', query.transport);
    if (query.pid !== '') params.set('pid', query.pid);
    if (query.uid !== '') params.set('uid', query.uid);
    if (query.gid !== '') params.set('gid', query.gid);
    query.expressionFilters.forEach(({ field, value }) => {
      params.append('match', `${field}=${value}`);
    });
    return params;
  }, []);

  const getQueryKey = useCallback((query: QueryConfig) => buildLogQueryParams(query).toString(), [buildLogQueryParams]);

  const readLogsStream = useCallback(async (res: Response, controller: AbortController) => {
    if (!res.body) {
      const text = await res.text();
      const parsed = await parseLogsOffThread({ kind: 'json-lines', text });
      return parsed.logs || [];
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const parsedLogs: LogEntry[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (controller.signal.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      if (done) {
        buffer += decoder.decode();
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      if (lines.length === 0) {
        continue;
      }

      const parsed = await parseLogsOffThread({
        kind: 'json-lines',
        text: lines.join('\n')
      });
      if (parsed.logs?.length) {
        parsedLogs.push(...parsed.logs);
      }
    }

    if (buffer.trim() !== '') {
      const parsed = await parseLogsOffThread({ kind: 'json-lines', text: buffer });
      if (parsed.logs?.length) {
        parsedLogs.push(...parsed.logs);
      }
    }

    return parsedLogs;
  }, [parseLogsOffThread]);

  const loadLogs = useCallback(async ({
    endTimeInput: requestEndTimeInput,
    queryLimit: requestQueryLimit,
    unit,
    syslog,
    priority,
    hostname,
    bootId,
    comm,
    transport,
    pid,
    uid,
    gid,
    expressionFilters,
    controller
  }: QueryConfig & { controller: AbortController }) => {
    const params = buildLogQueryParams({
      endTimeInput: requestEndTimeInput,
      queryLimit: requestQueryLimit,
      unit,
      syslog,
      priority,
      hostname,
      bootId,
      comm,
      transport,
      pid,
      uid,
      gid,
      expressionFilters
    });

    const res = await apiFetch(`${apiUrl}/logs?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const parsedLogs = await readLogsStream(res, controller);
    return parsedLogs.reverse();
  }, [apiFetch, apiUrl, buildLogQueryParams, readLogsStream]);

  const loadFieldValues = useCallback(async (fieldName: PreloadFieldName) => {
    const res = await apiFetch(`${apiUrl}${FIELD_VALUE_ENDPOINTS[fieldName]}`, {
      headers: { Accept: 'text/plain' }
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseFieldValues(await res.text());
  }, [apiFetch, apiUrl]);

  const loadBootSummaries = useCallback(async () => {
    const res = await apiFetch(`${apiUrl}/fields/boot-ids/meta`, {
      headers: { Accept: 'application/json' }
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json() as BootSummary[];
  }, [apiFetch, apiUrl]);

  const refreshUnitOptions = useCallback(async () => {
    try {
      const units = await loadFieldValues('_SYSTEMD_UNIT');
      knownUnitsRef.current = new Set(units);
      setKnownUnits(units);
    } catch (err) {
      console.error('Failed to refresh unit field values:', err);
    }
  }, [loadFieldValues]);

  const refreshSyslogOptions = useCallback(async () => {
    try {
      const syslogs = await loadFieldValues('SYSLOG_IDENTIFIER');
      knownSyslogsRef.current = new Set(syslogs);
      setKnownSyslogs(syslogs);
    } catch (err) {
      console.error('Failed to refresh syslog field values:', err);
    }
  }, [loadFieldValues]);

  const refreshHostnameOptions = useCallback(async () => {
    try {
      const hostnames = await loadFieldValues('_HOSTNAME');
      knownHostnamesRef.current = new Set(hostnames);
      setKnownHostnames(hostnames);
    } catch (err) {
      console.error('Failed to refresh hostname field values:', err);
    }
  }, [loadFieldValues]);

  const refreshBootIdOptions = useCallback(async () => {
    try {
      const bootSummaries = await loadBootSummaries();
      const nextBootIds = bootSummaries.map((summary) => formatBootIdOption(summary, locale));
      knownBootIdsRef.current = new Map(nextBootIds.map((option) => [option.value, option]));
      setKnownBootIds(nextBootIds);
    } catch (err) {
      console.error('Failed to refresh boot ID field values:', err);
    }
  }, [loadBootSummaries, locale]);

  const refreshCommOptions = useCallback(async () => {
    try {
      const comms = await loadFieldValues('_COMM');
      knownCommsRef.current = new Set(comms);
      setKnownComms(comms);
    } catch (err) {
      console.error('Failed to refresh _COMM field values:', err);
    }
  }, [loadFieldValues]);

  const refreshTransportOptions = useCallback(async () => {
    try {
      const transports = await loadFieldValues('_TRANSPORT');
      knownTransportsRef.current = new Set(transports);
      setKnownTransports(transports);
    } catch (err) {
      console.error('Failed to refresh transport field values:', err);
    }
  }, [loadFieldValues]);

  const startLiveTail = useCallback(async (queryOverride?: QueryConfig) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    const controller = abortControllerRef.current;
    const activeQuery = queryOverride ?? activeQueryRef.current ?? getResolvedQuery();

    try {
      const params = buildLogQueryParams(activeQuery, false);
      if (lastCursorRef.current) {
        params.set('cursor', lastCursorRef.current);
      }

      const res = await apiFetch(`${apiUrl}/logs/tail?${params.toString()}`, {
        headers: { Accept: 'text/event-stream' },
        signal: controller.signal
      });

      if (!res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (controller.signal.aborted) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        const parsedResponse = await parseLogsOffThread({ kind: 'sse-events', events });
        const parsedLogs = parsedResponse.logs || [];
        if (controller.signal.aborted) break;

        const newLogs = parsedLogs.filter((log) => {
          if (lastCursorRef.current === log.__CURSOR) return false;
          lastCursorRef.current = log.__CURSOR;
          return true;
        });

        if (newLogs.length > 0) {
          const orderedLogs = newLogs.reverse();
          updateKnownTags(orderedLogs);
          setLogs((prev) => trimWindowLogs([...orderedLogs, ...prev]));
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError' && err.name !== 'AuthRequiredError') {
        console.error('SSE Fetch Error:', err);
        setStatus('disconnected');
      }
    }
  }, [apiFetch, apiUrl, buildLogQueryParams, getResolvedQuery, parseLogsOffThread, trimWindowLogs, updateKnownTags]);

  const stopLiveTail = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const connect = useCallback(async (
    overrides: Partial<QueryConfig> = {},
    options: { force?: boolean } = {}
  ) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    const controller = abortControllerRef.current;

    const nextQuery = getResolvedQuery(overrides);
    const queryKey = getQueryKey(nextQuery);
    if (
      !options.force &&
      activeQueryKeyRef.current === queryKey &&
      statusRef.current !== 'disconnected' &&
      logsRef.current.length > 0
    ) {
      return;
    }

    const lastFailedConnect = lastFailedConnectRef.current;
    if (
      lastFailedConnect &&
      lastFailedConnect.key === queryKey &&
      Date.now() - lastFailedConnect.at < FAILED_CONNECT_COOLDOWN_MS
    ) {
      return;
    }

    setStatus('connecting');
    setLastErrorRef.current(null);
    clearExternalStateRef.current();
    setLogs([]);
    setFilteredLogIndices(null);
    setWindowTruncated(false);
    lastCursorRef.current = null;
    activeQueryRef.current = nextQuery;
    activeQueryKeyRef.current = queryKey;

    try {
      const nextLogs = await loadLogs({ ...nextQuery, controller });
      if (controller.signal.aborted) return;

      const initialLogs = trimWindowLogs(nextLogs);
      updateKnownTags(initialLogs);
      setLogs(initialLogs);
      lastCursorRef.current = initialLogs[0]?.__CURSOR || null;
      lastFailedConnectRef.current = null;
      setStatus('connected');

      if (isLiveTailingRef.current) void startLiveTail(nextQuery);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error(err);
        lastFailedConnectRef.current = { key: queryKey, at: Date.now() };
        setLastErrorRef.current(err.message || copy.requestFailed);
        setStatus('disconnected');
      }
    }
  }, [copy.requestFailed, getQueryKey, getResolvedQuery, loadLogs, startLiveTail, trimWindowLogs, updateKnownTags]);

  useEffect(() => {
    if (authState !== 'authenticated' || hasCleared) return;
    void connect();
  }, [authState, connect, hasCleared]);

  useEffect(() => {
    if (authState !== 'authenticated') return;
    let cancelled = false;

    void Promise.all([
      loadFieldValues('_SYSTEMD_UNIT'),
      loadFieldValues('SYSLOG_IDENTIFIER'),
      loadFieldValues('_HOSTNAME'),
      loadBootSummaries(),
      loadFieldValues('_COMM'),
      loadFieldValues('_TRANSPORT')
    ]).then(([units, syslogs, hostnames, bootSummaries, comms, transports]) => {
      if (cancelled) return;
      const nextBootIds = bootSummaries.map((summary) => formatBootIdOption(summary, locale));
      knownUnitsRef.current = new Set(units);
      knownSyslogsRef.current = new Set(syslogs);
      knownHostnamesRef.current = new Set(hostnames);
      knownBootIdsRef.current = new Map(nextBootIds.map((option) => [option.value, option]));
      knownCommsRef.current = new Set(comms);
      knownTransportsRef.current = new Set(transports);
      setKnownUnits(units);
      setKnownSyslogs(syslogs);
      setKnownHostnames(hostnames);
      setKnownBootIds(nextBootIds);
      setKnownComms(comms);
      setKnownTransports(transports);
    }).catch((err) => {
      if (cancelled) return;
      console.error('Failed to preload journal field values:', err);
    });

    return () => {
      cancelled = true;
    };
  }, [authState, loadBootSummaries, loadFieldValues, locale]);

  const resetData = useCallback(() => {
    stopLiveTail();
    setLogs([]);
    setFilteredLogIndices(null);
    setWindowTruncated(false);
    setStatus('disconnected');
    lastCursorRef.current = null;
    activeQueryKeyRef.current = null;
  }, [stopLiveTail]);

  return {
    connect,
    filteredLogIndices,
    isFiltering,
    knownBootIds,
    knownComms,
    knownHostnames,
    knownSyslogs,
    knownTransports,
    knownUnits,
    logs,
    refreshBootIdOptions,
    refreshCommOptions,
    refreshHostnameOptions,
    refreshSyslogOptions,
    refreshTransportOptions,
    refreshUnitOptions,
    resetData,
    setLogs,
    startLiveTail,
    status,
    stopLiveTail,
    windowTruncated
  };
}
