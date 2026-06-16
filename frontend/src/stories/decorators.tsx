import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Decorator } from '@storybook/react';
import { MemoryRouter } from 'react-router-dom';
import { SelectedPetProvider } from '../context/SelectedPetContext';
import {
  mockAnalyticsDateFrom,
  mockAnalyticsDateTo,
  mockAnalyticsRecords,
  mockApiTokens,
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

    return (
      <QueryClientProvider client={client}>
        <SelectedPetProvider initialPetId={petId}>
          <Story />
        </SelectedPetProvider>
      </QueryClientProvider>
    );
  };
}

export function withNutritionDayPanel(date: string, petId: string, empty = false): Decorator {
  return function NutritionDayDecorator(Story) {
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
    client.setQueryData(['day-summary', date, petId], empty ? { ...mockEmptyDaySummary, local_date: date } : { ...mockDaySummary, local_date: date });
    client.setQueryData(['nutrition-records-day', date, petId], empty ? [] : mockNutritionRecords);
    client.setQueryData(['nutrition-schedules', petId], mockNutritionSchedules);

    return (
      <QueryClientProvider client={client}>
        <Story />
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

    if (loading) {
      const pending = () => new Promise(() => {});
      client.setQueryDefaults(['nutrition-analytics'], { queryFn: pending });
      client.setQueryDefaults(['nutrition-records'], { queryFn: pending });
      client.setQueryDefaults(['nutrition-schedules'], { queryFn: pending });
    } else if (error) {
      const fail = () => Promise.reject(new Error('Unable to load analytics.'));
      client.setQueryDefaults(['nutrition-analytics'], { queryFn: fail });
      client.setQueryDefaults(['nutrition-records'], { queryFn: fail });
      client.setQueryDefaults(['nutrition-schedules'], { queryFn: fail });
    } else {
      const summary = empty ? mockEmptyRangeSummary : mockRangeSummary;
      const records = empty ? [] : mockAnalyticsRecords.filter((record) => record.pet_id === petId);
      const schedules = empty ? [] : mockNutritionSchedules.filter((schedule) => schedule.pet_id === petId);

      client.setQueryData(['nutrition-analytics', mockAnalyticsDateFrom, mockAnalyticsDateTo, petId], summary);
      client.setQueryData(['nutrition-records', mockAnalyticsDateFrom, mockAnalyticsDateTo, petId], records);
      client.setQueryData(['nutrition-schedules', petId], schedules);
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
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity, refetchOnMount: false, refetchOnWindowFocus: false } },
    });

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
