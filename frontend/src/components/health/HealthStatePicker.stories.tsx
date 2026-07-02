import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import type { HealthStateLevel } from '../../lib/healthState';
import { HealthStatePicker } from './HealthStatePicker';

const meta = {
  title: 'Components/Health/HealthStatePicker',
  component: HealthStatePicker,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    value: null,
    onChange: fn(),
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 320 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof HealthStatePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

function PickerDemo({ initial = null, disabled = false }: { initial?: HealthStateLevel | null; disabled?: boolean }) {
  const [value, setValue] = useState<HealthStateLevel | null>(initial);
  return <HealthStatePicker value={value} onChange={setValue} disabled={disabled} />;
}

/** Default picker — OK sits in the centre, Amazing top-right, Terrible on the left. */
export const Default: Story = {
  render: () => <PickerDemo />,
};

/** Pre-selected OK state. */
export const SelectedOk: Story = {
  render: () => <PickerDemo initial="ok" />,
};

/** Pre-selected Amazing state. */
export const SelectedAmazing: Story = {
  render: () => <PickerDemo initial="amazing" />,
};

/** Pre-selected Terrible state. */
export const SelectedTerrible: Story = {
  render: () => <PickerDemo initial="terrible" />,
};

/** Read-only display for viewers without write access. */
export const Disabled: Story = {
  render: () => <PickerDemo initial="good" disabled />,
};
