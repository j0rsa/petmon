import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ApplicationExtensionsProvider, type ApplicationExtensions } from '../context/ApplicationExtensions';
import { asNarrowStory } from '../stories/viewport';
import { mockPetId } from '../stories/fixtures';
import { NutritionAddForm } from './NutritionAddForm';

const meta = {
  title: 'Nutrition/NutritionAddForm',
  component: NutritionAddForm,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="panel" style={{ maxWidth: 640 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    date: '2024-06-15',
    petId: mockPetId,
    onSave: fn(),
    saving: false,
    isPaused: false,
  },
} satisfies Meta<typeof NutritionAddForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DefaultWetFoodPlusLiquid: Story = {
  parameters: {
    docs: {
      description: {
        story: 'Defaults to Wet food + Liquid with a wet,liquid amount placeholder.',
      },
    },
  },
};

export const Saving: Story = {
  args: {
    saving: true,
  },
};

export const OfflinePaused: Story = {
  args: {
    isPaused: true,
  },
};

export const NarrowMobile: Story = {
  decorators: [
    (Story) => (
      <div className="panel" style={{ maxWidth: 320, width: '100%', overflow: 'hidden' }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        story: 'Confirms the time field stays inside a phone-width card.',
      },
    },
  },
};

const berlinExtensions: ApplicationExtensions = {
  sessionKey: 'timestamp-tests',
  timezone: () => 'Europe/Berlin',
  permissions: async () => ({ view: false, writeRecords: false, writeProfile: false, manageIntegrations: false, create: false, delete: false, changeStatus: false }),
};

export const RepeatedTimeRequiresChoice: Story = {
  args: { date: '2026-10-25', onSave: fn() },
  decorators: [(Story) => <ApplicationExtensionsProvider value={berlinExtensions}><Story /></ApplicationExtensionsProvider>],
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.clear(canvas.getByLabelText('Time'));
    await userEvent.type(canvas.getByLabelText('Time'), '02:30');
    await userEvent.type(canvas.getByLabelText('Amount'), '10,5');
    await userEvent.click(canvas.getByRole('button', { name: /log|add/i }));
    await expect(args.onSave).not.toHaveBeenCalled();
    await userEvent.selectOptions(canvas.getByLabelText('Repeated time occurrence'), '2026-10-25T01:30:00.000Z');
    await userEvent.click(canvas.getByRole('button', { name: /log|add/i }));
    await expect(args.onSave).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ occurred_at: '2026-10-25T01:30:00.000Z', local_date: '2026-10-25' }),
    ]));
  },
};

export const RepeatedTimeNarrow: Story = asNarrowStory(RepeatedTimeRequiresChoice);

export const MissingTimeRejects: Story = {
  ...RepeatedTimeRequiresChoice,
  args: { date: '2026-03-29', onSave: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.clear(canvas.getByLabelText('Time'));
    await userEvent.type(canvas.getByLabelText('Time'), '02:30');
    await userEvent.type(canvas.getByLabelText('Amount'), '10,5');
    await expect(canvas.getByRole('alert')).toHaveTextContent('does not exist in Europe/Berlin');
    await userEvent.click(canvas.getByRole('button', { name: /log|add/i }));
    await expect(args.onSave).not.toHaveBeenCalled();
  },
};
