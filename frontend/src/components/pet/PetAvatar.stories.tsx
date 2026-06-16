import type { Meta, StoryObj } from '@storybook/react';
import { PET_SPECIES } from '../../types';
import { PetAvatar } from './PetAvatar';

const samplePhoto =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="#1e293b"/><circle cx="60" cy="48" r="22" fill="#fcd34d"/><ellipse cx="60" cy="92" rx="34" ry="24" fill="#fcd34d"/></svg>',
  );

const meta = {
  title: 'Components/Pet/PetAvatar',
  component: PetAvatar,
  tags: ['autodocs'],
  argTypes: {
    species: { control: 'select', options: PET_SPECIES },
    size: { control: { type: 'number', min: 64, max: 200 } },
  },
} satisfies Meta<typeof PetAvatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CatPlaceholder: Story = {
  args: {
    species: 'cat',
    name: 'Mittens',
    color: '#c4a882',
    size: 144,
  },
};

export const DogWithPhoto: Story = {
  args: {
    species: 'dog',
    name: 'Rex',
    photoUrl: samplePhoto,
    size: 144,
  },
};

export const BunnyPlaceholder: Story = {
  args: {
    species: 'bunny',
    name: 'Clover',
    color: '#f5e6d3',
    size: 128,
  },
};

export const ParrotPlaceholder: Story = {
  args: {
    species: 'parrot',
    name: 'Kiwi',
    color: '#22c55e',
    size: 128,
  },
};

export const SmallListSize: Story = {
  args: {
    species: 'cat',
    name: 'Mittens',
    color: '#c4a882',
    size: 72,
  },
};
