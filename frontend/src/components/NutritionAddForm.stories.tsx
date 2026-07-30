import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { mockPetId } from '../stories/fixtures';
import { NutritionAddForm } from './NutritionAddForm';

const meta = {
  title: 'Nutrition/NutritionAddForm',
  component: NutritionAddForm,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="panel" style={{ maxWidth: 640 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    date: '2024-06-15',
    petId: mockPetId,
    onSave: fn(),
    saving: false,
    isPaused: false,
  },
} satisfies Meta<typeof NutritionAddForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DefaultWetFoodPlusLiquid: Story = {
  parameters: {
    docs: {
      description: {
        story: 'Defaults to Wet food + Liquid with a wet,liquid amount placeholder.',
      },
    },
  },
};

export const Saving: Story = {
  args: {
    saving: true,
  },
};

export const OfflinePaused: Story = {
  args: {
    isPaused: true,
  },
};
