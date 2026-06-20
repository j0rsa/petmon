import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router-dom';
import { DisplaySettingsProvider } from '../context/DisplaySettingsProvider';
import { SelectedPetProvider } from '../context/SelectedPetContext';
import {
  mockAppInfo,
  mockDisplaySettings,
  mockEliminationDaySummary,
  mockEliminationRecords,
  mockPetId,
  mockPets,
} from '../stories/fixtures';
import EliminationJournalPage from './EliminationJournalPage';

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        queryFn: () => Promise.resolve(undefined),
      },
    },
  });
}

function withJournalData(date: string, empty = false) {
  return function JournalDecorator(Story: React.ComponentType) {
    const client = makeClient();
    client.setQueryData(['pets'], mockPets);
    client.setQueryData(['me'], { subject: 'dev', email: null, name: 'Dev', display_name: 'Dev', kind: 'dev' });
    client.setQueryData(['settings-display'], mockDisplaySettings);
    client.setQueryData(['app-info'], mockAppInfo);
    client.setQueryData(['elimination-records-day', date, mockPetId], empty ? [] : mockEliminationRecords.map((r) => ({ ...r, local_date: date })));
    // Pre-seed calendar data for the month
    const month = date.slice(0, 7);
    client.setQueryData(['elimination-calendar', month, mockPetId], empty ? [] : [mockEliminationDaySummary]);

    return (
      <MemoryRouter initialEntries={[date === new Date().toISOString().slice(0, 10) ? '/elimination' : `/elimination/${date}`]}>
        <QueryClientProvider client={client}>
          <DisplaySettingsProvider>
            <SelectedPetProvider initialPetId={mockPetId}>
              <Story />
            </SelectedPetProvider>
          </DisplaySettingsProvider>
        </QueryClientProvider>
      </MemoryRouter>
    );
  };
}

const meta = {
  title: 'Pages/EliminationJournalPage',
  component: EliminationJournalPage,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof EliminationJournalPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithRecords: Story = {
  decorators: [withJournalData('2024-06-15')],
};

export const EmptyDay: Story = {
  decorators: [withJournalData('2024-06-16', true)],
};
