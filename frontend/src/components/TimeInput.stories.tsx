import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { TimeInput } from './TimeInput';
import { nowTimeString } from '../lib/time';

const meta = {
  title: 'UI/TimeInput',
  component: TimeInput,
  tags: ['autodocs'],
  args: {
    value: '08:30',
    onChange: () => {},
  },
} satisfies Meta<typeof TimeInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Interactive: Story = {
  render: () => {
    const [time, setTime] = useState(nowTimeString);
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontFamily: 'monospace', fontSize: '0.88rem' }}>
        <TimeInput value={time} onChange={setTime} />
        <span style={{ color: 'var(--text-muted)' }}>→ {time}:00</span>
      </div>
    );
  },
};

export const WithAutoFocus: Story = {
  args: { value: '14:00', autoFocus: true },
};
