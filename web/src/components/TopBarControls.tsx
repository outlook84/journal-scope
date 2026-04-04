import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

import { useI18n } from '../i18n-context';
import { useTheme, type ThemePreference } from '../theme-context';
import type { AppPage, GatewayTarget, SessionRole } from '../types/app';
import { TimeRangeControl } from './TimeRangeControl';

type TopBarControlsProps = {
  activeGatewayTarget: GatewayTarget | null;
  activeGatewayTargetId: string;
  appVersion: string;
  currentPage: AppPage;
  desktopSessionMenuRef: React.RefObject<HTMLDivElement | null>;
  gatewayTargets: GatewayTarget[];
  isLiveTailing: boolean;
  isPinnedToNow: boolean;
  isSessionMenuOpen: boolean;
  liveTailAvailable: boolean;
  queryLimit: number;
  status: 'disconnected' | 'connecting' | 'connected';
  endTimeInput: string;
  onCloseSessionMenu: () => void;
  onLogout: () => void;
  onSetEndTimeInput: (value: string) => void;
  onSetNow: () => void;
  onSetQueryLimit: (value: number) => void;
  onSetCurrentPage: (page: AppPage) => void;
  onSwitchGatewayTarget: (targetId: string) => void;
  onToggleLiveTail: () => void;
  onToggleSessionMenu: () => void;
  sessionRole: SessionRole | null;
  viewport: 'desktop' | 'mobile';
  showFilteredCount: boolean;
  totalLogCount: number;
  visibleLogCount: number;
  mobileSessionMenuRef: React.RefObject<HTMLDivElement | null>;
  timeTitle: string;
};

