import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { withMemoryRouter } from '../stories/decorators';
import { mockAppInfo } from '../stories/fixtures';
import { NavBar, SidebarUserChip } from './NavBar';

const meta = {
  title: 'Navigation/NavBar',
  component: NavBar,
  tags: ['autodocs'],
  decorators: [
    withMemoryRouter,
    (Story) => (
      <aside className="sidebar" style={{ width: 280, padding: '1.25rem', minHeight: 420 }}>
        <Story />
      </aside>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
    route: '/',
  },
} satisfies Meta<typeof NavBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OverviewActive: Story = {
  parameters: { route: '/' },
};

export const NutritionActive: Story = {
  parameters: { route: '/nutrition' },
};

export const ToiletingPlaceholder: Story = {
  parameters: { route: '/elimination' },
};

// ── SidebarUserChip stories ───────────────────────────────────────────────────

function chipClient(me: object) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(['me'], me);
  client.setQueryData(['app-info'], mockAppInfo);
  return client;
}

function ChipWrapper({ me }: { me: object }) {
  return (
    <QueryClientProvider client={chipClient(me)}>
      <aside className="sidebar" style={{ width: 280, padding: '1.25rem' }}>
        <SidebarUserChip />
      </aside>
    </QueryClientProvider>
  );
}

export const UserChipOidc: StoryObj = {
  name: 'UserChip — OIDC user with version',
  render: () => <ChipWrapper me={{ subject: 'sub-123', email: 'alice@example.com', name: 'Alice', display_name: 'Alice', kind: 'oidc', scopes: [] }} />,
};

export const UserChipApiToken: StoryObj = {
  name: 'UserChip — API token user',
  render: () => <ChipWrapper me={{ subject: 'mobile-app', email: null, name: null, display_name: 'mobile-app', kind: 'api_token', scopes: ['api_read'] }} />,
};

export const UserChipDev: StoryObj = {
  name: 'UserChip — dev mode (no sign out)',
  render: () => <ChipWrapper me={{ subject: 'dev', email: null, name: 'Dev', display_name: 'Dev', kind: 'dev', scopes: [] }} />,
};
