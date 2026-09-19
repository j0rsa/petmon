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
import { useTime } from './useTime';
import ErrorBoundary from '../components/ErrorBoundary';

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
      getMe: async () => ({ subject: account, email: null, name: null, display_name: account, kind: 'oidc', scopes: ['all'], roles: [] }),
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
function UserDateProbe({ account }: { account: string }) {
  const time = useTime();
  const { selectedPet, pets, setSelectedPetId } = useSelectedPet();
  const [initialTime] = useState(time.nowLocalDateTimeString);
  const [draft, setDraft] = useState('');
  const privateData = useQuery({ queryKey: ['timezone-sensitive'], queryFn: async () => `Private data for ${account}` });
  return <section className="panel">
    <p>Selected pet: {selectedPet?.name ?? 'Loading'}</p>
    <button disabled={pets.length < 2} onClick={() => setSelectedPetId(pets.find((pet) => pet.id !== selectedPet?.id)!.id)}>Switch pet</button>
    <p>User timezone: {time.timeZone}</p>
    <p>Journal day: {time.today}</p>
    <p>Form clock: {time.nowTimeString()}</p>
    <label>Initial form timestamp<input readOnly value={initialTime} /></label>
    <label>Private draft<input value={draft} onChange={(event) => setDraft(event.target.value)} /></label>
    <p>{privateData.data}</p>
  </section>;
}

function UserTimezoneHarness() {
  const [account, setAccount] = useState('west');
  return <div className="page-stack">
    <button onClick={() => setAccount('east')}>Switch timezone account</button>
    <ApplicationExtensionsProvider value={{
      sessionKey: `timezone-user:${account}`,
      timezone: account === 'west' ? 'America/Los_Angeles' : 'Asia/Tokyo',
      now: () => dateLineInstant,
      permissions: async () => allow,
      pets: { key: account, list: async () => mockPets.slice(0, 2), create: async () => mockPets[0] },
    }}><SelectedPetProvider><UserDateProbe account={account} /></SelectedPetProvider></ApplicationExtensionsProvider>
  </div>;
}

export const UserTimezoneIndependentOfPet: Story = {
  render: () => <UserTimezoneHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByText(`Selected pet: ${mockPets[0].name}`)).toBeInTheDocument());
    await expect(canvas.getByText('Journal day: 2025-12-31')).toBeInTheDocument();
    await expect(canvas.getByText('Form clock: 16:30')).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Switch pet' }));
    await expect(canvas.getByText(`Selected pet: ${mockPets[1].name}`)).toBeInTheDocument();
    await expect(canvas.getByText('User timezone: America/Los_Angeles')).toBeInTheDocument();
    await expect(canvas.getByText('Journal day: 2025-12-31')).toBeInTheDocument();
    await expect(canvas.getByLabelText('Initial form timestamp')).toHaveValue('2025-12-31T16:30');
    await userEvent.type(canvas.getByLabelText('Private draft'), 'Do not carry between accounts');
    await userEvent.click(canvas.getByRole('button', { name: 'Switch timezone account' }));
    await waitFor(() => expect(canvas.getByText('Private data for east')).toBeInTheDocument());
    await expect(canvas.queryByText('Private data for west')).not.toBeInTheDocument();
    await expect(canvas.getByText('Journal day: 2026-01-01')).toBeInTheDocument();
    await expect(canvas.getByText('Form clock: 09:30')).toBeInTheDocument();
    await expect(canvas.getByLabelText('Initial form timestamp')).toHaveValue('2026-01-01T09:30');
    await expect(canvas.getByLabelText('Private draft')).toHaveValue('');
  },
};
export const UserTimezoneIndependentOfPetNarrow = asNarrowStory(UserTimezoneIndependentOfPet);

function MissingTimezoneProbe() {
  const { nowLocalDateTimeString } = useTime();
  return <input aria-label="Unsafe timestamp form" value={nowLocalDateTimeString()} readOnly />;
}

export const MissingUserTimezoneFailsClosed: Story = {
  render: () => <ErrorBoundary><ApplicationExtensionsProvider value={{ sessionKey: 'missing-user-zone', permissions: async () => allow }}><MissingTimezoneProbe /></ApplicationExtensionsProvider></ErrorBoundary>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
    await expect(canvas.queryByLabelText('Unsafe timestamp form')).not.toBeInTheDocument();
  },
};
export const MissingUserTimezoneFailsClosedNarrow = asNarrowStory(MissingUserTimezoneFailsClosed);
