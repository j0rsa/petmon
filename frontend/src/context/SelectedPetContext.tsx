import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { petsApi } from '../api/pets';
import type { Pet } from '../types';

const STORAGE_KEY = 'petmon-selected-pet-id';

function readStoredPetId() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

interface SelectedPetContextValue {
  pets: Pet[];
  petsLoading: boolean;
  selectedPetId: string | null;
  selectedPet: Pet | null;
  setSelectedPetId: (id: string) => void;
}

const SelectedPetContext = createContext<SelectedPetContextValue | null>(null);

interface SelectedPetProviderProps {
  children: ReactNode;
  /** Storybook / tests — skips localStorage on first render. */
  initialPetId?: string;
}

export function SelectedPetProvider({ children, initialPetId }: SelectedPetProviderProps) {
  const petsQuery = useQuery({ queryKey: ['pets'], queryFn: petsApi.list });
  const pets = useMemo(() => petsQuery.data ?? [], [petsQuery.data]);

  const [selectedPetId, setSelectedPetIdState] = useState<string | null>(initialPetId ?? readStoredPetId);

  const setSelectedPetId = useCallback((id: string) => {
    setSelectedPetIdState(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // ignore storage errors
    }
  }, []);

  useEffect(() => {
    if (pets.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedPetIdState(null);
      return;
    }

    if (selectedPetId && pets.some((pet) => pet.id === selectedPetId)) {
      return;
    }

    setSelectedPetId(pets[0].id);
  }, [pets, selectedPetId, setSelectedPetId]);

  const selectedPet = useMemo(() => pets.find((pet) => pet.id === selectedPetId) ?? null, [pets, selectedPetId]);

  const value = useMemo(
    () => ({
      pets,
      petsLoading: petsQuery.isLoading,
      selectedPetId,
      selectedPet,
      setSelectedPetId,
    }),
    [pets, petsQuery.isLoading, selectedPetId, selectedPet, setSelectedPetId],
  );

  return <SelectedPetContext.Provider value={value}>{children}</SelectedPetContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSelectedPet() {
  const context = useContext(SelectedPetContext);
  if (!context) {
    throw new Error('useSelectedPet must be used within SelectedPetProvider');
  }
  return context;
}
