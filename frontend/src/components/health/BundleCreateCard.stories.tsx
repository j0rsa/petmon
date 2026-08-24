import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { BundleCreateCard } from './BundleCreateCard';
import { mockMedAssignments, mockMedications } from '../../stories/fixtures';
import { asNarrowStory } from '../../stories/viewport';

const medicationsById = new Map(mockMedications.map((medication) => [medication.id, medication]));
const scheduled = mockMedAssignments.filter((assignment) => !assignment.optional);

const meta = {
  title: 'Components/Health/BundleCreateCard',
  component: BundleCreateCard,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    assignments: scheduled,
    medicationsById,
    saving: false,
    error: false,
    emptyHint: 'You need two current scheduled assignments (not as-needed) to create a bundle.',
    onCreate: () => {},
    onCancel: () => {},
  },
} satisfies Meta<typeof BundleCreateCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'New bundle' })).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Create bundle' })).toBeDisabled();
    await userEvent.click(canvas.getByRole('checkbox', { name: /Prednisolone/ }));
    await userEvent.click(canvas.getByRole('checkbox', { name: /Gabapentin/ }));
    await expect(canvas.getByRole('button', { name: 'Create bundle' })).toBeEnabled();
    await expect(canvas.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  },
};

export const NotEnoughMeds: Story = {
  args: { assignments: scheduled.slice(0, 1) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/two current scheduled assignments/)).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Create bundle' })).toBeDisabled();
    await expect(canvas.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  },
};

export const ReadyNarrow = asNarrowStory(Ready);
export const NotEnoughMedsNarrow = asNarrowStory(NotEnoughMeds);
