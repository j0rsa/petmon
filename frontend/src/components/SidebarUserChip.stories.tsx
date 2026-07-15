import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { MeResponse } from '../api/me';
import { mockAppInfo } from '../stories/fixtures';
import { SidebarUserChip } from './NavBar';

function chipClient(me: MeResponse) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(['me'], me);
  client.setQueryData(['app-info'], mockAppInfo);
  return client;
}

function ChipWrapper({ me }: { me: MeResponse }) {
  return (
    <QueryClientProvider client={chipClient(me)}>
      <aside className="sidebar" style={{ width: 280, padding: '1.25rem' }}>
        <SidebarUserChip />
      </aside>
    </QueryClientProvider>
  );
}

const meta = {
  title: 'Navigation/SidebarUserChip',
  component: SidebarUserChip,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof SidebarUserChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OidcUser: Story = {
  name: 'OIDC user with version',
  render: () => (
    <ChipWrapper
      me={{
        subject: 'sub-123',
        email: 'alice@example.com',
        name: 'Alice',
        display_name: 'Alice',
        kind: 'oidc',
        scopes: [],
      }}
    />
  ),
};

export const ApiTokenUser: Story = {
  name: 'API token user with creator',
  render: () => (
    <ChipWrapper
      me={{
        subject: 'iPhone (iOS 18.7)',
        email: null,
        name: 'iPhone (iOS 18.7)',
        display_name: 'iPhone (iOS 18.7)',
        kind: 'api_token',
        scopes: ['api_read'],
        token_created_by: 'Alice',
      }}
    />
  ),
};

export const DevUser: Story = {
  name: 'Dev mode (no sign out)',
  render: () => (
    <ChipWrapper
      me={{
        subject: 'dev',
        email: null,
        name: 'Dev',
        display_name: 'Dev',
        kind: 'dev',
        scopes: [],
      }}
    />
  ),
};
