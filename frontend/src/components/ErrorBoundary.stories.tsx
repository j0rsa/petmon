import type { Meta, StoryObj } from '@storybook/react-vite';
import ErrorBoundary from './ErrorBoundary';

function HealthyChild() {
  return (
    <div className="panel">
      <p>Content rendered successfully.</p>
    </div>
  );
}

function BrokenChild() {
  throw new Error('Storybook demo error');
}

const meta = {
  title: 'Components/ErrorBoundary',
  component: ErrorBoundary,
  tags: ['autodocs'],
} satisfies Meta<typeof ErrorBoundary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Healthy: Story = {
  render: () => (
    <ErrorBoundary>
      <HealthyChild />
    </ErrorBoundary>
  ),
};

export const WithError: Story = {
  tags: ['skip-test'],
  render: () => (
    <ErrorBoundary>
      <BrokenChild />
    </ErrorBoundary>
  ),
};
