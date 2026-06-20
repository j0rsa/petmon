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

export const WithData: Story = {
  decorators: [withEliminationAnalyticsPage()],
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
