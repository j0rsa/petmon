import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { mockAnalyticsDateTo, mockAnalyticsRecords, mockCumulativeFluidChartSettings, mockNutritionSchedules } from '../stories/fixtures';
import { CumulativeFluidChart } from './CumulativeFluidChart';

const meta = {
  title: 'Charts/CumulativeFluidChart',
  component: CumulativeFluidChart,
  tags: ['autodocs'],
  decorators: [
    (Story) => {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
      client.setQueryData(['user-settings', 'cumulative_fluid_chart'], mockCumulativeFluidChartSettings);
      return (
        <QueryClientProvider client={client}>
          <Story />
        </QueryClientProvider>
      );
    },
  ],
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof CumulativeFluidChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    records: mockAnalyticsRecords,
    focusDate: mockAnalyticsDateTo,
    schedules: mockNutritionSchedules,
  },
};

export const EmptyFocusDay: Story = {
  args: {
    records: mockAnalyticsRecords.filter((record) => record.local_date !== mockAnalyticsDateTo),
    focusDate: mockAnalyticsDateTo,
    schedules: mockNutritionSchedules,
  },
};
