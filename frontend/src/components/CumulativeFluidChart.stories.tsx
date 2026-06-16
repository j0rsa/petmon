import type { Meta, StoryObj } from '@storybook/react';
import { mockAnalyticsDateTo, mockAnalyticsRecords, mockNutritionSchedules } from '../stories/fixtures';
import { CumulativeFluidChart } from './CumulativeFluidChart';

const meta = {
  title: 'Components/CumulativeFluidChart',
  component: CumulativeFluidChart,
  tags: ['autodocs'],
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
