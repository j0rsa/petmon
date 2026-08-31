import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, within } from 'storybook/test';
import HealthNotificationsPage from './HealthNotificationsPage';
import { SelectedPetProvider } from '../context/SelectedPetContext';
import { mockPetId, mockPets } from '../stories/fixtures';
import { petSettingsQueryKey, DEFAULT_PET_NUDGE_SCHEDULE, type PetNudgeSchedule } from '../api/petSettings';
import { asNarrowStory } from '../stories/viewport';

function withData(nudgeData?: unknown) {
  return [
    (Story: React.ComponentType) => {
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: Infinity, refetchOnMount: false } },
      });
      client.setQueryData(['pets'], mockPets);
      if (nudgeData !== undefined) {
        client.setQueryData(petSettingsQueryKey(mockPetId, 'med_nudge'), nudgeData);
      }
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
  ] as import('@storybook/react-vite').Decorator[];
}

const meta = {
  title: 'Pages/HealthNotificationsPage',
  component: HealthNotificationsPage,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof HealthNotificationsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  decorators: withData(DEFAULT_PET_NUDGE_SCHEDULE),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: /Nudge reminders/i })).toBeInTheDocument();
    await expect(canvas.getByText('Morning')).toBeInTheDocument();
    await expect(canvas.getByText('Midday')).toBeInTheDocument();
    await expect(canvas.getByText('Evening')).toBeInTheDocument();
  },
};

/** All slots enabled — cron summary should appear. */
export const AllEnabled: Story = {
  decorators: withData({
    morning: { enabled: true, deadline_hour: 9 },
    midday: { enabled: true, deadline_hour: 13 },
    evening: { enabled: true, deadline_hour: 20 },
  } satisfies PetNudgeSchedule),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The cron summary section must render when slots are enabled
    await expect(canvas.getByText('Morning')).toBeInTheDocument();
    const summary = canvasElement.textContent ?? '';
    await expect(summary).toContain('09:00');
    await expect(summary).toContain('Server checks at');
  },
};

/**
 * Empty API response `{}` — the hook must fill in defaults rather than
 * crashing on `undefined.enabled`. This is a regression guard for the
 * bug where the route was misregistered and the API returned unexpected data.
 */
export const EmptyApiResponse: Story = {
  decorators: withData({}),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Must render without crashing
    await expect(canvas.getByText('Morning')).toBeInTheDocument();
  },
};

/** Partial response (missing `evening`) — must not crash. */
export const PartialApiResponse: Story = {
  decorators: withData({ morning: { enabled: true, deadline_hour: 9 } }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Morning')).toBeInTheDocument();
    await expect(canvas.getByText('Evening')).toBeInTheDocument();
  },
};

/** No cached data — uses defaults from hook. */
export const NoData: Story = {
  decorators: withData(undefined),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Morning')).toBeInTheDocument();
  },
};

export const DefaultNarrow = asNarrowStory(Default);
export const AllEnabledNarrow = asNarrowStory(AllEnabled);
