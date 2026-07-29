import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within, waitFor } from 'storybook/test';
import { withEliminationJournalPage } from '../stories/decorators';
import EliminationJournalPage from './EliminationJournalPage';

const meta = {
  title: 'Pages/EliminationJournalPage',
  component: EliminationJournalPage,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof EliminationJournalPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithRecords: Story = {
  decorators: [withEliminationJournalPage('2024-06-15')],
};

export const AutoTagEnabled: Story = {
  name: 'Auto-tag enabled',
  decorators: [withEliminationJournalPage('2024-06-15', { autoTagEnabled: true })],
};

export const DeepLinkToRecord: Story = {
  name: 'Deep link highlight',
  decorators: [withEliminationJournalPage('2024-06-15', { routeHash: '#record-elim-01' })],
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

export const EmptyDay: Story = {
  decorators: [withEliminationJournalPage('2024-06-16', { empty: true })],
};
