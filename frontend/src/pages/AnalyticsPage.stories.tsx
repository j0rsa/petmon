import type { Meta, StoryObj } from '@storybook/react-vite';
import { withAnalyticsPage, withMemoryRouter } from '../stories/decorators';
import AnalyticsPage from './AnalyticsPage';

const meta = {
  title: 'Pages/AnalyticsPage',
  component: AnalyticsPage,
  tags: ['autodocs'],
  decorators: [withMemoryRouter],
  parameters: {
    route: '/nutrition/analytics',
    layout: 'padded',
  },
} satisfies Meta<typeof AnalyticsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithData: Story = {
  decorators: [withAnalyticsPage()],
};

export const EmptyRange: Story = {
  decorators: [withAnalyticsPage({ empty: true })],
};

export const Loading: Story = {
  decorators: [withAnalyticsPage({ loading: true })],
};

export const Error: Story = {
  decorators: [withAnalyticsPage({ error: true })],
};
