import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('session-bound API authentication', () => {
  let storedToken: string | null;
  beforeEach(() => {
    vi.resetModules();
    storedToken = 'old-token';
    vi.stubGlobal('localStorage', {
      getItem: () => storedToken,
      setItem: (_key: string, value: string) => { storedToken = value; },
      removeItem: () => { storedToken = null; },
    });
    vi.stubGlobal('navigator', { onLine: true });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('uses custom cookie authentication without falling through to standalone OIDC discovery', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response('{}', { status: 401 }));
    vi.stubGlobal('fetch', fetch);
    const { api, configureApiSession } = await import('./client');
    const unauthorized = vi.fn(async () => {});
    configureApiSession({ getSessionKey: () => 'cookie-session', getToken: () => null, onUnauthorized: unauthorized });
    await expect(api.get('/pets')).rejects.toMatchObject({ status: 401 });
    expect(unauthorized).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]?.[1]).not.toHaveProperty('headers.Authorization');
    expect(storedToken).toBe('old-token');
  });

  it('does not log out a new cookie account when an old request later fails', async () => {
    let respond!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { respond = resolve; })));
    const { api, configureApiSession } = await import('./client');
    let session = 'first';
    const unauthorized = vi.fn(async () => {});
    configureApiSession({ getSessionKey: () => session, getToken: () => null, onUnauthorized: unauthorized });
    const request = api.get('/pets');
    session = 'second';
    respond(new Response('{}', { status: 401 }));
    await expect(request).rejects.toMatchObject({ status: 401 });
    expect(unauthorized).not.toHaveBeenCalled();
  });

  it('does not clear a replacement standalone token when an old request later fails', async () => {
    let respond!: (response: Response) => void;
    const fetch = vi.fn(() => new Promise<Response>((resolve) => { respond = resolve; }));
    vi.stubGlobal('fetch', fetch);
    const { api } = await import('./client');
    const request = api.get('/pets');
    storedToken = 'replacement-token';
    respond(new Response('{}', { status: 401 }));
    await expect(request).rejects.toMatchObject({ status: 401 });
    expect(storedToken).toBe('replacement-token');
    expect(fetch).toHaveBeenCalledOnce();
  });
});
