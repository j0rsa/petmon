import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { MedColorSwatch } from './MedColorSwatch';

const meta = {
  title: 'Components/Health/MedColorSwatch',
  component: MedColorSwatch,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof MedColorSwatch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    color: '#6366f1',
    onChange: () => {},
  },
  render: (args) => {
    const [color, setColor] = useState(args.color);
    return <MedColorSwatch color={color} onChange={setColor} />;
  },
};
