import type { Meta, StoryObj } from '@storybook/react';
import { PET_SPECIES } from '../../types';
import { PetSilhouette } from './PetSilhouette';

const meta = {
  title: 'Components/Pet/PetSilhouette',
  component: PetSilhouette,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div style={{ width: 160, height: 160, borderRadius: '50%', background: 'var(--avatar-bg)', display: 'grid', placeItems: 'center' }}>
        <Story />
      </div>
    ),
  ],
  argTypes: {
    species: { control: 'select', options: PET_SPECIES },
    color: { control: 'color' },
  },
} satisfies Meta<typeof PetSilhouette>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CatDefault: Story = {
  args: { species: 'cat' },
};

export const DogColored: Story = {
  args: { species: 'dog', color: '#d4a574' },
};

export const BunnyColored: Story = {
  args: { species: 'bunny', color: '#f5e6d3' },
};

export const ParrotColored: Story = {
  args: { species: 'parrot', color: '#22c55e' },
};

export const OtherDefault: Story = {
  args: { species: 'other' },
};
