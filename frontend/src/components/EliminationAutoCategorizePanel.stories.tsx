import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AutoCategorizePanel } from './EliminationAutoCategorizePanel';
import { mockPetId, mockPets } from '../stories/fixtures';
import type { EliminationDurationProfile } from '../api/elimination';

const mockDurationProfile: EliminationDurationProfile = {
  pet_id: mockPetId,
  wee: { sample_count: 12, avg_duration_seconds: 52 },
  poo: { sample_count: 8, avg_duration_seconds: 118 },
};

function withPanelData(enabled: boolean) {
  return function PanelDecorator(Story: React.ComponentType) {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    const pet = { ...mockPets[0], elimination_auto_categorize_by_duration: enabled };
    client.setQueryData(['pets'], [pet, mockPets[1]]);
    client.setQueryData(['elimination-duration-profile', mockPetId], mockDurationProfile);
    client.setQueryData(['me'], { subject: 'dev', email: null, name: 'Dev', display_name: 'Dev', kind: 'dev' });

    return (
      <QueryClientProvider client={client}>
        <Story />
      </QueryClientProvider>
    );
  };
}

const meta = {
  title: 'Components/EliminationAutoCategorizePanel',
  component: AutoCategorizePanel,
  tags: ['autodocs'],
  args: { pet: mockPets[0] },
} satisfies Meta<typeof AutoCategorizePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Disabled: Story = {
  decorators: [withPanelData(false)],
};

export const Enabled: Story = {
  decorators: [withPanelData(true)],
  args: {
    pet: { ...mockPets[0], elimination_auto_categorize_by_duration: true },
  },
};
