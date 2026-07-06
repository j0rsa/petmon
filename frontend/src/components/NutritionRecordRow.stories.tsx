import type { Meta, StoryObj } from '@storybook/react-vite';
import { mockNutritionRecords, mockPetId } from '../stories/fixtures';
import { NutritionRecordRow } from './NutritionDayPanel';

const noop = () => undefined;

const meta = {
  title: 'Nutrition/NutritionRecordRow',
  component: NutritionRecordRow,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="panel" style={{ maxWidth: 640 }}>
        <div className="entry-rows">
          <Story />
        </div>
      </div>
    ),
  ],
  args: {
    record: mockNutritionRecords[0],
    onSave: noop,
    onDelete: noop,
    saving: false,
    savingPaused: false,
    deleting: false,
    deletingPaused: false,
    canWrite: true,
  },
} satisfies Meta<typeof NutritionRecordRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Display: Story = {};

export const DisplayWithNote: Story = {
  args: {
    record: mockNutritionRecords[1],
  },
};

export const Editing: Story = {
  args: {
    record: {
      id: 'rec-edit',
      pet_id: mockPetId,
      occurred_at: '2024-06-15T09:21:00',
      local_date: '2024-06-15',
      category: 'liquids',
      amount: 10,
      unit: 'ml',
      note: 'Katovit mit Ente, col',
      source_type: 'manual',
      created_at: '2024-06-15T09:21:00',
      updated_at: '2024-06-15T09:21:00',
    },
    defaultEditing: true,
  },
};

export const EditingWithDisplayBelow: Story = {
  render: (args) => (
    <>
      <NutritionRecordRow {...args} />
      <NutritionRecordRow
        record={{
          id: 'rec-below',
          pet_id: mockPetId,
          occurred_at: '2024-06-15T07:39:00',
          local_date: '2024-06-15',
          category: 'wet_food',
          amount: 13,
          unit: 'g',
          source_type: 'manual',
          created_at: '2024-06-15T07:39:00',
          updated_at: '2024-06-15T07:39:00',
        }}
        onSave={noop}
        onDelete={noop}
        saving={false}
        savingPaused={false}
        deleting={false}
        deletingPaused={false}
        canWrite
      />
    </>
  ),
  args: Editing.args,
};
