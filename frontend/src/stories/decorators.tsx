import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Decorator } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router-dom';
import { SelectedPetProvider } from '../context/SelectedPetContext';
import { DisplaySettingsProvider } from '../context/DisplaySettingsProvider';
import { localToday, shiftDate } from '../lib/dates';
import {
  mockApiTokens,
  mockAppInfo,
  mockBestFluidDay,
  mockCreatedToken,
  mockDaySummary,
  mockDisplaySettings,
  mockEliminationRecords,
  mockEliminationRangeSummary,
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
  mockWeightRecords,
  mockWeightSummaryRaw,
  mockWeightSummaryDaily,
  mockWeightSummaryWeekly,
  mockHealthStateRecords,
} from './fixtures';

/** Single router wrapper — use `parameters.route` per story to set the active path. */
export const withMemoryRouter: Decorator = (Story, { parameters }) => (
  <MemoryRouter initialEntries={[typeof parameters.route === 'string' ? parameters.route : '/']}>
    <Story />
  </MemoryRouter>
);

/** Seeds the minimum query data needed for Layout (me, pets, app-info, display settings). */
export const withLayoutData: Decorator = (Story) => {
  const client = makeMockClient();
  client.setQueryData(['pets'], mockPets);
  client.setQueryData(['me'], { subject: 'dev', email: null, name: 'Dev', display_name: 'Dev', kind: 'dev', scopes: [] });
  client.setQueryData(['app-info'], mockAppInfo);
  client.setQueryData(['settings-display'], mockDisplaySettings);
  return (
    <QueryClientProvider client={client}>
      <DisplaySettingsProvider>
        <Story />
      </DisplaySettingsProvider>
    </QueryClientProvider>
  );
};

