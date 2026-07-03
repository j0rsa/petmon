type PwaUpdateHandler = (reloadPage?: boolean) => Promise<void>;

let applyPwaUpdate: PwaUpdateHandler | null = null;

/** Called once from main.tsx after registerSW(). */
export function setPwaUpdateHandler(handler: PwaUpdateHandler): void {
  applyPwaUpdate = handler;
}

/** Activate a waiting service worker and reload (used by the update banner). */
export async function refreshPwaApp(): Promise<void> {
  if (applyPwaUpdate) {
    await applyPwaUpdate(true);
    return;
  }
  globalThis.location?.reload();
}

/** Unregister service workers and delete Cache Storage entries (Workbox precache, etc.). */
export async function clearPwaCaches(): Promise<void> {
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }

  if ('caches' in globalThis) {
    const names = await caches.keys();
    await Promise.all(names.map((name) => caches.delete(name)));
  }
}

/** Nuclear option: drop SW + caches, then hard-reload so the browser fetches fresh assets. */
export async function clearPwaCachesAndReload(): Promise<void> {
  await clearPwaCaches();
  globalThis.location?.reload();
}

export function isPwaCacheSupported(): boolean {
  return 'serviceWorker' in navigator || 'caches' in globalThis;
}
