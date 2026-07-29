import type { Meta, StoryObj } from '@storybook/react-vite';
import { withEliminationAnalyticsPage, withMemoryRouter } from '../stories/decorators';
import EliminationAnalyticsPage from './EliminationAnalyticsPage';

const meta = {
  title: 'Pages/EliminationAnalyticsPage',
  component: EliminationAnalyticsPage,
  tags: ['autodocs'],
  decorators: [withMemoryRouter],
  parameters: {
    route: '/elimination/analytics',
    layout: 'padded',
  },
} satisfies Meta<typeof EliminationAnalyticsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithWeeAndPooDurations: Story = {
  name: 'Wee and poo durations',
  decorators: [withEliminationAnalyticsPage({ durationVariant: 'both' })],
};

export const WeeDurationOnly: Story = {
  name: 'Wee duration only',
  decorators: [withEliminationAnalyticsPage({ durationVariant: 'wee-only' })],
};

export const PooDurationOnly: Story = {
  name: 'Poo duration only',
  decorators: [withEliminationAnalyticsPage({ durationVariant: 'poo-only' })],
};

export const EmptyRange: Story = {
  decorators: [withEliminationAnalyticsPage({ empty: true })],
};

export const Loading: Story = {
  decorators: [withEliminationAnalyticsPage({ loading: true })],
};

export const Error: Story = {
  decorators: [withEliminationAnalyticsPage({ error: true })],
};
