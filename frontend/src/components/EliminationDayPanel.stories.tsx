import type { Meta, StoryObj } from '@storybook/react-vite';
import { mockPetId } from '../stories/fixtures';
import { withEliminationDayPanel } from '../stories/decorators';
import { EliminationDayPanel } from './EliminationDayPanel';

const meta = {
  title: 'Elimination/EliminationDayPanel',
  component: EliminationDayPanel,
  tags: ['autodocs'],
  args: {
    date: '2024-06-15',
    petId: mockPetId,
  },
} satisfies Meta<typeof EliminationDayPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithRecords: Story = {
  decorators: [withEliminationDayPanel('2024-06-15', mockPetId)],
};

export const EmptyDay: Story = {
  args: {
    date: '2024-06-16',
  },
  decorators: [withEliminationDayPanel('2024-06-16', mockPetId, true)],
};
