import type { Meta, StoryObj } from '@storybook/react-vite';
import type { HealthStateSummaryBucket } from '../../lib/healthStateChart';
import { HealthStateChart } from './HealthStateChart';

const sampleBuckets: HealthStateSummaryBucket[] = [
  { bucket: '2024-06-08', medianScore: 3, minScore: 2, maxScore: 4, count: 2, medianLevel: 'ok' },
  { bucket: '2024-06-10', medianScore: 4, minScore: 4, maxScore: 4, count: 1, medianLevel: 'good' },
  { bucket: '2024-06-12', medianScore: 2.5, minScore: 2, maxScore: 3, count: 2, medianLevel: 'ok' },
  { bucket: '2024-06-14', medianScore: 3, minScore: 3, maxScore: 3, count: 1, medianLevel: 'ok' },
  { bucket: '2024-06-15', medianScore: 5, minScore: 4, maxScore: 5, count: 2, medianLevel: 'amazing' },
];

const meta = {
  title: 'Components/Health/HealthStateChart',
  component: HealthStateChart,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    buckets: sampleBuckets,
    granularity: 'daily' as const,
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 640 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof HealthStateChart>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Daily median line with min/max range and dashed trend when multiple check-ins fall on the same day. */
export const DailyMedian: Story = {};

/** Weekly buckets for longer periods. */
export const WeeklyMedian: Story = {
  args: {
    granularity: 'weekly',
    buckets: [
      { bucket: '2024-05-27', medianScore: 3, minScore: 2, maxScore: 4, count: 5, medianLevel: 'ok' },
      { bucket: '2024-06-03', medianScore: 4, minScore: 3, maxScore: 5, count: 6, medianLevel: 'good' },
      { bucket: '2024-06-10', medianScore: 3.5, minScore: 2, maxScore: 5, count: 8, medianLevel: 'good' },
    ],
  },
};
