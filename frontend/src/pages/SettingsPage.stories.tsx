import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { withSettings } from '../stories/decorators';
import { mockCreatedToken } from '../stories/fixtures';
import type { ApiTokenCreated } from '../api/settings';
import SettingsPage from './SettingsPage';
import { expect, userEvent, within } from 'storybook/test';
import { asNarrowStory } from '../stories/viewport';

const meta = {
  title: 'Pages/SettingsPage',
  component: SettingsPage,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="content" style={{ maxWidth: 820, padding: '2rem' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SettingsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** All three sections fully configured. */
export const AllConfigured: Story = {
  decorators: [withSettings({ oidc: 'configured', telegram: 'configured', tokens: 'populated' })],
};

export const PersonalSettingsOnly: Story = {
  decorators: [withSettings({ admin: false })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'API tokens' })).toBeInTheDocument();
    await expect(canvas.queryByRole('heading', { name: 'Telegram' })).not.toBeInTheDocument();
    await expect(canvas.queryByRole('heading', { name: 'Instance API tokens' })).not.toBeInTheDocument();
  },
};
export const PersonalSettingsOnlyNarrow = asNarrowStory(PersonalSettingsOnly);

export const AdministratorWithReadOnlyCredential: Story = {
  decorators: [withSettings({ scopes: ['api_read'], usingApiToken: true })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('heading', { name: 'Telegram' })).not.toBeInTheDocument();
    await expect(canvas.queryByRole('heading', { name: 'Instance API tokens' })).not.toBeInTheDocument();
    await expect(canvas.queryByRole('button', { name: '+ Create token' })).not.toBeInTheDocument();
    for (const button of canvas.getAllByRole('button', { name: 'Edit scopes' })) await expect(button).toBeDisabled();
  },
};
export const AdministratorWithReadOnlyCredentialNarrow = asNarrowStory(AdministratorWithReadOnlyCredential);

export const AdministratorWithNarrowScopes: Story = {
  decorators: [withSettings({ scopes: ['api_read', 'api_write', 'mcp'], usingApiToken: true })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('heading', { name: 'Instance API tokens' })).not.toBeInTheDocument();
    await expect(canvas.queryByRole('heading', { name: 'Telegram' })).not.toBeInTheDocument();
    const scopeInput = canvas.getByPlaceholderText('Add scope…');
    await userEvent.click(scopeInput);
    const picker = within(scopeInput.closest('.tag-input') as HTMLElement);
    await expect(picker.queryByText('all')).not.toBeInTheDocument();
    await expect(picker.queryByText('instance_admin')).not.toBeInTheDocument();
    await expect(picker.getByText('api_write')).toBeInTheDocument();
  },
};
export const AdministratorWithNarrowScopesNarrow = asNarrowStory(AdministratorWithNarrowScopes);

/** Fresh install — nothing set up yet. */
export const BlankSlate: Story = {
  decorators: [withSettings({ oidc: 'empty', telegram: 'empty', tokens: 'empty' })],
};

/** OIDC configured, Telegram not, no tokens. */
export const OidcOnlyConfigured: Story = {
  decorators: [withSettings({ oidc: 'configured', telegram: 'empty', tokens: 'empty' })],
};

/** Telegram configured, OIDC not, no tokens. */
export const TelegramOnlyConfigured: Story = {
  decorators: [withSettings({ oidc: 'empty', telegram: 'configured', tokens: 'empty' })],
};

/** Loading state for all sections. */
export const Loading: Story = {
  decorators: [withSettings({ loading: true })],
};

/** OIDC session — shows "Remember this device" panel above the token list. */
export const RememberDevicePrompt: Story = {
  decorators: [withSettings({ oidc: 'configured', telegram: 'configured', tokens: 'populated', usingApiToken: false })],
};

/** Browser already holding an API token — shows info banner and current-token highlight. */
export const UsingDeviceToken: Story = {
  decorators: [withSettings({ oidc: 'configured', telegram: 'configured', tokens: 'populated', usingApiToken: true })],
};

/** Token just created — shows the one-time reveal banner. */
export const TokenJustCreated: StoryObj<{ token: ApiTokenCreated }> = {
  render: () => <TokenRevealBannerPreview />,
};

function TokenRevealBannerPreview() {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(mockCreatedToken.token).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="content" style={{ maxWidth: 820, padding: '2rem' }}>
      <div style={{ background: 'var(--success-bg)', border: '1px solid var(--success-border)', borderRadius: 12, padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <p style={{ fontSize: '0.88rem', fontWeight: 600 }}>Token created — copy it now, it won't be shown again.</p>
        <input
          readOnly
          value={mockCreatedToken.token}
          onFocus={(e) => e.target.select()}
          style={{ fontFamily: 'monospace', fontSize: '0.82rem', width: '100%', boxSizing: 'border-box' }}
        />
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="button button-secondary" type="button" onClick={handleCopy}>
            {copied ? 'Copied!' : 'Copy token'}
          </button>
          <button className="button button-secondary" type="button">
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
