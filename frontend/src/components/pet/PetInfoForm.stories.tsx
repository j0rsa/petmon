import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fn } from 'storybook/test';
import { mockEliminationDurationProfile, mockPets } from '../../stories/fixtures';
import { PetInfoForm, petToFormState } from './PetInfoForm';

function PetInfoFormDemo({
  initialPet = mockPets[0],
  photoUrl,
  loading = false,
}: {
  initialPet?: (typeof mockPets)[number];
  photoUrl?: string;
  loading?: boolean;
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
      client.setQueryData(['elimination-duration-profile', mockPets[0].id], mockEliminationDurationProfile);
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
};
