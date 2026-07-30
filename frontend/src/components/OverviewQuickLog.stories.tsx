import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { mockPetId } from '../stories/fixtures';
import { OverviewQuickLog } from './OverviewQuickLog';

const meta = {
  title: 'Overview/OverviewQuickLog',
  component: OverviewQuickLog,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => {
      const client = new QueryClient({
        defaultOptions: {
          queries: { retry: false, staleTime: Infinity },
          mutations: { retry: false },
        },
      });
      return (
        <QueryClientProvider client={client}>
          <div style={{ maxWidth: 640 }}>
            <Story />
          </div>
        </QueryClientProvider>
      );
    },
  ],
  args: {
    date: '2024-06-15',
    petId: mockPetId,
  },
} satisfies Meta<typeof OverviewQuickLog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {
  parameters: {
    docs: {
      description: {
        story: 'Create-only quick log — no past records list.',
      },
    },
  },
};

export const SuccessConfirmation: Story = {
  args: {
    initialSuccessMessage: 'Logged 76 g wet + 40 ml liquid',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('status')).toHaveTextContent('Logged 76 g wet + 40 ml liquid');
  },
};
