import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
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

function decorator(empty = false): Story['decorators'] {
  return [
    (Story) => {
      const client = new QueryClient();
      client.setQueryData(['pets'], mockPets);
      client.setQueryData(['medications', mockPetId], empty ? [] : mockMedications);
      client.setQueryData(['med-assignments', mockPetId], empty ? [] : mockMedAssignments);
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
  decorators: decorator(false),
};

export const Empty: Story = {
  decorators: decorator(true),
};
