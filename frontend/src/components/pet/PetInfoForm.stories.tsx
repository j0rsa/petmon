import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, fn, userEvent, within } from 'storybook/test';
import { asNarrowStory } from '../../stories/viewport';
import { mockEliminationClassifierStatus, mockPets } from '../../stories/fixtures';
import { PetInfoForm, petToFormState } from './PetInfoForm';

function PetInfoFormDemo({
  initialPet = mockPets[0],
  photoUrl,
  loading = false,
  canManageIntegrations = true,
  canChangeStatus = true,
}: {
  initialPet?: (typeof mockPets)[number];
  photoUrl?: string;
  loading?: boolean;
  canManageIntegrations?: boolean;
  canChangeStatus?: boolean;
}) {
  const [form, setForm] = useState(petToFormState(initialPet));
  const [photo, setPhoto] = useState(photoUrl);

  return (
    <PetInfoForm
      form={form}
      setForm={setForm}
      petId={initialPet.id}
      photoUrl={photo}
      loading={loading}
      canManageIntegrations={canManageIntegrations}
      canChangeStatus={canChangeStatus}
      submitLabel="Save profile"
      onSubmit={fn()}
      onCancel={fn()}
      onPhotoChange={async (file) => {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });
        setPhoto(dataUrl);
      }}
      onPhotoRemove={() => setPhoto(undefined)}
    />
  );
}

const meta = {
  title: 'Components/Pet/PetInfoForm',
  component: PetInfoFormDemo,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof PetInfoFormDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EditProfile: Story = {
  args: {
    initialPet: mockPets[0],
  },
};

export const ProfileWithoutIntegrationAuthority: Story = {
  args: { canManageIntegrations: false, canChangeStatus: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.clear(canvas.getByLabelText('Name'));
    await userEvent.type(canvas.getByLabelText('Name'), 'Updated name');
    await expect(canvas.getByLabelText('Name')).toHaveValue('Updated name');
    await expect(canvas.getByLabelText('Status')).toBeDisabled();
    for (const field of canvas.getAllByLabelText('Chat ID')) await expect(field).toBeDisabled();
    await expect(canvas.getByRole('button', { name: 'Copy from Nutrition' })).toBeDisabled();
  },
};
export const ProfileWithoutIntegrationAuthorityNarrow = asNarrowStory(ProfileWithoutIntegrationAuthority);

export const NewPetDefaults: Story = {
  args: {
    initialPet: {
      id: 'new-pet',
      name: '',
      species: 'cat',
      status: 'active',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    },
  },
};

export const Loading: Story = {
  args: {
    initialPet: mockPets[0],
    loading: true,
  },
};

export const AutoTagEnabled: Story = {
  name: 'Auto-tag enabled',
  decorators: [
    (Story) => {
      const client = new QueryClient({
        defaultOptions: {
          queries: { retry: false, staleTime: Infinity, refetchOnMount: false, refetchOnWindowFocus: false },
        },
      });
      client.setQueryData(['elimination-classifier-status', mockPets[0].id], mockEliminationClassifierStatus);
      client.setQueryData(['me'], { subject: 'dev', email: null, name: 'Dev', display_name: 'Dev', kind: 'dev', scopes: [], roles: ['instance_admin'] });
      return (
        <QueryClientProvider client={client}>
          <Story />
        </QueryClientProvider>
      );
    },
  ],
  args: {
    initialPet: { ...mockPets[0], elimination_auto_categorize_by_duration: true },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText('Auto-tag by duration')).toBeChecked();
    await expect(canvas.getByText(/Typical day:/)).toBeInTheDocument();
    await expect(canvas.getByText(/Model: 142 visits/)).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Retrain now' })).toBeInTheDocument();
  },
};
export const AutoTagEnabledNarrow = asNarrowStory(AutoTagEnabled);
