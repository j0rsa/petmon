import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within, waitFor } from 'storybook/test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BottomNav } from './BottomNav';
import { withMemoryRouter } from '../stories/decorators';
import { mockNotifications, mockPets, mockPetId, mockAppInfo } from '../stories/fixtures';
import { SelectedPetProvider } from '../context/SelectedPetContext';

function bottomNavClient(unreadCount: number, notifications = mockNotifications) {
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
  client.setQueryData(['pets'], mockPets);
  client.setQueryData(['me'], { subject: 'dev', email: null, name: 'Dev', display_name: 'Dev', kind: 'dev', scopes: [] });
  client.setQueryData(['notifications-unread-count'], { count: unreadCount });
  client.setQueryData(['notifications'], notifications);
  client.setQueryData(['app-info'], mockAppInfo);
  return client;
}

const withBottomNavData = (unreadCount: number): Decorator => (Story) => (
  <QueryClientProvider client={bottomNavClient(unreadCount)}>
    <SelectedPetProvider initialPetId={mockPetId}>
      <Story />
    </SelectedPetProvider>
  </QueryClientProvider>
);

/** Overrides fixtures — relies on meta withMemoryRouter for routing. */
const withNoPets: Decorator = (Story) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(['pets'], []);
  client.setQueryData(['me'], { subject: 'dev', email: null, name: 'Dev', display_name: 'Dev', kind: 'dev', scopes: [] });
  client.setQueryData(['notifications-unread-count'], { count: 0 });
  client.setQueryData(['app-info'], mockAppInfo);

  localStorage.removeItem('pm_selected_pet_id');

  return (
    <QueryClientProvider client={client}>
      <SelectedPetProvider>
        <Story />
      </SelectedPetProvider>
    </QueryClientProvider>
  );
};

const meta = {
  title: 'Navigation/BottomNav',
  component: BottomNav,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'pwaMobile' },
    route: '/',
  },
  decorators: [withBottomNavData(0), withMemoryRouter],
} satisfies Meta<typeof BottomNav>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithUnreadNotifications: Story = {
  name: 'Unread dot',
  decorators: [withBottomNavData(2)],
};

export const OnNutritionRoute: Story = {
  parameters: { route: '/nutrition' },
};

export const OnToiletingRoute: Story = {
  name: 'On toileting route',
  parameters: { route: '/elimination' },
};

export const OnHealthRoute: Story = {
  parameters: { route: '/health' },
};

export const NoPets: Story = {
  decorators: [withNoPets],
};

export const PetSheetWithNotifications: Story = {
  name: 'Pet sheet with notifications',
  decorators: [withBottomNavData(1)],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /^Mittens/i }));
    await waitFor(() => {
      expect(canvas.getByRole('dialog', { name: 'Pet, notifications, and settings' })).toBeInTheDocument();
    });
    await expect(canvas.getByText('Switch pet')).toBeInTheDocument();
    await expect(canvas.getByText('Manage pets')).toBeInTheDocument();
    await expect(canvas.getByText('Settings')).toBeInTheDocument();
    await expect(canvas.getByText(`v${mockAppInfo.version} · ${mockAppInfo.git_sha}`)).toBeInTheDocument();
    await expect(canvas.getByText('Notifications')).toBeInTheDocument();
    await expect(canvas.getByText('Visit duration did not match history for Mittens')).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Mark all read' })).toBeInTheDocument();
  },
};

export const AllPillarTabs: Story = {
  name: 'All pillar tabs visible',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('link', { name: 'Home' })).toBeInTheDocument();
    await expect(canvas.getByRole('link', { name: 'Food' })).toBeInTheDocument();
    await expect(canvas.getByRole('link', { name: 'Toilet' })).toBeInTheDocument();
    await expect(canvas.getByRole('link', { name: 'Health' })).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: /^Mittens/i })).toBeInTheDocument();
    await expect(canvas.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument();
  },
};
