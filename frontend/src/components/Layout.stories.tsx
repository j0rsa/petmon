import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './Layout';

const meta = {
  title: 'Layouts/Layout',
  component: Layout,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
  render: () => (
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<Layout />}>
          <Route
            index
            element={
              <div className="page-stack">
                <section className="panel">
                  <p className="eyebrow">Story</p>
                  <h2>Main content area</h2>
                  <p className="muted-text">Outlet content renders here.</p>
                </section>
              </div>
            }
          />
        </Route>
      </Routes>
    </MemoryRouter>
  ),
} satisfies Meta<typeof Layout>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Mobile: Story = {
  parameters: { viewport: { defaultViewport: 'pwaMobile' } },
};
