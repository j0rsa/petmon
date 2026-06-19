import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { settingsApi } from '../api/settings';
import type { ApiTokenCreated, ApiTokenPublic, DisplaySettings, OidcConfigPublic, TelegramConfigPublic } from '../api/settings';
import { infoApi } from '../api/info';
import { deriveDeviceAlias, getStoredToken, storeToken } from '../lib/auth';

export default function SettingsPage() {
  const { data: info } = useQuery({ queryKey: ['app-info'], queryFn: infoApi.get, staleTime: Infinity, retry: false });

  return (
    <div className="page-stack">
      <DisplaySection />
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

// ── OIDC ─────────────────────────────────────────────────────────────────────

function OidcSection() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['settings-oidc'], queryFn: settingsApi.getOidc });

  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [issuerUrl, setIssuerUrl] = useState('');
  const [clientId, setClientId] = useState('');

  const current = data ?? ({ enabled: false, issuer_url: null, client_id: null } as OidcConfigPublic);
  const effectiveEnabled = enabled ?? current.enabled;

  const mutation = useMutation({
    mutationFn: () => settingsApi.updateOidc({
      enabled: effectiveEnabled,
      ...(issuerUrl ? { issuer_url: issuerUrl } : {}),
      ...(clientId ? { client_id: clientId } : {}),
    }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['settings-oidc'], updated);
      setIssuerUrl('');
      setClientId('');
      setEnabled(null);
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
        <span className={`status-pill${current.enabled ? ' active' : ''}`}>
          {current.enabled ? 'Enabled' : 'Disabled'}
        </span>
      </div>

      <div className="form-grid">
        <div className="form-row">
          <label>Issuer URL</label>
          <input
            placeholder={current.issuer_url ?? 'https://accounts.example.com'}
            value={issuerUrl}
            onChange={(e) => setIssuerUrl(e.target.value)}
          />
          {current.issuer_url && !issuerUrl && (
            <span style={{ fontSize: '0.78rem', color: 'var(--text-subtle)' }}>current: {current.issuer_url}</span>
          )}
        </div>
        <div className="form-row">
          <label>Client ID</label>
          <input
            placeholder={current.client_id ?? 'client-id'}
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          />
          {current.client_id && !clientId && (
            <span style={{ fontSize: '0.78rem', color: 'var(--text-subtle)' }}>current: {current.client_id}</span>
          )}
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
  const { data: tokens, isLoading } = useQuery({ queryKey: ['api-tokens'], queryFn: settingsApi.listTokens });
  const { data: oidc } = useQuery({ queryKey: ['settings-oidc'], queryFn: settingsApi.getOidc });

  const [alias, setAlias] = useState('');
  const [justCreated, setJustCreated] = useState<ApiTokenCreated | null>(null);
  const [copied, setCopied] = useState(false);
  const [deviceAlias, setDeviceAlias] = useState(() => deriveDeviceAlias());
  const [deviceRemembered, setDeviceRemembered] = useState(false);

  const oidcEnabled = oidc?.enabled ?? false;
  const usingApiToken = getStoredToken()?.startsWith('pm_api_') ?? false;

  const createMutation = useMutation({
    mutationFn: () => settingsApi.createToken({ alias: alias || undefined }),
    onSuccess: (created) => {
      setJustCreated(created);
      setAlias('');
      queryClient.invalidateQueries({ queryKey: ['api-tokens'] });
    },
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
      {oidcEnabled && !usingApiToken && (
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
      {oidcEnabled && (
        <div className="form-grid">
          <div className="form-row">
            <label>Alias (optional)</label>
            <input placeholder="e.g. mobile-app" value={alias} onChange={(e) => setAlias(e.target.value)} />
          </div>
          <div className="form-row form-row-full">
            <button
              className="button"
              type="button"
              disabled={createMutation.isPending}
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
                onActivate={() => activateMutation.mutate(token.id)}
                activating={activateMutation.isPending && activateMutation.variables === token.id}
                onDeactivate={() => deactivateMutation.mutate(token.id)}
                deactivating={deactivateMutation.isPending && deactivateMutation.variables === token.id}
                onDelete={() => deleteMutation.mutate(token.id)}
                deleting={deleteMutation.isPending && deleteMutation.variables === token.id}
              />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function TokenRow({ token, onActivate, activating, onDeactivate, deactivating, onDelete, deleting }: {
  token: ApiTokenPublic;
  onActivate: () => void;
  activating: boolean;
  onDeactivate: () => void;
  deactivating: boolean;
  onDelete: () => void;
  deleting: boolean;
}) {
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
      <td style={{ fontSize: '0.88rem' }}>{token.created_by ?? <span style={{ color: 'var(--text-subtle)' }}>—</span>}</td>
      <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{token.created_at.slice(0, 10)}</td>
      <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{token.last_used_at ? token.last_used_at.slice(0, 10) : <span style={{ color: 'var(--text-subtle)' }}>never</span>}</td>
      <td><span className={`status-pill${token.active ? ' active' : ''}`}>{token.active ? 'Active' : 'Inactive'}</span></td>
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
    </tr>
  );
}
