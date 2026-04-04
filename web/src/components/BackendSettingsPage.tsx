import { useI18n } from '../i18n-context';
import type { GatewayTarget, GatewayTestStatus } from '../types/app';

type BackendSettingsPageProps = {
  activeGatewayTarget: GatewayTarget | null;
  adminConfigError: string | null;
  adminConfigNotice: string | null;
  adminDefaultGatewayTargetIdDraft: string;
  adminGatewayTargetsDraft: GatewayTarget[];
  defaultGatewayTargetId: string;
  gatewayTargets: GatewayTarget[];
  gatewayTestStatusById: Record<string, GatewayTestStatus>;
  isSavingAdminConfig: boolean;
  newAdminAccessCode: string;
  newViewerAccessCode: string;
  onAddDraftTarget: () => void;
  onAddDraftTargetHeader: (targetId: string) => void;
  onDefaultTargetChange: (targetId: string) => void;
  onNewAdminCodeChange: (value: string) => void;
  onNewViewerCodeChange: (value: string) => void;
  onRemoveDraftTarget: (targetId: string) => void;
  onRemoveDraftTargetHeader: (targetId: string, headerIndex: number) => void;
  onSave: () => void;
  onTestGatewayTarget: (targetId: string, rawUrl: string) => void;
  onUpdateDraftTarget: (targetId: string, field: 'id' | 'name' | 'url' | 'tlsServerName', value: string) => void;
  onUpdateDraftTargetHeader: (targetId: string, headerIndex: number, field: 'name' | 'value', value: string) => void;
  testingGatewayTargetId: string | null;
};

