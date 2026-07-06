import type { ComponentType } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { localToday, shiftDate } from '../../lib/dates';
import { mockHealthStateRecords, mockPetId } from '../../stories/fixtures';
import { HealthStatePanel } from './HealthStatePanel';

const meta = {
  title: 'Components/Health/HealthStatePanel',
  component: HealthStatePanel,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: { petId: mockPetId },
} satisfies Meta<typeof HealthStatePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

function seedHealthStateQueries(
  client: QueryClient,
  records: typeof mockHealthStateRecords,
  petId = mockPetId,
) {
  const today = localToday();
  const dateFrom = shiftDate(today, -29);
  client.setQueryData(['health-state-records', petId], records);
  client.setQueryData(['health-state-chart', petId, dateFrom, today, 'daily'], records);
  client.setQueryData(['health-state-chart', petId, 'all', today, 'weekly'], records);
}

function withHealthStateRecords(records: typeof mockHealthStateRecords, loading = false) {
  return function Decorator(StoryComponent: ComponentType) {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Infinity },
      },
    });
    if (loading) {
      client.setQueryDefaults(['health-state-records', mockPetId], {
        queryFn: () => new Promise(() => {}),
      });
      client.setQueryDefaults(['health-state-chart', mockPetId], {
        queryFn: () => new Promise(() => {}),
      });
    } else {
      seedHealthStateQueries(client, records);
    }
    client.setQueryData(['me'], {
      subject: 'dev',
      email: null,
      name: 'Dev',
      display_name: 'Dev',
      kind: 'dev',
      scopes: [],
    });
    return (
      <QueryClientProvider client={client}>
        <StoryComponent />
      </QueryClientProvider>
    );
  };
}

/** Panel with chart, recent check-ins, and optional notes. */
export const WithHistory: Story = {
  decorators: [withHealthStateRecords(mockHealthStateRecords)],
};

/** Empty state before any check-ins. */
export const Empty: Story = {
  decorators: [withHealthStateRecords([])],
};

/** Loading state. */
export const Loading: Story = {
  decorators: [withHealthStateRecords([], true)],
};
