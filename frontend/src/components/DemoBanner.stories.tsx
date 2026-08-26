import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect } from 'storybook/test';
import { mockAppInfo } from '../stories/fixtures';
import {
  SIMULATED_DEVICE_INSETS,
  asNarrowStory,
  assertTextClearsTopInset,
  withDeviceInsets,
} from '../stories/viewport';
import { DemoBanner } from './DemoBanner';

const meta = {
  title: 'Components/DemoBanner',
  component: DemoBanner,
  parameters: { layout: 'fullscreen' },
  render: (args) => {
    const client = new QueryClient();
    client.setQueryData(['app-info'], {
      ...mockAppInfo,
      demo_mode: args.demoMode ?? false,
    });
    return (
      <QueryClientProvider client={client}>
        <DemoBanner />
      </QueryClientProvider>
    );
  },
  argTypes: {
    demoMode: { control: 'boolean' },
  },
} satisfies Meta<{ demoMode: boolean }>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Hidden: Story = {
  args: { demoMode: false },
  play: async ({ canvasElement }) => {
    expect(canvasElement.querySelector('.demo-banner')).toBeNull();
    // With no banner mounted, nothing is reserved and content owns the inset.
    const root = getComputedStyle(document.documentElement);
    expect(root.getPropertyValue('--demo-banner-height').trim()).toBe('0px');
  },
};

export const Visible: Story = {
  args: { demoMode: true },
  play: async ({ canvasElement }) => {
    const banner = canvasElement.querySelector<HTMLElement>('.demo-banner');
    expect(banner, 'banner should render in demo mode').toBeTruthy();
    // Fixed and flush with the top edge, so it never scrolls out of view.
    expect(getComputedStyle(banner!).position).toBe('fixed');
    expect(Math.round(banner!.getBoundingClientRect().top)).toBe(0);
    // Opaque, because scrolling content passes underneath it.
    expect(getComputedStyle(banner!).backgroundImage).not.toBe('none');
  },
};

export const VisibleNarrow = asNarrowStory(Visible);

export const NotchedPhone: Story = {
  name: 'Notched phone',
  args: { demoMode: true },
  decorators: [withDeviceInsets()],
  parameters: {
    docs: {
      description: {
        story:
          'The PWA runs under the status bar, so the banner pads itself below the camera hole and '
          + 'reserves that padding in --demo-banner-height for everything below it.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const banner = canvasElement.querySelector<HTMLElement>('.demo-banner');
    assertTextClearsTopInset(banner, 'demo banner');
    // The reserved height covers the strip plus the banner itself.
    const height = Math.round(banner!.getBoundingClientRect().height);
    expect(
      height,
      `banner should reserve more than the ${SIMULATED_DEVICE_INSETS.top}px inset`,
    ).toBeGreaterThan(SIMULATED_DEVICE_INSETS.top);
    const reserved = getComputedStyle(document.documentElement)
      .getPropertyValue('--demo-banner-height');
    expect(reserved.trim(), 'reserved height should follow the device inset').not.toBe('0px');
  },
};

export const NotchedPhoneNarrow = asNarrowStory(NotchedPhone);
