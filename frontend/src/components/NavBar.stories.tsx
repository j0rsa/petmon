import type { Meta, StoryObj } from '@storybook/react-vite';
import { withMemoryRouter } from '../stories/decorators';
import { NavBar } from './NavBar';

const meta = {
  title: 'Components/NavBar',
  component: NavBar,
  tags: ['autodocs'],
  decorators: [
    withMemoryRouter,
    (Story) => (
      <aside className="sidebar" style={{ width: 280, padding: '1.25rem', minHeight: 420 }}>
        <Story />
      </aside>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
    route: '/',
  },
} satisfies Meta<typeof NavBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OverviewActive: Story = {
  parameters: { route: '/' },
};

export const NutritionActive: Story = {
  parameters: { route: '/nutrition' },
};

export const ToiletingPlaceholder: Story = {
  parameters: { route: '/elimination' },
};
