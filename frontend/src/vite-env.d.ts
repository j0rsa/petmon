/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/vanillajs" />

declare module '*.svg?raw' {
  const content: string;
  export default content;
}
