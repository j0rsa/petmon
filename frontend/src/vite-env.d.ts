/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/vanillajs" />

declare const __PETMON_BUILD__: { version: string; gitSha: string };

declare module '*.svg?raw' {
  const content: string;
  export default content;
}
