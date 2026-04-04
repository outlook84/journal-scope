import React from 'react';
import { describe, expect, it } from 'vitest';

import {
  buildHighlightMatcher,
  combineDateAndTime,
  formatTimestamp,
  getDatePart,
  getPriorityClasses,
  getPriorityLabel,
  getTimePart,
  normalizeGatewayHeaders,
  normalizeLog,
  parseFieldValues,
  renderHighlightedText,
  sanitizeNumericFilter,
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

  it('builds matchers and highlights matching segments', () => {
    const matcher = buildHighlightMatcher('Error?');
    expect(matcher?.query).toBe('error?');
    expect('critical Error? happened'.split(matcher!.regex)).toContain('Error?');

    const highlighted = renderHighlightedText('critical Error? happened', matcher);
    expect(Array.isArray(highlighted)).toBe(true);
    const parts = highlighted as Array<string | React.ReactElement>;
    const mark = parts.find((part): part is React.ReactElement => React.isValidElement(part));
    expect(React.isValidElement(mark)).toBe(true);
    expect(mark?.type).toBe('mark');

    expect(buildHighlightMatcher('')).toBeNull();
    expect(renderHighlightedText('plain text', null)).toBe('plain text');
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
