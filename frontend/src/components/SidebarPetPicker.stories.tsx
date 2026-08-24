import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SidebarPetPicker } from './SidebarPetPicker';
import { withSelectedPet } from '../stories/decorators';
import { mockPets } from '../stories/fixtures';
import { asNarrowStory } from '../stories/viewport';
import { SELECTED_PET_STORAGE_KEY } from '../lib/selectedPetStorage';
import { SelectedPetProvider } from '../context/SelectedPetContext';

const rex = mockPets[1];

const meta = {
  title: 'Navigation/SidebarPetPicker',
  component: SidebarPetPicker,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <MemoryRouter>
        <div style={{ width: 240, background: 'var(--surface-sidebar)', padding: '1rem' }}>
          <Story />
        </div>
      </MemoryRouter>
    ),
    withSelectedPet(),
  ],
} satisfies Meta<typeof SidebarPetPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithPets: Story = {};

export const SwitchPetPersists: Story = {
  name: 'Switch pet persists',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('option', { name: /Rex/i }));
    await expect(canvas.getByRole('option', { name: /Rex/i })).toHaveAttribute('aria-selected', 'true');
    expect(localStorage.getItem(SELECTED_PET_STORAGE_KEY)).toBe(rex.id);
  },
};

const withStoredRex: Decorator = (Story) => {
  localStorage.setItem(SELECTED_PET_STORAGE_KEY, rex.id);
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, refetchOnMount: false, refetchOnWindowFocus: false },
    },
  });
  client.setQueryData(['pets'], mockPets);
  return (
    <QueryClientProvider client={client}>
      <SelectedPetProvider>
        <Story />
      </SelectedPetProvider>
    </QueryClientProvider>
  );
};

export const RestoredAfterRefresh: Story = {
  name: 'Restores stored pet',
  decorators: [withStoredRex],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('option', { name: /Rex/i })).toHaveAttribute('aria-selected', 'true');
    await expect(canvas.getByRole('option', { name: /Mittens/i })).toHaveAttribute('aria-selected', 'false');
  },
};

export const SwitchPetPersistsNarrow = asNarrowStory(SwitchPetPersists);
export const RestoredAfterRefreshNarrow = asNarrowStory(RestoredAfterRefresh);
