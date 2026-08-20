import type { Meta, StoryObj } from '@storybook/react-vite';
import { MedIcon } from './MedIcon';

const meta = {
  title: 'Components/Health/MedIcon',
  component: MedIcon,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof MedIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PillHalf: Story = {
  args: {
    medType: 'pill',
    color: '#6366f1',
    pillShape: 'round_1_precut',
    doseFraction: 'half',
    size: 48,
  },
};

export const PillThreeQuarter: Story = {
  args: {
    medType: 'pill',
    color: '#ec4899',
    pillShape: 'round_2_precut',
    doseFraction: 'three_quarter',
    size: 48,
  },
};

export const PillWhole: Story = {
  args: {
    medType: 'pill',
    color: '#22c55e',
    pillShape: 'round_2_precut',
    doseFraction: 'whole',
    size: 48,
  },
};

export const LiquidBottle: Story = {
  args: {
    medType: 'liquid',
    color: '#f97316',
    size: 48,
  },
};
