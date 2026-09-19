import { StrictMode, useEffect, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { useQuery } from '@tanstack/react-query';
import { ApplicationExtensionsProvider, type ApplicationExtensions, type ResourcePermissions } from './ApplicationExtensions';
import { SelectedPetProvider, useSelectedPet } from './SelectedPetContext';
import { usePermissions } from './usePermissions';
import { asNarrowStory } from '../stories/viewport';
import { mockPets } from '../stories/fixtures';
import { StandaloneSessionBoundary } from './StandaloneSessionBoundary';
import { clearToken, getStoredToken, storeToken } from '../lib/auth';
import App from '../App';
import { MemoryRouter } from 'react-router-dom';
import { useResourceTime } from './useResourceTime';
import { resourceDateTime } from '../lib/resourceTime';

const allow: ResourcePermissions = { view: true, writeRecords: true, writeProfile: true, manageIntegrations: true, create: true, delete: true, changeStatus: true };
const deny: ResourcePermissions = { view: false, writeRecords: false, writeProfile: false, manageIntegrations: false, create: false, delete: false, changeStatus: false };

function Guard() { return null; }

function deferredResponse() {
  let resolve: (value: string) => void = () => {};
  const promise = new Promise<string>((done) => { resolve = done; });
  return { promise, resolve };
}

function ExtensionHarness({ failPermissions = false }: { failPermissions?: boolean }) {
  const [account, setAccount] = useState('first');
  const [pending, setPending] = useState(true);
  const [late] = useState(deferredResponse);
  const value: ApplicationExtensions = {
    sessionKey: `${account}:${pending}`,
    session: {
      Guard,
      signOut: async () => {},
      getMe: async () => ({ subject: account, email: null, name: null, display_name: account, kind: 'oidc', scopes: ['all'], capabilities: ['api_read', 'api_write', 'mcp'] }),
    },
    pets: { key: account, list: async () => account === 'first' ? [mockPets[0]] : [], create: async () => mockPets[0] },
    permissions: async (id) => {
      if (failPermissions) throw new Error('Permission lookup unavailable');
      if (pending) return new Promise<ResourcePermissions>(() => {});
      return id === 'restricted' ? deny : allow;
    },
  };
  return <div className="page-stack">
    <div className="button-row">
      <button onClick={() => setPending(false)}>Resolve permissions</button>
      <button onClick={() => setAccount('second')}>Switch account</button>
      <button onClick={() => late.resolve('Old private response')}>Release old request</button>
    </div>
    <StrictMode><ApplicationExtensionsProvider value={value}>
      <SelectedPetProvider><Probe account={account} late={late.promise} /></SelectedPetProvider>
    </ApplicationExtensionsProvider></StrictMode>
  </div>;
}

function Probe({ account, late }: { account: string; late: Promise<string> }) {
  const { pets } = useSelectedPet();
  const selected = usePermissions();
  const linked = usePermissions('restricted');
  const result = useQuery({ queryKey: ['sensitive'], queryFn: () => account === 'first' ? late : Promise.resolve('New account data') });
  return <section className="panel">
    <p>Visible pets: {pets.length}</p>
    <p>{selected.loaded ? 'Access checked' : 'Checking access'}</p>
    <button disabled={!selected.canWrite}>Record care</button>
    <button disabled={!linked.canWriteProfile}>Edit linked profile</button>
    <p>{result.data ?? 'Waiting for data'}</p>
  </section>;
}

const meta = { title: 'Embedding/ApplicationExtensions', component: ExtensionHarness } satisfies Meta<typeof ExtensionHarness>;
export default meta;
type Story = StoryObj<typeof meta>;

export const SessionIsolationAndPermissions: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Record care' })).toBeDisabled();
    await expect(canvas.getByRole('button', { name: 'Edit linked profile' })).toBeDisabled();
    await userEvent.click(canvas.getByRole('button', { name: 'Resolve permissions' }));
    await waitFor(() => expect(canvas.getByRole('button', { name: 'Record care' })).toBeEnabled());
    await expect(canvas.getByRole('button', { name: 'Edit linked profile' })).toBeDisabled();
    await expect(canvas.getByText('Visible pets: 1')).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Switch account' }));
    await waitFor(() => expect(canvas.getByText('New account data')).toBeInTheDocument());
    await userEvent.click(canvas.getByRole('button', { name: 'Release old request' }));
    await expect(canvas.getByText('Visible pets: 0')).toBeInTheDocument();
    await expect(canvas.queryByText('Old private response')).not.toBeInTheDocument();
  },
};
export const SessionIsolationAndPermissionsNarrow = asNarrowStory(SessionIsolationAndPermissions);

