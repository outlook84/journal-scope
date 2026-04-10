import React from 'react';
import { describe, expect, it } from 'vitest';

import {
  buildHighlightMatcher,
  combineDateAndTime,
  filterLogIndices,
  formatTimestamp,
  getSearchQueryError,
  getDatePart,
  getPriorityClasses,
  getPriorityLabel,
  getTimePart,
  normalizeGatewayHeaders,
  normalizeLog,
  normalizeStoredSearchFilters,
  parseSearchQuery,
  parseFieldValues,
  renderHighlightedText,
  sanitizeNumericFilter,
  matchesSearchQuery,
  toLocalDateTimeInputValue,
  toUnixSeconds
} from './app';

describe('app utils', () => {
  it('maps priority values to labels and classes', () => {
    expect(getPriorityLabel('3')).toBe('Error (3)');
    expect(getPriorityLabel('9')).toBe('9');
    expect(getPriorityClasses('2')).toEqual({ border: 'border-error', text: 'text-error' });
    expect(getPriorityClasses('4')).toEqual({ border: 'border-tertiary', text: 'text-tertiary' });
    expect(getPriorityClasses('6')).toEqual({ border: 'border-primary', text: 'text-primary-fixed-dim' });
    expect(getPriorityClasses('7')).toEqual({ border: 'border-transparent', text: 'text-outline-variant' });
  });

  it('formats and parses date-time values', () => {
    expect(formatTimestamp('1704067200000000')).toMatch(/^\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(formatTimestamp('')).toBe('UNKNOWN TIME');

    const date = new Date('2024-01-02T03:04:05.000Z');
    const expectedLocal = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    expect(toLocalDateTimeInputValue(date)).toBe(expectedLocal);

    expect(toUnixSeconds('2024-01-02T03:04')).toBeTypeOf('number');
    expect(toUnixSeconds('not-a-date')).toBeNull();
    expect(getDatePart('2024-01-02T03:04')).toBe('2024-01-02');
    expect(getTimePart('2024-01-02T03:04')).toBe('03:04');
    expect(combineDateAndTime('2024-01-02', '03:04')).toBe('2024-01-02T03:04');
    expect(combineDateAndTime('', '03:04')).toBe('');
  });

  it('normalizes field collections and numeric filters', () => {
    expect(parseFieldValues(' beta\nalpha \n\nbeta\n')).toEqual(['alpha', 'beta']);
    expect(sanitizeNumericFilter('pid=12a-3')).toBe('123');
    expect(normalizeGatewayHeaders([
      { name: ' Authorization ', value: ' Bearer token ' },
      { name: ' ', value: ' ' }
    ])).toEqual([{ name: 'Authorization', value: 'Bearer token' }]);
  });

  it('parses keyword queries into field filters and keyword terms', () => {
    const parsed = parseSearchQuery('SYSLOG_IDENTIFIER=sshd error -test123 "__CURSOR=abc"');
    expect(parsed.fieldFilters).toEqual([{ field: 'SYSLOG_IDENTIFIER', value: 'sshd' }]);
    expect(parsed.keywordQuery).toBe('error -test123 "__CURSOR=abc"');
    expect(parsed.keywordTerms).toEqual(['__cursor=abc', 'error']);
  });

  it('parses quoted field filters with whitespace values', () => {
    const parsed = parseSearchQuery('MESSAGE="connection reset by peer" error');
    expect(parsed.fieldFilters).toEqual([{ field: 'MESSAGE', value: 'connection reset by peer' }]);
    expect(parsed.keywordQuery).toBe('error');
    expect(parsed.keywordTerms).toEqual(['error']);
  });

  it('keeps non-journal field tokens as plain keywords', () => {
    const parsed = parseSearchQuery('syslog_identifier=sshd code=EIO foo="bar baz"');
    expect(parsed.fieldFilters).toEqual([]);
    expect(parsed.keywordQuery).toBe('syslog_identifier=sshd code=EIO foo="bar baz"');
    expect(parsed.keywordTerms).toEqual(['syslog_identifier=sshd', 'foo="bar baz"', 'code=eio']);
  });

  it('normalizes stored filters by migrating field tokens out of the query string', () => {
    expect(normalizeStoredSearchFilters('SYSLOG_IDENTIFIER=sshd error', [
      { field: 'PRIORITY', value: '3' }
    ])).toEqual({
      searchQuery: 'error',
      expressionFilters: [
        { field: 'PRIORITY', value: '3' },
        { field: 'SYSLOG_IDENTIFIER', value: 'sshd' }
      ]
    });
  });

  it('drops invalid stored search queries instead of preserving ambiguous syntax', () => {
    expect(normalizeStoredSearchFilters('error | timeout', [
      { field: 'PRIORITY', value: '3' }
    ])).toEqual({
      searchQuery: '',
      expressionFilters: [{ field: 'PRIORITY', value: '3' }]
    });
  });

  it('preserves plain keywords that happen to contain an equals sign', () => {
    expect(normalizeStoredSearchFilters('syslog_identifier=sshd code=EIO')).toEqual({
      searchQuery: 'syslog_identifier=sshd code=EIO',
      expressionFilters: []
    });
  });

  it('rejects unsupported or reserved search syntax', () => {
    expect(getSearchQueryError('error | timeout')).toBe('The | operator is not supported in search queries.');
    expect(getSearchQueryError('"connection reset')).toBe('Search query has an unmatched quote.');
    expect(getSearchQueryError('__CURSOR=abc')).toBe('Address fields cannot be used as filters: __CURSOR');
    expect(getSearchQueryError('syslog_identifier=sshd')).toBeNull();
    expect(getSearchQueryError('"__CURSOR=abc"')).toBeNull();
  });

  it('matches keyword queries against normalized log text', () => {
    expect(matchesSearchQuery('kernel error timeout', 'error timeout')).toBe(true);
    expect(matchesSearchQuery('kernel error only', 'error timeout')).toBe(false);
    expect(matchesSearchQuery('kernel connection reset by peer', '"connection reset" peer')).toBe(true);
    expect(matchesSearchQuery('kernel timeout waiting for reply', '"connection reset" error')).toBe(false);
    expect(matchesSearchQuery('kernel error retry', 'error -timeout')).toBe(true);
    expect(matchesSearchQuery('kernel error timeout', 'error -timeout')).toBe(false);
    expect(matchesSearchQuery('kernel code=eio retry later', 'code=EIO')).toBe(true);
    expect(matchesSearchQuery('kernel error timeout', 'error | timeout')).toBe(false);
  });

  it('filters logs with the shared search helper', () => {
    const logs = [
      normalizeLog({
        __REALTIME_TIMESTAMP: '1',
        PRIORITY: '3',
        SYSLOG_IDENTIFIER: 'sshd',
        MESSAGE: 'connection reset by peer',
        _HOSTNAME: 'node-1'
      }),
      normalizeLog({
        __REALTIME_TIMESTAMP: '2',
        PRIORITY: '6',
        SYSLOG_IDENTIFIER: 'kernel',
        MESSAGE: 'timeout waiting for reply',
        _HOSTNAME: 'node-2'
      })
    ];

    expect(filterLogIndices(logs, {
      priorityFilter: 'all',
      unitFilter: 'all',
      syslogFilter: 'all',
      hostnameFilter: 'all',
      bootIdFilter: 'all',
      commFilter: 'all',
      transportFilter: 'all',
      pidFilter: '',
      uidFilter: '',
      gidFilter: '',
      query: 'SYSLOG_IDENTIFIER=sshd',
      expressionFilters: [],
      sortOrder: 'desc'
    })).toEqual([0]);

    expect(filterLogIndices(logs, {
      priorityFilter: 'all',
      unitFilter: 'all',
      syslogFilter: 'all',
      hostnameFilter: 'all',
      bootIdFilter: 'all',
      commFilter: 'all',
      transportFilter: 'all',
      pidFilter: '',
      uidFilter: '',
      gidFilter: '',
      query: 'SYSLOG_IDENTIFIER=sshd "connection reset"',
      expressionFilters: [],
      sortOrder: 'desc'
    })).toEqual([0]);

    expect(filterLogIndices(logs, {
      priorityFilter: 'all',
      unitFilter: 'all',
      syslogFilter: 'all',
      hostnameFilter: 'all',
      bootIdFilter: 'all',
      commFilter: 'all',
      transportFilter: 'all',
      pidFilter: '',
      uidFilter: '',
      gidFilter: '',
      query: '',
      expressionFilters: [{ field: 'MESSAGE', value: 'timeout waiting for reply' }],
      sortOrder: 'desc'
    })).toEqual([1]);

    expect(filterLogIndices(logs, {
      priorityFilter: 'all',
      unitFilter: 'all',
      syslogFilter: 'all',
      hostnameFilter: 'all',
      bootIdFilter: 'all',
      commFilter: 'all',
      transportFilter: 'all',
      pidFilter: '',
      uidFilter: '',
      gidFilter: '',
      query: 'error | timeout',
      expressionFilters: [],
      sortOrder: 'desc'
    })).toEqual([]);
  });

  it('builds matchers and highlights matching segments', () => {
    const matcher = buildHighlightMatcher('error "connection reset" -retry');
    expect('critical Error happened'.match(matcher!.regex)?.[0]).toBe('Error');

    const highlighted = renderHighlightedText('critical Error happened', matcher);
    expect(Array.isArray(highlighted)).toBe(true);
    const parts = highlighted as Array<string | React.ReactElement>;
    const mark = parts.find((part): part is React.ReactElement => React.isValidElement(part));
    expect(React.isValidElement(mark)).toBe(true);
    expect(mark?.type).toBe('mark');

    expect(buildHighlightMatcher('')).toBeNull();
    expect(buildHighlightMatcher('error | timeout')).toBeNull();
    expect(renderHighlightedText('plain text', null)).toBe('plain text');
  });

  it('highlights longer overlapping terms before shorter ones', () => {
    const matcher = buildHighlightMatcher('test testing');
    const highlighted = renderHighlightedText('testing test', matcher);
    const marks = (highlighted as Array<string | React.ReactElement>)
      .filter((part): part is React.ReactElement => React.isValidElement(part))
      .map((part) => part.props.children);

    expect(marks).toEqual(['testing', 'test']);
  });

  it('normalizes log payloads for searching', () => {
    const arrayLog = normalizeLog({
      __REALTIME_TIMESTAMP: '1',
      PRIORITY: '6',
      SYSLOG_IDENTIFIER: 'kernel',
      MESSAGE: [104, 105]
    });
    expect(arrayLog.MESSAGE).toBe('hi');
    expect(arrayLog._s).toBe('kernel hi');

    const objectLog = normalizeLog({
      __REALTIME_TIMESTAMP: '2',
      PRIORITY: '5',
      _COMM: 'systemd',
      MESSAGE: { ok: true }
    });
    expect(objectLog.MESSAGE).toBe('{"ok":true}');
    expect(objectLog._s).toBe('systemd {"ok":true}');
  });
});
