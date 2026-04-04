import type { BootSummary, GatewayHeader, HighlightMatcher, LogEntry, SelectOption } from '../types/app';
import type { SupportedLocale } from '../i18n-context';
import { getMessages } from '../i18n-context';

export function getPriorityClasses(priority: string) {
  const p = parseInt(priority, 10) || 6;
  if (p <= 3) return { border: 'border-error', text: 'text-error' };
  if (p === 4) return { border: 'border-tertiary', text: 'text-tertiary' };
  if (p === 5 || p === 6) return { border: 'border-primary', text: 'text-primary-fixed-dim' };
  return { border: 'border-transparent', text: 'text-outline-variant' };
}

export function getPriorityLabel(priority: string, locale: SupportedLocale = 'en') {
  return getMessages(locale).priorityLabel(priority);
}

export function formatTimestamp(usecObj: string, locale: SupportedLocale = 'en') {
  if (!usecObj) return getMessages(locale).unknownTime;
  const ms = Math.floor(parseInt(usecObj, 10) / 1000);
  const date = new Date(ms);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const mins = String(date.getMinutes()).padStart(2, '0');
  const secs = String(date.getSeconds()).padStart(2, '0');
  return `${month}-${day} ${hours}:${mins}:${secs}`;
}

export function toLocalDateTimeInputValue(date: Date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
}

export function getNowEndTimeInput() {
  return toLocalDateTimeInputValue(new Date());
}

export function toUnixSeconds(input: string) {
  const value = new Date(input).getTime();
  return Number.isNaN(value) ? null : Math.floor(value / 1000);
}

export function getDatePart(input: string) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input) ? input.slice(0, 10) : toLocalDateTimeInputValue(new Date()).slice(0, 10);
}

export function getTimePart(input: string) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input) ? input.slice(11, 16) : toLocalDateTimeInputValue(new Date()).slice(11, 16);
}

export function combineDateAndTime(datePart: string, timePart: string) {
  if (!datePart || !timePart) return '';
  return `${datePart}T${timePart}`;
}

export function parseFieldValues(text: string) {
  return Array.from(new Set(
    text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '')
  )).sort();
}

export function formatBootIdOption(summary: BootSummary, locale: SupportedLocale = 'en'): SelectOption {
  const timestampLabel = summary.firstSeenRealtimeUsec
    ? formatTimestamp(summary.firstSeenRealtimeUsec, locale)
    : getMessages(locale).unknownTime;

  return {
    value: summary.bootId,
    label: `${timestampLabel} · ${summary.bootId}`,
    searchText: `${summary.bootId}\n${summary.firstSeenMessagePreview ?? ''}\n${summary.lastSeenMessagePreview ?? ''}`
  };
}

export function sanitizeNumericFilter(value: string) {
  return value.replace(/\D+/g, '');
}

export function normalizeGatewayHeaders(headers?: GatewayHeader[]) {
  return (headers ?? [])
    .map((header) => ({
      name: header.name.trim(),
      value: header.value.trim()
    }))
    .filter((header) => header.name !== '' || header.value !== '');
}

export function buildHighlightMatcher(query?: string) {
  if (!query) return null;

  try {
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return {
      query: query.toLowerCase(),
      regex: new RegExp(`(${escapedQuery})`, 'gi')
    } satisfies HighlightMatcher;
  } catch {
    return null;
  }
}

export function renderHighlightedText(text: string, matcher?: HighlightMatcher | null) {
  if (!matcher || !text) return text;

  const parts = text.split(matcher.regex);
  if (parts.length === 1) return text;

  return parts.map((part, i) =>
    part.toLowerCase() === matcher.query
      ? <mark key={i} className="rounded-[2px] bg-primary/16 px-0.5 font-bold text-primary">{part}</mark>
      : part
  );
}

export function normalizeLog(log: LogEntry) {
  if (Array.isArray(log.MESSAGE)) {
    try {
      log.MESSAGE = new TextDecoder().decode(new Uint8Array(log.MESSAGE));
    } catch {
      log.MESSAGE = '[Binary Data]';
    }
  } else if (typeof log.MESSAGE === 'object' && log.MESSAGE !== null) {
    log.MESSAGE = JSON.stringify(log.MESSAGE);
  }

  const unit = (log.SYSLOG_IDENTIFIER || log._COMM || log._SYSTEMD_UNIT || '').toLowerCase();
  const msg = (typeof log.MESSAGE === 'string' ? log.MESSAGE : '').toLowerCase();
  log._s = unit + ' ' + msg;

  return log;
}
