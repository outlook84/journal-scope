import { useCallback, useEffect, useMemo, useState } from 'react';

import type { SupportedLocale } from '../i18n-context';
import { getMessages } from '../i18n-context';
import type {
  AdminConfigPayload,
  GatewayTarget,
  GatewayTargetsPayload,
  GatewayTestStatus,
  SessionRole,
  SessionState
} from '../types/app';
import { normalizeGatewayHeaders } from '../utils/app';

type UseGatewayAdminOptions = {
  apiFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  apiUrl: string;
  authState: SessionState;
  locale: SupportedLocale;
  sessionRole: SessionRole | null;
  onReconnect: () => void;
};

export function useGatewayAdmin({
  apiFetch,
  apiUrl,
  authState,
  locale,
  sessionRole,
  onReconnect
}: UseGatewayAdminOptions) {
  const copy = getMessages(locale);
  const [gatewayTargets, setGatewayTargets] = useState<GatewayTarget[]>([]);
  const [activeGatewayTargetId, setActiveGatewayTargetId] = useState('');
  const [defaultGatewayTargetId, setDefaultGatewayTargetId] = useState('');
  const [adminGatewayTargetsDraft, setAdminGatewayTargetsDraft] = useState<GatewayTarget[]>([]);
  const [adminDefaultGatewayTargetIdDraft, setAdminDefaultGatewayTargetIdDraft] = useState('');
  const [newAdminAccessCode, setNewAdminAccessCode] = useState('');
  const [newViewerAccessCode, setNewViewerAccessCode] = useState('');
  const [adminConfigError, setAdminConfigError] = useState<string | null>(null);
  const [adminConfigNotice, setAdminConfigNotice] = useState<string | null>(null);
  const [isSavingAdminConfig, setIsSavingAdminConfig] = useState(false);
  const [testingGatewayTargetId, setTestingGatewayTargetId] = useState<string | null>(null);
  const [gatewayTestStatusById, setGatewayTestStatusById] = useState<Record<string, GatewayTestStatus>>({});

  const activeGatewayTarget = useMemo(
    () => gatewayTargets.find((target) => target.id === activeGatewayTargetId) ?? gatewayTargets[0] ?? null,
    [activeGatewayTargetId, gatewayTargets]
  );

  const clearTargetTestStatus = useCallback((targetId: string) => {
    setGatewayTestStatusById((prev) => {
      if (!prev[targetId]) return prev;
      const next = { ...prev };
      delete next[targetId];
      return next;
    });
  }, []);

  const loadGatewayTargets = useCallback(async () => {
    if (authState !== 'authenticated') return null;
    const res = await apiFetch(`${apiUrl}/gateway-targets`, {
      headers: { Accept: 'application/json' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as GatewayTargetsPayload;
    setGatewayTargets(data.gatewayTargets);
    setActiveGatewayTargetId(data.activeGatewayTargetId);
    return data;
  }, [apiFetch, apiUrl, authState]);

  const loadAdminConfig = useCallback(async () => {
    if (authState !== 'authenticated' || sessionRole !== 'admin') return;
    const res = await apiFetch(`${apiUrl}/admin/config`, {
      headers: { Accept: 'application/json' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const config = await res.json() as AdminConfigPayload;
    setDefaultGatewayTargetId(config.defaultGatewayTargetId);
    setAdminGatewayTargetsDraft(config.gatewayTargets.map((target) => ({ ...target })));
    setAdminDefaultGatewayTargetIdDraft(config.defaultGatewayTargetId);
  }, [apiFetch, apiUrl, authState, sessionRole]);

  useEffect(() => {
    if (authState !== 'authenticated') {
      setGatewayTargets([]);
      setActiveGatewayTargetId('');
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        await loadGatewayTargets();
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to load gateway targets:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authState, loadGatewayTargets]);

  useEffect(() => {
    if (authState !== 'authenticated' || sessionRole !== 'admin') {
      setDefaultGatewayTargetId('');
      setAdminGatewayTargetsDraft([]);
      setAdminDefaultGatewayTargetIdDraft('');
      setNewAdminAccessCode('');
      setNewViewerAccessCode('');
      setAdminConfigError(null);
      setAdminConfigNotice(null);
      setGatewayTestStatusById({});
      setTestingGatewayTargetId(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        await loadAdminConfig();
      } catch (err: any) {
        if (cancelled) return;
        console.error('Failed to load admin config:', err);
        setAdminConfigError(err?.message || copy.failedToLoadAdminConfig);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authState, copy.failedToLoadAdminConfig, loadAdminConfig, sessionRole]);

  const saveAdminConfig = useCallback(async () => {
    if (sessionRole !== 'admin') return;
    const normalizedTargets = adminGatewayTargetsDraft
      .map((target) => ({
        id: target.id.trim(),
        name: target.name.trim(),
        url: target.url.trim(),
        tlsServerName: (target.tlsServerName ?? '').trim(),
        headers: normalizeGatewayHeaders(target.headers)
      }))
      .filter((target) => target.id !== '' || target.name !== '' || target.url !== '');

    if (normalizedTargets.length === 0) {
      setAdminConfigError(copy.gatewayTargetRequired);
      return;
    }
    if (normalizedTargets.some((target) => !target.id || !target.name || !target.url)) {
      setAdminConfigError(copy.gatewayTargetFieldsRequired);
      return;
    }
    if (normalizedTargets.some((target) => target.headers.some((header) => !header.name || !header.value))) {
      setAdminConfigError(copy.gatewayHeaderFieldsRequired);
      return;
    }

    setIsSavingAdminConfig(true);
    setAdminConfigError(null);
    setAdminConfigNotice(null);
    try {
      const payload: {
        gatewayTargets: GatewayTarget[];
        defaultGatewayTargetId: string;
        adminAccessCode?: string;
        viewerAccessCode?: string;
      } = {
        gatewayTargets: normalizedTargets,
        defaultGatewayTargetId: adminDefaultGatewayTargetIdDraft || normalizedTargets[0].id
      };
      if (newAdminAccessCode.trim()) payload.adminAccessCode = newAdminAccessCode.trim();
      if (newViewerAccessCode.trim()) payload.viewerAccessCode = newViewerAccessCode.trim();

      const res = await apiFetch(`${apiUrl}/admin/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || `HTTP ${res.status}`);
      }
      const config = await res.json() as AdminConfigPayload;
      setDefaultGatewayTargetId(config.defaultGatewayTargetId);
      setAdminGatewayTargetsDraft(config.gatewayTargets.map((target) => ({ ...target })));
      setAdminDefaultGatewayTargetIdDraft(config.defaultGatewayTargetId);
      setNewAdminAccessCode('');
      setNewViewerAccessCode('');
      setAdminConfigNotice(copy.savedBackendSettings);
      await loadGatewayTargets();
      onReconnect();
    } catch (err: any) {
      console.error('Failed to save admin config:', err);
      setAdminConfigError(err?.message || copy.failedToSaveBackendSettings);
    } finally {
      setIsSavingAdminConfig(false);
    }
  }, [
    adminDefaultGatewayTargetIdDraft,
    adminGatewayTargetsDraft,
    apiFetch,
    apiUrl,
    copy.failedToSaveBackendSettings,
    copy.gatewayHeaderFieldsRequired,
    copy.gatewayTargetFieldsRequired,
    copy.gatewayTargetRequired,
    copy.savedBackendSettings,
    loadGatewayTargets,
    newAdminAccessCode,
    newViewerAccessCode,
    onReconnect,
    sessionRole
  ]);

  const switchGatewayTarget = useCallback(async (targetId: string) => {
    if (!targetId || targetId === activeGatewayTargetId) return;
    try {
      const res = await apiFetch(`${apiUrl}/gateway-targets/active`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({ targetId })
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || `HTTP ${res.status}`);
      }
      const data = await res.json() as GatewayTargetsPayload;
      setGatewayTargets(data.gatewayTargets);
      setActiveGatewayTargetId(data.activeGatewayTargetId);
      setAdminConfigError(null);
      onReconnect();
    } catch (err: any) {
      console.error('Failed to switch gateway target:', err);
      setAdminConfigError(err?.message || copy.failedToSwitchGatewayTarget);
    }
  }, [activeGatewayTargetId, apiFetch, apiUrl, copy.failedToSwitchGatewayTarget, onReconnect]);

  const testGatewayTarget = useCallback(async (targetId: string, rawUrl: string) => {
    const draftTarget = adminGatewayTargetsDraft.find((target) => target.id === targetId);
    const nextURL = rawUrl.trim();
    if (!nextURL) {
      setGatewayTestStatusById((prev) => ({
        ...prev,
        [targetId]: { kind: 'error', message: copy.enterUrlFirst }
      }));
      return;
    }

    setTestingGatewayTargetId(targetId);
    setGatewayTestStatusById((prev) => {
      const next = { ...prev };
      delete next[targetId];
      return next;
    });

    try {
      const res = await apiFetch(`${apiUrl}/admin/test-gateway`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          url: nextURL,
          tlsServerName: (draftTarget?.tlsServerName ?? '').trim(),
          headers: normalizeGatewayHeaders(draftTarget?.headers)
        })
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || `HTTP ${res.status}`);
      }
      const data = await res.json() as { status?: number };
      setGatewayTestStatusById((prev) => ({
        ...prev,
        [targetId]: {
          kind: 'success',
          message: copy.reachableHttp(data.status ?? 200)
        }
      }));
    } catch (err: any) {
      console.error('Failed to test gateway target:', err);
      setGatewayTestStatusById((prev) => ({
        ...prev,
        [targetId]: {
          kind: 'error',
          message: err?.message || copy.connectionTestFailed
        }
      }));
    } finally {
      setTestingGatewayTargetId((current) => current === targetId ? null : current);
    }
  }, [
    adminGatewayTargetsDraft,
    apiFetch,
    apiUrl,
    copy
  ]);

  const updateDraftTarget = useCallback((targetId: string, field: 'id' | 'name' | 'url' | 'tlsServerName', value: string) => {
    setAdminGatewayTargetsDraft((prev) => prev.map((target) => target.id === targetId ? { ...target, [field]: value } : target));
    clearTargetTestStatus(targetId);
  }, [clearTargetTestStatus]);

  const addDraftTarget = useCallback(() => {
    setAdminGatewayTargetsDraft((prev) => {
      const nextIndex = prev.length + 1;
      return [...prev, {
        id: `target-${Date.now()}-${nextIndex}`,
        name: locale === 'zh-CN' ? `目标 ${nextIndex}` : `Target ${nextIndex}`,
        url: '',
        tlsServerName: '',
        headers: []
      }];
    });
  }, [locale]);

  const updateDraftTargetHeader = useCallback((targetId: string, headerIndex: number, field: 'name' | 'value', value: string) => {
    setAdminGatewayTargetsDraft((prev) => prev.map((target) => {
      if (target.id !== targetId) return target;
      const headers = [...(target.headers ?? [])];
      headers[headerIndex] = { ...(headers[headerIndex] ?? { name: '', value: '' }), [field]: value };
      return { ...target, headers };
    }));
    clearTargetTestStatus(targetId);
  }, [clearTargetTestStatus]);

  const addDraftTargetHeader = useCallback((targetId: string) => {
    setAdminGatewayTargetsDraft((prev) => prev.map((target) => target.id === targetId
      ? { ...target, headers: [...(target.headers ?? []), { name: '', value: '' }] }
      : target));
  }, []);

  const removeDraftTargetHeader = useCallback((targetId: string, headerIndex: number) => {
    setAdminGatewayTargetsDraft((prev) => prev.map((target) => {
      if (target.id !== targetId) return target;
      return { ...target, headers: (target.headers ?? []).filter((_, index) => index !== headerIndex) };
    }));
    clearTargetTestStatus(targetId);
  }, [clearTargetTestStatus]);

  const removeDraftTarget = useCallback((targetId: string) => {
    setAdminGatewayTargetsDraft((prev) => {
      const nextTargets = prev.filter((target) => target.id !== targetId);
      setAdminDefaultGatewayTargetIdDraft((currentDefault) => currentDefault === targetId ? (nextTargets[0]?.id || '') : currentDefault);
      return nextTargets;
    });
    setGatewayTestStatusById((prev) => {
      const next = { ...prev };
      delete next[targetId];
      return next;
    });
  }, []);

  return {
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
  };
}
