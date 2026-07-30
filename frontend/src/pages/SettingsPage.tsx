import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { settingsApi } from '../api/settings';
import type { ApiTokenCreated, ApiTokenPublic, ApiTokenScope, DisplaySettings, OidcConfigPublic, TelegramConfigPublic } from '../api/settings';
import { API_TOKEN_SCOPES } from '../api/settings';
import { infoApi } from '../api/info';
import { deriveDeviceAlias, getStoredToken, storeToken } from '../lib/auth';
import { clearPwaCachesAndReload, isPwaCacheSupported } from '../lib/pwaCache';
import { getPushSupportStatus, isPushSupported, sendTestPushNotification, watchNotificationPermission } from '../lib/pushNotifications';
import { TagInput } from '../components/TagInput';
import { usePermissions } from '../context/usePermissions';

export default function SettingsPage() {
  const { data: info } = useQuery({ queryKey: ['app-info'], queryFn: infoApi.get, staleTime: Infinity, retry: false });

  return (
    <div className="page-stack">
      <DisplaySection />
      <PushNotificationsSection />
      <AppCacheSection />
      <OidcSection />
      <TelegramSection />
      <ApiTokensSection />
      {info && (
        <p style={{ textAlign: 'center', fontSize: '0.72rem', color: 'var(--text-subtle)', letterSpacing: '0.02em', paddingBottom: '0.5rem' }}>
          v{info.version} · {info.git_sha}
        </p>
      )}
    </div>
  );
}

// ── Display ───────────────────────────────────────────────────────────────────

function DisplaySection() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['settings-display'], queryFn: settingsApi.getDisplay });

  const current: DisplaySettings = data ?? {
    time_format: 'h24',
    date_format: 'dmy',
    show_water_card: true,
    calendar_show_wet_food: true,
    calendar_show_liquids: true,
    calendar_show_water: true,
    calendar_show_dry_food: true,
    calendar_show_record_count: true,
    calendar_show_total_fluid: true,
    calendar_week_start: 'sunday',
  };

  const mutation = useMutation({
    mutationFn: settingsApi.updateDisplay,
    onSuccess: (updated) => {
      queryClient.setQueryData(['settings-display'], updated);
    },
  });

  if (isLoading) return <div className="loading-state">Loading display settings…</div>;

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Preferences</p>
          <h3>Display</h3>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div className="display-option-row">
          <span className="display-option-label">Time format</span>
          <div className="display-option-choices">
            {(['h24', 'h12'] as const).map((v) => (
              <label key={v} className="checkbox-row" style={{ paddingTop: 0 }}>
                <input
                  type="radio"
                  name="time_format"
                  checked={current.time_format === v}
                  onChange={() => mutation.mutate({ time_format: v })}
                />
                {v === 'h24' ? '24h' : '12h'}
              </label>
            ))}
          </div>
        </div>

        <div className="display-option-row">
          <span className="display-option-label">Date format</span>
          <div className="display-option-choices">
            {(['dmy', 'mmm_dd_yyyy'] as const).map((v) => (
              <label key={v} className="checkbox-row" style={{ paddingTop: 0 }}>
                <input
                  type="radio"
                  name="date_format"
                  checked={current.date_format === v}
                  onChange={() => mutation.mutate({ date_format: v })}
                />
                {v === 'dmy' ? 'DD.MM.YYYY' : 'MMM DD, YYYY'}
              </label>
            ))}
          </div>
        </div>

        <div className="display-option-row">
          <span className="display-option-label">Water card</span>
          <div className="display-option-choices">
            <label className="checkbox-row" style={{ paddingTop: 0 }}>
              <input
                type="checkbox"
                checked={current.show_water_card}
                onChange={(e) => mutation.mutate({ show_water_card: e.target.checked })}
              />
              Show water metric card
            </label>
          </div>
        </div>

        <div className="display-option-row">
          <span className="display-option-label">Week starts on</span>
          <div className="display-option-choices">
            {(['sunday', 'monday'] as const).map((v) => (
              <label key={v} className="checkbox-row" style={{ paddingTop: 0 }}>
                <input
                  type="radio"
                  name="calendar_week_start"
                  checked={current.calendar_week_start === v}
                  onChange={() => mutation.mutate({ calendar_week_start: v })}
                />
                {v === 'sunday' ? 'Sunday' : 'Monday'}
              </label>
            ))}
          </div>
        </div>

        <div className="display-option-row" style={{ alignItems: 'flex-start' }}>
          <span className="display-option-label" style={{ paddingTop: '0.15rem' }}>Calendar metrics</span>
          <div className="display-option-choices" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.5rem' }}>
            {(
              [
                ['calendar_show_total_fluid',   'Total fluid (ml)'],
                ['calendar_show_wet_food',       'Wet food (g)'],
                ['calendar_show_liquids',        'Liquids (ml)'],
                ['calendar_show_water',          'Water (ml)'],
                ['calendar_show_dry_food',       'Dry food (g)'],
                ['calendar_show_record_count',   'Record count (fallback)'],
              ] as const
            ).map(([field, label]) => (
              <label key={field} className="checkbox-row" style={{ paddingTop: 0 }}>
                <input
                  type="checkbox"
                  checked={current[field]}
                  onChange={(e) => mutation.mutate({ [field]: e.target.checked })}
                />
                {label}
              </label>
            ))}
          </div>
        </div>
      </div>

      {mutation.isError && (
        <div className="error-state">
          {mutation.error instanceof Error ? mutation.error.message : 'Failed to save display settings.'}
        </div>
      )}
    </section>
  );
}

