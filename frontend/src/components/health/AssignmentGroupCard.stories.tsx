import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { AssignmentGroupCard } from './AssignmentGroupCard';
import { daysInclusive, localToday, shiftDate } from '../../lib/dates';
import { mockMedAssignments, mockMedications } from '../../stories/fixtures';
import { asNarrowStory, assertHeaderActionOnDesktop } from '../../stories/viewport';

function dmyShort(date: string) {
  const [y, m, d] = date.split('-');
  return `${d}.${m}.${y}`;
}

function courseSince(from: string, today: string) {
  return `${daysInclusive(from, today)} days · since ${dmyShort(from)}`;
}

function courseEnded(from: string, to: string) {
  return `${daysInclusive(from, to)} days · ${dmyShort(from)} → ${dmyShort(to)}`;
}

const medication = mockMedications[0]!;
const current = mockMedAssignments[0]!;
const today = localToday();
const past = {
  ...current,
  id: 'assign-1-past',
  date_from: shiftDate(today, -40),
  date_to: shiftDate(today, -15),
  created_at: '2026-01-01T00:00:00Z',
};
const pausedRun = [
  {
    ...current,
    id: 'assign-1',
    date_from: shiftDate(today, -50),
    date_to: shiftDate(today, -40),
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    ...current,
    id: 'assign-2',
    date_from: shiftDate(today, -39),
    date_to: shiftDate(today, -30),
    created_at: '2026-01-10T00:00:00Z',
  },
];
const afterPause = {
  ...current,
  id: 'assign-3',
  date_from: shiftDate(today, -20),
  date_to: shiftDate(today, -15),
  created_at: '2026-02-01T00:00:00Z',
};

const meta = {
  title: 'Components/Health/AssignmentGroupCard',
  component: AssignmentGroupCard,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    medication,
    current,
    past: [],
    today,
    canWrite: true,
    canAssign: false,
    deleting: false,
    pausing: false,
    patchingTimer: false,
    onRevise: () => {},
    onPause: () => {},
    onAssign: () => {},
    onDelete: () => {},
    onPatchTimer: () => {},
  },
} satisfies Meta<typeof AssignmentGroupCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Active: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Prednisolone' })).toBeInTheDocument();
    await expect(canvas.getByText('Active')).toBeInTheDocument();
    await expect(canvas.getByText('On course')).toBeInTheDocument();
    await expect(canvas.getByText(courseSince(current.date_from, today))).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Revise Prednisolone' })).toBeInTheDocument();
    assertHeaderActionOnDesktop(canvasElement, 'Prednisolone', 'Revise Prednisolone');
    await expect(canvas.queryByText('earlier assignment', { exact: false })).not.toBeInTheDocument();
  },
};

export const WithHistory: Story = {
  args: { past: [past] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Prednisolone' })).toBeInTheDocument();
    await expect(canvas.getAllByRole('heading', { name: 'Prednisolone' })).toHaveLength(1);
    await expect(canvas.getByText(courseSince(past.date_from, today))).toBeInTheDocument();
    await userEvent.click(canvas.getByText('1 earlier assignment'));
    await expect(canvas.getByText('Ended')).toBeInTheDocument();
  },
};

export const WithPauseGap: Story = {
  args: { past: [...pausedRun, afterPause] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('On course')).toBeInTheDocument();
    await expect(canvas.getByText(courseSince(afterPause.date_from, today))).toBeInTheDocument();
    await expect(canvas.queryByText(courseSince(pausedRun[0]!.date_from, today))).not.toBeInTheDocument();
    await userEvent.click(canvas.getByText('3 earlier assignments'));
    await expect(canvas.getAllByText('Ended')).toHaveLength(3);
  },
};

export const Ended: Story = {
  args: {
    current: { ...current, date_to: shiftDate(today, -1) },
    canAssign: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Ended')).toBeInTheDocument();
    // Both "On course" and "Dates" rows show the same text for a single-assignment ended course.
    await expect(canvas.getAllByText(courseEnded(current.date_from, shiftDate(today, -1)))[0]).toBeInTheDocument();
    await expect(canvas.queryByRole('button', { name: 'Revise Prednisolone' })).not.toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Assign' })).toBeInTheDocument();
    assertHeaderActionOnDesktop(canvasElement, 'Prednisolone', 'Delete Prednisolone assignment');
  },
};

export const ActiveNarrow = asNarrowStory(Active);
export const WithHistoryNarrow = asNarrowStory(WithHistory);
export const WithPauseGapNarrow = asNarrowStory(WithPauseGap);
export const EndedNarrow = asNarrowStory(Ended);
