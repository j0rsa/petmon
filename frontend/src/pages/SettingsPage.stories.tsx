import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { withSettings } from '../stories/decorators';
import { mockCreatedToken } from '../stories/fixtures';
import type { ApiTokenCreated } from '../api/settings';
import SettingsPage from './SettingsPage';

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
