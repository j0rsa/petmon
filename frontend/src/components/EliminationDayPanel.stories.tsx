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

/** Latest entry is general — shows one-press Wee/Poop categorization. */
export const GeneralLatestRecord: Story = {
  decorators: [
    withEliminationDayPanel('2024-06-15', mockPetId, false, {
      recordsOverride: [
        {
          id: 'elim-general',
          pet_id: mockPetId,
          occurred_at: '2024-06-15T20:00:00',
          local_date: '2024-06-15',
          event_type: 'general',
          subtype: null,
          duration_seconds: 45,
          note: null,
          source_type: 'manual',
          created_at: '2024-06-15T20:00:00',
          updated_at: '2024-06-15T20:00:00',
        },
        {
          id: 'elim-02',
          pet_id: mockPetId,
          occurred_at: '2024-06-15T08:30:00',
          local_date: '2024-06-15',
          event_type: 'defecation',
          subtype: 'normal',
          duration_seconds: 90,
          note: 'Normal stool',
          source_type: 'manual',
          created_at: '2024-06-15T08:30:00',
          updated_at: '2024-06-15T08:30:00',
        },
      ],
    }),
  ],
};

export const EmptyDay: Story = {
  args: {
    date: '2024-06-16',
  },
  decorators: [withEliminationDayPanel('2024-06-16', mockPetId, true)],
};
