import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/client';
import { settingsApi } from '../api/settings';
import type { ApiTokenAdminPublic, ApiTokenCreated, ApiTokenPublic, OidcConfigPublic, TelegramConfigPublic } from '../api/settings';
import type { Scope } from '../api/authTypes';
import { useUserSettings } from '../api/userSettings';
import { allowedTokenScopes } from '../api/settings';
import { deriveDeviceAlias, storeToken } from '../lib/auth';
import { clearPwaCachesAndReload, isPwaCacheSupported } from '../lib/pwaCache';
import { getPushSupportStatus, isPushSupported, sendTestPushNotification, watchNotificationPermission } from '../lib/pushNotifications';
import { TagInput } from '../components/TagInput';
import { usePermissions } from '../context/usePermissions';
import { effectiveScopes } from '../api/me';
import { useApplicationExtensions, useSessionMe } from '../context/ApplicationExtensions';

export default function SettingsPage() {
  const { canAdminRead, canAdminWrite } = usePermissions(null);
  const extensions = useApplicationExtensions();
  return (
    <div className="page-stack">
      <DisplaySection />
      <DeveloperModeSection />
      <PushNotificationsSection />
      <AppCacheSection />
      {canAdminRead && <fieldset disabled={!canAdminWrite} className="page-stack" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <OidcSection />
        <TelegramSection />
      </fieldset>}
      <ApiTokensSection />
      {canAdminRead && <InstanceTokensSection canWrite={canAdminWrite} />}
      {extensions?.chrome?.settings}
    </div>
  );
}

// ── Display ───────────────────────────────────────────────────────────────────

function DisplaySection() {
  const { settings: current, update, isLoading, error, isSaving } = useUserSettings('display');

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
                  onChange={() => update({ time_format: v })}
                  disabled={isSaving}
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
                  onChange={() => update({ date_format: v })}
                  disabled={isSaving}
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
                onChange={(e) => update({ show_water_card: e.target.checked })}
                disabled={isSaving}
              />
              Show water metric card
            </label>
          </div>
        </div>

      </div>

      {error && (
        <div className="error-state">
          {error instanceof Error ? error.message : 'Failed to save display settings.'}
        </div>
      )}
    </section>
  );
}

