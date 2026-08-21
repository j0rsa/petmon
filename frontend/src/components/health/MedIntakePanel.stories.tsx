import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { MedIntakePanel } from './MedIntakePanel';
import { SelectedPetProvider } from '../../context/SelectedPetContext';
import { mockDailyMedAssignments, mockDeveloperModeSettings, mockPetId, mockPets } from '../../stories/fixtures';
import { localToday } from '../../lib/dates';

const meta = {
  title: 'Components/Health/MedIntakePanel',
  component: MedIntakePanel,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof MedIntakePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

function withMedData(empty = false, developerMode = false): Story['decorators'] {
  return [
    (Story) => {
      const client = new QueryClient();
      client.setQueryData(['pets'], mockPets);
      client.setQueryData(['user-settings', 'developer_mode'], {
        ...mockDeveloperModeSettings,
        enabled: developerMode,
      });
      client.setQueryData(
        ['med-daily', mockPetId, localToday()],
        empty ? [] : mockDailyMedAssignments,
      );
      return (
        <MemoryRouter>
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

export const WithDailyMeds: Story = {
  args: { petId: mockPetId },
  decorators: withMedData(false),
};

export const WithDeveloperMode: Story = {
  args: { petId: mockPetId },
  decorators: withMedData(false, true),
};

export const Empty: Story = {
  args: { petId: mockPetId },
  decorators: withMedData(true),
};
