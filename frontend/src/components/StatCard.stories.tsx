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

export const TrendUp: Story = {
  args: { label: 'median visits / day', value: '4.8', icon: <TrendUpIcon />, current: 4.8, avg: 4.0 },
};

export const TrendDown: Story = {
  args: { label: 'median visits / day', value: '3.6', icon: <TrendUpIcon />, current: 3.6, avg: 4.0 },
};

export const TrendFlat: Story = {
  args: { label: 'median visits / day', value: '4.1', icon: <TrendUpIcon />, current: 4.1, avg: 4.0 },
};

export const TrendFlatEdge: Story = {
  args: { label: 'median visits / day', value: '4.2', icon: <TrendUpIcon />, current: 4.2, avg: 4.0 },
};

export const WeeMedianTimeSpent: Story = {
  name: 'Wee median time spent',
  args: {
    label: 'wee median time spent',
    value: '52s',
    color: 'var(--metric-water)',
    icon: <ClockIcon />,
    current: 52,
    avg: 48,
    avgLabel: 'avg 48s',
  },
};

export const PooMedianTimeSpent: Story = {
  name: 'Poo median time spent',
  args: {
    label: 'poo median time spent',
    value: '1m 58s',
    color: 'var(--metric-wet)',
    icon: <ClockIcon />,
    current: 118,
    avg: 105,
    avgLabel: 'avg 1m 45s',
  },
};

export const ManualNote: Story = {
  args: { label: 'vomit days', value: '2', color: 'var(--error-text)', icon: <AlertIcon />, note: '14% of period' },
};
