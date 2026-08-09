import { registerSW } from 'virtual:pwa-register';
import { infoApi } from '../api/info';
import { clearPwaCachesAndReload } from './pwaCache';

const UPDATE_INTERVAL_MS = 60 * 60 * 1000;
const VERSION_RELOAD_KEY = 'petmon-version-reload-attempted';

/** Embedded at build time from Cargo.toml + git SHA (see vite.config.ts). */
export const PETMON_BUILD =
  typeof __PETMON_BUILD__ !== 'undefined'
    ? __PETMON_BUILD__
    : { version: 'dev', gitSha: 'dev' };

function buildMatchesServer(version: string, gitSha: string): boolean {
  return version === PETMON_BUILD.version && gitSha === PETMON_BUILD.gitSha;
}

/** Register the service worker, reload on new controller, poll for updates. */
export function initPwaUpdates(): void {
  if (import.meta.env.DEV) {
    return;
  }

  let refreshing = false;
  navigator.serviceWorker?.addEventListener('controllerchange', () => {
    if (refreshing) {
      return;
    }
    refreshing = true;
    globalThis.location.reload();
  });

  registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (registration) {
        scheduleServiceWorkerUpdateChecks(registration);
      }
    },
    onOfflineReady() {},
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') {
      return;
    }
    void navigator.serviceWorker?.ready.then((registration) => registration.update());
    void checkServerVersionMismatch();
  });

  void checkServerVersionMismatch();
}

function scheduleServiceWorkerUpdateChecks(registration: ServiceWorkerRegistration): void {
  const check = () => {
    void registration.update();
  };

  window.setInterval(check, UPDATE_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      check();
    }
  });
}

/**
 * Compare running bundle version to `/api/v1/info`. Reload (or clear caches) when
 * the server reports a newer deploy — catches cases where the SW update path stalls.
 */
export async function checkServerVersionMismatch(): Promise<void> {
  if (PETMON_BUILD.version === 'dev') {
    return;
  }

  try {
    const info = await infoApi.get();
    if (buildMatchesServer(info.version, info.git_sha)) {
      sessionStorage.removeItem(VERSION_RELOAD_KEY);
      return;
    }

    if (sessionStorage.getItem(VERSION_RELOAD_KEY)) {
      sessionStorage.removeItem(VERSION_RELOAD_KEY);
      await clearPwaCachesAndReload();
      return;
    }

    sessionStorage.setItem(VERSION_RELOAD_KEY, '1');
    globalThis.location.reload();
  } catch {
    // Offline or API unavailable — skip until next check.
  }
}