export function TopBarControls({
  activeGatewayTarget,
  activeGatewayTargetId,
  appVersion,
  currentPage,
  desktopSessionMenuRef,
  gatewayTargets,
  isLiveTailing,
  isPinnedToNow,
  isSessionMenuOpen,
  liveTailAvailable,
  queryLimit,
  status,
  endTimeInput,
  mobileSessionMenuRef,
  onCloseSessionMenu,
  onLogout,
  onSetEndTimeInput,
  onSetNow,
  onSetQueryLimit,
  onSetCurrentPage,
  onSwitchGatewayTarget,
  onToggleLiveTail,
  onToggleSessionMenu,
  sessionRole,
  viewport,
  showFilteredCount,
  totalLogCount,
  visibleLogCount,
  timeTitle
}: TopBarControlsProps) {
  const { locale, messages, setLocale, supportedLocales } = useI18n();
  const { themePreference, setThemePreference, supportedThemes } = useTheme();
  const isMobile = viewport === 'mobile';

  const selectedQueryLimitLabel = status !== 'connected'
    ? String(queryLimit)
    : !showFilteredCount || visibleLogCount === totalLogCount
    ? String(totalLogCount)
    : `${visibleLogCount}/${totalLogCount}`;

  const sessionLabel = isMobile
    ? (sessionRole ? messages.sessionRole(sessionRole) : '')
    : (sessionRole ? messages.sessionRoleMenuLabel(sessionRole) : '');

  const queryLimitOptions = [100, 250, 500, 1000, 2500, 5000, 10000];

  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);

  const themeLabels: Record<ThemePreference, string> = {
    system: messages.themeSystem,
    light: messages.themeLight,
    dark: messages.themeDark
  };

  // Gate sub-menus on the parent session menu being open — if the session menu
  // closes, these are derived as false without needing a setState-in-effect.
  const effectiveLanguageMenuOpen = isSessionMenuOpen && isLanguageMenuOpen;
  const effectiveThemeMenuOpen = isSessionMenuOpen && isThemeMenuOpen;

  const renderSessionMenu = () => (
    <div className="absolute right-0 top-[calc(100%+8px)] z-[80] min-w-[188px] overflow-visible rounded-lg border border-outline-variant/45 bg-surface-container-low/95 shadow-[0_20px_48px_rgba(60,80,140,0.15)] backdrop-blur">
      {sessionRole === 'admin' && (
        <>
          <div className="ui-menu-heading">
            {messages.view}
          </div>
          <button
            type="button"
            onClick={() => {
              onSetCurrentPage('logs');
              onCloseSessionMenu();
            }}
            className={`ui-action-caption flex w-full items-center justify-between px-3 py-2.5 text-left ${currentPage === 'logs' ? 'bg-primary/10 text-primary' : 'text-on-surface hover:bg-surface-container/70'}`}
            role="menuitem"
          >
            <span>{messages.logs}</span>
            {currentPage === 'logs' ? <span className="text-xs text-primary/80">{messages.current}</span> : null}
          </button>
          <button
            type="button"
            onClick={() => {
              onSetCurrentPage('backend');
              onCloseSessionMenu();
            }}
            className={`ui-action-caption flex w-full items-center justify-between px-3 py-2.5 text-left ${currentPage === 'backend' ? 'bg-primary/10 text-primary' : 'text-on-surface hover:bg-surface-container/70'}`}
            role="menuitem"
          >
            <span>{messages.backend}</span>
            {currentPage === 'backend' ? <span className="text-xs text-primary/80">{messages.current}</span> : null}
          </button>
          <div className="mx-3 border-t border-outline-variant/15" />
        </>
      )}

      <div className="mx-3 border-t border-outline-variant/15" />

      <div className="ui-menu-heading">
        {messages.language}
      </div>
      <button
        type="button"
        onClick={() => setIsLanguageMenuOpen((current) => !current)}
        className={`ui-action-caption flex w-full items-center justify-between px-3 py-2.5 text-left ${effectiveLanguageMenuOpen ? 'bg-surface-container/80 text-on-surface' : 'text-on-surface hover:bg-surface-container/70'}`}
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={effectiveLanguageMenuOpen}
      >
        <span>{locale === 'en' ? 'English' : '简体中文'}</span>
        <ChevronDown size={14} className={`transition-transform ${effectiveLanguageMenuOpen ? 'rotate-180' : ''}`} />
      </button>
      {effectiveLanguageMenuOpen ? (
        <div className="border-t border-outline-variant/15 bg-surface-container-low/60 py-1">
          {supportedLocales.map((supportedLocale) => (
            <button
              key={supportedLocale}
              type="button"
              onClick={() => {
                setLocale(supportedLocale);
                setIsLanguageMenuOpen(false);
                onCloseSessionMenu();
              }}
              className={`ui-action-caption flex w-full items-center justify-between px-5 py-2.5 text-left ${locale === supportedLocale ? 'text-primary' : 'text-on-surface hover:bg-surface-container/70'}`}
              role="menuitem"
            >
              <span>{supportedLocale === 'en' ? 'English' : '简体中文'}</span>
              {locale === supportedLocale ? <span className="text-xs text-primary/80">{messages.current}</span> : null}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mx-3 border-t border-outline-variant/15" />

      <div className="ui-menu-heading">
        {messages.theme}
      </div>
      <button
        type="button"
        onClick={() => setIsThemeMenuOpen((current) => !current)}
        className={`ui-action-caption flex w-full items-center justify-between px-3 py-2.5 text-left ${effectiveThemeMenuOpen ? 'bg-surface-container/80 text-on-surface' : 'text-on-surface hover:bg-surface-container/70'}`}
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={effectiveThemeMenuOpen}
      >
        <span>{themeLabels[themePreference]}</span>
        <ChevronDown size={14} className={`transition-transform ${effectiveThemeMenuOpen ? 'rotate-180' : ''}`} />
      </button>
      {effectiveThemeMenuOpen ? (
        <div className="border-t border-outline-variant/15 bg-surface-container-low/60 py-1">
          {supportedThemes.map((supportedTheme) => (
            <button
              key={supportedTheme}
              type="button"
              onClick={() => {
                setThemePreference(supportedTheme);
                setIsThemeMenuOpen(false);
                onCloseSessionMenu();
              }}
              className={`ui-action-caption flex w-full items-center justify-between px-5 py-2.5 text-left ${themePreference === supportedTheme ? 'text-primary' : 'text-on-surface hover:bg-surface-container/70'}`}
              role="menuitem"
            >
              <span>{themeLabels[supportedTheme]}</span>
              {themePreference === supportedTheme ? <span className="text-xs text-primary/80">{messages.current}</span> : null}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mx-3 border-t border-outline-variant/15" />

      <div className="px-3 py-2 text-sm leading-none text-on-surface-variant/45">
        {messages.version} {appVersion}
      </div>

      <div className="mx-3 border-t border-outline-variant/15" />

      <div className="relative">
        <button
          type="button"
          onClick={() => {
            onCloseSessionMenu();
            onLogout();
          }}
          className="ui-action-caption flex w-full items-center px-3 py-2.5 text-left text-on-surface hover:bg-surface-container/70"
          role="menuitem"
        >
          {messages.signOut}
        </button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <div className="min-w-0 flex-1 select-none">
        <div className="flex min-w-0 items-center gap-2">
          {currentPage === 'logs' && (
            <>
              {gatewayTargets.length > 0 && (
                <select
                  value={activeGatewayTargetId}
                  onChange={(event) => onSwitchGatewayTarget(event.target.value)}
                  className="h-8 min-w-0 flex-1 rounded-md border border-outline-variant/45 bg-surface-container-lowest px-2 text-sm font-medium text-on-surface-variant focus:outline-none focus:border-primary/55"
                  title={activeGatewayTarget?.url || messages.selectGatewayTarget}
                >
                  {gatewayTargets.map((target) => (
                    <option key={target.id} value={target.id}>
                      {target.name}
                    </option>
                  ))}
                </select>
              )}
              <select
                value={queryLimit}
                onChange={(event) => onSetQueryLimit(parseInt(event.target.value, 10))}
                className="h-8 min-w-[84px] shrink-0 rounded-md border border-outline-variant/45 bg-surface-container-lowest px-2 text-base font-medium text-on-surface-variant focus:outline-none focus:border-primary/55"
                title={messages.queryEntryLimit}
              >
                {queryLimitOptions.map((option) => (
                  <option key={option} value={option}>
                    {option === queryLimit ? selectedQueryLimitLabel : option}
                  </option>
                ))}
              </select>
            </>
          )}

          {sessionRole && (
            <div className="relative ml-auto shrink-0" ref={mobileSessionMenuRef}>
              <button
                type="button"
                onClick={onToggleSessionMenu}
                className={`ui-action-caption flex h-8 items-center gap-2 rounded-md border px-2 ${isSessionMenuOpen
                  ? 'border-primary/30 bg-surface-container text-on-surface'
                  : 'border-outline-variant/45 bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'
                  }`}
                aria-haspopup="menu"
                aria-expanded={isSessionMenuOpen}
              >
                <span>{sessionLabel}</span>
                <ChevronDown size={14} className={`transition-transform ${isSessionMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              {isSessionMenuOpen ? renderSessionMenu() : null}
            </div>
          )}
        </div>

        {currentPage === 'logs' && (
          <div className="mt-2">
            <TimeRangeControl
              endTimeInput={endTimeInput}
              isLiveTailing={isLiveTailing}
              isPinnedToNow={isPinnedToNow}
              liveTailAvailable={liveTailAvailable}
              size="sm"
              timeTitle={timeTitle}
              onSetNow={onSetNow}
              onSetEndTimeInput={onSetEndTimeInput}
              onToggleLiveTail={onToggleLiveTail}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center select-none gap-3 md:gap-4 flex-wrap">
      {currentPage === 'logs' && (
        <>
          {gatewayTargets.length > 0 && (
            <select
              value={activeGatewayTargetId}
              onChange={(event) => onSwitchGatewayTarget(event.target.value)}
              className="h-9 shrink min-w-0 max-w-[220px] rounded-md border border-outline-variant/45 bg-surface-container-lowest px-3 text-sm font-medium text-on-surface-variant focus:outline-none focus:border-primary/55"
              title={activeGatewayTarget?.url || messages.selectGatewayTarget}
            >
              {gatewayTargets.map((target) => (
                <option key={target.id} value={target.id}>
                  {target.name}
                </option>
              ))}
            </select>
          )}
          <select
            value={queryLimit}
            onChange={(event) => onSetQueryLimit(parseInt(event.target.value, 10))}
            className="h-9 min-w-[92px] shrink-0 rounded-md border border-outline-variant/45 bg-surface-container-lowest px-3 text-base font-medium text-on-surface-variant focus:outline-none focus:border-primary/55"
            title={messages.queryEntryLimit}
          >
            {queryLimitOptions.map((option) => (
              <option key={option} value={option}>
                {option === queryLimit ? selectedQueryLimitLabel : option}
              </option>
            ))}
          </select>

          <TimeRangeControl
            endTimeInput={endTimeInput}
            isLiveTailing={isLiveTailing}
            isPinnedToNow={isPinnedToNow}
            liveTailAvailable={liveTailAvailable}
            size="md"
            timeTitle={timeTitle}
            onSetNow={onSetNow}
            onSetEndTimeInput={onSetEndTimeInput}
            onToggleLiveTail={onToggleLiveTail}
          />
        </>
      )}

      {sessionRole && (
        <div className="relative shrink-0" ref={viewport === 'desktop' ? desktopSessionMenuRef : mobileSessionMenuRef}>
          <button
            type="button"
            onClick={onToggleSessionMenu}
            className={`ui-action-caption flex h-9 items-center gap-2 rounded-md border px-3 ${isSessionMenuOpen
              ? 'border-primary/30 bg-surface-container text-on-surface'
              : 'border-outline-variant/45 bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'
              }`}
            aria-haspopup="menu"
            aria-expanded={isSessionMenuOpen}
          >
            <span>{messages.sessionRoleMenuLabel(sessionRole)}</span>
            <ChevronDown size={14} className={`transition-transform ${isSessionMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {isSessionMenuOpen ? renderSessionMenu() : null}
        </div>
      )}
    </div>
  );
}
