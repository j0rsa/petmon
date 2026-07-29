import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { NotificationCenter } from './NotificationCenter';
import { withNotificationCenter } from '../stories/decorators';

const meta = {
  title: 'Components/NotificationCenter',
  component: NotificationCenter,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof NotificationCenter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithUnreadBadge: Story = {
  decorators: [withNotificationCenter({ unreadCount: 1 })],
};

export const AllRead: Story = {
  decorators: [withNotificationCenter({ unreadCount: 0 })],
};

export const PanelOpen: Story = {
  decorators: [withNotificationCenter({ unreadCount: 1 })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /notification/i }));
    await expect(canvas.getByRole('dialog', { name: 'Notifications' })).toBeInTheDocument();
    await expect(canvas.getByText('Visit duration did not match history for Mittens')).toBeInTheDocument();
  },
};

export const EmptyNotifications: Story = {
  name: 'Empty list',
  decorators: [withNotificationCenter({ unreadCount: 0, notifications: [] })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /notification/i }));
    await expect(canvas.getByText('No notifications yet.')).toBeInTheDocument();
  },
};