export function withSelectedPet(petId = mockPetId): Decorator {
  return function SelectedPetDecorator(Story) {
    const client = makeMockClient();
    client.setQueryData(['pets'], mockPets);
    client.setQueryData(['me'], { subject: 'dev', email: null, name: 'Dev', display_name: 'Dev', kind: 'dev', scopes: [] });
    client.setQueryData(['app-info'], mockAppInfo);

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
    client.setQueryData(['me'], { subject: 'dev', email: null, name: 'Dev', display_name: 'Dev', kind: 'dev', scopes: [] });
    client.setQueryData(['settings-display'], mockDisplaySettings);
    client.setQueryData(['app-info'], mockAppInfo);
    client.setQueryData(['day-summary', date, petId], empty ? { ...mockEmptyDaySummary, local_date: date } : { ...mockDaySummary, local_date: date });
    client.setQueryData(['nutrition-records-day', date, petId], empty ? [] : mockNutritionRecords);
    client.setQueryData(['nutrition-schedules', petId], mockNutritionSchedules);
    client.setQueryData(['nutrition-best-fluid-day', date, petId], empty ? null : mockBestFluidDay);

    return (
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <DisplaySettingsProvider>
            <SelectedPetProvider initialPetId={petId}>
              <Story />
            </SelectedPetProvider>
          </DisplaySettingsProvider>
        </QueryClientProvider>
      </MemoryRouter>
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
    client.setQueryData(['me'], { subject: 'dev', email: null, name: 'Dev', display_name: 'Dev', kind: 'dev', scopes: [] });
    client.setQueryData(['app-info'], mockAppInfo);

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

// ── Elimination decorators ───────────────────────────────────────────────────

export function withEliminationDayPanel(
  date: string,
  petId: string,
  empty = false,
  options?: { recordsOverride?: typeof mockEliminationRecords },
): Decorator {
  return function EliminationDayDecorator(Story) {
    const client = makeMockClient();
    client.setQueryData(['pets'], mockPets);
    client.setQueryData(['me'], { subject: 'dev', email: null, name: 'Dev', display_name: 'Dev', kind: 'dev', scopes: [] });
    client.setQueryData(['settings-display'], mockDisplaySettings);
    client.setQueryData(['app-info'], mockAppInfo);
    const records = options?.recordsOverride
      ?? (empty ? [] : mockEliminationRecords.map((r) => ({ ...r, local_date: date })));
    client.setQueryData(['elimination-records-day', date, petId], records);

    return (
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <DisplaySettingsProvider>
            <SelectedPetProvider initialPetId={petId}>
              <Story />
            </SelectedPetProvider>
          </DisplaySettingsProvider>
        </QueryClientProvider>
      </MemoryRouter>
    );
  };
}

interface EliminationAnalyticsDecoratorOptions {
  empty?: boolean;
  petId?: string;
  loading?: boolean;
  error?: boolean;
}

export function withEliminationAnalyticsPage({
  empty = false,
  petId = mockPetId,
  loading = false,
  error = false,
}: EliminationAnalyticsDecoratorOptions = {}): Decorator {
  return function EliminationAnalyticsDecorator(Story) {
    const client = makeMockClient();
    client.setQueryData(['pets'], mockPets);
    client.setQueryData(['me'], { subject: 'dev', email: null, name: 'Dev', display_name: 'Dev', kind: 'dev', scopes: [] });
    client.setQueryData(['app-info'], mockAppInfo);

    const today = localToday();
    const emptyRangeSummary = { ...mockEliminationRangeSummary, daily_summaries: [], type_totals: {}, avg_per_day: 0, p50_per_day: 0, p90_per_day: 0, p99_per_day: 0 };
    const summary = empty ? emptyRangeSummary : mockEliminationRangeSummary;

    if (loading) {
      const pending = () => new Promise(() => {});
      for (const days of [7, 14, 30, 90]) {
        const from = shiftDate(today, -(days - 1));
        client.setQueryDefaults(['elimination-analytics', from, today, petId], { queryFn: pending });
      }
    } else if (error) {
      const fail = () => Promise.reject(new Error('Unable to load analytics.'));
      for (const days of [7, 14, 30, 90]) {
        const from = shiftDate(today, -(days - 1));
        client.setQueryDefaults(['elimination-analytics', from, today, petId], { queryFn: fail });
      }
    } else {
      for (const days of [7, 14, 30, 90]) {
        const from = shiftDate(today, -(days - 1));
        client.setQueryData(['elimination-analytics', from, today, petId], summary);
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

// ── Pet info page decorator ──────────────────────────────────────────────────

export function withPetInfoPage(petId = mockPetId, withWeights = true): Decorator {
  return function PetInfoDecorator(Story) {
    const client = makeMockClient();
    client.setQueryData(['pets'], mockPets);
    client.setQueryData(['pets', petId], mockPets.find((p) => p.id === petId) ?? mockPets[0]);
    client.setQueryData(['me'], { subject: 'dev', email: null, name: 'Dev', display_name: 'Dev', kind: 'dev', scopes: [] });
    client.setQueryData(['app-info'], mockAppInfo);
    client.setQueryData(['weight-records', petId], withWeights ? mockWeightRecords.map((r) => ({ ...r, pet_id: petId })) : []);

    return (
      <MemoryRouter initialEntries={[`/pets/${petId}`]}>
        <QueryClientProvider client={client}>
          <SelectedPetProvider initialPetId={petId}>
            <Story />
          </SelectedPetProvider>
        </QueryClientProvider>
      </MemoryRouter>
    );
  };
}

// ── Health page decorator ────────────────────────────────────────────────────

interface WithHealthPageOptions {
  petId?: string;
  loading?: boolean;
  empty?: boolean;
  longHistory?: boolean;
}

export function withHealthPage({ petId = mockPetId, loading = false, empty = false, longHistory = false }: WithHealthPageOptions = {}): Decorator {
  return function HealthDecorator(Story) {
    const client = makeMockClient();
    client.setQueryData(['pets'], mockPets);
    client.setQueryData(['me'], { subject: 'dev', email: null, name: 'Dev', display_name: 'Dev', kind: 'dev', scopes: [] });
    client.setQueryData(['app-info'], mockAppInfo);

    if (loading) {
      const pending = () => new Promise(() => {});
      client.setQueryDefaults(['weight-records', petId], { queryFn: pending });
      client.setQueryDefaults(['weight-summary'], { queryFn: pending });
      client.setQueryDefaults(['health-state-records', petId], { queryFn: pending });
      client.setQueryDefaults(['health-state-chart', petId], { queryFn: pending });
    } else {
      client.setQueryData(
        ['weight-records', petId],
        empty ? [] : mockWeightRecords.map((r) => ({ ...r, pet_id: petId })),
      );

      const todayStr = localToday();
      const rawFrom = shiftDate(todayStr, -29);
      const dailyFrom = shiftDate(todayStr, -89);
      const yearFrom = shiftDate(todayStr, -364);
      const summaryData = (buckets: typeof mockWeightSummaryRaw) =>
        empty ? [] : buckets.map((b) => ({ ...b }));

      client.setQueryData(['weight-summary', rawFrom, todayStr, 'raw', petId], summaryData(mockWeightSummaryRaw));
      client.setQueryData(['weight-summary', dailyFrom, todayStr, 'daily', petId], summaryData(mockWeightSummaryDaily));
      client.setQueryData(['weight-summary', yearFrom, todayStr, 'weekly', petId], summaryData(longHistory ? mockWeightSummaryWeekly : mockWeightSummaryDaily));
      client.setQueryData(['weight-summary', 'all', todayStr, 'weekly', petId], summaryData(mockWeightSummaryWeekly));

      client.setQueryData(
        ['health-state-records', petId],
        empty ? [] : mockHealthStateRecords.map((r) => ({ ...r, pet_id: petId })),
      );

      const chartRecords = empty ? [] : mockHealthStateRecords.map((r) => ({ ...r, pet_id: petId }));
      client.setQueryData(['health-state-chart', petId, rawFrom, todayStr, 'daily'], chartRecords);
      client.setQueryData(['health-state-chart', petId, dailyFrom, todayStr, 'daily'], chartRecords);
      client.setQueryData(['health-state-chart', petId, yearFrom, todayStr, 'weekly'], chartRecords);
      client.setQueryData(['health-state-chart', petId, 'all', todayStr, 'weekly'], chartRecords);
    }

    return (
      <MemoryRouter initialEntries={['/health']}>
        <QueryClientProvider client={client}>
          <SelectedPetProvider initialPetId={petId}>
            <Story />
          </SelectedPetProvider>
        </QueryClientProvider>
      </MemoryRouter>
    );
  };
}

const API_TOKEN_STUB = 'pm_api_storybook000000000000000000000000000000000000000000000000000000';

interface WithSettingsOptions {
  oidc?: 'empty' | 'configured';
  telegram?: 'empty' | 'configured';
  tokens?: 'empty' | 'populated';
  loading?: boolean;
  newToken?: boolean;
  /** Simulate the browser having stored an API token (shows the "using device token" banner). */
  usingApiToken?: boolean;
}

export function withSettings({
  oidc = 'configured',
  telegram = 'configured',
  tokens = 'populated',
  loading = false,
  newToken = false,
  usingApiToken = false,
}: WithSettingsOptions = {}): Decorator {
  return function SettingsDecorator(Story) {
    const client = makeMockClient();

    // Seed localStorage so SettingsPage's `usingApiToken` branch renders correctly.
    if (usingApiToken) {
      localStorage.setItem('pm_id_token', API_TOKEN_STUB);
    } else {
      localStorage.removeItem('pm_id_token');
    }

    if (newToken) {
      client.setQueryDefaults(['create-token-mock'], { queryFn: () => Promise.resolve(mockCreatedToken) });
    }

    if (loading) {
      const pending = () => new Promise(() => {});
      client.setQueryDefaults(['settings-display'], { queryFn: pending });
      client.setQueryDefaults(['settings-oidc'], { queryFn: pending });
      client.setQueryDefaults(['settings-telegram'], { queryFn: pending });
      client.setQueryDefaults(['api-tokens'], { queryFn: pending });
    } else {
      client.setQueryData(['settings-display'], mockDisplaySettings);
      client.setQueryData(['settings-oidc'], oidc === 'configured' ? mockOidcConfigured : mockOidcEmpty);
      client.setQueryData(['settings-telegram'], telegram === 'configured' ? mockTelegramConfigured : mockTelegramEmpty);
      client.setQueryData(['api-tokens'], tokens === 'populated' ? mockApiTokens : []);
      client.setQueryData(['app-info'], mockAppInfo);
    }

    return (
      <QueryClientProvider client={client}>
        <Story />
      </QueryClientProvider>
    );
  };
}
