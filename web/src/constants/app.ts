import type { PreloadFieldName } from '../types/app';

export const FIELD_VALUE_ENDPOINTS: Record<PreloadFieldName, string> = {
  _SYSTEMD_UNIT: '/fields/units',
  SYSLOG_IDENTIFIER: '/fields/syslog-identifiers',
  _HOSTNAME: '/fields/hostnames',
  _BOOT_ID: '/fields/boot-ids',
  _COMM: '/fields/comms',
  _TRANSPORT: '/fields/transports'
};

export const DEFAULT_QUERY_LIMIT = 1000;
export const MAX_QUERY_LIMIT = 10000;
export const CLIENT_WINDOW_CAP = 10000;
export const LOG_ROW_HEIGHT = 32;
export const VIRTUAL_OVERSCAN = 12;
