import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { expect, waitFor } from 'storybook/test';
import { DisplaySettingsProvider } from '../context/DisplaySettingsProvider';
import { SelectedPetProvider } from '../context/SelectedPetContext';
import { EliminationLayout } from '../layouts/EliminationLayout';
import EliminationJournalPage from '../pages/EliminationJournalPage';
import { withDemoLayoutData, withLayoutData } from '../stories/decorators';
import {
  mockAppInfo,
  mockCumulativeFluidChartSettings,
  mockDaySummary,
  mockDeveloperModeSettings,
  mockDisplaySettings,
  mockEliminationDaySummary,
  mockEliminationRecords,
  mockNotifications,
  mockNutritionCalendarSettings,
  mockPetId,
  mockPets,
} from '../stories/fixtures';
import {
  asNarrowStory,
  assertBottomNavPinned,
  assertShellSpansOneViewport,
  assertTextClearsTopInset,
  withDeviceInsets,
} from '../stories/viewport';
import { Layout } from './Layout';

const eliminationDeepLinkDate = '2024-06-15';
const eliminationDeepLinkHash = '#record-elim-01';

const withNotificationDeepLinkData: Decorator = (Story) => {
  // Layout owns an inner SelectedPetProvider too; seed its browser selection so
  // an earlier pet-switch story cannot redirect this deep link to another pet.
  localStorage.setItem('petmon-selected-pet-id', mockPetId);
  useEffect(() => () => localStorage.removeItem('petmon-selected-pet-id'), []);
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, refetchOnMount: false, refetchOnWindowFocus: false },
    },
  });
  client.setQueryData(['pets'], mockPets);
  client.setQueryData(['me'], { subject: 'dev', email: null, name: 'Dev', display_name: 'Dev', kind: 'dev', scopes: [], roles: ['instance_admin'] });
  client.setQueryData(['app-info'], mockAppInfo);
  client.setQueryData(['user-settings', 'display'], mockDisplaySettings);
  client.setQueryData(['user-settings', 'nutrition_calendar'], mockNutritionCalendarSettings);
  client.setQueryData(['user-settings', 'cumulative_fluid_chart'], mockCumulativeFluidChartSettings);
  client.setQueryData(['user-settings', 'developer_mode'], mockDeveloperModeSettings);
  client.setQueryData(['notifications-unread-count'], { count: 1 });
  client.setQueryData(['notifications'], mockNotifications);
  client.setQueryData(
    ['elimination-records-day', eliminationDeepLinkDate, mockPetId],
    mockEliminationRecords.map((r) => ({ ...r, local_date: eliminationDeepLinkDate })),
  );
  client.setQueryData(['elimination-calendar', eliminationDeepLinkDate.slice(0, 7), mockPetId], [mockEliminationDaySummary]);
  client.setQueryData(['day-summary', eliminationDeepLinkDate, mockPetId], { ...mockDaySummary, local_date: eliminationDeepLinkDate });

  return (
    <QueryClientProvider client={client}>
      <DisplaySettingsProvider>
        <SelectedPetProvider initialPetId={mockPetId}>
          <Story />
        </SelectedPetProvider>
      </DisplaySettingsProvider>
    </QueryClientProvider>
  );
};

function NotificationDeepLinkHarness() {
  const navigate = useNavigate();
  useEffect(() => {
    window.scrollTo(0, 600);
    navigate(`/elimination/${eliminationDeepLinkDate}${eliminationDeepLinkHash}`);
  }, [navigate]);
  return (
    <div className="page-stack">
      <section className="panel" style={{ minHeight: '120vh' }}>
        <p className="eyebrow">Home</p>
        <h2>Tall home page</h2>
        <p className="muted-text">Simulates scroll position before opening a notification link.</p>
      </section>
    </div>
  );
}

const meta = {
  title: 'Layouts/Layout',
  component: Layout,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
  render: () => (
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<Layout />}>
          <Route
            index
            element={
              <div className="page-stack">
                <section className="panel">
                  <p className="eyebrow">Story</p>
                  <h2>Main content area</h2>
                  <p className="muted-text">Outlet content renders here.</p>
                </section>
              </div>
            }
          />
        </Route>
      </Routes>
    </MemoryRouter>
  ),
  decorators: [withLayoutData],
} satisfies Meta<typeof Layout>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithNotifications: Story = {
  name: 'With notification bell',
  parameters: {
    docs: {
      description: {
        story: 'Desktop shows the global notification bell; mobile uses the bottom-nav pet tab red dot and sheet.',
      },
    },
  },
};

