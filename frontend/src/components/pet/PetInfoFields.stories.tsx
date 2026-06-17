import type { Meta, StoryObj } from '@storybook/react-vite';
import { mockPets } from '../../stories/fixtures';
import { PetInfoFields } from './PetInfoFields';

const meta = {
  title: 'Components/Pet/PetInfoFields',
  component: PetInfoFields,
  tags: ['autodocs'],
} satisfies Meta<typeof PetInfoFields>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FullProfile: Story = {
  args: { pet: mockPets[0] },
};

export const MinimalProfile: Story = {
  args: { pet: mockPets[1] },
};

export const SparseProfile: Story = {
  args: {
    pet: {
      id: 'sparse-pet',
      name: 'Noodle',
      species: 'other',
      status: 'active',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    },
  },
};
