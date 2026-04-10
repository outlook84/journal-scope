import type { BootSummary, ExpressionFilter, FilterRequest, GatewayHeader, HighlightMatcher, LogEntry, SelectOption } from '../types/app';
import type { SupportedLocale } from '../i18n-context';
import { getMessages } from '../i18n-context';

type QueryToken =
  | { type: 'pipe' }
  | { type: 'term'; raw: string };

type KeywordTerm = {
  raw: string;
  value: string;
  negated: boolean;
};

type FieldFilterTokenIssue =
  | { field: string; reason: 'reserved' }
  | null;

type SearchQueryIssue =
  | { reason: 'unmatched-quote' }
  | { reason: 'pipe-unsupported' }
  | { reason: 'field-token'; field: string; fieldReason: 'reserved' };

export type ParsedSearchQuery = {
  fieldFilters: ExpressionFilter[];
  keywordGroups: KeywordTerm[][];
  keywordQuery: string;
  keywordTerms: string[];
};

export const VALID_JOURNAL_FIELD_NAME = /^_?[A-Z0-9_]+$/;

export function isQueryableFieldName(field: string): boolean {
  return field !== '' && !field.startsWith('__') && VALID_JOURNAL_FIELD_NAME.test(field);
}

function tokenizeSearchInput(input: string): QueryToken[] {
  const tokens: QueryToken[] = [];
  let current = '';
  let inQuote = false;

  const pushCurrent = () => {
    const raw = current.trim();
    if (raw) {
      tokens.push({ type: 'term', raw });
    }
    current = '';
  };

  for (const char of input) {
    if (inQuote) {
      current += char;
      if (char === '"') {
        inQuote = false;
      }
      continue;
    }

    if (char === '"') {
      current += char;
      inQuote = true;
      continue;
    }

    if (/\s/.test(char)) {
      pushCurrent();
      continue;
    }

    if (char === '|') {
      pushCurrent();
      tokens.push({ type: 'pipe' });
      continue;
    }

    current += char;
  }

  pushCurrent();
  return tokens;
}

function parseFieldFilterToken(token: QueryToken): ExpressionFilter | null {
  if (token.type !== 'term') return null;
  if (token.raw.startsWith('-')) return null;

  const quotedValueMatch = token.raw.match(/^([^=\s|]+)="([^"]*)"$/);
  if (quotedValueMatch) {
    const [, field, value] = quotedValueMatch;
    if (!field || !value || !isQueryableFieldName(field)) return null;
    return { field, value };
  }

  if (token.raw.includes('"')) return null;

  const eqIndex = token.raw.indexOf('=');
  if (eqIndex <= 0 || eqIndex === token.raw.length - 1) return null;

  const field = token.raw.slice(0, eqIndex).trim();
  const value = token.raw.slice(eqIndex + 1).trim();
  if (!field || !value || !isQueryableFieldName(field)) return null;

  return { field, value };
}

function getFieldFilterTokenIssue(token: QueryToken): FieldFilterTokenIssue {
  if (token.type !== 'term') return null;
  if (token.raw.startsWith('-')) return null;
  if (token.raw.length >= 2 && token.raw.startsWith('"') && token.raw.endsWith('"')) return null;

  const eqIndex = token.raw.indexOf('=');
  if (eqIndex <= 0) return null;

  const field = token.raw.slice(0, eqIndex).trim();
  if (!field) return null;
  if (field.startsWith('__')) return { field, reason: 'reserved' };
  return null;
}

function hasUnmatchedQuote(input: string) {
  let inQuote = false;

  for (const char of input) {
    if (char === '"') {
      inQuote = !inQuote;
    }
  }

  return inQuote;
}

function parseKeywordTermToken(token: QueryToken): KeywordTerm | null {
  if (token.type !== 'term') return null;

  let raw = token.raw;
  let negated = false;

  if (raw.startsWith('-') && raw.length > 1) {
    negated = true;
    raw = raw.slice(1);
  }

  if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) {
    raw = raw.slice(1, -1);
  }

  const value = raw.trim();
  if (!value) return null;

  return { raw: token.raw, value, negated };
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildMatcherRegex(terms: KeywordTerm[]) {
  const patterns = terms.map((term) => escapeRegex(term.value));

  return patterns.length > 0
    ? new RegExp(`(?:${patterns.join('|')})`, 'gi')
    : null;
}

function matchesKeywordTerm(haystack: string, term: KeywordTerm) {
  return haystack.includes(term.value.toLowerCase());
}

function getSearchQueryIssue(query: string): SearchQueryIssue | null {
  const trimmed = query.trim();
  if (!trimmed) return null;
  if (hasUnmatchedQuote(trimmed)) return { reason: 'unmatched-quote' };

  const tokens = tokenizeSearchInput(trimmed);
  if (tokens.some((token) => token.type === 'pipe')) {
    return { reason: 'pipe-unsupported' };
  }

  for (const token of tokens) {
    const issue = getFieldFilterTokenIssue(token);
    if (issue) {
      return { reason: 'field-token', field: issue.field, fieldReason: issue.reason };
    }
  }

  for (const token of tokens) {
    if (token.type !== 'term') continue;
    if (parseFieldFilterToken(token)) continue;
    parseKeywordTermToken(token);
  }

  return null;
}

