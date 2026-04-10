import { useEffect, useMemo, useState } from 'react';
import type { SetStateAction } from 'react';

import { DEFAULT_QUERY_LIMIT, MAX_QUERY_LIMIT } from '../constants/app';
import type { SupportedLocale } from '../i18n-context';
import type { ExpressionFilter } from '../types/app';
import {
  getNowEndTimeInput,
  getPriorityLabel,
  getSearchQueryError,
  isQueryableFieldName,
  normalizeStoredSearchFilters,
  parseSearchQuery
} from '../utils/app';

type UseLogFiltersOptions = {
  locale?: SupportedLocale;
  onDirty?: () => void;
  storageScope?: string | null;
};

type PersistedLogFilters = {
  searchQuery: string;
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
  expressionFilters: ExpressionFilter[];
  endTimeInput: string;
  isPinnedToNow: boolean;
  queryLimit: number;
  sortOrder: 'desc' | 'asc';
};

type FilterState = PersistedLogFilters & {
  expressionInput: string;
  expressionInputError: string | null;
};

const FILTERS_STORAGE_PREFIX = 'journal-scope:log-filters:';

function isValidEndTimeInput(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return false;
  return !Number.isNaN(new Date(value).getTime());
}

function clampQueryLimit(value: number): number {
  return Math.max(1, Math.min(MAX_QUERY_LIMIT, Math.floor(value)));
}

function buildDefaultPersistedState(): PersistedLogFilters {
  return {
    searchQuery: '',
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
    expressionFilters: [],
    endTimeInput: getNowEndTimeInput(),
    isPinnedToNow: true,
    queryLimit: DEFAULT_QUERY_LIMIT,
    sortOrder: 'desc'
  };
}

function readPersistedState(storageScope: string): PersistedLogFilters {
  const defaults = buildDefaultPersistedState();
  if (typeof window === 'undefined') return defaults;

  try {
    const raw = window.localStorage.getItem(`${FILTERS_STORAGE_PREFIX}${storageScope}`);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<PersistedLogFilters>;
    const rawExpressionFilters = Array.isArray(parsed.expressionFilters)
      ? parsed.expressionFilters.filter((item): item is ExpressionFilter => (
        !!item &&
        typeof item === 'object' &&
        typeof item.field === 'string' &&
        typeof item.value === 'string' &&
        isQueryableFieldName(item.field) &&
        item.value.trim() !== ''
      ))
      : defaults.expressionFilters;
    const normalizedSearchFilters = normalizeStoredSearchFilters(
      typeof parsed.searchQuery === 'string' ? parsed.searchQuery : defaults.searchQuery,
      rawExpressionFilters
    );

    return {
      searchQuery: normalizedSearchFilters.searchQuery,
      priorityFilter: typeof parsed.priorityFilter === 'string' ? parsed.priorityFilter : defaults.priorityFilter,
      unitFilter: typeof parsed.unitFilter === 'string' ? parsed.unitFilter : defaults.unitFilter,
      syslogFilter: typeof parsed.syslogFilter === 'string' ? parsed.syslogFilter : defaults.syslogFilter,
      hostnameFilter: typeof parsed.hostnameFilter === 'string' ? parsed.hostnameFilter : defaults.hostnameFilter,
      bootIdFilter: typeof parsed.bootIdFilter === 'string' ? parsed.bootIdFilter : defaults.bootIdFilter,
      commFilter: typeof parsed.commFilter === 'string' ? parsed.commFilter : defaults.commFilter,
      transportFilter: typeof parsed.transportFilter === 'string' ? parsed.transportFilter : defaults.transportFilter,
      pidFilter: typeof parsed.pidFilter === 'string' ? parsed.pidFilter : defaults.pidFilter,
      uidFilter: typeof parsed.uidFilter === 'string' ? parsed.uidFilter : defaults.uidFilter,
      gidFilter: typeof parsed.gidFilter === 'string' ? parsed.gidFilter : defaults.gidFilter,
      expressionFilters: normalizedSearchFilters.expressionFilters,
      endTimeInput: typeof parsed.endTimeInput === 'string' && isValidEndTimeInput(parsed.endTimeInput)
        ? parsed.endTimeInput
        : defaults.endTimeInput,
      isPinnedToNow: typeof parsed.isPinnedToNow === 'boolean' ? parsed.isPinnedToNow : defaults.isPinnedToNow,
      queryLimit: typeof parsed.queryLimit === 'number' && Number.isFinite(parsed.queryLimit)
        ? clampQueryLimit(parsed.queryLimit)
        : defaults.queryLimit,
      sortOrder: parsed.sortOrder === 'asc' || parsed.sortOrder === 'desc' ? parsed.sortOrder : defaults.sortOrder
    };
  } catch {
    return defaults;
  }
}

