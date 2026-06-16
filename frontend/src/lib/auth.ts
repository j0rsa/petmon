const TOKEN_KEY = 'pm_id_token';
const VERIFIER_KEY = 'pm_pkce_verifier';
const STATE_KEY = 'pm_oauth_state';
const REDIRECT_KEY = 'pm_redirect_after_login';

// ── Token storage ─────────────────────────────────────────────────────────────

export function getStoredToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function storeToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
}

// ── Redirect path ─────────────────────────────────────────────────────────────

export function storeRedirectPath(path: string): void {
  sessionStorage.setItem(REDIRECT_KEY, path);
}

export function consumeRedirectPath(): string {
  const path = sessionStorage.getItem(REDIRECT_KEY) ?? '/';
  sessionStorage.removeItem(REDIRECT_KEY);
  return path;
}

// ── PKCE helpers ──────────────────────────────────────────────────────────────

function base64urlEncode(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function generateCodeVerifier(): Promise<string> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return base64urlEncode(bytes.buffer);
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoded = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return base64urlEncode(digest);
}

export function generateState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return base64urlEncode(bytes.buffer);
}

// ── PKCE session storage ──────────────────────────────────────────────────────

export function storeVerifier(verifier: string): void {
  sessionStorage.setItem(VERIFIER_KEY, verifier);
}

export function consumeVerifier(): string | null {
  const v = sessionStorage.getItem(VERIFIER_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);
  return v;
}

export function storeState(state: string): void {
  sessionStorage.setItem(STATE_KEY, state);
}

export function consumeState(): string | null {
  const s = sessionStorage.getItem(STATE_KEY);
  sessionStorage.removeItem(STATE_KEY);
  return s;
}

// ── Login redirect ────────────────────────────────────────────────────────────

export interface AuthInfo {
  mode: 'dev' | 'oidc' | 'unconfigured';
  authorization_endpoint?: string;
  client_id?: string;
  token_endpoint?: string;
}

export async function fetchAuthInfo(): Promise<AuthInfo> {
  const res = await fetch('/api/v1/auth/info');
  if (!res.ok) throw new Error('Failed to fetch auth info');
  return res.json();
}

/** Build the PKCE authorization URL and navigate to it. */
export async function redirectToLogin(authInfo: AuthInfo): Promise<void> {
  if (!authInfo.authorization_endpoint || !authInfo.client_id) return;

  const verifier = await generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  const state = generateState();

  storeVerifier(verifier);
  storeState(state);
  storeRedirectPath(window.location.pathname + window.location.search);

  const redirectUri = `${window.location.origin}/auth/callback`;

  const url = new URL(authInfo.authorization_endpoint);
  url.searchParams.set('client_id', authInfo.client_id);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', state);

  window.location.href = url.toString();
}
