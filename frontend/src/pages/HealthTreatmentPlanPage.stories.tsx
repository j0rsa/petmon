import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, userEvent, within } from 'storybook/test';
import HealthTreatmentPlanPage from './HealthTreatmentPlanPage';
import { SelectedPetProvider } from '../context/SelectedPetContext';
import { mockMedAssignments, mockMedications, mockPetId, mockPets } from '../stories/fixtures';

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
}: {
  medications?: typeof mockMedications;
  assignments?: typeof mockMedAssignments;
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
    await userEvent.click(canvas.getAllByRole('button', { name: 'Revise' })[0]!);
    await expect(
      canvas.getByRole('button', { name: 'Change color for Prednisolone' }),
    ).toBeInTheDocument();
    await expect(canvas.getByLabelText('Telegram emoji for Prednisolone')).toBeInTheDocument();
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
    await userEvent.click(canvas.getByRole('button', { name: 'Revise' }));
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
    await userEvent.click(canvas.getAllByRole('button', { name: 'Add plan' })[0]!);
    await expect(
      canvas.getByRole('button', { name: 'Change color for Prednisolone' }),
    ).toBeInTheDocument();
  },
};

export const Empty: Story = {
  decorators: decorator({ medications: [], assignments: [] }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '+ Register med' }));
    await expect(canvas.getByRole('heading', { name: 'Register medication' })).toBeInTheDocument();
  },
};
