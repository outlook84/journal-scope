import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, RefreshCw, X, ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Menu, Network, Unplug, Delete, Trash2 } from 'lucide-react';

import { AnsiText } from './components/AnsiText';
import { AuthScreen } from './components/AuthScreen';
import { BackendSettingsPage } from './components/BackendSettingsPage';
import { VirtualLogList } from './components/LogList';
import { PwaUpdateBanner } from './components/PwaUpdateBanner';
import { PriorityMultiSelect } from './components/PriorityMultiSelect';
import { SearchableSelect } from './components/SearchableSelect';
import { TopBarControls } from './components/TopBarControls';
import { useI18n } from './i18n-context';
import {
  CLIENT_WINDOW_CAP,
  DEFAULT_QUERY_LIMIT,
  MAX_QUERY_LIMIT
} from './constants/app';
import type { AppPage, LogEntry } from './types/app';
import { useGatewayAdmin } from './hooks/useGatewayAdmin';
import { useLogFilters } from './hooks/useLogFilters';
import { useLogData } from './hooks/useLogData';
import { useSession } from './hooks/useSession';
import {
  formatTimestamp,
  getDatePart,
  getNowEndTimeInput,
  getTimePart
} from './utils/app';


export default function App() {
  const { locale, messages } = useI18n();
  const apiUrl = '/api';
  const [currentPage, setCurrentPage] = useState<AppPage>('logs');
  const [isLiveTailing, setIsLiveTailing] = useState(false);
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [activeLog, setActiveLog] = useState<LogEntry | null>(null);
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [hasCleared, setHasCleared] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 768);
  const [lastError, setLastError] = useState<string | null>(null);
  const [sessionMenuOpenFor, setSessionMenuOpenFor] = useState<string | null>(null);

  const desktopSessionMenuRef = useRef<HTMLDivElement | null>(null);
  const mobileSessionMenuRef = useRef<HTMLDivElement | null>(null);

  const resetForUnauthorized = useCallback((message = messages.authenticationRequired) => {
    setIsLiveTailing(false);
    setActiveLog(null);
    setSelectedLog(null);
    setHasCleared(false);
    setLastError(message);
  }, [messages.authenticationRequired]);

  const {
    accessCodeInput,
    appVersion,
    apiFetch,
    authError,
    authState,
    isSubmittingAuth,
    logout,
    sessionRole,
    setAccessCodeInput,
    submitAccessCode
  } = useSession({
    apiUrl,
    locale,
    setLastError,
    onUnauthorized: resetForUnauthorized,
    onLoginSuccess: () => {
      setCurrentPage('logs');
    },
    onLogout: () => {
      setIsLiveTailing(false);
      setCurrentPage('logs');
      setHasCleared(false);
      setActiveLog(null);
      setSelectedLog(null);
    }
  });

  const {
    activeGatewayTarget,
    activeGatewayTargetId,
    addDraftTarget,
    addDraftTargetHeader,
    adminConfigError,
    adminConfigNotice,
    adminDefaultGatewayTargetIdDraft,
    adminGatewayTargetsDraft,
    defaultGatewayTargetId,
    gatewayTargets,
    gatewayTestStatusById,
    isSavingAdminConfig,
    newAdminAccessCode,
    newViewerAccessCode,
    removeDraftTarget,
    removeDraftTargetHeader,
    saveAdminConfig,
    setAdminDefaultGatewayTargetIdDraft,
    setNewAdminAccessCode,
    setNewViewerAccessCode,
    switchGatewayTarget,
    testGatewayTarget,
    testingGatewayTargetId,
    updateDraftTarget,
    updateDraftTargetHeader
  } = useGatewayAdmin({
    apiFetch,
    apiUrl,
    authState,
    locale,
    sessionRole,
    onReconnect: () => {
      void connect({}, { force: true });
    }
  });

  const {
    applyDetailFilter,
    applyExpressionInput,
    bootIdFilter,
    commFilter,
    endTimeInput,
    expressionFilters,
    expressionInput,
    expressionInputError,
    gidFilter,
    hostnameFilter,
    isHydrated: areFiltersHydrated,
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
    setHostnameFilter,
    setIsPinnedToNow,
    setQueryLimit,
    setSortOrder,
    setSyslogFilter,
    setTransportFilter,
    setUnitFilter,
    sortOrder,
    syslogFilter,
    transportFilter,
    uidFilter,
    unitFilter
  } = useLogFilters({
    locale,
    onDirty: () => {
      setHasCleared(false);
    },
    storageScope: sessionRole && activeGatewayTargetId ? `role:${sessionRole}:target:${activeGatewayTargetId}` : null
  });
  const liveTailAvailable = isPinnedToNow;
  const logsAuthState = authState === 'authenticated' && areFiltersHydrated && activeGatewayTargetId
    ? authState
    : 'checking';
  const sessionMenuScope = `${authState}:${sessionRole ?? 'none'}:${currentPage}`;
  const isSessionMenuOpen = sessionMenuOpenFor === sessionMenuScope;
  const closeSessionMenu = useCallback(() => {
    setSessionMenuOpenFor(null);
  }, []);
  const toggleSessionMenu = useCallback(() => {
    setSessionMenuOpenFor((current) => current === sessionMenuScope ? null : sessionMenuScope);
  }, [sessionMenuScope]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const {
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
  } = useLogData({
    apiFetch,
    apiUrl,
    authState: logsAuthState,
    filters: {
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
      debouncedSearchQuery,
      sortOrder,
      queryLimit,
      endTimeInput,
      isPinnedToNow
    },
    hasCleared,
    isLiveTailing,
    locale,
    onClearExternalState: () => {
      setHasCleared(false);
      setActiveLog(null);
      setSelectedLog(null);
    },
    onSetLastError: setLastError
  });
  const visibleLogCount = filteredLogIndices ? filteredLogIndices.length : logs.length;
  const totalLogCount = logs.length;
  const showFilteredCount = debouncedSearchQuery !== '';

  useEffect(() => {
    if (logsAuthState !== 'authenticated') {
      resetData();
    }
  }, [logsAuthState, resetData]);

  useEffect(() => {
    if (typeof window === 'undefined' || !sessionRole || gatewayTargets.length === 0) return;

    const validTargetIds = new Set(gatewayTargets.map((target) => target.id));
    const prefix = `journal-scope:log-filters:role:${sessionRole}:target:`;

    try {
      for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
        const key = window.localStorage.key(index);
        if (!key || !key.startsWith(prefix)) continue;
        const targetId = key.slice(prefix.length);
        if (!validTargetIds.has(targetId)) {
          window.localStorage.removeItem(key);
        }
      }
    } catch {
      // Ignore storage cleanup failures so the UI remains usable.
    }
  }, [gatewayTargets, sessionRole]);

  useEffect(() => {
    if (!isSessionMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const targetNode = event.target as Node;
      const withinSessionMenu = [
        desktopSessionMenuRef.current,
        mobileSessionMenuRef.current
      ].some((ref) => ref?.contains(targetNode));

      if (isSessionMenuOpen && !withinSessionMenu) {
        closeSessionMenu();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeSessionMenu();
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [closeSessionMenu, isSessionMenuOpen]);

  const applyEndTime = (nextEndTimeInput: string, nextPinnedToNow: boolean) => {
    setEndTimeInput(nextEndTimeInput);
    setIsPinnedToNow(nextPinnedToNow);

    if (!nextPinnedToNow && isLiveTailing) {
      setIsLiveTailing(false);
      stopLiveTail();
    }
  };

  const toggleLiveTail = () => {
    if (!liveTailAvailable) return;
    const newState = !isLiveTailing;
    setIsLiveTailing(newState);
    if (newState) {
      if (status === 'connected') startLiveTail();
    } else {
      stopLiveTail();
    }
  };

  const clearFeed = () => {
    if (logs.length > 0) {
      setHasCleared(true);
      setLogs([]);
      setActiveLog(null);
      setSelectedLog(null);
    }
  };

  const undoClear = () => {
    setHasCleared(false);
  };

  const handleOpenLog = useCallback((log: LogEntry) => {
    setActiveLog(log);
    setSelectedLog((current) => (
      current && current.__REALTIME_TIMESTAMP === log.__REALTIME_TIMESTAMP && current.MESSAGE === log.MESSAGE
        ? null
        : log
    ));
  }, []);

  if (authState === 'checking') {
    return <div className="min-h-screen bg-background text-on-surface" />;
  }

  if (authState !== 'authenticated') {
    return (
      <AuthScreen
        accessCodeInput={accessCodeInput}
        authError={authError}
        authState={authState}
        isSubmittingAuth={isSubmittingAuth}
        lastError={lastError}
        onAccessCodeChange={setAccessCodeInput}
        onSubmit={submitAccessCode}
      />
    );
  }

  const backendSettingsPage = sessionRole === 'admin' ? (
    <BackendSettingsPage
      activeGatewayTarget={activeGatewayTarget}
      adminConfigError={adminConfigError}
      adminConfigNotice={adminConfigNotice}
      adminDefaultGatewayTargetIdDraft={adminDefaultGatewayTargetIdDraft}
      adminGatewayTargetsDraft={adminGatewayTargetsDraft}
      defaultGatewayTargetId={defaultGatewayTargetId}
      gatewayTargets={gatewayTargets}
      gatewayTestStatusById={gatewayTestStatusById}
      isSavingAdminConfig={isSavingAdminConfig}
      newAdminAccessCode={newAdminAccessCode}
      newViewerAccessCode={newViewerAccessCode}
      onAddDraftTarget={addDraftTarget}
      onAddDraftTargetHeader={addDraftTargetHeader}
      onDefaultTargetChange={setAdminDefaultGatewayTargetIdDraft}
      onNewAdminCodeChange={setNewAdminAccessCode}
      onNewViewerCodeChange={setNewViewerAccessCode}
      onRemoveDraftTarget={removeDraftTarget}
      onRemoveDraftTargetHeader={removeDraftTargetHeader}
      onSave={() => {
        void saveAdminConfig();
      }}
      onTestGatewayTarget={(targetId, rawUrl) => {
        void testGatewayTarget(targetId, rawUrl);
      }}
      onUpdateDraftTarget={updateDraftTarget}
      onUpdateDraftTargetHeader={updateDraftTargetHeader}
      testingGatewayTargetId={testingGatewayTargetId}
    />
  ) : null;
  const isBackendPage = currentPage === 'backend';

  const renderStatusIcon = (size: number, mobile = false) => {
    if (status === 'connected') {
      return <Network size={size} className={`shrink-0 text-primary ${mobile ? '' : 'drop-shadow-[0_0_10px_rgba(107,132,190,0.18)]'}`} aria-hidden="true" />;
    }

    if (status === 'connecting') {
      return <Network size={size} className="shrink-0 animate-pulse text-tertiary" aria-hidden="true" />;
    }

    return <Unplug size={size} className="shrink-0 text-outline" aria-hidden="true" />;
  };

  const renderFilterBar = (className: string) => (
    <div className={className}>
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <div className="log-scrollbar flex min-w-0 flex-wrap items-center gap-2 overflow-visible md:flex-nowrap md:overflow-x-auto md:overflow-y-hidden">
            {queryTokens.map((token) => (
              <button
                key={token.key}
                type="button"
                onClick={token.onRemove}
                className="inline-flex max-w-full items-center gap-1 rounded-full border border-primary/25 bg-primary/14 px-2 py-1 text-xs text-primary transition-colors hover:bg-primary/22 md:shrink-0"
                title={messages.removeFilter(token.label)}
              >
                <span className="break-all text-left">{token.label}</span>
                <X size={12} />
              </button>
            ))}
            <label className="flex min-w-0 w-full items-center gap-2 rounded-md border border-outline-variant/40 bg-surface-container-highest px-3 py-1.5 md:min-w-[220px] md:flex-1">
              <Search size={14} className="shrink-0 text-on-surface-variant/45" />
              <input
                type="text"
                value={expressionInput}
                onChange={(e) => setExpressionInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    applyExpressionInput();
                  }
                }}
                placeholder={messages.addFieldOrKeyword}
                className="min-w-0 flex-1 bg-transparent text-sm text-on-surface placeholder:text-on-surface-variant/35 focus:outline-none"
              />
            </label>
          </div>
          {expressionInputError && (
            <div className="mt-1 text-xs text-error">{expressionInputError}</div>
          )}
        </div>
        <button
          type="button"
          onClick={resetQueryPanel}
          className="ml-auto inline-flex shrink-0 items-center justify-center p-1 text-on-surface-variant/70 transition-colors hover:text-on-surface"
          aria-label={messages.resetFilters}
          title={messages.resetFilters}
        >
          <Delete size={18} />
        </button>
      </div>
    </div>
  );

  return (
    <div className="bg-background text-on-surface font-sans overflow-hidden h-screen flex flex-col">
      <div className="hidden md:flex justify-between items-center px-4 md:px-6 py-2 border-b border-outline-variant/30 gap-4 shrink-0 bg-surface-container/10">
        <div className="flex items-center gap-3 min-w-0">
          <span className="truncate text-lg font-bold text-on-surface">{messages.appName}</span>
        </div>
        <div className="flex items-center gap-3 min-w-0">
          <TopBarControls
            activeGatewayTarget={activeGatewayTarget}
            activeGatewayTargetId={activeGatewayTargetId}
            appVersion={appVersion}
            currentPage={currentPage}
            desktopSessionMenuRef={desktopSessionMenuRef}
            gatewayTargets={gatewayTargets}
            isLiveTailing={isLiveTailing}
            isPinnedToNow={isPinnedToNow}
            isSessionMenuOpen={isSessionMenuOpen}
            liveTailAvailable={liveTailAvailable}
            queryLimit={queryLimit}
            status={status}
            endTimeInput={endTimeInput}
            mobileSessionMenuRef={mobileSessionMenuRef}
            onCloseSessionMenu={closeSessionMenu}
            onLogout={() => {
              void logout();
            }}
            onSetEndTimeInput={(value) => {
              applyEndTime(value, false);
            }}
            onSetNow={() => {
              applyEndTime(getNowEndTimeInput(), true);
            }}
            onSetQueryLimit={(value) => {
              const nextValue = Math.min(MAX_QUERY_LIMIT, value || DEFAULT_QUERY_LIMIT);
              setQueryLimit(nextValue);
            }}
            onSetCurrentPage={setCurrentPage}
            onSwitchGatewayTarget={(targetId) => {
              void switchGatewayTarget(targetId);
            }}
            onToggleLiveTail={toggleLiveTail}
            onToggleSessionMenu={toggleSessionMenu}
            sessionRole={sessionRole}
            viewport="desktop"
            showFilteredCount={showFilteredCount}
            totalLogCount={totalLogCount}
            visibleLogCount={visibleLogCount}
            timeTitle={isPinnedToNow ? messages.viewingLiveEnd : messages.showingLatestAtOrBefore(`${getDatePart(endTimeInput)} ${getTimePart(endTimeInput)}`)}
          />
          {renderStatusIcon(14)}
        </div>
      </div>
      {currentPage === 'logs' && renderFilterBar('hidden md:block border-b border-outline-variant/20 bg-surface-container-low/40 px-6 py-2 shrink-0')}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Mobile Backdrop */}
        {!isBackendPage && isSidebarOpen && (
          <div className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-sm" onClick={() => setIsSidebarOpen(false)} />
        )}

        {!isBackendPage && (
          <aside id="filters-sidebar" className={`absolute md:relative inset-y-0 left-0 z-50 w-72 bg-surface-container-high md:bg-surface-container/40 border-r border-outline-variant/20 text-sm font-medium flex flex-col shrink-0 transition-all duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0 md:ml-0 shadow-[0_20px_44px_rgba(40,60,120,0.18)] md:shadow-none' : '-translate-x-full md:translate-x-0 md:-ml-72'}`}>
            <div className="px-6 py-4 border-b border-outline-variant/10 shrink-0 md:hidden">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3 min-w-0 md:hidden">
                  <span className="text-lg font-bold text-on-surface truncate">{messages.appName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="hidden md:inline-flex rounded-full border border-outline-variant/30 bg-surface-container-low px-2.5 py-1 text-xs font-bold uppercase tracking-widest text-on-surface-variant/75">
                    {status}
                  </span>
                  <button className="md:hidden text-on-surface-variant/70 p-1" onClick={() => setIsSidebarOpen(false)}><X size={18} /></button>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-visible log-scrollbar">
              <div className="px-4 pt-2 pb-4">
                {currentPage === 'logs' && (
                  <>
                    <section className="border-b border-outline-variant/20 py-4">
                      <div className="space-y-4">
                        <div>
                          <label className="ui-label">{messages.priority}</label>
                          <PriorityMultiSelect
                            values={expressionFilters.filter((item) => item.field === 'PRIORITY').map((item) => item.value)}
                            onChange={(nextValues) => {
                              setExpressionFilters((prev) => [
                                ...prev.filter((item) => item.field !== 'PRIORITY'),
                                ...nextValues.map((value) => ({ field: 'PRIORITY', value }))
                              ]);
                            }}
                          />
                        </div>

                        <div>
                          <label className="ui-label">{messages.sourceUnit}</label>
                          <SearchableSelect
                            value={unitFilter}
                            options={knownUnits}
                            placeholder={messages.anyUnit}
                            onOpen={() => {
                              void refreshUnitOptions();
                            }}
                            onChange={(val: string) => {
                              setUnitFilter(val);
                              setSyslogFilter('all');
                            }}
                          />
                        </div>

                        <div>
                          <label className="ui-label">{messages.syslogId}</label>
                          <SearchableSelect
                            value={syslogFilter}
                            options={knownSyslogs}
                            placeholder={messages.anyId}
                            onOpen={() => {
                              void refreshSyslogOptions();
                            }}
                            onChange={(val: string) => {
                              setSyslogFilter(val);
                              setUnitFilter('all');
                            }}
                          />
                        </div>

                      </div>
                    </section>

                    <section className="py-4">
                      <div className="space-y-4">
                        <div>
                          <label className="ui-label">{messages.hostname}</label>
                          <SearchableSelect
                            value={hostnameFilter}
                            options={knownHostnames}
                            placeholder={messages.anyHost}
                            onOpen={() => {
                              void refreshHostnameOptions();
                            }}
                            onChange={(val: string) => {
                              setHostnameFilter(val);
                            }}
                          />
                        </div>

                        <div>
                          <label className="ui-label">{messages.bootId}</label>
                          <SearchableSelect
                            value={bootIdFilter}
                            options={knownBootIds}
                            placeholder={messages.anyBoot}
                            onOpen={() => {
                              void refreshBootIdOptions();
                            }}
                            onChange={(val: string) => {
                              setBootIdFilter(val);
                            }}
                          />
                        </div>

                        <div>
                          <label className="ui-label">{messages.commandName}</label>
                          <SearchableSelect
                            value={commFilter}
                            options={knownComms}
                            placeholder={messages.anyComm}
                            onOpen={() => {
                              void refreshCommOptions();
                            }}
                            onChange={(val: string) => {
                              setCommFilter(val);
                            }}
                          />
                        </div>

                        <div>
                          <label className="ui-label">{messages.transport}</label>
                          <SearchableSelect
                            value={transportFilter}
                            options={knownTransports}
                            placeholder={messages.anyTransport}
                            onOpen={() => {
                              void refreshTransportOptions();
                            }}
                            onChange={(val: string) => {
                              setTransportFilter(val);
                            }}
                          />
                        </div>

                        <p className="text-xs text-on-surface-variant/45">{messages.unlistedFieldsHint}</p>
                      </div>
                    </section>
                  </>
                )}
              </div>
            </div>

          </aside>
        )}
        {!isBackendPage && (
          <button
            type="button"
            onClick={() => setIsSidebarOpen((prev) => !prev)}
            className={`absolute left-0 top-1/2 z-[60] hidden md:flex h-14 w-4 -translate-y-1/2 items-center justify-center rounded-r-sm border border-l-0 border-outline-variant/10 bg-surface-container-high text-on-surface-variant/45 transition-colors hover:border-outline-variant/20 hover:text-on-surface-variant/75 ${isSidebarOpen ? 'translate-x-72' : 'translate-x-0'}`}
            aria-label={isSidebarOpen ? messages.collapseFilters : messages.expandFilters}
            aria-expanded={isSidebarOpen}
            aria-controls="filters-sidebar"
          >
            {isSidebarOpen ? <ChevronLeft size={14} strokeWidth={2.25} /> : <ChevronRight size={14} strokeWidth={2.25} />}
          </button>
        )}

        <main className="flex-1 min-w-0 bg-surface flex flex-col overflow-hidden transition-all">
          <div className="flex md:hidden items-start px-4 py-2 border-b border-outline-variant/30 gap-3 shrink-0 bg-surface-container/10 min-w-0">
            {!isBackendPage && (
              <div className="flex w-8 shrink-0 flex-col gap-2">
                <div className="flex h-8 items-center justify-center">
                  <button
                    type="button"
                    onClick={() => setIsSidebarOpen((prev) => !prev)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-outline-variant/30 bg-surface-container-highest text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
                    aria-label={isSidebarOpen ? messages.closeFilters : messages.openFilters}
                    aria-expanded={isSidebarOpen}
                    aria-controls="filters-sidebar"
                  >
                    {isSidebarOpen ? <X size={15} /> : <Menu size={15} />}
                  </button>
                </div>
                <div className="flex h-8 items-center justify-center">
                  {renderStatusIcon(16, true)}
                </div>
              </div>
            )}
            <TopBarControls
              activeGatewayTarget={activeGatewayTarget}
              activeGatewayTargetId={activeGatewayTargetId}
              appVersion={appVersion}
              currentPage={currentPage}
              desktopSessionMenuRef={desktopSessionMenuRef}
              gatewayTargets={gatewayTargets}
              isLiveTailing={isLiveTailing}
              isPinnedToNow={isPinnedToNow}
              isSessionMenuOpen={isSessionMenuOpen}
              liveTailAvailable={liveTailAvailable}
              queryLimit={queryLimit}
              status={status}
              endTimeInput={endTimeInput}
              mobileSessionMenuRef={mobileSessionMenuRef}
              onCloseSessionMenu={closeSessionMenu}
              onLogout={() => {
                void logout();
              }}
              onSetEndTimeInput={(value) => {
                applyEndTime(value, false);
              }}
              onSetNow={() => {
                applyEndTime(getNowEndTimeInput(), true);
              }}
              onSetQueryLimit={(value) => {
                const nextValue = Math.min(MAX_QUERY_LIMIT, value || DEFAULT_QUERY_LIMIT);
                setQueryLimit(nextValue);
              }}
              onSetCurrentPage={setCurrentPage}
              onSwitchGatewayTarget={(targetId) => {
                void switchGatewayTarget(targetId);
              }}
              onToggleLiveTail={toggleLiveTail}
              onToggleSessionMenu={toggleSessionMenu}
              sessionRole={sessionRole}
              viewport="mobile"
              showFilteredCount={showFilteredCount}
              totalLogCount={totalLogCount}
              visibleLogCount={visibleLogCount}
              timeTitle={isPinnedToNow ? messages.viewingLiveEnd : messages.showingLatestAtOrBefore(`${getDatePart(endTimeInput)} ${getTimePart(endTimeInput)}`)}
            />
          </div>
          {currentPage === 'logs' && renderFilterBar('md:hidden border-b border-outline-variant/20 bg-surface-container-low/40 px-4 py-2 shrink-0')}

          {currentPage === 'backend' ? backendSettingsPage : (
            <section className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <div className="ui-table-head grid grid-cols-[130px_80px_minmax(0,1fr)_auto] md:grid-cols-[160px_120px_minmax(0,1fr)_auto] min-w-max items-center pl-4 pr-3 md:pl-9 md:pr-8 py-3 border-b border-outline-variant/10 bg-surface-container-lowest shrink-0">
                <button
                  type="button"
                  onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
                  className="flex items-center gap-2 text-left transition-colors hover:text-on-surface"
                    title={sortOrder === 'desc' ? messages.newestFirst : messages.oldestFirst}
                  >
                  <span>{messages.timestamp}</span>
                  {sortOrder === 'desc' ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
                </button>
                <span>{messages.source}</span>
                <span>{messages.message}</span>
                <div className="flex justify-end justify-self-end">
                  {hasCleared ? (
                    <button
                      type="button"
                      onClick={undoClear}
                      className="ui-action-caption shrink-0 hover:text-on-surface"
                      title={messages.refetch}
                      aria-label={messages.refetch}
                    >
                      <span className="inline-flex items-center gap-2">
                        <RefreshCw size={12} />
                        <span className="hidden lg:inline">{messages.refetch}</span>
                      </span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={clearFeed}
                      className="ui-action-caption shrink-0 hover:text-on-surface disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={logs.length === 0}
                      title={messages.clearFeed}
                      aria-label={messages.clearFeed}
                    >
                      <span className="inline-flex items-center gap-2">
                        <Trash2 size={14} />
                        <span className="hidden lg:inline">{messages.clearFeed}</span>
                      </span>
                    </button>
                  )}
                </div>
              </div>

              <div className="relative flex-1 min-h-0 overflow-hidden bg-background/50">
                {isFiltering ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-on-surface-variant/50">
                    <Search size={40} className="mb-4 opacity-20 animate-pulse" />
                    <p>{messages.filteringLogs}</p>
                  </div>
                ) : visibleLogCount === 0 && status === 'connected' ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-on-surface-variant/50">
                    <Search size={48} className="mb-4 opacity-20" />
                    <p>{messages.noLogsMatch}</p>
                  </div>
                ) : (
                  <VirtualLogList
                    logs={logs}
                    logIndices={filteredLogIndices}
                    activeLog={activeLog}
                    onActivateLog={setActiveLog}
                    onOpenLog={handleOpenLog}
                    status={status}
                    searchQuery={searchQuery}
                    errorMessage={lastError}
                  />
                )}
              </div>

              {windowTruncated && (
                <div className="relative z-30 isolate min-h-[56px] px-4 md:px-6 py-3 border-t border-outline-variant/20 bg-surface-container-low flex items-center justify-between gap-4 pointer-events-auto shrink-0">
                  <div className="text-xs text-on-surface-variant/80">
                    {messages.loadedWindowCapped(CLIENT_WINDOW_CAP.toLocaleString())}
                  </div>
                </div>
              )}
            </section>
          )}

          {selectedLog && (
            <div className="absolute bottom-0 left-0 right-0 z-30 md:bottom-6 md:left-auto md:right-6 md:z-50 md:w-96 max-h-[60vh] flex flex-col overflow-hidden bg-surface-container/90 backdrop-blur-xl border border-outline-variant/30 rounded-t-xl md:rounded-xl shadow-[0_24px_56px_rgba(122,112,100,0.18)]">
              <div className="p-4 bg-primary/5 border-b border-outline-variant/10 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-on-surface tracking-wider uppercase">{messages.eventDetails}</span>
                </div>
                <button onClick={() => setSelectedLog(null)} className="text-on-surface-variant hover:text-on-surface transition-colors">
                  <X size={16} />
                </button>
              </div>
              <div className="p-5 overflow-y-auto log-scrollbar space-y-4 text-sm flex-1">
                <div className="space-y-3">
                  {Object.entries(selectedLog).filter(([k]) => !['_s', '_p'].includes(k)).sort(([a], [b]) => {
                    const top = ['__REALTIME_TIMESTAMP', 'PRIORITY', 'MESSAGE'];
                    if (top.includes(a) && !top.includes(b)) return -1;
                    if (!top.includes(a) && top.includes(b)) return 1;
                    return a.localeCompare(b);
                  }).map(([k, v]) => {
                    if (k === '__REALTIME_TIMESTAMP') {
                      const rawValue = typeof v === 'string' ? v : JSON.stringify(v);
                      return (
                        <div key={k} className="flex flex-col gap-1 border-b border-outline-variant/5 pb-2 mb-2">
                          <span className="text-on-surface-variant/60 font-bold tracking-wider">{k}</span>
                          <div className="rounded bg-surface-container-lowest p-2 text-left break-all text-tertiary-fixed-dim">
                            <div>{rawValue}</div>
                            <div className="mt-1 text-xs text-on-surface-variant/55">
                              {formatTimestamp(String(v), locale)}
                            </div>
                          </div>
                        </div>
                      )
                    }

                    let displayVal = v;
                    const isLong = typeof displayVal === 'string' && displayVal.length > 50 || k === 'MESSAGE';
                    const s = typeof displayVal === 'string' ? displayVal : JSON.stringify(displayVal);
                    const canApplyFilter = s !== '' && !k.startsWith('__');

                    if (isLong) {
                      return (
                        <div key={k} className="flex flex-col gap-1 border-b border-outline-variant/5 pb-2 mb-2">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-on-surface-variant/60 font-bold tracking-wider">{k}</span>
                            {canApplyFilter && (
                              <button
                                type="button"
                                onClick={() => applyDetailFilter(k, v)}
                                className="ui-action-caption shrink-0 rounded border border-outline-variant/20 px-1.5 py-0.5 text-[10px] hover:border-primary/40 hover:text-primary"
                                title={messages.applyFilterFrom(k)}
                              >
                                {messages.filter}
                              </button>
                            )}
                          </div>
                          <div className="select-text rounded bg-surface-container-lowest p-2 text-left text-sm text-tertiary-fixed-dim whitespace-pre-wrap break-all">
                            <AnsiText text={s} />
                          </div>
                        </div>
                      )
                    }
                    return (
                      <div key={k} className="flex justify-between items-center border-b border-outline-variant/5 pb-2 mb-2 break-all gap-4">
                        <span className="text-on-surface-variant/60 font-bold tracking-wider shrink-0">{k}</span>
                        {canApplyFilter ? (
                          <button
                            type="button"
                            onClick={() => applyDetailFilter(k, v)}
                            className="text-right text-primary-fixed-dim transition-colors hover:text-primary"
                             title={messages.applyFilterFrom(k)}
                          >
                            <AnsiText text={s} />
                          </button>
                        ) : (
                          <span className="text-primary-fixed-dim text-right"><AnsiText text={s} /></span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

        </main>
      </div>
      <PwaUpdateBanner />
    </div>
  );
}
