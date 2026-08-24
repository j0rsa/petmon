import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, userEvent, within } from 'storybook/test';
import HealthTreatmentPlanPage from './HealthTreatmentPlanPage';
import { SelectedPetProvider } from '../context/SelectedPetContext';
import { mockMedAssignments, mockMedications, mockMedBundles, mockPetId, mockPets } from '../stories/fixtures';
import { asNarrowStory } from '../stories/viewport';
import { daysInclusive, localToday, shiftDate } from '../lib/dates';

function dmyShort(date: string) {
  const [y, m, d] = date.split('-');
  return `${d}.${m}.${y}`;
}

const meta = {
  title: 'Pages/HealthTreatmentPlanPage',
  component: HealthTreatmentPlanPage,
  tags: ['autodocs'],
  parameters: { layout: 'padded', route: '/health/treatment-plan' },
} satisfies Meta<typeof HealthTreatmentPlanPage>;

export default meta;
type Story = StoryObj<typeof meta>;

function decorator({
  medications = mockMedications,
  assignments = mockMedAssignments,
  bundles = mockMedBundles,
}: {
  medications?: typeof mockMedications;
  assignments?: typeof mockMedAssignments;
  bundles?: typeof mockMedBundles;
} = {}): Story['decorators'] {
  return [
    (Story) => {
      const client = new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            staleTime: Infinity,
            refetchOnMount: false,
            refetchOnWindowFocus: false,
          },
        },
      });
      client.setQueryData(['pets'], mockPets);
      client.setQueryData(['medications', mockPetId], medications);
      client.setQueryData(['med-assignments', mockPetId], assignments);
      client.setQueryData(['med-bundles', mockPetId], bundles);
      return (
        <MemoryRouter initialEntries={['/health/treatment-plan']}>
          <QueryClientProvider client={client}>
            <SelectedPetProvider initialPetId={mockPetId}>
              <Story />
            </SelectedPetProvider>
          </QueryClientProvider>
        </MemoryRouter>
      );
    },
  ];
}

