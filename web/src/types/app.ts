export interface LogEntry {
  __REALTIME_TIMESTAMP: string;
  PRIORITY: string;
  SYSLOG_IDENTIFIER?: string;
  _COMM?: string;
  _SYSTEMD_UNIT?: string;
  MESSAGE: any;
  _s?: string;
  [key: string]: any;
}

export type ParserRequest =
  | { kind: 'json-lines'; text: string }
  | { kind: 'sse-events'; events: string[] };

export type StoreRequest = {
  kind: 'store-logs';
  logs: LogEntry[];
  mode: 'replace' | 'prepend' | 'append';
  maxLogs?: number;
};

export type ExpressionFilter = {
  field: string;
  value: string;
};

export type FilterRequest = {
  kind: 'filter-logs';
  filters: {
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
    query: string;
    expressionFilters: ExpressionFilter[];
    sortOrder: 'desc' | 'asc';
  };
};

export type WorkerResponse = {
  id: number;
  logs?: LogEntry[];
  indices?: number[];
};

export type HighlightMatcher = {
  regex: RegExp;
};

export type QueryConfig = {
  endTimeInput: string;
  queryLimit: number;
  unit: string;
  syslog: string;
  priority: string;
  hostname: string;
  bootId: string;
  comm: string;
  transport: string;
  pid: string;
  uid: string;
  gid: string;
  expressionFilters: ExpressionFilter[];
};

export type SessionRole = 'viewer' | 'admin';
export type SessionState = 'checking' | 'authenticated' | 'unauthenticated';
export type AppPage = 'logs' | 'backend';
export type SessionPayload = {
  role?: SessionRole;
  version?: string;
};

export type GatewayHeader = {
  name: string;
  value: string;
};

export type SelectOption = {
  value: string;
  label: string;
  searchText?: string;
};

export type BootSummary = {
  bootId: string;
  firstSeenRealtimeUsec: string;
  firstSeenCursor?: string;
  firstSeenMessagePreview?: string;
  lastSeenRealtimeUsec: string;
  lastSeenCursor?: string;
  lastSeenMessagePreview?: string;
};

export type GatewayTarget = {
  id: string;
  name: string;
  url: string;
  tlsServerName?: string;
  headers?: GatewayHeader[];
};

export type GatewayTestStatus = {
  kind: 'success' | 'error';
  message: string;
};

export type GatewayTargetsPayload = {
  gatewayTargets: GatewayTarget[];
  activeGatewayTargetId: string;
};

export type AdminConfigPayload = {
  gatewayTargets: GatewayTarget[];
  defaultGatewayTargetId: string;
};

export type PreloadFieldName =
  | '_SYSTEMD_UNIT'
  | 'SYSLOG_IDENTIFIER'
  | '_HOSTNAME'
  | '_BOOT_ID'
  | '_COMM'
  | '_TRANSPORT';
