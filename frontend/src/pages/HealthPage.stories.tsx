import type { Meta, StoryObj } from '@storybook/react-vite';
import { withHealthPage } from '../stories/decorators';
import HealthPage from './HealthPage';

const meta = {
  title: 'Pages/HealthPage',
  component: HealthPage,
  tags: ['autodocs'],
  parameters: { layout: 'padded', route: '/health' },
} satisfies Meta<typeof HealthPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Full health page with weight history chart and records table. */
export const WithWeightHistory: Story = {
  decorators: [withHealthPage()],
};

/** No measurements recorded yet. */
export const Empty: Story = {
  decorators: [withHealthPage({ empty: true })],
};

/** Loading state. */
export const Loading: Story = {
  decorators: [withHealthPage({ loading: true })],
};
