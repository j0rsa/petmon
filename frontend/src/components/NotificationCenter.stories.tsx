import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { NotificationCenter } from './NotificationCenter';
import { SelectedPetProvider } from '../context/SelectedPetContext';
import { mockPetId, mockPets } from '../stories/fixtures';
import type { NotificationItem } from '../api/notifications';

const mockNotifications: NotificationItem[] = [
  {
    id: 'n-1',
    kind: 'elimination.auto_categorize_failed',
    title: 'Visit duration did not match history for Mittens',
    body: 'The logged duration did not match wee or poop patterns — categorize the 2026-06-02 visit manually.',
    link_path: '/elimination/2026-06-02',
    link_hash: 'record-elim-01',
    pet_id: mockPetId,
    pet_name: 'Mittens',
    created_at: new Date(Date.now() - 5 * 60_000).toISOString(),
    read: false,
  },
  {
    id: 'n-2',
    kind: 'elimination.auto_categorize_failed',
    title: 'Could not auto-tag Rex\'s visit',
    body: 'Auto-tagging needs at least two categorized wee and poop visits with durations.',
    link_path: '/elimination/2026-06-01',
    link_hash: 'record-elim-02',
    pet_id: mockPets[1].id,
    pet_name: 'Rex',
    created_at: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
    read: true,
  },
];

function withNotifications(unreadCount = 1) {
  return function NotificationsDecorator(Story: React.ComponentType) {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    client.setQueryData(['notifications-unread-count'], { count: unreadCount });
    client.setQueryData(['notifications'], mockNotifications);
    client.setQueryData(['pets'], mockPets);
    client.setQueryData(['me'], { subject: 'dev', email: null, name: 'Dev', display_name: 'Dev', kind: 'dev' });

    return (
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <SelectedPetProvider initialPetId={mockPetId}>
            <div style={{ minHeight: '20rem' }}>
              <Story />
            </div>
          </SelectedPetProvider>
        </QueryClientProvider>
      </MemoryRouter>
    );
  };
}

const meta = {
  title: 'Components/NotificationCenter',
  component: NotificationCenter,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof NotificationCenter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithUnreadBadge: Story = {
  decorators: [withNotifications(1)],
};

export const AllRead: Story = {
  decorators: [withNotifications(0)],
};
