import type { Meta, StoryObj } from '@storybook/react-vite';
import { PillDoseIcon } from './PillDoseIcon';
import { PILL_SHAPE_GEOMETRY } from '../../lib/pillDoseCuts';

const meta = {
  title: 'Components/Health/PillDoseIcon',
  component: PillDoseIcon,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof PillDoseIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RoundHalf: Story = {
  args: {
    color: '#6366f1',
    shape: 'round',
    fraction: 'half',
    size: 56,
    showShapeName: true,
  },
};

export const OvalHalf: Story = {
  args: {
    color: '#22c55e',
    shape: 'oval',
    fraction: 'half',
    size: 56,
    showShapeName: true,
  },
};

export const UnsupportedDose: Story = {
  args: {
    color: '#f97316',
    shape: 'capsule',
    fraction: 'half',
    size: 56,
    showShapeName: true,
  },
};

export const AllShapesHalf: Story = {
  args: {
    color: '#6366f1',
    shape: 'round',
    fraction: 'half',
    size: 40,
    showShapeName: false,
  },
  render: () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', maxWidth: '32rem' }}>
      {PILL_SHAPE_GEOMETRY.map((geo) => (
        <PillDoseIcon
          key={geo.id}
          color="#6366f1"
          shape={geo.id}
          fraction="half"
          size={44}
          showShapeName
        />
      ))}
    </div>
  ),
};
