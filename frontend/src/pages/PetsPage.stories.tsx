import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { withPetsPage } from '../stories/decorators';
import PetsPage from './PetsPage';

const meta = {
  title: 'Pages/PetsPage',
  component: PetsPage,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof PetsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Pet cards first; create form stays collapsed until Add a pet. */
export const WithPets: Story = {
  decorators: [withPetsPage()],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Manage pet profiles' })).toBeInTheDocument();
    await expect(canvas.getByRole('heading', { name: 'Mittens' })).toBeInTheDocument();
    await expect(canvas.queryByRole('heading', { name: 'Create a new profile' })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Add a pet' }));
    await expect(canvas.getByRole('heading', { name: 'Create a new profile' })).toBeInTheDocument();
    await expect(canvas.getByLabelText('Name')).toBeInTheDocument();
  },
};

/** Empty state prompts creating the first pet. */
export const Empty: Story = {
  decorators: [withPetsPage({ empty: true })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('No pets yet.')).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Add your first pet' }));
    await expect(canvas.getByRole('heading', { name: 'Create a new profile' })).toBeInTheDocument();
  },
};
