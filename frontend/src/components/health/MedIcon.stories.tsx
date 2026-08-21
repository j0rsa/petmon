import type { Meta, StoryObj } from '@storybook/react-vite';
import { MedIcon } from './MedIcon';
import { PILL_SHAPES } from '../../lib/medications';

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
    pillShape: 'round',
    doseFraction: 'half',
    size: 48,
  },
};

export const PillThreeQuarter: Story = {
  args: {
    medType: 'pill',
    color: '#ec4899',
    pillShape: 'round',
    doseFraction: 'three_quarter',
    size: 48,
  },
};

export const OvalQuarter: Story = {
  args: {
    medType: 'pill',
    color: '#22c55e',
    pillShape: 'oval',
    doseFraction: 'quarter',
    size: 48,
  },
};

export const AllShapes: Story = {
  args: {
    medType: 'pill',
    color: '#6366f1',
    pillShape: 'round',
    doseFraction: 'half',
    size: 40,
  },
  render: () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.75rem', maxWidth: '28rem' }}>
      {PILL_SHAPES.map((shape) => (
        <div key={shape} style={{ textAlign: 'center' }}>
          <MedIcon medType="pill" color="#6366f1" pillShape={shape} doseFraction="half" size={40} />
        </div>
      ))}
    </div>
  ),
};

export const LiquidBottle: Story = {
  args: {
    medType: 'liquid',
    color: '#f97316',
    size: 48,
  },
};