function DeveloperModeSection() {
  const { settings: current, update, isLoading, error, isSaving } = useUserSettings('developer_mode');

  if (isLoading) return <div className="loading-state">Loading developer settings…</div>;

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Preferences</p>
          <h3>Developer mode</h3>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div className="display-option-row">
          <span className="display-option-label">API snippets</span>
          <div className="display-option-choices">
            <label className="checkbox-row" style={{ paddingTop: 0 }}>
              <input
                type="checkbox"
                checked={current.enabled}
                onChange={(e) => update({ enabled: e.target.checked })}
                disabled={isSaving}
              />
              Show copyable curl commands next to medication Take buttons
            </label>
          </div>
        </div>
      </div>

      {error && (
        <div className="error-state">
          {error instanceof Error ? error.message : 'Failed to save developer settings.'}
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
        Permission is requested when you open the app. Works on desktop browsers and installed mobile PWAs
        (iOS requires Add to Home Screen). If a test says it was sent but nothing appears, check OS notification
        settings for this browser — the server only confirms delivery to the push service.
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
        New versions reload automatically; use the button below only if the app still looks outdated after an update.
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

function InstanceTokensSection({ canWrite }: { canWrite: boolean }) {
  const client = useQueryClient();
  const tokens = useQuery({ queryKey: ['instance-api-tokens'], queryFn: settingsApi.listInstanceTokens });
  const revoke = useMutation({ mutationFn: settingsApi.revokeInstanceToken, onSuccess: () => client.invalidateQueries({ queryKey: ['instance-api-tokens'] }) });
  const activate = useMutation({ mutationFn: settingsApi.activateInstanceToken, onSuccess: () => client.invalidateQueries({ queryKey: ['instance-api-tokens'] }) });
  const revokeOwner = useMutation({ mutationFn: settingsApi.revokeInstanceTokensForOwner, onSuccess: () => client.invalidateQueries({ queryKey: ['instance-api-tokens'] }) });
  const groups = groupTokensByOwner(tokens.data ?? []);

  return <section className="panel">
    <h3>Instance API tokens</h3>
    <p className="muted-text">Operational access to credentials across this instance. Re-activating revoked tokens is restricted to instance administrators.</p>
    {tokens.isPending && <p>Loading tokens…</p>}
    {(tokens.isError || revoke.isError || activate.isError || revokeOwner.isError) && <p className="error-state" role="alert">Unable to update instance tokens.</p>}
    {groups.map(({ owner, tokens: ownerTokens }) => {
      const activeCount = ownerTokens.filter((token) => token.active).length;
      const userLabel = ownerTokens[0]?.created_by ?? owner ?? 'Unknown user';
      return <div key={owner ?? 'unowned'} style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', paddingTop: '0.75rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
          <p style={{ fontSize: '0.88rem', fontWeight: 600, overflowWrap: 'anywhere' }}>{userLabel} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>· {ownerTokens.length} token{ownerTokens.length === 1 ? '' : 's'}</span></p>
          {canWrite && owner && activeCount > 0 && <button
            className="button button-danger"
            type="button"
            disabled={revokeOwner.isPending}
            onClick={() => { if (window.confirm(`Revoke all ${activeCount} active token${activeCount === 1 ? '' : 's'} for ${userLabel}?`)) revokeOwner.mutate(owner); }}
          >
            {revokeOwner.isPending && revokeOwner.variables === owner ? 'Revoking…' : `Revoke all (${activeCount})`}
          </button>}
        </div>
        <div style={{ overflowX: 'auto', maxWidth: '100%' }}><table>
          <thead><tr><th>Alias</th><th>Scopes</th><th>Status</th>{canWrite && <th>Actions</th>}</tr></thead>
          <tbody>{ownerTokens.map((token) => <tr key={token.id}>
            <td style={{ fontFamily: 'monospace', fontSize: '0.88rem', overflowWrap: 'anywhere' }}>{token.alias ?? token.id}</td>
            <td><ScopeBadges scopes={token.scopes} /></td>
            <td><span className={`status-pill${token.active ? ' active' : ''}`}>{token.active ? 'Active' : 'Inactive'}</span></td>
            {canWrite && <td><div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {token.active ? <button className="button button-danger" type="button" disabled={revoke.isPending} onClick={() => { if (window.confirm(`Revoke token ${token.alias ?? token.id}?`)) revoke.mutate(token.id); }}>{revoke.isPending && revoke.variables === token.id ? '…' : 'Revoke'}</button>
                : <button className="button button-secondary" type="button" disabled={activate.isPending} onClick={() => { if (window.confirm(`Activate token ${token.alias ?? token.id}?`)) activate.mutate(token.id); }}>{activate.isPending && activate.variables === token.id ? '…' : 'Activate'}</button>}
            </div></td>}
          </tr>)}</tbody>
        </table></div>
      </div>;
    })}
  </section>;
}

function groupTokensByOwner(tokens: ApiTokenAdminPublic[]) {
  const groups = new Map<string | null, ApiTokenAdminPublic[]>();
  for (const token of tokens) groups.set(token.owner_subject, [...(groups.get(token.owner_subject) ?? []), token]);
  return [...groups.entries()]
    .sort(([left], [right]) => (left ?? '').localeCompare(right ?? ''))
    .map(([owner, ownerTokens]) => ({ owner, tokens: ownerTokens }));
}

function ScopeBadges({ scopes }: { scopes: Scope[] }) {
  return <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
    {scopes.length === 0 ? <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>legacy full access</span> : scopes.map((scope) => <span key={scope} style={{ fontFamily: 'monospace', fontSize: '0.72rem', background: 'var(--surface-raised)', border: '1px solid var(--border-subtle)', borderRadius: 4, padding: '0.1rem 0.4rem' }}>{scope}</span>)}
  </div>;
}

function ApiTokensSection() {
  const queryClient = useQueryClient();
  const extensions = useApplicationExtensions();
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const { data: me } = useSessionMe();
  const scopes = effectiveScopes(me);
  const canWrite = scopes.has('api_write');
  const allowedScopes = allowedTokenScopes(me);
  const { data: tokens, isLoading } = useQuery({ queryKey: ['api-tokens'], queryFn: settingsApi.listTokens, enabled: scopes.has('api_read') });

  const [alias, setAlias] = useState('');
  const [newScopes, setNewScopes] = useState<Scope[]>([]);
  const [justCreated, setJustCreated] = useState<ApiTokenCreated | null>(null);
  const [copied, setCopied] = useState(false);
  const [deviceAlias, setDeviceAlias] = useState(() => deriveDeviceAlias());
  const [deviceRemembered, setDeviceRemembered] = useState(false);

  const oidcEnabled = me?.kind === 'oidc';
  const usingApiToken = me?.kind === 'api_token';

  const createMutation = useMutation({
    mutationFn: () => settingsApi.createToken({ alias: alias || undefined, scopes: newScopes }),
    onSuccess: (created) => {
      setJustCreated(created);
      setAlias('');
      setNewScopes([]);
      queryClient.invalidateQueries({ queryKey: ['api-tokens'] });
    },
  });

  const updateScopesMutation = useMutation({
    mutationFn: ({ id, scopes }: { id: string; scopes: Scope[] }) =>
      settingsApi.updateTokenScopes(id, { scopes }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['api-tokens'] });
      await queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  });

  const rememberMutation = useMutation({
    mutationFn: () => settingsApi.createToken({ alias: deviceAlias || undefined, scopes: allowedScopes.filter((scope) => scope !== 'all') }),
    onSuccess: async (created) => {
      if (!active.current) return;
      if (extensions?.session) await extensions.session.installApiToken?.(created.token);
      else storeToken(created.token);
      setDeviceRemembered(true);
      queryClient.invalidateQueries({ queryKey: ['api-tokens'] });
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
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
      {canWrite && oidcEnabled && !usingApiToken && (!extensions?.session || extensions.session.installApiToken) && (
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

      {/* Create form */}
      {canWrite && (
        <div className="form-grid">
          <div className="form-row">
            <label>Alias (optional)</label>
            <input placeholder="e.g. mobile-app" value={alias} onChange={(e) => setAlias(e.target.value)} />
          </div>
          <div className="form-row">
            <label>Scopes</label>
            <TagInput
              value={newScopes}
              options={allowedScopes}
              onChange={setNewScopes}
              placeholder="Add scope…"
            />
          </div>
          <div className="form-row form-row-full">
            <button
              className="button"
              type="button"
              disabled={createMutation.isPending || newScopes.length === 0 || newScopes.some((scope) => !allowedScopes.includes(scope))}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? 'Creating…' : '+ Create token'}
            </button>
            {createMutation.isError && (
              <p style={{ fontSize: '0.82rem', color: 'var(--error-text)', marginTop: '0.5rem' }}>
                {createMutation.error instanceof ApiError
                  ? ((createMutation.error.body as { message?: string })?.message ?? 'Failed to create token.')
                  : 'Failed to create token.'}
              </p>
            )}
          </div>
        </div>
      )}

      <p className="muted-text">Tokens can only receive permissions available to this session. MCP enables reading and writing through MCP. Instance administration requires an explicit scope and an active administrator role.</p>
      {(updateScopesMutation.isError || deactivateMutation.isError || deleteMutation.isError) && <p className="error-state" role="alert">Unable to update this token. Check this session's permissions and try again.</p>}
      {/* Token list */}
      {isLoading ? (
        <div className="loading-state">Loading tokens…</div>
      ) : !tokens?.length ? (
        <div className="empty-state" style={{ textAlign: 'center' }}>No API tokens yet.</div>
      ) : (
        <div style={{ overflowX: 'auto', maxWidth: '100%' }}><table>
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
                allowedScopes={allowedScopes}
                onDeactivate={() => deactivateMutation.mutate(token.id)}
                deactivating={deactivateMutation.isPending && deactivateMutation.variables === token.id}
                onDelete={() => deleteMutation.mutate(token.id)}
                deleting={deleteMutation.isPending && deleteMutation.variables === token.id}
                onUpdateScopes={(scopes) => updateScopesMutation.mutate({ id: token.id, scopes })}
                updatingScopes={updateScopesMutation.isPending && updateScopesMutation.variables?.id === token.id}
              />
            ))}
          </tbody>
        </table></div>
      )}
    </section>
  );
}

function TokenRow({ token, canWrite, allowedScopes, onDeactivate, deactivating, onDelete, deleting, onUpdateScopes, updatingScopes }: {
  token: ApiTokenPublic;
  canWrite: boolean;
  allowedScopes: Scope[];
  onDeactivate: () => void;
  deactivating: boolean;
  onDelete: () => void;
  deleting: boolean;
  onUpdateScopes: (scopes: Scope[]) => void;
  updatingScopes: boolean;
}) {
  const [editingScopes, setEditingScopes] = useState(false);
  const [scopesDraft, setScopesDraft] = useState<Scope[]>(token.scopes);

  function startScopeEdit() {
    setScopesDraft(token.scopes.filter((scope) => allowedScopes.includes(scope)));
    setEditingScopes(true);
  }

  function commitScopes() {
    if (scopesDraft.length === 0 || scopesDraft.some((scope) => !allowedScopes.includes(scope))) return;
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
                options={allowedScopes}
                onChange={setScopesDraft}
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
              disabled={!canWrite}
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
                <span style={{ alignSelf: 'center', color: 'var(--text-muted)', fontSize: '0.78rem' }}>Instance admin can reactivate</span>
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