// ── Push notifications ────────────────────────────────────────────────────────

function pushStatusLabel(status: string): string {
  switch (status) {
    case 'subscribed':
      return 'Enabled — this device is subscribed.';
    case 'granted-not-subscribed':
      return 'Permission granted — finishing subscription…';
    case 'prompt':
      return 'Waiting for permission — allow notifications when prompted.';
    case 'denied':
      return 'Blocked — enable notifications in your browser or OS settings.';
    case 'server-disabled':
      return 'Server push is not configured.';
    case 'unsupported':
      return 'Not supported in this browser.';
    default:
      return status;
  }
}

function PushNotificationsSection() {
  const supported = isPushSupported();
  const [status, setStatus] = useState<string>(() => (supported ? 'loading' : 'unsupported'));
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supported) return;

    const refreshStatus = () => {
      getPushSupportStatus()
        .then(setStatus)
        .catch(() => setStatus('prompt'));
    };

    refreshStatus();

    const stopPermissionWatch = watchNotificationPermission(() => {
      refreshStatus();
    });

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        refreshStatus();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stopPermissionWatch();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [supported]);

  async function handleTestPush() {
    setTesting(true);
    setMessage(null);
    setError(null);
    try {
      const result = await sendTestPushNotification();
      const refreshed = await getPushSupportStatus();
      setStatus(refreshed);
      if (result.sent > 0) {
        setMessage(
          'Test notification sent to this device — you should see “Petmon test notification” from your browser/OS.',
        );
      } else {
        setError(
          result.error
            ?? 'Failed to deliver the test notification to this device. Check permission and try again.',
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send test push.');
    } finally {
      setTesting(false);
    }
  }

  if (!supported) return null;

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Alerts</p>
          <h3>Push notifications</h3>
        </div>
      </div>

      <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>
        Petmon can send browser push notifications when new in-app alerts are created.
        Permission is requested when you open the app. Works on desktop browsers and installed mobile PWAs.
      </p>

      <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginTop: '0.75rem' }}>
        Status: {status === 'loading' ? 'Checking…' : pushStatusLabel(status)}
      </p>

      <div className="form-row" style={{ justifyContent: 'flex-end' }}>
        <button
          className="button button-secondary"
          type="button"
          disabled={testing || status === 'loading'}
          onClick={handleTestPush}
        >
          {testing ? 'Sending…' : 'Test push notifications system'}
        </button>
      </div>

      {message && (
        <p
          role="status"
          style={{
            margin: 0,
            padding: '0.65rem 0.85rem',
            borderRadius: 10,
            background: 'var(--success-bg)',
            border: '1px solid var(--success-border)',
            color: 'var(--success-text, #4ade80)',
            fontSize: '0.88rem',
            fontWeight: 500,
          }}
        >
          {message}
        </p>
      )}
      {error && <div className="error-state">{error}</div>}
    </section>
  );
}

