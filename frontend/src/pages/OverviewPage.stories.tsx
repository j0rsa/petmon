import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { withOverviewPage } from '../stories/decorators';
import OverviewPage from './OverviewPage';

const meta = {
  title: 'Pages/OverviewPage',
  component: OverviewPage,
  tags: ['autodocs'],
  parameters: { layout: 'padded', route: '/' },
} satisfies Meta<typeof OverviewPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithHighlights: Story = {
  decorators: [withOverviewPage()],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Fluid intake' })).toBeInTheDocument();
    await expect(canvas.getByRole('heading', { name: 'Log intake' })).toBeInTheDocument();
    await expect(canvas.queryByText('Last 7 days')).not.toBeInTheDocument();
    await expect(canvas.queryByText('Streak')).not.toBeInTheDocument();
  },
};

export const EmptyDay: Story = {
  decorators: [withOverviewPage({ empty: true })],
  parameters: {
    docs: {
      description: {
        story: 'No intake yet today — quick log still available under the fluid summary.',
      },
    },
  },
};