export const Mobile: Story = {
  parameters: { viewport: { defaultViewport: 'pwaMobile' } },
};

export const MobileWithNotifications: Story = {
  name: 'Mobile with unread dot',
  parameters: {
    viewport: { defaultViewport: 'pwaMobile' },
    docs: {
      description: {
        story: 'Mobile bottom bar: Home, Food, Toilet, Health, and pet tab. Settings lives in the pet sheet.',
      },
    },
  },
};

/** A page that fits must not gain scroll just because the top strip is reserved. */
function assertContentStartsBelowBanner(canvasElement: HTMLElement) {
  const banner = canvasElement.querySelector<HTMLElement>('.demo-banner');
  const content = canvasElement.querySelector<HTMLElement>('.content');
  expect(banner, 'demo banner should render').toBeTruthy();
  expect(content, 'content column should render').toBeTruthy();
  const bannerBottom = Math.round(banner!.getBoundingClientRect().bottom);
  const contentTop = Math.round(content!.getBoundingClientRect().top);
  expect(
    contentTop,
    `content starts at ${contentTop}px, under the banner that ends at ${bannerBottom}px`,
  ).toBeGreaterThanOrEqual(bannerBottom - 1);
}

export const DemoMode: Story = {
  name: 'Demo banner (mobile)',
  decorators: [withDemoLayoutData],
  parameters: {
    viewport: { defaultViewport: 'pwaMobile' },
    docs: {
      description: {
        story:
          'The banner is fixed and its height is reserved by the shell, so the page does not '
          + 'gain the banner’s height in scroll and the bottom nav stays on the bottom edge.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    assertContentStartsBelowBanner(canvasElement);
    assertShellSpansOneViewport(canvasElement);
    assertBottomNavPinned(canvasElement, 0);
  },
};

export const DemoModeNarrow = asNarrowStory(DemoMode);

export const DemoModeNotchedPhone: Story = {
  name: 'Demo banner on a notched phone',
  decorators: [withDemoLayoutData, withDeviceInsets()],
  parameters: {
    viewport: { defaultViewport: 'pwaMobile' },
    docs: {
      description: {
        story:
          'Simulated safe-area insets: the banner text clears the camera hole, the content column '
          + 'clears the banner, and the nav items clear the home indicator.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    assertTextClearsTopInset(canvasElement.querySelector('.demo-banner'), 'demo banner');
    assertContentStartsBelowBanner(canvasElement);
    assertShellSpansOneViewport(canvasElement);
    assertBottomNavPinned(canvasElement);
  },
};

export const DemoModeNotchedPhoneNarrow = asNarrowStory(DemoModeNotchedPhone);

export const NotchedPhoneWithoutBanner: Story = {
  name: 'Notched phone (no banner)',
  decorators: [withDeviceInsets()],
  parameters: {
    viewport: { defaultViewport: 'pwaMobile' },
    docs: {
      description: {
        story: 'Production layout: with no banner, the content column itself clears the camera hole.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const content = canvasElement.querySelector<HTMLElement>('.content');
    expect(content, 'content column should render').toBeTruthy();
    assertTextClearsTopInset(content!.firstElementChild as HTMLElement, 'first content block');
    assertBottomNavPinned(canvasElement);
  },
};

export const NotchedPhoneWithoutBannerNarrow = asNarrowStory(NotchedPhoneWithoutBanner);

export const NotificationDeepLinkMobile: Story = {
  name: 'Notification deep link keeps bottom nav pinned',
  decorators: [withNotificationDeepLinkData],
  parameters: {
    viewport: { defaultViewport: 'pwaMobile' },
    docs: {
      description: {
        story:
          'Opening a notification deep link from a scrolled page must reset scroll on pathname change '
          + 'and keep the bottom nav fixed to the viewport edge.',
      },
    },
  },
  render: () => (
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<NotificationDeepLinkHarness />} />
          <Route path="/elimination" element={<EliminationLayout />}>
            <Route index element={<EliminationJournalPage />} />
            <Route path=":date" element={<EliminationJournalPage />} />
          </Route>
        </Route>
      </Routes>
    </MemoryRouter>
  ),
  play: async ({ canvasElement }) => {
    await waitFor(
      () => {
        expect(canvasElement.querySelector('#record-elim-01')).toBeTruthy();
      },
      { timeout: 5000 },
    );
    assertBottomNavPinned(canvasElement, 0);
    window.scrollTo(0, 300);
    assertBottomNavPinned(canvasElement, 0);
  },
};

export const NotificationDeepLinkMobileNarrow = asNarrowStory(NotificationDeepLinkMobile);