// ── App cache (PWA) ───────────────────────────────────────────────────────────

function AppCacheSection() {
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supported = isPwaCacheSupported();

  async function handleClearCache() {
    if (!window.confirm('Clear cached app files and reload? You will stay signed in.')) return;

    setClearing(true);
    setError(null);
    try {
      await clearPwaCachesAndReload();
    } catch (err) {
      setClearing(false);
      setError(err instanceof Error ? err.message : 'Failed to clear app cache.');
    }
  }

  if (!supported) return null;

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">App</p>
          <h3>Cached files</h3>
        </div>
      </div>

      <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>
        Petmon installs as a PWA and caches JavaScript, CSS, and icons via a service worker (Workbox).
        If you see a partial update after a new version, clear the cache to fetch everything fresh.
        This does not remove your sign-in or pet data.
      </p>

      <div className="form-row" style={{ justifyContent: 'flex-end' }}>
        <button
          className="button button-secondary"
          type="button"
          disabled={clearing}
          onClick={handleClearCache}
        >
          {clearing ? 'Clearing…' : 'Clear cache and reload'}
        </button>
      </div>

      {error && <div className="error-state">{error}</div>}
    </section>
  );
}

// ── OIDC ─────────────────────────────────────────────────────────────────────

function OidcSection() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['settings-oidc'], queryFn: settingsApi.getOidc });

  // Local overrides — null means "use whatever is in data".
  const [enabledOverride, setEnabledOverride] = useState<boolean | null>(null);
  const [issuerUrl, setIssuerUrl] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [groupsClaim, setGroupsClaim] = useState<string | null>(null);
  const [fullAccessGroup, setFullAccessGroup] = useState<string | null>(null);
  const [readonlyGroup, setReadonlyGroup] = useState<string | null>(null);

  const loaded = data ?? ({
    enabled: false,
    issuer_url: null,
    client_id: null,
    groups_claim: 'groups',
    full_access_group: null,
    readonly_group: null,
  } as OidcConfigPublic);

  // Displayed values: local override when set, otherwise loaded value.
  const enabled = enabledOverride ?? loaded.enabled;
  const fIssuerUrl = issuerUrl ?? (loaded.issuer_url ?? '');
  const fClientId = clientId ?? (loaded.client_id ?? '');
  const fGroupsClaim = groupsClaim ?? (loaded.groups_claim ?? 'groups');
  const fFullAccessGroup = fullAccessGroup ?? (loaded.full_access_group ?? '');
  const fReadonlyGroup = readonlyGroup ?? (loaded.readonly_group ?? '');

  const mutation = useMutation({
    mutationFn: () => settingsApi.updateOidc({
      enabled,
      issuer_url: fIssuerUrl || null,
      client_id: fClientId || null,
      groups_claim: fGroupsClaim || null,
      full_access_group: fFullAccessGroup || null,
      readonly_group: fReadonlyGroup || null,
    }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['settings-oidc'], updated);
      // Reset overrides so fields reflect the saved values from server.
      setEnabledOverride(null);
      setIssuerUrl(null);
      setClientId(null);
      setGroupsClaim(null);
      setFullAccessGroup(null);
      setReadonlyGroup(null);
    },
  });

  if (isLoading) return <div className="loading-state">Loading OIDC settings…</div>;

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Authentication</p>
          <h3>OIDC / SSO</h3>
        </div>
        <span className={`status-pill${loaded.enabled ? ' active' : ''}`}>
          {loaded.enabled ? 'Enabled' : 'Disabled'}
        </span>
      </div>

      <div className="form-grid">
        <div className="form-row">
          <label>Issuer URL</label>
          <input
            placeholder="https://accounts.example.com"
            value={fIssuerUrl}
            onChange={(e) => setIssuerUrl(e.target.value)}
          />
        </div>
        <div className="form-row">
          <label>Client ID</label>
          <input
            placeholder="client-id"
            value={fClientId}
            onChange={(e) => setClientId(e.target.value)}
          />
        </div>

        <div className="form-row">
          <label>Groups claim</label>
          <input
            placeholder="groups"
            value={fGroupsClaim}
            onChange={(e) => setGroupsClaim(e.target.value)}
          />
          <span style={{ fontSize: '0.78rem', color: 'var(--text-subtle)' }}>JWT claim name containing group membership</span>
        </div>
        <div className="form-row">
          <label>Full access group</label>
          <input
            placeholder="e.g. petmon-admins (blank = any OIDC user)"
            value={fFullAccessGroup}
            onChange={(e) => setFullAccessGroup(e.target.value)}
          />
        </div>
        <div className="form-row">
          <label>Read-only group</label>
          <input
            placeholder="e.g. petmon-viewers (optional)"
            value={fReadonlyGroup}
            onChange={(e) => setReadonlyGroup(e.target.value)}
          />
          <span style={{ fontSize: '0.78rem', color: 'var(--text-subtle)' }}>Members get api_read scope only</span>
        </div>

        <div className="form-row" style={{ justifyContent: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: '1rem', gridColumn: '1 / -1' }}>
          <label className="checkbox-row" style={{ paddingTop: 0 }}>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabledOverride(e.target.checked)}
            />
            Enabled
          </label>
          <button
            className="button"
            type="button"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? 'Saving…' : 'Save OIDC settings'}
          </button>
        </div>
      </div>

      {mutation.isError && (
        <div className="error-state">
          {mutation.error instanceof Error ? mutation.error.message : 'Failed to save OIDC settings.'}
        </div>
      )}
    </section>
  );
}

