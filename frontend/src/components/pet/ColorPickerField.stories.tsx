import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { ColorPickerField } from './ColorPickerField';

const meta = {
  title: 'Components/Pet/ColorPickerField',
  component: ColorPickerField,
  tags: ['autodocs'],
  args: {
    id: 'color',
    onChange: fn(),
  },
} satisfies Meta<typeof ColorPickerField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithValue: Story = {
  args: { value: '#c4a882', placeholder: '#rrggbb' },
};

export const Empty: Story = {
  args: { value: '', placeholder: '#rrggbb' },
};

export const InvalidHex: Story = {
  args: { value: 'notacolor', placeholder: '#rrggbb' },
};
