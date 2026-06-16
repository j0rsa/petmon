import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Decorator } from '@storybook/react';
import { MemoryRouter } from 'react-router-dom';
import { SelectedPetProvider } from '../context/SelectedPetContext';
import { localToday, shiftDate } from '../lib/dates';
import {
  mockAnalyticsDateFrom,
  mockAnalyticsDateTo,
  mockAnalyticsRecords,
  mockApiTokens,
  mockBestFluidDay,
  mockDaySummary,
  mockEmptyDaySummary,
  mockEmptyRangeSummary,
  mockNutritionRecords,
  mockNutritionSchedules,
  mockOidcConfigured,
  mockOidcEmpty,
  mockPetId,
  mockPets,
  mockRangeSummary,
  mockTelegramConfigured,
  mockTelegramEmpty,
} from './fixtures';

/** Single router wrapper — use `parameters.route` per story to set the active path. */
export const withMemoryRouter: Decorator = (Story, { parameters }) => (
  <MemoryRouter initialEntries={[typeof parameters.route === 'string' ? parameters.route : '/']}>
    <Story />
  </MemoryRouter>
);

export function withSelectedPet(petId = mockPetId): Decorator {
  return function SelectedPetDecorator(Story) {
    const client = makeMockClient();
    client.setQueryData(['pets'], mockPets);
    client.setQueryData(['me'], { subject: 'dev', email: null, name: 'Dev', display_name: 'Dev', kind: 'dev' });

    return (
      <QueryClientProvider client={client}>
        <SelectedPetProvider initialPetId={petId}>
          <Story />
        </SelectedPetProvider>
      </QueryClientProvider>
    );
  };
}

const noopQueryFn = () => Promise.resolve(undefined);

function makeMockClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        // Catch-all: any query not pre-seeded returns undefined instead of hitting the network
        queryFn: noopQueryFn,
      },
    },
  });
}

export function withNutritionDayPanel(date: string, petId: string, empty = false): Decorator {
  return function NutritionDayDecorator(Story) {
    const client = makeMockClient();
    client.setQueryData(['pets'], mockPets);
    client.setQueryData(['me'], { subject: 'dev', email: null, name: 'Dev', display_name: 'Dev', kind: 'dev' });
    client.setQueryData(['day-summary', date, petId], empty ? { ...mockEmptyDaySummary, local_date: date } : { ...mockDaySummary, local_date: date });
    client.setQueryData(['nutrition-records-day', date, petId], empty ? [] : mockNutritionRecords);
    client.setQueryData(['nutrition-schedules', petId], mockNutritionSchedules);
    client.setQueryData(['nutrition-best-fluid-day', date, petId], empty ? null : mockBestFluidDay);

    return (
      <QueryClientProvider client={client}>
        <SelectedPetProvider initialPetId={petId}>
          <Story />
        </SelectedPetProvider>
      </QueryClientProvider>
    );
  };
}

interface AnalyticsPageDecoratorOptions {
  empty?: boolean;
  petId?: string;
  loading?: boolean;
  error?: boolean;
}

export function withAnalyticsPage({
  empty = false,
  petId = mockPetId,
  loading = false,
  error = false,
}: AnalyticsPageDecoratorOptions = {}): Decorator {
  return function AnalyticsPageDecorator(Story) {
    const client = makeMockClient();

    client.setQueryData(['pets'], mockPets);
    client.setQueryData(['me'], { subject: 'dev', email: null, name: 'Dev', display_name: 'Dev', kind: 'dev' });

    // Pre-populate all period variants the page may request (7d, 14d, 30d, 90d)
    const today = localToday();
    const summary = empty ? mockEmptyRangeSummary : mockRangeSummary;

    if (loading) {
      const pending = () => new Promise(() => {});
      for (const days of [7, 14, 30, 90]) {
        const from = shiftDate(today, -(days - 1));
        client.setQueryDefaults(['nutrition-analytics', from, today, petId], { queryFn: pending });
      }
    } else if (error) {
      const fail = () => Promise.reject(new Error('Unable to load analytics.'));
      for (const days of [7, 14, 30, 90]) {
        const from = shiftDate(today, -(days - 1));
        client.setQueryDefaults(['nutrition-analytics', from, today, petId], { queryFn: fail });
      }
    } else {
      for (const days of [7, 14, 30, 90]) {
        const from = shiftDate(today, -(days - 1));
        client.setQueryData(['nutrition-analytics', from, today, petId], summary);
      }
    }

    return (
      <QueryClientProvider client={client}>
        <SelectedPetProvider initialPetId={petId}>
          <Story />
        </SelectedPetProvider>
      </QueryClientProvider>
    );
  };
}

export function withAnalyticsPageForPet(petId = mockPetId): Decorator {
  return withAnalyticsPage({ petId });
}

interface WithSettingsOptions {
  oidc?: 'empty' | 'configured';
  telegram?: 'empty' | 'configured';
  tokens?: 'empty' | 'populated';
  loading?: boolean;
}

export function withSettings({
  oidc = 'configured',
  telegram = 'configured',
  tokens = 'populated',
  loading = false,
}: WithSettingsOptions = {}): Decorator {
  return function SettingsDecorator(Story) {
    const client = makeMockClient();

    if (loading) {
      const pending = () => new Promise(() => {});
      client.setQueryDefaults(['settings-oidc'], { queryFn: pending });
      client.setQueryDefaults(['settings-telegram'], { queryFn: pending });
      client.setQueryDefaults(['api-tokens'], { queryFn: pending });
    } else {
      client.setQueryData(['settings-oidc'], oidc === 'configured' ? mockOidcConfigured : mockOidcEmpty);
      client.setQueryData(['settings-telegram'], telegram === 'configured' ? mockTelegramConfigured : mockTelegramEmpty);
      client.setQueryData(['api-tokens'], tokens === 'populated' ? mockApiTokens : []);
    }

    return (
      <QueryClientProvider client={client}>
        <Story />
      </QueryClientProvider>
    );
  };
}
