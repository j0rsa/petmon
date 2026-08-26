import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, userEvent, within } from 'storybook/test';
import { MedIntakePanel } from './MedIntakePanel';
import { SelectedPetProvider } from '../../context/SelectedPetContext';
import { mockDailyMedAssignments, mockBundleDailyAssignments, mockDeveloperModeSettings, mockMedBundles, mockPetId, mockPets } from '../../stories/fixtures';
import { localToday } from '../../lib/dates';
import { asNarrowStory, assertHeaderActionPlacement } from '../../stories/viewport';

const meta = {
  title: 'Components/Health/MedIntakePanel',
  component: MedIntakePanel,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof MedIntakePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

const DESKTOP_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function withDesktopUserAgent(): Decorator[] {
  return [
    (Story) => {
      Object.defineProperty(navigator, 'userAgent', {
        configurable: true,
        value: DESKTOP_USER_AGENT,
      });
      Object.defineProperty(navigator, 'userAgentData', {
        configurable: true,
        value: { platform: 'macOS' },
      });
      return <Story />;
    },
  ];
}

function withMedDataCore({
  empty = false,
  developerMode = false,
  daily = mockDailyMedAssignments,
  bundles = [],
}: {
  empty?: boolean;
  developerMode?: boolean;
  daily?: typeof mockDailyMedAssignments;
  bundles?: typeof mockMedBundles;
} = {}): Decorator[] {
  return [
    (Story) => {
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
      client.setQueryData(['user-settings', 'developer_mode'], {
        ...mockDeveloperModeSettings,
        enabled: developerMode,
      });
      client.setQueryData(
        ['med-daily', mockPetId, localToday()],
        empty ? [] : daily,
      );
      client.setQueryData(['med-bundles', mockPetId], empty ? [] : bundles);
      client.setQueryData(['app-info'], {
        med_intake_shortcut_icloud_url: 'https://www.icloud.com/shortcuts/abc123def4',
        med_intake_automate_community_url: 'https://llamalab.com/automate/community/flows/12345',
      });
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
  ];
}

function withMedData(options?: Parameters<typeof withMedDataCore>[0]): Decorator[] {
  // Innermost decorator wins for navigator overrides (Storybook applies first listed last).
  return [...withDesktopUserAgent(), ...withMedDataCore(options)];
}

export const WithDailyMeds: Story = {
  args: { petId: mockPetId },
  decorators: withMedData(),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Meds' })).toBeInTheDocument();
    await expect(canvas.getByRole('heading', { name: "Today's meds" })).toBeInTheDocument();
    await expect(canvas.getByRole('link', { name: 'Apple Shortcut' })).toBeInTheDocument();
    await expect(canvas.getByRole('link', { name: 'AutoMate flow' })).toBeInTheDocument();
    // Import links are a card action on the header row, not text trailing the
    // title: right-aligned on desktop, wrapped below the title when narrow.
    assertHeaderActionPlacement(canvasElement, "Today's meds", 'AutoMate flow');
    const links = canvas.getByRole('link', { name: 'Apple Shortcut' }).closest('.med-intake-import-links');
    await expect(links?.parentElement).toHaveClass('section-heading');
    await expect(canvas.queryByRole('heading', { name: 'Bundles' })).not.toBeInTheDocument();
    await userEvent.click(canvas.getAllByRole('button', { name: 'Add record' })[0]!);
    await expect(canvas.getByText('Add medication record')).toBeInTheDocument();
    await expect(canvas.getByText('Taken date')).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Cancel' }));
    await userEvent.click(canvas.getAllByRole('button', { name: 'Take now' })[1]!);
    await expect(canvas.getByText('Record medication taken now')).toBeInTheDocument();
    await expect(canvas.queryByText('Taken date')).not.toBeInTheDocument();
  },
};

export const WithDeveloperMode: Story = {
  args: { petId: mockPetId },
  decorators: withMedData({ developerMode: true }),
};

function withAndroidUserAgent(): Decorator[] {
  return [
    (Story) => {
      Object.defineProperty(navigator, 'userAgent', {
        configurable: true,
        value: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      });
      Object.defineProperty(navigator, 'userAgentData', {
        configurable: true,
        value: { platform: 'Android' },
      });
      return <Story />;
    },
  ];
}

export const WithDailyMedsAndroid: Story = {
  args: { petId: mockPetId },
  decorators: [...withAndroidUserAgent(), ...withMedDataCore()],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('link', { name: 'AutoMate flow' })).toBeInTheDocument();
    await expect(canvas.queryByRole('link', { name: 'Apple Shortcut' })).not.toBeInTheDocument();
  },
};

export const WithBundle: Story = {
  args: { petId: mockPetId },
  decorators: withMedData({
    daily: mockBundleDailyAssignments,
    bundles: mockMedBundles,
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Prednisolone + Gabapentin')).toBeInTheDocument();
    await expect(canvas.getByRole('heading', { name: 'Bundles' })).toBeInTheDocument();
    await expect(canvas.getByRole('heading', { name: 'Meds' })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Add record for Prednisolone + Gabapentin' }));
    await expect(canvas.getByText('Add medication record')).toBeInTheDocument();
    await expect(canvas.getByText('Taken date')).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Cancel' }));
    await expect(canvas.getByRole('button', { name: 'Take Prednisolone + Gabapentin now' })).toBeInTheDocument();
    await expect(canvas.queryByRole('button', { name: 'Undo Prednisolone + Gabapentin' })).not.toBeInTheDocument();
  },
};

export const WithBundleTaken: Story = {
  args: { petId: mockPetId },
  decorators: withMedData({
    daily: mockBundleDailyAssignments.map((item, index) => ({
      ...item,
      intakes: [{
        id: `bundle-intake-${index}`,
        pet_id: mockPetId,
        medication_id: item.medication.id,
        assignment_id: item.assignment.id,
        assignment: item.assignment,
        dose_fraction_override: null,
        liquid_dose_ml_override: null,
        effective_dose_fraction: item.assignment.dose_fraction,
        effective_dose_mg: item.assignment.effective_dose_mg,
        dose_label: item.assignment.dose_label,
        occurred_at: `${localToday()}T08:00:00`,
        local_date: localToday(),
        taken: true,
        note: null,
        source_type: 'manual',
        created_at: `${localToday()}T08:00:00`,
      }],
    })),
    bundles: mockMedBundles,
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Add record for Prednisolone + Gabapentin' })).toBeInTheDocument();
    await expect(canvas.queryByRole('button', { name: 'Take Prednisolone + Gabapentin now' })).not.toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Undo Prednisolone + Gabapentin' })).toBeInTheDocument();
    await expect(canvas.getByRole('heading', { name: 'Bundles' })).toBeInTheDocument();
    await expect(canvas.getByRole('heading', { name: 'Meds' })).toBeInTheDocument();
  },
};

export const Empty: Story = {
  args: { petId: mockPetId },
  decorators: withMedData({ empty: true }),
};

export const WithDailyMedsNarrow = asNarrowStory(WithDailyMeds);
export const WithDailyMedsAndroidNarrow = asNarrowStory(WithDailyMedsAndroid);
export const WithBundleNarrow = asNarrowStory(WithBundle);
export const WithBundleTakenNarrow = asNarrowStory(WithBundleTaken);
export const EmptyNarrow = asNarrowStory(Empty);
