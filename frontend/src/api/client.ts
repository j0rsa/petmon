import { clearToken, fetchAuthInfo, getStoredToken, redirectToLogin, storeRedirectPath } from '../lib/auth';

const BASE = '/api/v1';

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
  const token = getStoredToken();

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
    // Token missing or expired — fetch auth info and redirect to login
    clearToken();
    try {
      const authInfo = await fetchAuthInfo();
      if (authInfo.mode === 'oidc') {
        storeRedirectPath(window.location.pathname + window.location.search);
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
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (path: string) => request<void>(path, { method: 'DELETE' }),
};
