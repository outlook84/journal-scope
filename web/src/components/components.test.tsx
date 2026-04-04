import { createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { AuthScreen } from './AuthScreen';
import { TopBarControls } from './TopBarControls';
import { LocaleProvider } from '../i18n';

describe('AuthScreen', () => {
  it('renders the unauthenticated prompt and active error message', () => {
    const markup = renderToStaticMarkup(
      <AuthScreen
        accessCodeInput="secret"
        authError="Invalid access code"
        authState="unauthenticated"
        isSubmittingAuth={false}
        lastError={null}
        onAccessCodeChange={() => {}}
        onSubmit={() => {}}
      />
    );

    expect(markup).toContain('Enter a viewer or admin access code to unlock the log view.');
    expect(markup).toContain('Invalid access code');
    expect(markup).toContain('Unlock Journal Scope');
  });

  it('renders the checking state copy and disabled submit button', () => {
    const markup = renderToStaticMarkup(
      <AuthScreen
        accessCodeInput=""
        authError={null}
        authState="checking"
        isSubmittingAuth={true}
        lastError="Network error"
        onAccessCodeChange={() => {}}
        onSubmit={() => {}}
      />
    );

    expect(markup).toContain('Checking current session');
    expect(markup).toContain('Network error');
    expect(markup).toContain('Unlocking');
    expect(markup).toContain('disabled');
  });
});

describe('TopBarControls', () => {
  const baseProps = {
    activeGatewayTarget: { id: 'a', name: 'Primary', url: 'https://gateway.example' },
    activeGatewayTargetId: 'a',
    currentPage: 'logs' as const,
    desktopSessionMenuRef: createRef<HTMLDivElement>(),
    gatewayTargets: [{ id: 'a', name: 'Primary', url: 'https://gateway.example' }],
    isLiveTailing: false,
    isPinnedToNow: false,
    isSessionMenuOpen: false,
    liveTailAvailable: true,
    queryLimit: 1000,
    status: 'connected' as const,
    endTimeInput: '2024-01-02T03:04',
    mobileSessionMenuRef: createRef<HTMLDivElement>(),
    onCloseSessionMenu: vi.fn(),
    onLogout: vi.fn(),
    onSetEndTimeInput: vi.fn(),
    onSetNow: vi.fn(),
    onSetQueryLimit: vi.fn(),
    onSetCurrentPage: vi.fn(),
    onSwitchGatewayTarget: vi.fn(),
    onToggleLiveTail: vi.fn(),
    onToggleSessionMenu: vi.fn(),
    sessionRole: 'admin' as const,
    showFilteredCount: false,
    totalLogCount: 321,
    visibleLogCount: 321,
    timeValueLabel: '2024-01-02 03:04',
    timeTitle: 'Showing latest matches at or before 2024-01-02 03:04'
  };

  it('renders desktop controls with the compact query limit label', () => {
    const markup = renderToStaticMarkup(
      <TopBarControls
        {...baseProps}
        viewport="desktop"
      />
    );

    expect(markup).toContain('2024 / 01 / 02');
    expect(markup).toContain('321');
    expect(markup).toContain('Primary');
    expect(markup).toContain('admin');
    expect(markup).not.toContain('Set Time');
  });

  it('renders mobile pinned-to-now state and viewer session label', () => {
    const markup = renderToStaticMarkup(
      <TopBarControls
        {...baseProps}
        isPinnedToNow={true}
        liveTailAvailable={false}
        sessionRole="viewer"
        viewport="mobile"
      />
    );

    expect(markup).toContain('Viewer');
    expect(markup).toContain('Set Time');
    expect(markup).toContain('disabled');
    expect(markup).toContain('Live tail is available only when End Time is set to Now');
  });

  it('renders the selected query limit with the live visible count even past the initial limit', () => {
    const markup = renderToStaticMarkup(
      <TopBarControls
        {...baseProps}
        queryLimit={1000}
        showFilteredCount={false}
        totalLogCount={1003}
        visibleLogCount={1003}
        viewport="desktop"
      />
    );

    expect(markup).toContain('1003');
  });

  it('renders filtered counts as visible over total window count', () => {
    const markup = renderToStaticMarkup(
      <TopBarControls
        {...baseProps}
        queryLimit={1000}
        showFilteredCount={true}
        totalLogCount={1000}
        visibleLogCount={50}
        viewport="desktop"
      />
    );

    expect(markup).toContain('50/1000');
  });

  it('shows the configured query limit while the initial connection is still loading', () => {
    const markup = renderToStaticMarkup(
      <TopBarControls
        {...baseProps}
        status="connecting"
        totalLogCount={0}
        visibleLogCount={0}
        viewport="desktop"
      />
    );

    expect(markup).toContain('1000');
    expect(markup).not.toContain('>0<');
  });

  it('renders Simplified Chinese session menu labels when locale is zh-CN', () => {
    const markup = renderToStaticMarkup(
      <LocaleProvider initialLocale="zh-CN">
        <TopBarControls
          {...baseProps}
          isSessionMenuOpen={true}
          viewport="desktop"
        />
      </LocaleProvider>
    );

    expect(markup).toContain('语言');
    expect(markup).toContain('退出登录');
    expect(markup).not.toContain('当前身份');
  });
});
