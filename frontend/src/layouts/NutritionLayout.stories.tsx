import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { NutritionLayout } from './NutritionLayout';

const meta = {
  title: 'Layouts/NutritionLayout',
  component: NutritionLayout,
  tags: ['autodocs'],
  render: (_args, { parameters }) => (
    <MemoryRouter initialEntries={[parameters.route ?? '/nutrition']}>
      <Routes>
        <Route path="/nutrition" element={<NutritionLayout />}>
          <Route
            index
            element={
              <section className="panel">
                <p className="eyebrow">Journal</p>
                <p className="muted-text">Outlet content for the active nutrition tab.</p>
              </section>
            }
          />
          <Route
            path="analytics"
            element={
              <section className="panel">
                <p className="eyebrow">Analytics</p>
                <p className="muted-text">Charts render in this outlet.</p>
              </section>
            }
          />
        </Route>
      </Routes>
    </MemoryRouter>
  ),
} satisfies Meta<typeof NutritionLayout>;

export default meta;
type Story = StoryObj<typeof meta>;

export const JournalTab: Story = {
  parameters: { route: '/nutrition' },
};

export const AnalyticsTab: Story = {
  parameters: { route: '/nutrition/analytics' },
};
