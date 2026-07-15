import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { mockNutritionRecords, mockPetId } from '../stories/fixtures';
import { NutritionRecordRow } from './NutritionDayPanel';

const noop = () => undefined;

const editingRecord = {
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
};

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
    onSave: fn(),
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
    record: editingRecord,
    defaultEditing: true,
  },
  parameters: {
    docs: {
      description: {
        story: 'Edit time, category, amount, and note. Use Move to yesterday or Move to tomorrow to shift the record one day while keeping the same time and notes.',
      },
    },
  },
};

export const EditingSavingMoveDate: Story = {
  args: {
    record: editingRecord,
    defaultEditing: true,
    saving: true,
  },
};

export const EditingSavingPausedMoveDate: Story = {
  args: {
    record: editingRecord,
    defaultEditing: true,
    saving: true,
    savingPaused: true,
  },
};

export const EditingNarrow: Story = {
  ...Editing,
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
  decorators: [
    (Story) => (
      <div className="panel" style={{ maxWidth: 354 }}>
        <div className="entry-rows">
          <Story />
        </div>
      </div>
    ),
  ],
};

export const MoveToYesterday: Story = {
  args: {
    record: editingRecord,
    defaultEditing: true,
    onSave: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Move to yesterday' }));
    await expect(args.onSave).toHaveBeenCalledWith('rec-edit', {
      occurred_at: '2024-06-14T09:21:00',
      local_date: '2024-06-14',
      category: 'liquids',
      amount: 10,
      unit: 'ml',
      note: 'Katovit mit Ente, col',
    });
  },
};

export const MoveToTomorrow: Story = {
  args: {
    record: editingRecord,
    defaultEditing: true,
    onSave: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Move to tomorrow' }));
    await expect(args.onSave).toHaveBeenCalledWith('rec-edit', {
      occurred_at: '2024-06-16T09:21:00',
      local_date: '2024-06-16',
      category: 'liquids',
      amount: 10,
      unit: 'ml',
      note: 'Katovit mit Ente, col',
    });
  },
};

export const MoveToYesterdayKeepsEditedTimeAndNote: Story = {
  args: {
    record: editingRecord,
    defaultEditing: true,
    onSave: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.clear(canvas.getByLabelText('Time'));
    await userEvent.type(canvas.getByLabelText('Time'), '14:05');
    await userEvent.clear(canvas.getByLabelText('Note'));
    await userEvent.type(canvas.getByLabelText('Note'), 'Evening top-up');
    await userEvent.click(canvas.getByRole('button', { name: 'Move to yesterday' }));
    await expect(args.onSave).toHaveBeenCalledWith('rec-edit', {
      occurred_at: '2024-06-14T14:05:00',
      local_date: '2024-06-14',
      category: 'liquids',
      amount: 10,
      unit: 'ml',
      note: 'Evening top-up',
    });
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