function buildInitialFilterState(storageScope?: string | null): FilterState {
  const persisted = storageScope ? readPersistedState(storageScope) : buildDefaultPersistedState();
  return {
    ...persisted,
    expressionInput: '',
    expressionInputError: null
  };
}

export function useLogFilters({ locale = 'en', onDirty, storageScope }: UseLogFiltersOptions = {}) {
  const scopeKey = storageScope ?? '__default__';
  const [stateByScope, setStateByScope] = useState<Record<string, FilterState>>({});
  const currentState = useMemo(
    () => stateByScope[scopeKey] ?? buildInitialFilterState(storageScope),
    [scopeKey, stateByScope, storageScope]
  );

  const updateCurrentState = (updater: (current: FilterState) => FilterState) => {
    setStateByScope((prev) => {
      const current = prev[scopeKey] ?? buildInitialFilterState(storageScope);
      const next = updater(current);
      if (next === current) {
        return prev;
      }
      return {
        ...prev,
        [scopeKey]: next
      };
    });
  };

  const setField = <K extends keyof FilterState>(field: K, value: SetStateAction<FilterState[K]>) => {
    updateCurrentState((current) => {
      const nextValue = typeof value === 'function'
        ? (value as (previous: FilterState[K]) => FilterState[K])(current[field])
        : value;
      if (Object.is(current[field], nextValue)) {
        return current;
      }
      return {
        ...current,
        [field]: nextValue
      };
    });
  };

  const searchQuery = currentState.searchQuery;
  const priorityFilter = currentState.priorityFilter;
  const unitFilter = currentState.unitFilter;
  const syslogFilter = currentState.syslogFilter;
  const hostnameFilter = currentState.hostnameFilter;
  const bootIdFilter = currentState.bootIdFilter;
  const commFilter = currentState.commFilter;
  const transportFilter = currentState.transportFilter;
  const pidFilter = currentState.pidFilter;
  const uidFilter = currentState.uidFilter;
  const gidFilter = currentState.gidFilter;
  const expressionFilters = currentState.expressionFilters;
  const expressionInput = currentState.expressionInput;
  const expressionInputError = currentState.expressionInputError;
  const endTimeInput = currentState.endTimeInput;
  const isPinnedToNow = currentState.isPinnedToNow;
  const queryLimit = currentState.queryLimit;
  const sortOrder = currentState.sortOrder;

  const setSearchQuery = (value: SetStateAction<string>) => setField('searchQuery', value);
  const setPriorityFilter = (value: SetStateAction<string>) => setField('priorityFilter', value);
  const setUnitFilter = (value: SetStateAction<string>) => setField('unitFilter', value);
  const setSyslogFilter = (value: SetStateAction<string>) => setField('syslogFilter', value);
  const setHostnameFilter = (value: SetStateAction<string>) => setField('hostnameFilter', value);
  const setBootIdFilter = (value: SetStateAction<string>) => setField('bootIdFilter', value);
  const setCommFilter = (value: SetStateAction<string>) => setField('commFilter', value);
  const setTransportFilter = (value: SetStateAction<string>) => setField('transportFilter', value);
  const setPidFilter = (value: SetStateAction<string>) => setField('pidFilter', value);
  const setUidFilter = (value: SetStateAction<string>) => setField('uidFilter', value);
  const setGidFilter = (value: SetStateAction<string>) => setField('gidFilter', value);
  const setExpressionFilters = (value: SetStateAction<ExpressionFilter[]>) => setField('expressionFilters', value);
  const setExpressionInput = (value: SetStateAction<string>) => setField('expressionInput', value);
  const setExpressionInputError = (value: SetStateAction<string | null>) => setField('expressionInputError', value);
  const setEndTimeInput = (value: SetStateAction<string>) => setField('endTimeInput', value);
  const setIsPinnedToNow = (value: SetStateAction<boolean>) => setField('isPinnedToNow', value);
  const setQueryLimit = (value: SetStateAction<number>) => setField('queryLimit', value);
  const setSortOrder = (value: SetStateAction<'desc' | 'asc'>) => setField('sortOrder', value);

  useEffect(() => {
    if (!storageScope || typeof window === 'undefined') return;

    const persisted: PersistedLogFilters = {
      searchQuery,
      priorityFilter,
      unitFilter,
      syslogFilter,
      hostnameFilter,
      bootIdFilter,
      commFilter,
      transportFilter,
      pidFilter,
      uidFilter,
      gidFilter,
      expressionFilters,
      endTimeInput,
      isPinnedToNow,
      queryLimit,
      sortOrder
    };

    try {
      window.localStorage.setItem(`${FILTERS_STORAGE_PREFIX}${storageScope}`, JSON.stringify(persisted));
    } catch {
      // Ignore storage write failures so the UI remains usable.
    }
  }, [
    storageScope,
    searchQuery,
    priorityFilter,
    unitFilter,
    syslogFilter,
    hostnameFilter,
    bootIdFilter,
    commFilter,
    transportFilter,
    pidFilter,
    uidFilter,
    gidFilter,
    expressionFilters,
    endTimeInput,
    isPinnedToNow,
    queryLimit,
    sortOrder
  ]);

  const resetQueryPanel = () => {
    updateCurrentState((current) => ({
      ...current,
      searchQuery: '',
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
      expressionFilters: [],
      expressionInput: '',
      expressionInputError: null
    }));
    onDirty?.();
  };

  const hasAdvancedFilterSelection =
    hostnameFilter !== 'all' ||
    bootIdFilter !== 'all' ||
    commFilter !== 'all' ||
    transportFilter !== 'all' ||
    expressionFilters.some(({ field }) => ['_HOSTNAME', '_BOOT_ID', '_COMM', '_TRANSPORT'].includes(field));

  const hasQueryPanelChanges =
    searchQuery !== '' ||
    priorityFilter !== 'all' ||
    unitFilter !== 'all' ||
    syslogFilter !== 'all' ||
    hasAdvancedFilterSelection ||
    queryLimit !== DEFAULT_QUERY_LIMIT ||
    expressionFilters.length > 0 ||
    !isPinnedToNow;

  const activeFilterCount = [
    priorityFilter !== 'all',
    unitFilter !== 'all',
    syslogFilter !== 'all',
    hostnameFilter !== 'all',
    bootIdFilter !== 'all',
    commFilter !== 'all',
    transportFilter !== 'all',
    pidFilter !== '',
    uidFilter !== '',
    gidFilter !== '',
    expressionFilters.length > 0
  ].filter(Boolean).length;

  const queryTokens = [
    priorityFilter !== 'all' ? { key: 'priority', label: `PRIORITY=${getPriorityLabel(priorityFilter, locale)}`, onRemove: () => setPriorityFilter('all') } : null,
    unitFilter !== 'all' ? { key: 'unit', label: `_SYSTEMD_UNIT=${unitFilter}`, onRemove: () => setUnitFilter('all') } : null,
    syslogFilter !== 'all' ? { key: 'syslog', label: `SYSLOG_IDENTIFIER=${syslogFilter}`, onRemove: () => setSyslogFilter('all') } : null,
    hostnameFilter !== 'all' ? { key: 'hostname', label: `_HOSTNAME=${hostnameFilter}`, onRemove: () => setHostnameFilter('all') } : null,
    bootIdFilter !== 'all' ? { key: 'boot', label: `_BOOT_ID=${bootIdFilter}`, onRemove: () => setBootIdFilter('all') } : null,
    commFilter !== 'all' ? { key: 'comm', label: `_COMM=${commFilter}`, onRemove: () => setCommFilter('all') } : null,
    transportFilter !== 'all' ? { key: 'transport', label: `_TRANSPORT=${transportFilter}`, onRemove: () => setTransportFilter('all') } : null,
    searchQuery !== '' ? { key: 'query', label: `QUERY~${searchQuery}`, onRemove: () => setSearchQuery('') } : null,
    ...expressionFilters.map(({ field, value }) => ({
      key: `expr:${field}:${value}`,
      label: field === 'PRIORITY' ? `${field}=${getPriorityLabel(value, locale)}` : `${field}=${value}`,
      onRemove: () => setExpressionFilters((prev) => prev.filter((item) => !(item.field === field && item.value === value)))
    }))
  ].filter(Boolean) as Array<{ key: string; label: string; onRemove: () => void }>;

  const applyDetailFilter = (field: string, rawValue: unknown) => {
    const nextValue = String(rawValue ?? '').trim();
    if (!nextValue || !isQueryableFieldName(field)) return;

    onDirty?.();
    setExpressionFilters((prev) => {
      if (prev.some((item) => item.field === field && item.value === nextValue)) {
        return prev;
      }
      return [...prev, { field, value: nextValue }];
    });
  };

  const applyExpressionInput = () => {
    const value = expressionInput.trim();
    if (!value) return;

    const queryError = getSearchQueryError(value, locale);
    if (queryError) {
      setExpressionInputError(queryError);
      return;
    }

    const parsed = parseSearchQuery(value);
    const hasNewFieldFilter = parsed.fieldFilters.some((filter) => (
      !expressionFilters.some((item) => item.field === filter.field && item.value === filter.value)
    ));
    const hasSearchQueryChange = parsed.keywordQuery !== '' && parsed.keywordQuery !== searchQuery;

    if (hasNewFieldFilter || hasSearchQueryChange) {
      onDirty?.();
    }

    if (hasNewFieldFilter) {
      setExpressionFilters((prev) => {
        const next = prev.slice();
        for (const filter of parsed.fieldFilters) {
          if (!next.some((item) => item.field === filter.field && item.value === filter.value)) {
            next.push(filter);
          }
        }
        return next.length === prev.length ? prev : next;
      });
    }

    if (hasSearchQueryChange) {
      setSearchQuery(parsed.keywordQuery);
    }

    setExpressionInput('');
    setExpressionInputError(null);
  };

  return {
    activeFilterCount,
    applyDetailFilter,
    applyExpressionInput,
    bootIdFilter,
    commFilter,
    endTimeInput,
    expressionFilters,
    expressionInput,
    expressionInputError,
    gidFilter,
    hasQueryPanelChanges,
    hostnameFilter,
    isPinnedToNow,
    pidFilter,
    priorityFilter,
    queryLimit,
    queryTokens,
    resetQueryPanel,
    searchQuery,
    setBootIdFilter,
    setCommFilter,
    setEndTimeInput,
    setExpressionFilters,
    setExpressionInput,
    setExpressionInputError,
    setGidFilter,
    setHostnameFilter,
    setIsPinnedToNow,
    setPidFilter,
    setPriorityFilter,
    setQueryLimit,
    setSearchQuery,
    setSortOrder,
    setSyslogFilter,
    setTransportFilter,
    setUidFilter,
    setUnitFilter,
    isHydrated: true,
    sortOrder,
    syslogFilter,
    transportFilter,
    uidFilter,
    unitFilter
  };
}
