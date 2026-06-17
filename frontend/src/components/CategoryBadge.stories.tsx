import type { Meta, StoryObj } from '@storybook/react-vite';
import { CategoryBadge } from './CategoryBadge';

const meta = {
  title: 'UI/CategoryBadge',
  component: CategoryBadge,
  tags: ['autodocs'],
} satisfies Meta<typeof CategoryBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WetFood: Story = {
  args: { category: 'wet_food' },
};

export const Water: Story = {
  args: { category: 'water' },
};

export const Liquids: Story = {
  args: { category: 'liquids' },
};

export const UnknownCategory: Story = {
  args: { category: 'custom_label' },
};
