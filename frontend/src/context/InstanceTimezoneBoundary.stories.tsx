import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { InstanceTimezoneBoundary } from './InstanceTimezoneBoundary';
import { ApplicationExtensionsProvider } from './ApplicationExtensions';
import { useResourceTime } from './useResourceTime';
import { mockAppInfo } from '../stories/fixtures';
import { asNarrowStory } from '../stories/viewport';

let resolveInfo: (response: Response) => void = () => {};
let infoRequests = 0;

function ClockForm() {
  const { toCivil } = useResourceTime('resource');
  const [initialClock] = useState(() => toCivil('2026-01-01T00:30:00Z'));
  return <label>Initial resource clock<input aria-label="Initial resource clock" value={initialClock} readOnly /></label>;
}

function Harness() {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  function respond(timezone: string) {
    resolveInfo(new Response(JSON.stringify({ ...mockAppInfo, timezone }), { headers: { 'Content-Type': 'application/json' } }));
  }
  return <QueryClientProvider client={client}>
    <div className="panel page-stack">
      <button onClick={() => respond('Asia/Tokyo')}>Load server timezone</button>
      <button onClick={() => respond('invalid/timezone')}>Load invalid timezone</button>
      <InstanceTimezoneBoundary><ClockForm /></InstanceTimezoneBoundary>
    </div>
  </QueryClientProvider>;
}

const meta = {
  title: 'Embedding/InstanceTimezoneBoundary',
  component: Harness,
  beforeEach: () => {
    const original = window.fetch;
    infoRequests = 0;
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith('/api/v1/info')) {
        infoRequests += 1;
        return new Promise<Response>((resolve) => { resolveInfo = resolve; });
      }
      return original(input, init);
    };
    return () => { window.fetch = original; };
  },
} satisfies Meta<typeof Harness>;
export default meta;
type Story = StoryObj<typeof meta>;

export const WaitsBeforeInitializingForms: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Loading instance timezone…')).toBeInTheDocument();
    await expect(canvas.queryByLabelText('Initial resource clock')).not.toBeInTheDocument();
    await waitFor(() => expect(infoRequests).toBe(1));
    await userEvent.click(canvas.getByRole('button', { name: 'Load server timezone' }));
    await waitFor(() => expect(canvas.getByLabelText('Initial resource clock')).toHaveValue('2026-01-01T09:30:00'));
  },
};
export const WaitsBeforeInitializingFormsNarrow = asNarrowStory(WaitsBeforeInitializingForms);

export const InvalidTimezoneCanRetry: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(infoRequests).toBe(1));
    await userEvent.click(canvas.getByRole('button', { name: 'Load invalid timezone' }));
    await waitFor(() => expect(canvas.getByRole('alert')).toHaveTextContent('valid instance timezone'));
    await expect(canvas.queryByLabelText('Initial resource clock')).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(infoRequests).toBe(2));
    await userEvent.click(canvas.getByRole('button', { name: 'Load server timezone' }));
    await waitFor(() => expect(canvas.getByLabelText('Initial resource clock')).toHaveValue('2026-01-01T09:30:00'));
  },
};

export const EmbeddedResolverDoesNotFetchInfo: Story = {
  render: () => <ApplicationExtensionsProvider value={{
    sessionKey: 'custom-timezone', timezone: () => 'Europe/Berlin',
    permissions: async () => ({ view: false, writeRecords: false, writeProfile: false, manageIntegrations: false, create: false, delete: false, changeStatus: false }),
  }}><ClockForm /></ApplicationExtensionsProvider>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText('Initial resource clock')).toHaveValue('2026-01-01T01:30:00');
    await expect(infoRequests).toBe(0);
  },
};
