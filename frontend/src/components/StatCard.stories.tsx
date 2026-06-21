import type { Meta, StoryObj } from '@storybook/react-vite';
import { StatCard } from './StatCard';
import { TrendUpIcon, ClockIcon, AlertIcon } from '../lib/metricIcons';

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

export const WithUnit: Story = {
  args: { label: 'avg liquids / day', value: '85', unit: 'ml', color: 'var(--metric-water)' },
};

export const WithIcon: Story = {
  args: { label: 'median visits / day', value: '4.2', icon: <TrendUpIcon />, note: '+5% vs avg 4.0' },
};

export const TrendUp: Story = {
  args: { label: 'median visits / day', value: '4.2', trend: 'up', icon: <TrendUpIcon />, note: '+12% trend' },
};

export const TrendDown: Story = {
  args: { label: 'median time spent', value: '1m 35s', trend: 'down', color: 'var(--metric-wet)', icon: <ClockIcon />, note: '-8% trend' },
};

export const TrendFlat: Story = {
  args: { label: 'vomit days', value: '2', trend: 'flat', color: 'var(--error-text)', icon: <AlertIcon />, note: '14% of period' },
};

export const NoTrend: Story = {
  args: { label: 'vomit days', value: '0', color: 'var(--error-text)', icon: <AlertIcon />, note: '0% of period' },
};
