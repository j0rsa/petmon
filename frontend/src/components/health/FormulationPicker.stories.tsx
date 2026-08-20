import type { Meta, StoryObj } from '@storybook/react-vite';
import { FormulationPicker, defaultFormulationPickerValue } from './FormulationPicker';
import { useState } from 'react';

const meta = {
  title: 'Components/Health/FormulationPicker',
  component: FormulationPicker,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof FormulationPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    color: '#6366f1',
    value: defaultFormulationPickerValue,
    onChange: () => {},
  },
  render: (args) => {
    const [value, setValue] = useState(args.value);
    return <FormulationPicker color={args.color} value={value} onChange={setValue} />;
  },
};

export const OneMgWhole: Story = {
  args: {
    color: '#22c55e',
    value: {
      tabletStrengthMg: '1',
      pillShape: 'round_2_precut',
      doseFraction: 'whole',
    },
    onChange: () => {},
  },
  render: (args) => {
    const [value, setValue] = useState(args.value);
    return <FormulationPicker color={args.color} value={value} onChange={setValue} />;
  },
};
