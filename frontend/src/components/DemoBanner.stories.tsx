import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { mockAppInfo } from '../stories/fixtures';
import { DemoBanner } from './DemoBanner';

const meta = {
  title: 'Components/DemoBanner',
  component: DemoBanner,
  parameters: { layout: 'fullscreen' },
  render: (args) => {
    const client = new QueryClient();
    client.setQueryData(['app-info'], {
      ...mockAppInfo,
      demo_mode: args.demoMode ?? false,
    });
    return (
      <QueryClientProvider client={client}>
        <DemoBanner />
      </QueryClientProvider>
    );
  },
  argTypes: {
    demoMode: { control: 'boolean' },
  },
} satisfies Meta<{ demoMode: boolean }>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Hidden: Story = {
  args: { demoMode: false },
};

export const Visible: Story = {
  args: { demoMode: true },
};
