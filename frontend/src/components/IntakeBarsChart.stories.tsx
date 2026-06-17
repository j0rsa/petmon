import type { Meta, StoryObj } from '@storybook/react-vite';
import { IntakeBarsChart } from './IntakeBarsChart';
import { mockNutritionRecords } from '../stories/fixtures';

const meta = {
  title: 'Charts/IntakeBarsChart',
  component: IntakeBarsChart,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof IntakeBarsChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithRecords: Story = {
  args: { records: mockNutritionRecords },
};

export const Empty: Story = {
  args: { records: [] },
};
