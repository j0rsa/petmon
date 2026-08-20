import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { MedIconPicker, defaultMedIconPickerValue } from './MedIconPicker';
import { useState } from 'react';

const meta = {
  title: 'Components/Health/MedIconPicker',
  component: MedIconPicker,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof MedIconPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PillDefault: Story = {
  args: {
    value: defaultMedIconPickerValue,
    onChange: fn(),
  },
  render: (args) => {
    const [value, setValue] = useState(args.value);
    return <MedIconPicker value={value} onChange={setValue} />;
  },
};

export const Liquid: Story = {
  args: {
    value: {
      ...defaultMedIconPickerValue,
      medType: 'liquid',
      color: '#f97316',
    },
    onChange: fn(),
  },
  render: (args) => {
    const [value, setValue] = useState(args.value);
    return <MedIconPicker value={value} onChange={setValue} />;
  },
};

export const StaticPill: Story = {
  args: {
    value: {
      medType: 'pill',
      pillShape: 'round_2_precut',
      pillFraction: 'quarter',
      color: '#22c55e',
    },
    onChange: fn(),
  },
};
