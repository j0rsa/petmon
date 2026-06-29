import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { TagInput } from './TagInput';

const ALL_SCOPES = ['all', 'api_read', 'api_write', 'mcp'];

const meta = {
  title: 'Components/TagInput',
  component: TagInput,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    value: [],
    options: ALL_SCOPES,
    onChange: () => {},
    placeholder: 'Add scope…',
  },
  decorators: [
    (Story: () => React.ReactNode) => (
      <div style={{ maxWidth: 360 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TagInput>;

export default meta;
type Story = StoryObj<typeof meta>;

function Controlled({ initial }: { initial: string[] }) {
  const [value, setValue] = useState(initial);
  return (
    <TagInput
      value={value}
      options={ALL_SCOPES}
      onChange={setValue}
      placeholder="Add scope…"
    />
  );
}

/** Empty — shows placeholder and full dropdown on focus */
export const Empty: Story = {
  render: () => <Controlled initial={[]} />,
};

/** Pre-populated with all scope */
export const AllScope: Story = {
  render: () => <Controlled initial={['all']} />,
};

/** Mixed read/write scopes */
export const ReadWrite: Story = {
  render: () => <Controlled initial={['api_read', 'mcp']} />,
};

/** All options selected — input hidden */
export const AllSelected: Story = {
  render: () => <Controlled initial={ALL_SCOPES} />,
};

/** Disabled state */
export const Disabled: Story = {
  args: {
    value: ['api_read', 'mcp'],
    options: ALL_SCOPES,
    onChange: () => {},
    disabled: true,
  },
};
