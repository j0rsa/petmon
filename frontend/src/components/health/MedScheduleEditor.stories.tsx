import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { MedScheduleEditor, defaultMedFrequency } from './MedScheduleEditor';

const meta = {
  title: 'Components/Health/MedScheduleEditor',
  component: MedScheduleEditor,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof MedScheduleEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DailyMorning: Story = {
  args: {
    value: defaultMedFrequency,
    onChange: () => {},
  },
  render: (args) => {
    const [value, setValue] = useState(args.value);
    return <MedScheduleEditor value={value} onChange={setValue} />;
  },
};

export const EveryThreeDaysEvening: Story = {
  args: {
    value: {
      morning: 0,
      midday: 0,
      evening: 1,
      every: 3,
      unit: 'days',
    },
    onChange: () => {},
  },
  render: (args) => {
    const [value, setValue] = useState(args.value);
    return <MedScheduleEditor value={value} onChange={setValue} />;
  },
};