export const WithPlans: Story = {
  decorators: decorator(),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Known medications' })).toBeInTheDocument();
    await expect(canvas.getByRole('heading', { name: 'Assignments' })).toBeInTheDocument();
    await expect(canvas.getByRole('heading', { name: 'Bundles' })).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: '+ New bundle' })).toBeInTheDocument();
    await expect(canvas.queryByRole('heading', { name: 'New bundle' })).not.toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: '+ New assignment' })).toBeInTheDocument();
    await expect(canvas.queryByRole('heading', { name: 'New assignment' })).not.toBeInTheDocument();
    await expect(canvas.getByRole('heading', { name: 'Prednisolone + Gabapentin' })).toBeInTheDocument();
    await expect(canvas.getAllByRole('heading', { name: 'Prednisolone' })).toHaveLength(2);
    await expect(canvas.getByLabelText('Telegram emoji 💊')).toBeInTheDocument();
    await expect(canvas.queryByText('Pill')).not.toBeInTheDocument();
    await expect(canvas.queryByLabelText('Telegram emoji for Prednisolone')).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Edit Prednisolone' }));
    await expect(canvas.getByRole('button', { name: 'Change color for Prednisolone' })).toBeInTheDocument();
    await expect(canvas.getByLabelText('Telegram emoji for Prednisolone')).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Cancel' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Revise Prednisolone' }));
    const reviseHeading = canvas.getByRole('heading', { name: 'Revise assignment' });
    await expect(reviseHeading).toBeInTheDocument();
    await expect(canvas.queryByRole('button', { name: '+ New assignment' })).not.toBeInTheDocument();
    const assignmentsHeading = canvas.getByRole('heading', { name: 'Assignments' });
    await expect(
      assignmentsHeading.compareDocumentPosition(reviseHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await expect(canvas.queryByRole('heading', { name: 'New treatment plan' })).not.toBeInTheDocument();
    const optional = canvas.getByLabelText('Optional medication (take as needed)');
    const dose = canvas.getByText('Dose per administration');
    await expect(
      optional.compareDocumentPosition(dose) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  },
};

export const LiquidFieldOrder: Story = {
  decorators: decorator({
    assignments: [{
      ...mockMedAssignments[1]!,
      optional: false,
      liquid_dose_ml: 2.5,
      dose_label: '2.5ml',
    }],
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Revise Metronidazole' }));
    const concentration = canvas.getByLabelText('Concentration (mg/ml, optional)');
    const optional = canvas.getByLabelText('Optional medication (take as needed)');
    const dose = canvas.getByLabelText('Dose (ml)');
    await expect(
      concentration.compareDocumentPosition(dose) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await expect(
      dose.compareDocumentPosition(optional) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  },
};

export const MedicationWithoutPlan: Story = {
  decorators: decorator({ assignments: [] }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getAllByRole('button', { name: 'Assign' })[0]!);
    const heading = canvas.getByRole('heading', { name: 'New assignment' });
    await expect(heading).toBeInTheDocument();
    await expect(canvas.queryByRole('button', { name: '+ New assignment' })).not.toBeInTheDocument();
    const assignmentsHeading = canvas.getByRole('heading', { name: 'Assignments' });
    await expect(
      assignmentsHeading.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await expect(canvas.queryByLabelText('Telegram emoji for Prednisolone')).not.toBeInTheDocument();
    await expect(canvas.queryByRole('heading', { name: 'New treatment plan' })).not.toBeInTheDocument();
  },
};

export const EndedAssignment: Story = {
  decorators: decorator({
    assignments: [{
      ...mockMedAssignments[0]!,
      date_to: shiftDate(localToday(), -1),
    }],
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Ended')).toBeInTheDocument();
    await expect(canvas.queryByRole('button', { name: 'Revise Prednisolone' })).not.toBeInTheDocument();
    await expect(canvas.queryByRole('button', { name: 'Pause Prednisolone' })).not.toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Delete Prednisolone assignment' })).toBeInTheDocument();
  },
};

export const GroupedHistory: Story = {
  decorators: decorator({
    assignments: [
      {
        ...mockMedAssignments[0]!,
        id: 'assign-1-current',
        date_from: shiftDate(localToday(), -2),
        date_to: null,
      },
      {
        ...mockMedAssignments[0]!,
        id: 'assign-1-past',
        date_from: shiftDate(localToday(), -30),
        date_to: shiftDate(localToday(), -3),
        created_at: '2026-01-01T00:00:00Z',
      },
      mockMedAssignments[1]!,
    ],
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole('heading', { name: 'Prednisolone' })).toHaveLength(2);
    const courseFrom = shiftDate(localToday(), -30);
    await expect(canvas.getByText(
      `${daysInclusive(courseFrom, localToday())} days · since ${dmyShort(courseFrom)}`,
    )).toBeInTheDocument();
    await expect(canvas.getByText('1 earlier assignment')).toBeInTheDocument();
    await userEvent.click(canvas.getByText('1 earlier assignment'));
    await expect(canvas.getByText('Ended')).toBeInTheDocument();
  },
};

export const Empty: Story = {
  decorators: decorator({ medications: [], assignments: [], bundles: [] }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '+ Register med' }));
    await expect(canvas.getByRole('heading', { name: 'Register medication' })).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Choose medication color' })).toBeInTheDocument();
    await expect(canvas.getByLabelText('Telegram emoji')).toBeInTheDocument();
  },
};

export const CreateAssignment: Story = {
  decorators: decorator(),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('heading', { name: 'New assignment' })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: '+ New assignment' }));
    const heading = canvas.getByRole('heading', { name: 'New assignment' });
    await expect(heading).toBeInTheDocument();
    await expect(canvas.queryByRole('button', { name: '+ New assignment' })).not.toBeInTheDocument();
    const assignmentsHeading = canvas.getByRole('heading', { name: 'Assignments' });
    await expect(
      assignmentsHeading.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await expect(canvas.getByRole('button', { name: 'Create assignment' })).toBeDisabled();
    await userEvent.selectOptions(canvas.getByLabelText('Medication'), 'med-pill-1');
    await expect(canvas.getByRole('button', { name: 'Create assignment' })).toBeEnabled();
    await userEvent.click(canvas.getByRole('button', { name: 'Cancel' }));
    await expect(canvas.queryByRole('heading', { name: 'New assignment' })).not.toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: '+ New assignment' })).toBeInTheDocument();
  },
};

export const CreateBundle: Story = {
  decorators: decorator({ bundles: [] }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('heading', { name: 'New bundle' })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: '+ New bundle' }));
    await expect(canvas.getByRole('heading', { name: 'New bundle' })).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Create bundle' })).toBeDisabled();
    await userEvent.click(canvas.getByRole('checkbox', { name: /Prednisolone/ }));
    await userEvent.click(canvas.getByRole('checkbox', { name: /Gabapentin/ }));
    await expect(canvas.getByRole('button', { name: 'Create bundle' })).toBeEnabled();
  },
};

export const BundledMedsHidden: Story = {
  decorators: decorator(),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '+ New bundle' }));
    await expect(canvas.getByText('Every scheduled medication is already in a bundle.')).toBeInTheDocument();
    await expect(canvas.queryByRole('checkbox')).not.toBeInTheDocument();
  },
};

export const WithPlansNarrow = asNarrowStory(WithPlans);
export const LiquidFieldOrderNarrow = asNarrowStory(LiquidFieldOrder);
export const MedicationWithoutPlanNarrow = asNarrowStory(MedicationWithoutPlan);
export const EndedAssignmentNarrow = asNarrowStory(EndedAssignment);
export const GroupedHistoryNarrow = asNarrowStory(GroupedHistory);
export const EmptyNarrow = asNarrowStory(Empty);
export const CreateAssignmentNarrow = asNarrowStory(CreateAssignment);
export const CreateBundleNarrow = asNarrowStory(CreateBundle);
export const BundledMedsHiddenNarrow = asNarrowStory(BundledMedsHidden);
