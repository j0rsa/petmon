import { useEffect, useState } from 'react';
import {
  consumeRedirectPath,
  consumeState,
  consumeVerifier,
  fetchAuthInfo,
  redirectToLogin,
  storeToken,
} from '../lib/auth';

export default function AuthCallbackPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function exchange() {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const returnedState = params.get('state');
      const errorParam = params.get('error');

      if (errorParam) {
        setError(`Login failed: ${params.get('error_description') ?? errorParam}`);
        return;
      }

      if (!code) {
        setError('No authorization code received.');
        return;
      }

      // Validate state to prevent CSRF
      const expectedState = consumeState();
      if (!expectedState || returnedState !== expectedState) {
        setError('State mismatch — possible CSRF attack. Please try again.');
        return;
      }

      const verifier = consumeVerifier();
      if (!verifier) {
        setError('PKCE verifier missing. Please try logging in again.');
        return;
      }

      // Fetch the token endpoint from the server (avoids hardcoding provider URLs)
      const authInfo = await fetchAuthInfo().catch(() => null);
      if (!authInfo || authInfo.mode !== 'oidc' || !authInfo.token_endpoint || !authInfo.client_id) {
        setError('OIDC not configured on the server.');
        return;
      }

      // Exchange the authorization code for tokens directly with the provider.
      // PKCE: no client_secret needed — the verifier proves we initiated the flow.
      const redirectUri = `${window.location.origin}/auth/callback`;
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: authInfo.client_id,
        code_verifier: verifier,
      });

      const tokenRes = await fetch(authInfo.token_endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });

      if (!tokenRes.ok) {
        const detail = await tokenRes.text().catch(() => '');
        setError(`Token exchange failed (${tokenRes.status})${detail ? `: ${detail}` : ''}`);
        return;
      }

      const tokens = await tokenRes.json();
      const idToken: string | undefined = tokens.id_token;

      if (!idToken) {
        setError('Provider did not return an id_token.');
        return;
      }

      storeToken(idToken);
      window.location.replace(consumeRedirectPath());
    }

    exchange().catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  if (error) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        gap: '1rem',
        padding: '2rem',
      }}>
        <div className="error-state" style={{ maxWidth: 480 }}>{error}</div>
        <button
          className="button button-secondary"
          type="button"
          onClick={async () => {
            const authInfo = await fetchAuthInfo().catch(() => null);
            if (authInfo?.mode === 'oidc') redirectToLogin(authInfo);
          }}
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      color: 'var(--text-muted)',
      fontFamily: 'monospace',
    }}>
      completing login…
    </div>
  );
}
