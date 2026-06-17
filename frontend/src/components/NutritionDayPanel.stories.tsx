import type { Meta, StoryObj } from '@storybook/react-vite';
import { mockPetId } from '../stories/fixtures';
import { withNutritionDayPanel } from '../stories/decorators';
import { NutritionDayPanel } from './NutritionDayPanel';

const meta = {
  title: 'Nutrition/NutritionDayPanel',
  component: NutritionDayPanel,
  tags: ['autodocs'],
  args: {
    date: '2024-06-15',
    petId: mockPetId,
  },
} satisfies Meta<typeof NutritionDayPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithRecords: Story = {
  decorators: [withNutritionDayPanel('2024-06-15', mockPetId)],
};

export const EmptyDay: Story = {
  args: {
    date: '2024-06-16',
  },
  decorators: [withNutritionDayPanel('2024-06-16', mockPetId, true)],
};
