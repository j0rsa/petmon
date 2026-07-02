import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  "stories": [
    "../src/**/*.mdx",
    "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"
  ],
  "addons": [
    "@chromatic-com/storybook",
    "@storybook/addon-vitest",
    "@storybook/addon-a11y",
    "@storybook/addon-docs",
    "@storybook/addon-mcp"
  ],
  "framework": "@storybook/react-vite",
  async viteFinal(config) {
    // Storybook inherits the app Vite config, but PWA service-worker generation
    // fails on large manager bundles during build-storybook / Chromatic publishes.
    config.plugins = config.plugins?.filter((plugin) => {
      if (!plugin || typeof plugin !== 'object') return true;
      const name = 'name' in plugin ? String(plugin.name) : '';
      return !name.includes('pwa');
    });
    return config;
  },
};
export default config;