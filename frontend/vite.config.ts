/// <reference types="vitest/config" />
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/

import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';

const dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

function readPetmonBuildInfo(): { version: string; gitSha: string } {
  const cargoToml = fs.readFileSync(path.join(dirname, '..', 'Cargo.toml'), 'utf-8');
  const version = cargoToml.match(/^version\s*=\s*"([^"]+)"/m)?.[1] ?? 'unknown';
  let gitSha = 'unknown';
  try {
    gitSha = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    // Non-git checkout (e.g. published crate tarball).
  }
  return { version, gitSha };
}

const isStorybookBuild =
  process.env.STORYBOOK === 'true' ||
  process.env.npm_lifecycle_event === 'build-storybook' ||
  process.env.npm_lifecycle_event === 'storybook';

const enablePwa = !isStorybookBuild && !process.env.VITEST;

const petmonBuild = readPetmonBuildInfo();

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig({
  define: {
    __PETMON_BUILD__: JSON.stringify(petmonBuild),
  },
  plugins: [
    react(),
    ...(enablePwa
      ? [
          VitePWA({
            registerType: 'autoUpdate',
            strategies: 'injectManifest',
            srcDir: 'src',
            filename: 'sw.ts',
            injectManifest: {
              globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
            },
            devOptions: {
              enabled: true,
              type: 'module',
            },
            workbox: {
              navigateFallback: '/index.html',
              navigateFallbackDenylist: [/^\/api/, /^\/mcp/],
            },
            includeAssets: ['favicon.svg', 'icons/*.png'],
            manifest: {
              name: 'Petmon',
              short_name: 'Petmon',
              description: 'Pet monitoring app',
              theme_color: '#1e1e1c',
              background_color: '#1c1c1a',
              display: 'standalone',
              orientation: 'portrait',
              scope: '/',
              start_url: '/',
              icons: [
                { src: 'icons/72x72.png',   sizes: '72x72',   type: 'image/png' },
                { src: 'icons/96x96.png',   sizes: '96x96',   type: 'image/png' },
                { src: 'icons/128x128.png', sizes: '128x128', type: 'image/png' },
                { src: 'icons/144x144.png', sizes: '144x144', type: 'image/png' },
                { src: 'icons/152x152.png', sizes: '152x152', type: 'image/png' },
                { src: 'icons/180x180.png', sizes: '180x180', type: 'image/png' },
                { src: 'icons/192x192.png', sizes: '192x192', type: 'image/png' },
                { src: 'icons/384x384.png', sizes: '384x384', type: 'image/png' },
                { src: 'icons/512x512.png', sizes: '512x512', type: 'image/png' },
                { src: 'icons/maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
              ],
            },
          }),
        ]
      : []),
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
      '/mcp': 'http://localhost:8080'
    }
  },
  test: {
    projects: [
      {
        extends: true,
        plugins: [
          // The plugin will run tests for the stories defined in your Storybook config
          // See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
          storybookTest({
            configDir: path.join(dirname, '.storybook')
          })
        ],
        test: {
          name: 'storybook',
          retry: 2,
          fileParallelism: false,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({}),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
    ]
  }
});