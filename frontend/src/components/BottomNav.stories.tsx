import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BottomNav } from './BottomNav';
import { withMemoryRouter, withSelectedPet } from '../stories/decorators';
import { SelectedPetProvider } from '../context/SelectedPetContext';

/** Overrides withSelectedPet fixtures — relies on meta withMemoryRouter for routing. */
const withNoPets: Decorator = (Story) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(['pets'], []);
  client.setQueryData(['me'], { subject: 'dev', email: null, name: 'Dev', display_name: 'Dev', kind: 'dev', scopes: [] });

  localStorage.removeItem('pm_selected_pet_id');

  return (
    <QueryClientProvider client={client}>
      <SelectedPetProvider>
        <Story />
      </SelectedPetProvider>
    </QueryClientProvider>
  );
};

const meta = {
  title: 'Navigation/BottomNav',
  component: BottomNav,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'pwaMobile' },
    route: '/',
  },
  decorators: [withSelectedPet(), withMemoryRouter],
} satisfies Meta<typeof BottomNav>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const OnNutritionRoute: Story = {
  parameters: { route: '/nutrition' },
};

export const NoPets: Story = {
  decorators: [withNoPets],
};
