import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NoPetSelected } from './NoPetSelected';
import { SelectedPetProvider } from '../context/SelectedPetContext';

function withEmptyPets(Story: React.ComponentType) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(['pets'], []);
  client.setQueryData(['me'], { subject: 'dev', email: null, name: 'Dev', display_name: 'Dev', kind: 'dev' });
  return (
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <SelectedPetProvider>
          <Story />
        </SelectedPetProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

const meta = {
  title: 'UI/NoPetSelected',
  component: NoPetSelected,
  tags: ['autodocs'],
} satisfies Meta<typeof NoPetSelected>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoPets: Story = {
  decorators: [withEmptyPets],
};
