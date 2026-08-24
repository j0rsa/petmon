import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import { KnownMedicationCard } from './KnownMedicationCard';
import { mockMedications } from '../../stories/fixtures';
import { asNarrowStory, assertHeaderActionOnDesktop } from '../../stories/viewport';

const medication = mockMedications[0]!;

const meta = {
  title: 'Components/Health/KnownMedicationCard',
  component: KnownMedicationCard,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    medication,
    canWrite: true,
    canAssign: false,
    editing: false,
    saving: false,
    deleting: false,
    onEdit: () => {},
    onCancelEdit: () => {},
    onSave: () => {},
    onAssign: () => {},
    onDelete: () => {},
  },
} satisfies Meta<typeof KnownMedicationCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const View: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const name = canvas.getByRole('heading', { name: 'Prednisolone' });
    const emoji = canvas.getByLabelText('Telegram emoji 💊');
    await expect(name).toBeInTheDocument();
    await expect(emoji).toBeInTheDocument();
    await expect(
      name.compareDocumentPosition(emoji) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await expect(canvas.queryByText('Pill')).not.toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Edit Prednisolone' })).toBeInTheDocument();
    assertHeaderActionOnDesktop(canvasElement, 'Prednisolone', 'Edit Prednisolone');
    await expect(canvas.queryByLabelText('Telegram emoji for Prednisolone')).not.toBeInTheDocument();
  },
};

export const Editing: Story = {
  args: { editing: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText('Name for Prednisolone')).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Change color for Prednisolone' })).toBeInTheDocument();
    await expect(canvas.getByLabelText('Telegram emoji for Prednisolone')).toBeInTheDocument();
  },
};

export const Interactive: Story = {
  render: (args) => {
    const [editing, setEditing] = useState(false);
    return (
      <KnownMedicationCard
        {...args}
        editing={editing}
        onEdit={() => setEditing(true)}
        onCancelEdit={() => setEditing(false)}
        onSave={() => setEditing(false)}
      />
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Edit Prednisolone' }));
    await expect(canvas.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Cancel' }));
    await expect(canvas.getByRole('button', { name: 'Edit Prednisolone' })).toBeInTheDocument();
  },
};

export const ViewNarrow = asNarrowStory(View);
export const EditingNarrow = asNarrowStory(Editing);
export const InteractiveNarrow = asNarrowStory(Interactive);