// ── Telegram ──────────────────────────────────────────────────────────────────

function TelegramSection() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['settings-telegram'], queryFn: settingsApi.getTelegram });

  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [botToken, setBotToken] = useState('');

  const current = data ?? ({ enabled: false, has_bot_token: false } as TelegramConfigPublic);
  const effectiveEnabled = enabled ?? current.enabled;

  const mutation = useMutation({
    mutationFn: () => settingsApi.updateTelegram({
      enabled: effectiveEnabled,
      ...(botToken ? { bot_token: botToken } : {}),
    }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['settings-telegram'], updated);
      setBotToken('');
      setEnabled(null);
    },
  });

  if (isLoading) return <div className="loading-state">Loading Telegram settings…</div>;

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Notifications</p>
          <h3>Telegram</h3>
        </div>
        <span className={`status-pill${current.enabled ? ' active' : ''}`}>
          {current.enabled ? 'Enabled' : 'Disabled'}
        </span>
      </div>

      <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>
        When enabled, each new nutrition record is forwarded to the pet's configured Telegram chat. Configure the chat and thread per pet on the pet profile page.
      </p>

      <div className="form-grid">
        <div className="form-row">
          <label>Bot token</label>
          <input
            type="password"
            placeholder={current.has_bot_token ? '••••••••  (set — leave blank to keep)' : 'Enter bot token from @BotFather'}
            value={botToken}
            onChange={(e) => setBotToken(e.target.value)}
            autoComplete="new-password"
          />
        </div>

        <div className="form-row" style={{ justifyContent: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: '1rem', gridColumn: '1 / -1' }}>
          <label className="checkbox-row" style={{ paddingTop: 0 }}>
            <input
              type="checkbox"
              checked={effectiveEnabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            Enabled
          </label>
          <button
            className="button"
            type="button"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? 'Saving…' : 'Save Telegram settings'}
          </button>
        </div>
      </div>

      {mutation.isError && (
        <div className="error-state">
          {mutation.error instanceof Error ? mutation.error.message : 'Failed to save Telegram settings.'}
        </div>
      )}
    </section>
  );
}

