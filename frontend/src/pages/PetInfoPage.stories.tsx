import type { Meta, StoryObj } from '@storybook/react-vite';
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
};

/** Pet with no weight records — chart panel shows empty state. */
export const NoWeightData: Story = {
  decorators: [withPetInfoPage(undefined, false)],
};
