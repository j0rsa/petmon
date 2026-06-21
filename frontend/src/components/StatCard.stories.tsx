import type { Meta, StoryObj } from '@storybook/react-vite';
import { StatCard } from './StatCard';

const meta = {
  title: 'Components/StatCard',
  component: StatCard,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 240 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StatCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Plain: Story = {
  args: { label: 'median visits / day', value: '4.2' },
};

export const TrendUp: Story = {
  args: { label: 'median visits / day', value: '4.2', trend: 'up' },
};

export const TrendDown: Story = {
  args: { label: 'median time spent', value: '1m 35s', trend: 'down', color: 'var(--metric-wet)' },
};

export const TrendFlat: Story = {
  args: { label: 'vomit days', value: '2', trend: 'flat', color: 'var(--error-text)' },
};

export const NoTrend: Story = {
  args: { label: 'vomit days', value: '0', color: 'var(--error-text)' },
};