export function BackendSettingsPage({
  activeGatewayTarget,
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
  onAddDraftTarget,
  onAddDraftTargetHeader,
  onDefaultTargetChange,
  onNewAdminCodeChange,
  onNewViewerCodeChange,
  onRemoveDraftTarget,
  onRemoveDraftTargetHeader,
  onSave,
  onTestGatewayTarget,
  onUpdateDraftTarget,
  onUpdateDraftTargetHeader,
  testingGatewayTargetId
}: BackendSettingsPageProps) {
  const { messages } = useI18n();
  const isPristine = JSON.stringify(adminGatewayTargetsDraft) === JSON.stringify(gatewayTargets)
    && newAdminAccessCode.trim() === ''
    && newViewerAccessCode.trim() === ''
    && adminDefaultGatewayTargetIdDraft === defaultGatewayTargetId;

  return (
    <section className="flex-1 min-h-0 overflow-auto log-scrollbar bg-background/40">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-6 py-4">
        <div className="sticky top-0 z-10 -mx-6 flex items-center justify-between gap-4 bg-background/95 px-6 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <h1 className="text-xl font-bold text-on-surface">{messages.backendSettings}</h1>

          <button
            type="button"
            onClick={onSave}
            disabled={isSavingAdminConfig || isPristine}
            className="ui-action-caption flex h-10 shrink-0 items-center justify-center rounded-md border border-outline-variant/30 bg-surface-container-highest/95 px-4 shadow-sm backdrop-blur hover:bg-surface-container hover:text-on-surface disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSavingAdminConfig ? messages.saving : messages.save}
          </button>
        </div>

        <div className="rounded-xl border border-outline-variant/20 bg-surface-container/40 p-5">
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="ui-label">{messages.newAdminCode}</label>
                <input type="password" value={newAdminAccessCode} onChange={(event) => onNewAdminCodeChange(event.target.value)} placeholder={messages.leaveBlankToKeepCurrent} className="w-full bg-surface-container-highest border border-outline-variant/30 text-on-surface text-sm rounded-md px-3 py-2 focus:outline-none focus:border-primary/50 placeholder:text-on-surface-variant/40" />
              </div>

              <div>
                <label className="ui-label">{messages.newViewerCode}</label>
                <input type="password" value={newViewerAccessCode} onChange={(event) => onNewViewerCodeChange(event.target.value)} placeholder={messages.leaveBlankToKeepCurrent} className="w-full bg-surface-container-highest border border-outline-variant/30 text-on-surface text-sm rounded-md px-3 py-2 focus:outline-none focus:border-primary/50 placeholder:text-on-surface-variant/40" />
              </div>
            </div>

            <div className="text-xs text-on-surface-variant/60">
              {messages.currentSessionTarget}: {activeGatewayTarget ? `${activeGatewayTarget.name} (${activeGatewayTarget.url})` : messages.notLoaded}
            </div>

            {(adminConfigError || adminConfigNotice) && (
              <div className={`rounded-md border px-3 py-2 text-sm ${adminConfigError ? 'border-error/20 bg-error/10 text-error' : 'border-primary/20 bg-primary/10 text-primary'}`}>
                {adminConfigError || adminConfigNotice}
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="ui-label mb-0">{messages.gatewayTargets}</div>
                <button
                  type="button"
                  onClick={onAddDraftTarget}
                  className="ui-action-caption rounded-md border border-outline-variant/20 bg-surface-container-highest px-3 py-1.5 hover:text-on-surface"
                >
                  {messages.addTarget}
                </button>
              </div>

              {adminGatewayTargetsDraft.map((target) => (
                <div key={target.id} className="rounded-lg border border-outline-variant/15 bg-surface-container-highest/40 p-3 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <label className="flex items-center gap-2 text-xs text-on-surface-variant/70">
                      <input
                        type="radio"
                        name="defaultGatewayTarget"
                        checked={adminDefaultGatewayTargetIdDraft === target.id}
                        onChange={() => onDefaultTargetChange(target.id)}
                      />
                      {messages.defaultForNewSessions}
                    </label>
                    <button
                      type="button"
                      onClick={() => onRemoveDraftTarget(target.id)}
                      disabled={adminGatewayTargetsDraft.length === 1}
                      className="ui-action-caption rounded-md border border-outline-variant/20 px-2 py-1 hover:text-on-surface disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {messages.remove}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <label className="ui-label">{messages.name}</label>
                      <input type="text" value={target.name} onChange={(event) => onUpdateDraftTarget(target.id, 'name', event.target.value)} placeholder="Office" className="w-full bg-surface-container-highest border border-outline-variant/30 text-on-surface text-sm rounded-md px-3 py-2 focus:outline-none focus:border-primary/50 placeholder:text-on-surface-variant/40" />
                    </div>
                    <div>
                      <label className="ui-label">{messages.id}</label>
                      <input type="text" value={target.id} onChange={(event) => onUpdateDraftTarget(target.id, 'id', event.target.value)} placeholder="office" className="w-full bg-surface-container-highest border border-outline-variant/30 text-on-surface text-sm rounded-md px-3 py-2 focus:outline-none focus:border-primary/50 placeholder:text-on-surface-variant/40" />
                    </div>
                  </div>

                  <div>
                    <label className="ui-label">URL</label>
                    <div className="flex flex-col gap-2 md:flex-row">
                      <input type="url" value={target.url} onChange={(event) => onUpdateDraftTarget(target.id, 'url', event.target.value)} placeholder="http://127.0.0.1:19531" className="w-full bg-surface-container-highest border border-outline-variant/30 text-on-surface text-sm rounded-md px-3 py-2 focus:outline-none focus:border-primary/50 placeholder:text-on-surface-variant/40" />
                      <button
                        type="button"
                        onClick={() => onTestGatewayTarget(target.id, target.url)}
                        disabled={testingGatewayTargetId === target.id}
                        className="ui-action-caption flex h-10 shrink-0 items-center justify-center rounded-md border border-outline-variant/30 bg-surface-container px-3 hover:bg-surface-container-highest hover:text-on-surface disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {testingGatewayTargetId === target.id ? messages.testing : messages.test}
                      </button>
                    </div>
                    {gatewayTestStatusById[target.id] && (
                      <div className={`mt-2 rounded-md border px-3 py-2 text-xs ${gatewayTestStatusById[target.id].kind === 'success' ? 'border-primary/20 bg-primary/10 text-primary' : 'border-error/20 bg-error/10 text-error'}`}>
                        {gatewayTestStatusById[target.id].message}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="ui-label">{messages.tlsServerName}</label>
                    <input type="text" value={target.tlsServerName ?? ''} onChange={(event) => onUpdateDraftTarget(target.id, 'tlsServerName', event.target.value)} placeholder={messages.tlsServerNamePlaceholder} className="w-full bg-surface-container-highest border border-outline-variant/30 text-on-surface text-sm rounded-md px-3 py-2 focus:outline-none focus:border-primary/50 placeholder:text-on-surface-variant/40" />
                    <p className="mt-2 text-xs text-on-surface-variant/45">{messages.tlsServerNameHint}</p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="ui-label mb-0">{messages.customHeaders}</div>
                      <button type="button" onClick={() => onAddDraftTargetHeader(target.id)} className="ui-action-caption rounded-md border border-outline-variant/20 bg-surface-container-highest px-2.5 py-1 hover:text-on-surface">{messages.addHeader}</button>
                    </div>

                    {(target.headers?.length ?? 0) === 0 ? (
                      <div className="rounded-md border border-outline-variant/10 bg-surface-container-highest/30 px-3 py-2 text-xs text-on-surface-variant/55">{messages.noCustomHeaders}</div>
                    ) : (
                      <div className="space-y-2">
                        {(target.headers ?? []).map((header, headerIndex) => (
                          <div key={`${target.id}-header-${headerIndex}`} className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_1.4fr_auto]">
                            <input type="text" value={header.name} onChange={(event) => onUpdateDraftTargetHeader(target.id, headerIndex, 'name', event.target.value)} placeholder={messages.headerName} className="w-full bg-surface-container-highest border border-outline-variant/30 text-on-surface text-sm rounded-md px-3 py-2 focus:outline-none focus:border-primary/50 placeholder:text-on-surface-variant/40" />
                            <input type="text" value={header.value} onChange={(event) => onUpdateDraftTargetHeader(target.id, headerIndex, 'value', event.target.value)} placeholder={messages.headerValue} className="w-full bg-surface-container-highest border border-outline-variant/30 text-on-surface text-sm rounded-md px-3 py-2 focus:outline-none focus:border-primary/50 placeholder:text-on-surface-variant/40" />
                            <button type="button" onClick={() => onRemoveDraftTargetHeader(target.id, headerIndex)} className="ui-action-caption rounded-md border border-outline-variant/20 px-2 py-1 hover:text-on-surface">{messages.remove}</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
