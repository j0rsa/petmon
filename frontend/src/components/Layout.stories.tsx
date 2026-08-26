import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { expect } from 'storybook/test';
import { withDemoLayoutData, withLayoutData } from '../stories/decorators';
import {
  asNarrowStory,
  assertBottomNavPinned,
  assertShellSpansOneViewport,
  assertTextClearsTopInset,
  withDeviceInsets,
} from '../stories/viewport';
import { Layout } from './Layout';

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
