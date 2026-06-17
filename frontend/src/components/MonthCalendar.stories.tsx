import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { mockCalendarHighlights } from '../stories/fixtures';
import { MonthCalendar } from './MonthCalendar';

const meta = {
  title: 'Components/MonthCalendar',
  component: MonthCalendar,
  tags: ['autodocs'],
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
