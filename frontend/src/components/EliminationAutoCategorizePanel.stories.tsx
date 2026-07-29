import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AutoCategorizePanel } from './EliminationAutoCategorizePanel';
import {
  mockEliminationDurationProfile,
  mockEliminationDurationProfileSparse,
  mockPetId,
  mockPets,
} from '../stories/fixtures';

function withPanelData(
  enabled: boolean,
  profile = mockEliminationDurationProfile,
  loading = false,
) {
  return function PanelDecorator(Story: React.ComponentType) {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    const pet = { ...mockPets[0], elimination_auto_categorize_by_duration: enabled };
    client.setQueryData(['pets'], [pet, mockPets[1]]);
    if (loading) {
      client.setQueryDefaults(['elimination-duration-profile', mockPetId], {
        queryFn: () => new Promise(() => {}),
      });
    } else {
      client.setQueryData(['elimination-duration-profile', mockPetId], profile);
    }
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

export const EnabledInsufficientHistory: Story = {
  name: 'Enabled — insufficient history',
  decorators: [withPanelData(true, mockEliminationDurationProfileSparse)],
  args: {
    pet: { ...mockPets[0], elimination_auto_categorize_by_duration: true },
  },
};

export const EnabledLoading: Story = {
  name: 'Enabled — loading profile',
  decorators: [withPanelData(true, mockEliminationDurationProfile, true)],
  args: {
    pet: { ...mockPets[0], elimination_auto_categorize_by_duration: true },
  },
};
