import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { withSelectedPet } from '../stories/decorators';

const meta = {
  title: 'Navigation/BottomNav',
  component: BottomNav,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'pwaMobile' },
  },
  decorators: [
    (Story) => (
      <MemoryRouter>
        <div style={{ height: '100vh', background: 'var(--bg)', position: 'relative' }}>
          <Story />
        </div>
      </MemoryRouter>
    ),
    withSelectedPet(),
  ],
} satisfies Meta<typeof BottomNav>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const OnNutritionRoute: Story = {
  decorators: [
    (Story) => (
      <MemoryRouter initialEntries={['/nutrition']}>
        <div style={{ height: '100vh', background: 'var(--bg)', position: 'relative' }}>
          <Story />
        </div>
      </MemoryRouter>
    ),
    withSelectedPet(),
  ],
};