export const FailedPermissions: Story = {
  args: { failPermissions: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByText('Access checked')).toBeInTheDocument());
    await expect(canvas.getByRole('button', { name: 'Record care' })).toBeDisabled();
    await expect(canvas.getByRole('button', { name: 'Edit linked profile' })).toBeDisabled();
  },
};
export const FailedPermissionsNarrow = asNarrowStory(FailedPermissions);

function StandaloneHarness() {
  useEffect(() => {
    const original = getStoredToken();
    return () => { if (original) storeToken(original); else clearToken(); };
  }, []);
  return <div className="page-stack">
    <button onClick={() => storeToken('boundary-test-next')}>Switch credential</button>
    <StrictMode><StandaloneSessionBoundary><StandaloneProbe /></StandaloneSessionBoundary></StrictMode>
  </div>;
}

function StandaloneProbe() {
  const [draft, setDraft] = useState('');
  const result = useQuery({ queryKey: ['sensitive'], queryFn: async () => getStoredToken() === 'boundary-test-next' ? 'New account data' : 'Old account data' });
  return <section className="panel"><label>Private draft<input value={draft} onChange={(event) => setDraft(event.target.value)} /></label><p>{result.data}</p></section>;
}

export const StandaloneCredentialIsolation: Story = {
  render: () => <StandaloneHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByText('Old account data')).toBeInTheDocument());
    await userEvent.type(canvas.getByLabelText('Private draft'), 'Private unsaved draft');
    await userEvent.click(canvas.getByRole('button', { name: 'Switch credential' }));
    await waitFor(() => expect(canvas.getByText('New account data')).toBeInTheDocument());
    await expect(canvas.getByLabelText('Private draft')).toHaveValue('');
    await expect(canvas.queryByText('Old account data')).not.toBeInTheDocument();
  },
};
export const StandaloneCredentialIsolationNarrow = asNarrowStory(StandaloneCredentialIsolation);

function WaitingGuard() { return <p>Preparing custom sign-in…</p>; }

export const CustomAuthenticationWaits: Story = {
  render: () => <ApplicationExtensionsProvider value={{ sessionKey: 'waiting', permissions: async () => deny, session: { Guard: WaitingGuard, getMe: async () => { throw new Error('Not authenticated'); }, signOut: async () => {} } }}><MemoryRouter><App /></MemoryRouter></ApplicationExtensionsProvider>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Preparing custom sign-in…')).toBeInTheDocument();
    await expect(canvas.queryByText('Redirecting to sign-in…')).not.toBeInTheDocument();
    await expect(canvas.queryByRole('navigation')).not.toBeInTheDocument();
  },
};
export const CustomAuthenticationWaitsNarrow = asNarrowStory(CustomAuthenticationWaits);

const dateLineInstant = new Date('2026-01-01T00:30:00Z');
function ResourceDateProbe() {
  const west = useResourceTime('west');
  const east = useResourceTime('east');
  return <section className="panel">
    <p>Browser day: {resourceDateTime(dateLineInstant).slice(0, 10)}</p>
    <p>West journal: {west.today}</p>
    <p>East medication day: {east.today}</p>
    <p>West form time: {west.nowTimeString()}</p>
    <p>East form time: {east.nowTimeString()}</p>
  </section>;
}
export const ResourceDatesAcrossTimezones: Story = {
  render: () => <ApplicationExtensionsProvider value={{ sessionKey: 'timezone-test', timezone: (id) => id === 'west' ? 'America/Los_Angeles' : 'Asia/Tokyo', now: () => dateLineInstant, permissions: async () => allow }}><ResourceDateProbe /></ApplicationExtensionsProvider>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('West journal: 2025-12-31')).toBeInTheDocument();
    await expect(canvas.getByText('East medication day: 2026-01-01')).toBeInTheDocument();
    await expect(canvas.getByText('West form time: 16:30')).toBeInTheDocument();
    await expect(canvas.getByText('East form time: 09:30')).toBeInTheDocument();
    const browserDay = resourceDateTime(dateLineInstant).slice(0, 10);
    expect(['2025-12-31', '2026-01-01'].some((day) => day !== browserDay)).toBe(true);
  },
};
export const ResourceDatesAcrossTimezonesNarrow = asNarrowStory(ResourceDatesAcrossTimezones);