export function parseSearchQuery(input: string): ParsedSearchQuery {
  if (getSearchQueryIssue(input)) {
    return {
      fieldFilters: [],
      keywordGroups: [],
      keywordQuery: '',
      keywordTerms: []
    };
  }

  const fieldFilters: ExpressionFilter[] = [];
  const keywordGroups: KeywordTerm[][] = [];
  const currentGroup: KeywordTerm[] = [];

  for (const token of tokenizeSearchInput(input.trim())) {
    if (token.type === 'pipe') continue;

    const fieldFilter = parseFieldFilterToken(token);
    if (fieldFilter) {
      fieldFilters.push(fieldFilter);
      continue;
    }

    const keywordTerm = parseKeywordTermToken(token);
    if (!keywordTerm) continue;

    currentGroup.push(keywordTerm);
  }

  if (currentGroup.length > 0) {
    keywordGroups.push(currentGroup);
  }

  const keywordTerms = Array.from(
    new Set(
      keywordGroups
        .flatMap((group) => group.filter((term) => !term.negated).map((term) => term.value.toLowerCase()))
        .filter((term) => term !== '')
    )
  ).sort((a, b) => b.length - a.length || a.localeCompare(b));

  return {
    fieldFilters,
    keywordGroups,
    keywordQuery: keywordGroups.map((group) => group.map((term) => term.raw).join(' ')).join(' '),
    keywordTerms
  };
}

export function matchesSearchQuery(text: string | undefined, query: string) {
  if (getSearchQueryIssue(query)) return false;
  const parsed = parseSearchQuery(query);
  return matchesParsedSearchQuery(text, parsed);
}

export function matchesParsedSearchQuery(text: string | undefined, parsed: Pick<ParsedSearchQuery, 'keywordGroups'>) {
  if (parsed.keywordGroups.length === 0) return true;

  const haystack = (text ?? '').toLowerCase();
  return parsed.keywordGroups.some((group) => group.every((term) => (
    term.negated
      ? !matchesKeywordTerm(haystack, term)
      : matchesKeywordTerm(haystack, term)
  )));
}

function dedupeExpressionFilters(filters: ExpressionFilter[]) {
  const seen = new Set<string>();
  const result: ExpressionFilter[] = [];

  for (const filter of filters) {
    const key = `${filter.field}\u0000${filter.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(filter);
  }

  return result;
}

export function normalizeStoredSearchFilters(searchQuery: string, expressionFilters: ExpressionFilter[] = []) {
  if (getSearchQueryIssue(searchQuery)) {
    return {
      searchQuery: '',
      expressionFilters: dedupeExpressionFilters(expressionFilters)
    };
  }

  const parsed = parseSearchQuery(searchQuery);

  return {
    searchQuery: parsed.keywordQuery,
    expressionFilters: dedupeExpressionFilters([...expressionFilters, ...parsed.fieldFilters])
  };
}

export function getSearchQueryError(query: string, locale: SupportedLocale = 'en') {
  const messages = getMessages(locale);
  const issue = getSearchQueryIssue(query);
  if (!issue) return null;

  switch (issue.reason) {
    case 'unmatched-quote':
      return messages.searchQueryHasUnmatchedQuote;
    case 'pipe-unsupported':
      return messages.searchQueryPipeUnsupported;
    case 'field-token':
      return messages.addressFieldsCannotBeUsed(issue.field);
    default:
      return null;
  }
}

export function filterLogIndices(logs: LogEntry[], filters: FilterRequest['filters']) {
  if (getSearchQueryIssue(filters.query)) {
    return [];
  }

  const parsedQuery = parseSearchQuery(filters.query);
  const expressionFilters = dedupeExpressionFilters([...filters.expressionFilters, ...parsedQuery.fieldFilters]);
  const result: number[] = [];
  const expressionGroups = expressionFilters.reduce<Record<string, Set<string>>>((groups, filter) => {
    (groups[filter.field] ??= new Set()).add(filter.value);
    return groups;
  }, {});

  for (let index = 0; index < logs.length; index++) {
    const log = logs[index];
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

    if (!matchesParsedSearchQuery(log._s, parsedQuery)) continue;

    result.push(index);
  }

  if (filters.sortOrder === 'asc') {
    result.reverse();
  }

  return result;
}

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
    const parsed = parseSearchQuery(query);
    if (parsed.keywordTerms.length === 0) return null;

    const highlightTerms = parsed.keywordGroups
      .flatMap((group) => group.filter((term) => !term.negated))
      .sort((a, b) => b.value.length - a.value.length || a.value.localeCompare(b.value));
    const regex = buildMatcherRegex(highlightTerms);
    if (!regex) return null;

    return {
      regex
    } satisfies HighlightMatcher;
  } catch {
    return null;
  }
}

export function matchesHighlightMatcher(text: string | undefined, matcher?: HighlightMatcher | null) {
  if (!matcher || !text) return false;
  return new RegExp(matcher.regex.source, matcher.regex.flags).test(text);
}

export function renderHighlightedText(text: string, matcher?: HighlightMatcher | null) {
  if (!matcher || !text) return text;

  const regex = new RegExp(matcher.regex.source, matcher.regex.flags);
  const parts: Array<string | JSX.Element> = [];
  let lastIndex = 0;

  for (const match of text.matchAll(regex)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      parts.push(text.slice(lastIndex, index));
    }

    parts.push(
      <mark key={`${index}:${match[0]}`} className="rounded-[2px] bg-primary/16 px-0.5 font-bold text-primary">
        {match[0]}
      </mark>
    );
    lastIndex = index + match[0].length;
  }

  if (parts.length === 0) return text;
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
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
