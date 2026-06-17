import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router-dom';
import { SidebarPetPicker } from './SidebarPetPicker';
import { withSelectedPet } from '../stories/decorators';

const meta = {
  title: 'Navigation/SidebarPetPicker',
  component: SidebarPetPicker,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <MemoryRouter>
        <div style={{ width: 240, background: 'var(--surface-sidebar)', padding: '1rem' }}>
          <Story />
        </div>
      </MemoryRouter>
    ),
    withSelectedPet(),
  ],
} satisfies Meta<typeof SidebarPetPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithPets: Story = {};
