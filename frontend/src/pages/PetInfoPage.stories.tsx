import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { withPetInfoPage } from '../stories/decorators';
import PetInfoPage from './PetInfoPage';

const meta = {
  title: 'Pages/PetInfoPage',
  component: PetInfoPage,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof PetInfoPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Full pet profile with weight chart. */
export const WithWeightHistory: Story = {
  decorators: [withPetInfoPage()],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Mittens' })).toBeInTheDocument();
    await expect(canvas.getByText('Auto-tag by duration')).toBeInTheDocument();
    await expect(canvas.getByText('Disabled')).toBeInTheDocument();
  },
};

/** Pet with no weight records — chart panel shows empty state. */
export const NoWeightData: Story = {
  decorators: [withPetInfoPage(undefined, false)],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('No weight records yet.')).toBeInTheDocument();
  },
};

/** Auto-tag enabled: view mode shows classifier baselines and model status. */
export const AutoTagEnabled: Story = {
  name: 'Auto-tag enabled',
  decorators: [withPetInfoPage(undefined, true, true)],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Mittens' })).toBeInTheDocument();
    await expect(canvas.getByText('Enabled')).toBeInTheDocument();
    await expect(canvas.getByText(/Typical day:/)).toBeInTheDocument();
    await expect(canvas.getByText(/Model: 142 visits/)).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Retrain now' })).toBeInTheDocument();
  },
};

/** Auto-tag panel stays left-aligned on narrow screens (classifier stats are not centered). */
export const AutoTagEnabledMobile: Story = {
  name: 'Auto-tag enabled (mobile)',
  parameters: { viewport: { defaultViewport: 'pwaMobile' } },
  decorators: [withPetInfoPage(undefined, true, true)],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const panel = canvas.getByText(/Typical day:/).closest('.pet-elimination-auto-tag');
    expect(panel).toBeTruthy();
    expect(getComputedStyle(panel!).textAlign).toBe('left');
  },
};

/** Edit mode with auto-tag checkbox and classifier panel. */
export const AutoTagEditMode: Story = {
  name: 'Auto-tag edit mode',
  decorators: [withPetInfoPage(undefined, true, true)],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Edit profile' }));
    await expect(canvas.getByLabelText('Auto-tag by duration')).toBeChecked();
    await expect(canvas.getByText(/Typical day:/)).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Retrain now' })).toBeInTheDocument();
  },
};
