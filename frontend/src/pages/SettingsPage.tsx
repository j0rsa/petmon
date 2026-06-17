import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { settingsApi } from '../api/settings';
import type { ApiTokenCreated, ApiTokenPublic, OidcConfigPublic, TelegramConfigPublic } from '../api/settings';

export default function SettingsPage() {
  return (
    <div className="page-stack">
      <OidcSection />
      <TelegramSection />
      <ApiTokensSection />
    </div>
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

  const oidcEnabled = oidc?.enabled ?? false;

  const createMutation = useMutation({
    mutationFn: () => settingsApi.createToken({ alias: alias || undefined }),
    onSuccess: (created) => {
      setJustCreated(created);
      setAlias('');
      queryClient.invalidateQueries({ queryKey: ['api-tokens'] });
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => settingsApi.deactivateToken(id),
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

      {/* One-time token reveal */}
      {justCreated && (
        <div style={{ background: 'var(--success-bg)', border: '1px solid var(--success-border)', borderRadius: 12, padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <p style={{ fontSize: '0.88rem', fontWeight: 600 }}>Token created — copy it now, it won't be shown again.</p>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              readOnly
              value={justCreated.token}
              onFocus={(e) => e.target.select()}
              style={{ fontFamily: 'monospace', fontSize: '0.82rem', flex: 1 }}
            />
            <button className="button button-secondary" type="button" style={{ whiteSpace: 'nowrap' }} onClick={handleCopy}>
              {copied ? 'Copied!' : 'Copy'}
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
                onDeactivate={() => deactivateMutation.mutate(token.id)}
                deactivating={deactivateMutation.isPending && deactivateMutation.variables === token.id}
              />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function TokenRow({ token, onDeactivate, deactivating }: { token: ApiTokenPublic; onDeactivate: () => void; deactivating: boolean }) {
  return (
    <tr style={{ opacity: token.active ? 1 : 0.5 }}>
      <td style={{ fontFamily: 'monospace', fontSize: '0.88rem' }}>{token.alias ?? <span style={{ color: 'var(--text-subtle)' }}>—</span>}</td>
      <td style={{ fontSize: '0.88rem' }}>{token.created_by ?? <span style={{ color: 'var(--text-subtle)' }}>—</span>}</td>
      <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{token.created_at.slice(0, 10)}</td>
      <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{token.last_used_at ? token.last_used_at.slice(0, 10) : <span style={{ color: 'var(--text-subtle)' }}>never</span>}</td>
      <td><span className={`status-pill${token.active ? ' active' : ''}`}>{token.active ? 'Active' : 'Inactive'}</span></td>
      <td>
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
      </td>
    </tr>
  );
}
