import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { mockPetId } from '../stories/fixtures';
import { withEliminationDayPanel } from '../stories/decorators';
import { EliminationDayPanel } from './EliminationDayPanel';

const meta = {
  title: 'Elimination/EliminationDayPanel',
  component: EliminationDayPanel,
  tags: ['autodocs'],
  args: {
    date: '2024-06-15',
    petId: mockPetId,
  },
} satisfies Meta<typeof EliminationDayPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithRecords: Story = {
  decorators: [withEliminationDayPanel('2024-06-15', mockPetId)],
};

export const DeepLinkHighlight: Story = {
  name: 'Deep link highlight',
  decorators: [withEliminationDayPanel('2024-06-15', mockPetId, false, { routeHash: '#record-elim-01' })],
  play: async ({ canvasElement }) => {
    await waitFor(() => {
      expect(canvasElement.querySelector('#record-elim-01')).toBeTruthy();
    });
    const row = canvasElement.querySelector('#record-elim-01');
    await waitFor(() => {
      expect(row).toHaveClass('entry-row-wrap--deep-link-flash');
    });
  },
};

/** Latest entry is general — shows one-press Wee/Poop categorization. */
export const GeneralLatestRecord: Story = {
  decorators: [
    withEliminationDayPanel('2024-06-15', mockPetId, false, {
      recordsOverride: [
        {
          id: 'elim-general',
          pet_id: mockPetId,
          occurred_at: '2024-06-15T20:00:00',
          local_date: '2024-06-15',
          event_type: 'general',
          subtype: null,
          duration_seconds: 45,
          note: null,
          source_type: 'manual',
          created_at: '2024-06-15T20:00:00',
          updated_at: '2024-06-15T20:00:00',
        },
        {
          id: 'elim-02',
          pet_id: mockPetId,
          occurred_at: '2024-06-15T08:30:00',
          local_date: '2024-06-15',
          event_type: 'defecation',
          subtype: 'normal',
          duration_seconds: 90,
          note: 'Normal stool',
          source_type: 'manual',
          created_at: '2024-06-15T08:30:00',
          updated_at: '2024-06-15T08:30:00',
        },
      ],
    }),
  ],
};

export const EmptyDay: Story = {
  args: {
    date: '2024-06-16',
  },
  decorators: [withEliminationDayPanel('2024-06-16', mockPetId, true)],
};

const weeLatestRecords = [
  {
    id: 'elim-wee',
    pet_id: mockPetId,
    occurred_at: '2024-06-15T20:00:00',
    local_date: '2024-06-15',
    event_type: 'urination' as const,
    subtype: null,
    duration_seconds: 45,
    note: null,
    source_type: 'manual',
    created_at: '2024-06-15T20:00:00',
    updated_at: '2024-06-15T20:00:00',
  },
];

/** Row edit open: Log visit becomes disabled “Editing…” so ghost-clicks cannot create. */
export const Editing: Story = {
  decorators: [
    withEliminationDayPanel('2024-06-15', mockPetId, false, {
      recordsOverride: weeLatestRecords,
    }),
  ],
  parameters: {
    docs: {
      description: {
        story:
          'While a visit is being edited, Log visit is disabled and labeled “Editing…”. The categorize bar is also hidden until edit mode ends.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Edit' }));
    const logVisit = canvas.getByRole('button', { name: 'Editing…' });
    await expect(logVisit).toBeDisabled();
    const editTypeSelect = canvas
      .getAllByLabelText('Event type')
      .find((el) => !(el as HTMLSelectElement).disabled);
    await expect(editTypeSelect).toBeTruthy();
    await expect(canvas.queryByText('Last visit uncategorized — was it:')).not.toBeInTheDocument();
  },
};

export const EditingNarrow: Story = {
  ...Editing,
  parameters: {
    ...Editing.parameters,
    viewport: { defaultViewport: 'mobile1' },
  },
};

/**
 * Uncategorized latest visit normally shows Wee/Poop — but not while that row is open for edit.
 */
export const EditingHidesCategorizeBar: Story = {
  decorators: [
    withEliminationDayPanel('2024-06-15', mockPetId, false, {
      recordsOverride: [
        {
          ...weeLatestRecords[0],
          id: 'elim-general',
          event_type: 'general',
        },
      ],
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Last visit uncategorized — was it:')).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Edit' }));
    await expect(canvas.getByRole('button', { name: 'Editing…' })).toBeDisabled();
    await expect(canvas.queryByText('Last visit uncategorized — was it:')).not.toBeInTheDocument();
  },
};

/**
 * Editing a visit must not accidentally create via the Log visit form.
 * Mobile browsers often deliver a ghost click to whatever sits under a native
 * <select> after it closes — previously that hit Log visit (default Wee).
 */
export const EditTypeDoesNotCreate: Story = {
  decorators: [
    withEliminationDayPanel('2024-06-15', mockPetId, false, {
      recordsOverride: weeLatestRecords,
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const fetchMock = fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'PATCH' && url.includes('/elimination/records/elim-wee')) {
        return new Response(
          JSON.stringify({
            ...weeLatestRecords[0],
            event_type: 'general',
            updated_at: '2024-06-15T20:01:00',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (method === 'GET' && url.includes('/elimination/records')) {
        return new Response(
          JSON.stringify([{ ...weeLatestRecords[0], event_type: 'general' }]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    const originalFetch = window.fetch;
    window.fetch = fetchMock as unknown as typeof fetch;

    try {
      await userEvent.click(canvas.getByRole('button', { name: 'Edit' }));
      const logVisit = canvas.getByRole('button', { name: 'Editing…' });
      await expect(logVisit).toBeDisabled();

      const editTypeSelect = canvas
        .getAllByLabelText('Event type')
        .find((el) => !(el as HTMLSelectElement).disabled);
      await expect(editTypeSelect).toBeTruthy();
      await userEvent.selectOptions(editTypeSelect!, 'general');
      // Simulate the ghost click that mobile browsers fire on dismiss of <select>.
      // Disabled + pointer-events:none must keep this from creating a visit.
      logVisit.click();

      await userEvent.click(canvas.getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        const writes = fetchMock.mock.calls.filter((call) => {
          const method = String(call[1]?.method ?? 'GET').toUpperCase();
          return method === 'POST' || method === 'PATCH';
        });
        expect(writes).toHaveLength(1);
        expect(String(writes[0][1]?.method ?? '').toUpperCase()).toBe('PATCH');
        expect(String(writes[0][0])).toContain('/elimination/records/elim-wee');
        expect(String(writes[0][1]?.body ?? '')).toContain('"event_type":"general"');
      });

      await waitFor(() => {
        expect(canvas.getByText('Last visit uncategorized — was it:')).toBeInTheDocument();
      });
    } finally {
      window.fetch = originalFetch;
    }
  },
};
