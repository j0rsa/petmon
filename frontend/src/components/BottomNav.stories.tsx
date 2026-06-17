import type { Meta, StoryObj } from '@storybook/react-vite';
import { BottomNav } from './BottomNav';
import { withMemoryRouter, withSelectedPet } from '../stories/decorators';

const meta = {
  title: 'Navigation/BottomNav',
  component: BottomNav,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'pwaMobile' },
    route: '/',
  },
  decorators: [withSelectedPet(), withMemoryRouter],
} satisfies Meta<typeof BottomNav>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const OnNutritionRoute: Story = {
  parameters: { route: '/nutrition' },
};
