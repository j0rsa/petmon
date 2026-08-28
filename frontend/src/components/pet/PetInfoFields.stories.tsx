import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { mockPets } from '../../stories/fixtures';
import { asNarrowStory } from '../../stories/viewport';
import { PetInfoFields } from './PetInfoFields';

const meta = {
  title: 'Components/Pet/PetInfoFields',
  component: PetInfoFields,
  tags: ['autodocs'],
} satisfies Meta<typeof PetInfoFields>;

export default meta;
type Story = StoryObj<typeof meta>;

function mockClipboard() {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: () => Promise.resolve() },
  });
}

export const FullProfile: Story = {
  args: { pet: mockPets[0] },
  play: async ({ canvasElement }) => {
    mockClipboard();
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Pet ID')).toBeInTheDocument();
    await expect(canvas.getByText(mockPets[0].id)).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Copy pet ID' }));
    await waitFor(() => {
      expect(canvas.getByRole('button', { name: 'Copied pet ID' })).toBeInTheDocument();
    });
  },
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

export const FullProfileNarrow = asNarrowStory(FullProfile);
