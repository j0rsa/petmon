import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { withLayoutData } from '../stories/decorators';
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
  decorators: [withLayoutData],
} satisfies Meta<typeof Layout>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithNotifications: Story = {
  name: 'With notification bell',
  parameters: {
    docs: {
      description: {
        story: 'Desktop shows the global notification bell; mobile uses the bottom-nav pet tab red dot and sheet.',
      },
    },
  },
};

export const Mobile: Story = {
  parameters: { viewport: { defaultViewport: 'pwaMobile' } },
};

export const MobileWithNotifications: Story = {
  name: 'Mobile with unread dot',
  parameters: {
    viewport: { defaultViewport: 'pwaMobile' },
    docs: {
      description: {
        story: 'Mobile bottom bar: Home, Food, Toilet, Health, and pet tab. Settings lives in the pet sheet.',
      },
    },
  },
};
