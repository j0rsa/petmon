import type { Preview, Decorator } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../src/index.css';

const PWA_VIEWPORTS = {
  pwaMobile: {
    name: 'PWA Mobile (390×844)',
    styles: { width: '390px', height: '844px' },
    type: 'mobile' as const,
  },
  pwaSmall: {
    name: 'PWA Small (375×667)',
    styles: { width: '375px', height: '667px' },
    type: 'mobile' as const,
  },
  ipadMini: {
    name: 'iPad Mini (768×1024)',
    styles: { width: '768px', height: '1024px' },
    type: 'tablet' as const,
  },
};

// Block all /api/v1/ calls in Storybook — components should use seeded QueryClient data.
// If a query fires despite seeded data (cache miss, key mismatch, etc.) it gets a clean
// null response instead of a network error.
const _originalFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
  if (typeof url === 'string' && url.includes('/api/v1/')) {
    console.warn(`[Storybook] Intercepted API call: ${url}`);
    return new Response('null', { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  return _originalFetch(input, init);
};

const withQueryClient: Decorator = (Story) => {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
      },
    },
  });
  // Seed identity so NavBar's /auth/me query never hits the network
  client.setQueryData(['me'], { subject: 'dev', email: null, name: 'Dev', display_name: 'Dev', kind: 'dev' });
  return (
    <QueryClientProvider client={client}>
      <Story />
    </QueryClientProvider>
  );
};

const preview: Preview = {
  decorators: [withQueryClient],
  parameters: {
    backgrounds: { disable: true },
    viewport: {
      viewports: PWA_VIEWPORTS,
      defaultViewport: 'responsive',
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: {
      test: 'todo',
    },
  },
};

export default preview;
