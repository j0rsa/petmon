import { clearToken, fetchAuthInfo, getStoredToken, isSignedOut, redirectToLogin } from '../lib/auth';

const BASE = '/api/v1';

export interface ApiSessionAdapter {
  /** Opaque identity/credential revision, including cookie-session changes; never a secret. */
  getSessionKey: () => string;
  /** Return null for a cookie-authenticated session. */
  getToken: () => string | null;
  onUnauthorized: () => Promise<void>;
}

let sessionAdapter: ApiSessionAdapter | undefined;

/** Trusted composition-root configuration, before mounting shared components.
 * Pair account/credential changes with ApplicationExtensionsProvider.sessionKey. */
export function configureApiSession(adapter: ApiSessionAdapter) { sessionAdapter = adapter; }

export class ApiError extends Error {
  public status: number;
  public body: unknown;

  constructor(status: number, body: unknown) {
    super(`HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const adapter = sessionAdapter;
  const sessionKey = adapter?.getSessionKey();
  const token = adapter ? adapter.getToken() : getStoredToken();

  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
    ...init,
  });

  const contentType = res.headers.get('content-type') ?? '';
  const parseBody = async () => {
    if (contentType.includes('application/json')) {
      return res.json().catch(() => ({}));
    }
    const text = await res.text().catch(() => '');
    return text || {};
  };

  if (res.status === 401) {
    if (adapter) {
      if (adapter === sessionAdapter && adapter.getSessionKey() === sessionKey && adapter.getToken() === token) await adapter.onUnauthorized();
      throw new ApiError(res.status, await parseBody());
    }
    // Do not clear the token or attempt SSO while offline — the request failed
    // due to no connectivity, not because the token is invalid.
    if (!navigator.onLine) {
      throw new ApiError(res.status, await parseBody());
    }
    // Token missing or expired — redirect to login once; parallel 401s all see
    // the token already cleared and bail out to avoid clobbering PKCE state.
    if (!token || getStoredToken() !== token) {
      throw new ApiError(res.status, await parseBody());
    }
    clearToken();
    if (isSignedOut()) {
      throw new ApiError(res.status, await parseBody());
    }
    try {
      const authInfo = await fetchAuthInfo();
      if (authInfo.mode === 'oidc') {
        await redirectToLogin(authInfo);
        // redirectToLogin navigates away; this promise never resolves
        return new Promise(() => {});
      }
    } catch {
      // If auth info fetch itself fails, fall through and throw the original error
    }
    throw new ApiError(res.status, await parseBody());
  }

  if (!res.ok) {
    throw new ApiError(res.status, await parseBody());
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await parseBody()) as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (path: string) => request<void>(path, { method: 'DELETE' }),
};
