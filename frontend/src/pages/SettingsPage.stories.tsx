import type { Meta, StoryObj } from '@storybook/react';
import { withSettings } from '../stories/decorators';
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