// ── API tokens ────────────────────────────────────────────────────────────────

function ApiTokensSection() {
  const queryClient = useQueryClient();
  const { canWrite } = usePermissions();
  const { data: tokens, isLoading } = useQuery({ queryKey: ['api-tokens'], queryFn: settingsApi.listTokens });
  const { data: oidc } = useQuery({ queryKey: ['settings-oidc'], queryFn: settingsApi.getOidc });

  const [alias, setAlias] = useState('');
  const [newScopes, setNewScopes] = useState<ApiTokenScope[]>(['all']);
  const [justCreated, setJustCreated] = useState<ApiTokenCreated | null>(null);
  const [copied, setCopied] = useState(false);
  const [deviceAlias, setDeviceAlias] = useState(() => deriveDeviceAlias());
  const [deviceRemembered, setDeviceRemembered] = useState(false);

  const oidcEnabled = oidc?.enabled ?? false;
  const usingApiToken = getStoredToken()?.startsWith('pm_api_') ?? false;

  const createMutation = useMutation({
    mutationFn: () => settingsApi.createToken({ alias: alias || undefined, scopes: newScopes }),
    onSuccess: (created) => {
      setJustCreated(created);
      setAlias('');
      setNewScopes(['all']);
      queryClient.invalidateQueries({ queryKey: ['api-tokens'] });
    },
  });

  const updateScopesMutation = useMutation({
    mutationFn: ({ id, scopes }: { id: string; scopes: ApiTokenScope[] }) =>
      settingsApi.updateTokenScopes(id, { scopes }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['api-tokens'] }),
  });

  const rememberMutation = useMutation({
    mutationFn: () => settingsApi.createToken({ alias: deviceAlias || undefined }),
    onSuccess: (created) => {
      storeToken(created.token);
      setDeviceRemembered(true);
      queryClient.invalidateQueries({ queryKey: ['api-tokens'] });
    },
  });

  const activateMutation = useMutation({
    mutationFn: (id: string) => settingsApi.activateToken(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['api-tokens'] }),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => settingsApi.deactivateToken(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['api-tokens'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => settingsApi.deleteToken(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['api-tokens'] }),
  });

  function handleCopy() {
    if (!justCreated) return;
    navigator.clipboard.writeText(justCreated.token).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Access</p>
          <h3>API tokens</h3>
        </div>
      </div>

      {/* Remember this device — shown when using OIDC and OIDC is enabled */}
      {canWrite && oidcEnabled && !usingApiToken && (
        <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 12, padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div>
            <p style={{ fontSize: '0.88rem', fontWeight: 600, marginBottom: '0.25rem' }}>Remember this device</p>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Creates a long-lived token stored on this device so you won't be redirected to SSO repeatedly.</p>
          </div>
          {deviceRemembered ? (
            <p style={{ fontSize: '0.88rem', color: 'var(--success-text, #4ade80)', fontWeight: 500 }}>This device is now remembered. You'll stay signed in without SSO.</p>
          ) : (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                value={deviceAlias}
                onChange={(e) => setDeviceAlias(e.target.value)}
                placeholder="Device label"
                style={{ flex: '1 1 160px', minWidth: 0 }}
              />
              <button
                className="button"
                type="button"
                disabled={rememberMutation.isPending}
                onClick={() => rememberMutation.mutate()}
              >
                {rememberMutation.isPending ? 'Saving…' : 'Remember device'}
              </button>
            </div>
          )}
          {rememberMutation.isError && (
            <p style={{ fontSize: '0.82rem', color: 'var(--error-text)' }}>Failed to create token — try again.</p>
          )}
        </div>
      )}

      {/* Info banner when already on an API token */}
      {usingApiToken && (
        <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 12, padding: '0.75rem 1rem', fontSize: '0.88rem', color: 'var(--text-muted)' }}>
          This device is authenticated with a long-lived API token (highlighted below).
        </div>
      )}

      {/* One-time token reveal */}
      {justCreated && (
        <div style={{ background: 'var(--success-bg)', border: '1px solid var(--success-border)', borderRadius: 12, padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <p style={{ fontSize: '0.88rem', fontWeight: 600 }}>Token created — copy it now, it won't be shown again.</p>
          <input
            readOnly
            value={justCreated.token}
            onFocus={(e) => e.target.select()}
            style={{ fontFamily: 'monospace', fontSize: '0.82rem', width: '100%', boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button className="button button-secondary" type="button" onClick={handleCopy}>
              {copied ? 'Copied!' : 'Copy token'}
            </button>
            <button className="button button-secondary" type="button" onClick={() => setJustCreated(null)}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* OIDC gate warning */}
      {!oidcEnabled && (
        <div style={{ background: 'var(--warning-bg)', border: '1px solid var(--warning-border)', borderRadius: 12, padding: '0.75rem 1rem', fontSize: '0.88rem', color: 'var(--text-muted)' }}>
          API tokens can only be created when OIDC is enabled — the token is linked to the authenticated user who creates it.
        </div>
      )}

      {/* Create form */}
      {canWrite && oidcEnabled && (
        <div className="form-grid">
          <div className="form-row">
            <label>Alias (optional)</label>
            <input placeholder="e.g. mobile-app" value={alias} onChange={(e) => setAlias(e.target.value)} />
          </div>
          <div className="form-row">
            <label>Scopes</label>
            <TagInput
              value={newScopes}
              options={API_TOKEN_SCOPES}
              onChange={(v) => setNewScopes(v as ApiTokenScope[])}
              placeholder="Add scope…"
            />
          </div>
          <div className="form-row form-row-full">
            <button
              className="button"
              type="button"
              disabled={createMutation.isPending || newScopes.length === 0}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? 'Creating…' : '+ Create token'}
            </button>
          </div>
        </div>
      )}

      {/* Token list */}
      {isLoading ? (
        <div className="loading-state">Loading tokens…</div>
      ) : !tokens?.length ? (
        <div className="empty-state" style={{ textAlign: 'center' }}>No API tokens yet.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Alias</th>
              <th>Scopes</th>
              <th>Created by</th>
              <th>Created</th>
              <th>Last used</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {tokens.map((token) => (
              <TokenRow
                key={token.id}
                token={token}
                canWrite={canWrite}
                onActivate={() => activateMutation.mutate(token.id)}
                activating={activateMutation.isPending && activateMutation.variables === token.id}
                onDeactivate={() => deactivateMutation.mutate(token.id)}
                deactivating={deactivateMutation.isPending && deactivateMutation.variables === token.id}
                onDelete={() => deleteMutation.mutate(token.id)}
                deleting={deleteMutation.isPending && deleteMutation.variables === token.id}
                onUpdateScopes={(scopes) => updateScopesMutation.mutate({ id: token.id, scopes })}
                updatingScopes={updateScopesMutation.isPending && updateScopesMutation.variables?.id === token.id}
              />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function TokenRow({ token, canWrite, onActivate, activating, onDeactivate, deactivating, onDelete, deleting, onUpdateScopes, updatingScopes }: {
  token: ApiTokenPublic;
  canWrite: boolean;
  onActivate: () => void;
  activating: boolean;
  onDeactivate: () => void;
  deactivating: boolean;
  onDelete: () => void;
  deleting: boolean;
  onUpdateScopes: (scopes: ApiTokenScope[]) => void;
  updatingScopes: boolean;
}) {
  const [editingScopes, setEditingScopes] = useState(false);
  const [scopesDraft, setScopesDraft] = useState<ApiTokenScope[]>(token.scopes);

  function startScopeEdit() {
    setScopesDraft(token.scopes);
    setEditingScopes(true);
  }

  function commitScopes() {
    if (scopesDraft.length === 0) return;
    onUpdateScopes(scopesDraft);
    setEditingScopes(false);
  }

  return (
    <tr style={{ opacity: token.active ? 1 : 0.5, borderLeft: token.current ? '2px solid var(--accent)' : undefined }}>
      <td style={{ fontFamily: 'monospace', fontSize: '0.88rem' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          {token.alias ?? <span style={{ color: 'var(--text-subtle)' }}>—</span>}
          {token.current && (
            <span style={{ fontSize: '0.72rem', fontFamily: 'inherit', background: 'var(--accent)', color: 'var(--accent-fg, #fff)', borderRadius: 4, padding: '0.1rem 0.35rem', fontWeight: 600, letterSpacing: '0.02em' }}>
              current
            </span>
          )}
        </span>
      </td>
      <td>
        {editingScopes ? (
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', minWidth: 220 }}>
            <div style={{ flex: 1 }}>
              <TagInput
                value={scopesDraft}
                options={API_TOKEN_SCOPES}
                onChange={(v) => setScopesDraft(v as ApiTokenScope[])}
                placeholder="Add scope…"
                disabled={updatingScopes}
              />
            </div>
            <button
              className="button button-secondary"
              type="button"
              style={{ padding: '0.25rem 0.6rem', fontSize: '0.78rem', whiteSpace: 'nowrap' }}
              disabled={updatingScopes || scopesDraft.length === 0}
              onClick={commitScopes}
            >
              {updatingScopes ? '…' : 'Save'}
            </button>
            <button
              className="button button-secondary"
              type="button"
              style={{ padding: '0.25rem 0.6rem', fontSize: '0.78rem' }}
              onClick={() => setEditingScopes(false)}
            >
              ✕
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {token.scopes.map((s) => (
              <span
                key={s}
                style={{ fontFamily: 'monospace', fontSize: '0.72rem', background: 'var(--surface-raised)', border: '1px solid var(--border-subtle)', borderRadius: 4, padding: '0.1rem 0.4rem' }}
              >
                {s}
              </span>
            ))}
            <button
              className="icon-button"
              type="button"
              title="Edit scopes"
              aria-label="Edit scopes"
              style={{ fontSize: '0.78rem', opacity: 0.6 }}
              onClick={startScopeEdit}
            >
              ✎
            </button>
          </div>
        )}
      </td>
      <td style={{ fontSize: '0.88rem' }}>{token.created_by ?? <span style={{ color: 'var(--text-subtle)' }}>—</span>}</td>
      <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{token.created_at.slice(0, 10)}</td>
      <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{token.last_used_at ? token.last_used_at.slice(0, 10) : <span style={{ color: 'var(--text-subtle)' }}>never</span>}</td>
      <td><span className={`status-pill${token.active ? ' active' : ''}`}>{token.active ? 'Active' : 'Inactive'}</span></td>
      {canWrite && (
        <td>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            {token.active && (
              <button
                className="button button-danger"
                type="button"
                style={{ padding: '0.3rem 0.75rem', fontSize: '0.82rem' }}
                disabled={deactivating}
                onClick={() => { if (window.confirm(`Deactivate token "${token.alias ?? token.id}"?`)) onDeactivate(); }}
              >
                {deactivating ? '…' : 'Deactivate'}
              </button>
            )}
            {!token.active && (
              <>
                <button
                  className="button button-secondary"
                  type="button"
                  style={{ padding: '0.3rem 0.75rem', fontSize: '0.82rem' }}
                  disabled={activating}
                  onClick={onActivate}
                >
                  {activating ? '…' : 'Activate'}
                </button>
                <button
                  className="button button-danger"
                  type="button"
                  style={{ padding: '0.3rem 0.75rem', fontSize: '0.82rem' }}
                  disabled={deleting}
                  onClick={() => { if (window.confirm(`Permanently delete token "${token.alias ?? token.id}"? This cannot be undone.`)) onDelete(); }}
                >
                  {deleting ? '…' : 'Delete'}
                </button>
              </>
            )}
          </div>
        </td>
      )}
    </tr>
  );
}
