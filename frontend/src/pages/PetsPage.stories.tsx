import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { withPetsPage } from '../stories/decorators';
import { asNarrowStory } from '../stories/viewport';
import PetsPage from './PetsPage';

function assertBadgesDoNotBreakName(canvasElement: HTMLElement, petName: string) {
  const heading = within(canvasElement).getByRole('heading', { name: petName });
  const header = heading.closest('.pet-list-card-header');
  expect(header, `${petName} card header`).toBeTruthy();
  const breed = header!.querySelector('.muted-text');
  const badges = header!.querySelector('.pet-list-card-badges');
  expect(breed, `${petName} breed`).toBeTruthy();
  expect(badges, `${petName} badges`).toBeTruthy();
  const nameBox = heading.getBoundingClientRect();
  const breedBox = breed!.getBoundingClientRect();
  const badgeBox = badges!.getBoundingClientRect();
  expect(breedBox.top, `${petName} breed should stay under the name`).toBeGreaterThanOrEqual(nameBox.bottom - 2);
  const sitsBesideName = badgeBox.left >= nameBox.right - 2;
  if (!sitsBesideName) {
    expect(badgeBox.top, `${petName} badges should wrap below the name`).toBeGreaterThanOrEqual(nameBox.bottom - 2);
    expect(breedBox.top, `${petName} breed should sit below the wrapped badges`).toBeGreaterThanOrEqual(badgeBox.bottom - 2);
  }
}

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
    await expect(canvas.getByRole('heading', { name: 'Move to Cloud instance' })).toBeInTheDocument();
    await expect(canvas.getByRole('heading', { name: 'Mittens' })).toBeInTheDocument();
    assertBadgesDoNotBreakName(canvasElement, 'Mittens');
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

export const WithPetsNarrow = asNarrowStory(WithPets);
export const EmptyNarrow = asNarrowStory(Empty);
