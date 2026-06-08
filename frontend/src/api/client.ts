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
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
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
