import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fn } from 'storybook/test';
import { mockCalendarHighlights, mockNutritionCalendarSettings } from '../stories/fixtures';
import { MonthCalendar } from './MonthCalendar';

const meta = {
  title: 'Calendar/MonthCalendar',
  component: MonthCalendar,
  tags: ['autodocs'],
  decorators: [
    (Story) => {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
      client.setQueryData(['user-widget-settings', 'nutrition_calendar'], mockNutritionCalendarSettings);
      return (
        <QueryClientProvider client={client}>
          <Story />
        </QueryClientProvider>
      );
    },
  ],
  args: {
    month: '2024-06',
    selectedDate: '2024-06-15',
    highlights: mockCalendarHighlights(),
    onMonthChange: fn(),
    onSelectDate: fn(),
  },
} satisfies Meta<typeof MonthCalendar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithHighlights: Story = {};

export const EmptyMonth: Story = {
  args: {
    highlights: new Map(),
    selectedDate: '2024-06-01',
  },
};

export const SelectedToday: Story = {
  args: {
    month: new Date().toISOString().slice(0, 7),
    selectedDate: new Date().toISOString().slice(0, 10),
    highlights: new Map(),
  },
};

export const CompactMobile: Story = {
  args: { compact: true },
  parameters: { viewport: { defaultViewport: 'pwaMobile' } },
};
