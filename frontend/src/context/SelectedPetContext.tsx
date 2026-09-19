import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { petsApi } from '../api/pets';
import { readStoredPetId, resolveSelectedPetId, writeStoredPetId } from '../lib/selectedPetStorage';
import type { Pet } from '../types';
import { useApplicationExtensions } from './ApplicationExtensions';

interface SelectedPetContextValue {
  pets: Pet[];
  petsLoading: boolean;
  petsError: Error | null;
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
  const extension = useApplicationExtensions()?.pets;
  const petsQuery = useQuery({ queryKey: extension ? ['pets', 'collection', extension.key] : ['pets'], queryFn: ({ signal }) => extension ? extension.list(signal) : petsApi.list() });
  const pets = useMemo(() => petsQuery.data ?? [], [petsQuery.data]);

  const [storedPetId, setSelectedPetIdState] = useState<string | null>(() => initialPetId ?? (extension?.persistence ? extension.persistence.read() : extension ? null : readStoredPetId()));
  const selectedPetId = extension?.selection ? extension.selection.id : storedPetId;

  const setSelectedPetId = useCallback((id: string) => {
    setSelectedPetIdState(id);
    extension?.selection?.setId(id);
    if (extension?.persistence) extension.persistence.write(id);
    else if (!extension) writeStoredPetId(id);
  }, [extension]);

  useEffect(() => {
    const next = resolveSelectedPetId(petsQuery.data, selectedPetId);
    if (next === selectedPetId) return;
    if (next === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedPetIdState(null);
      extension?.selection?.setId(null);
      extension?.persistence?.write(null);
      return;
    }
    setSelectedPetId(next);
  }, [petsQuery.data, selectedPetId, setSelectedPetId, extension]);

  const selectedPet = useMemo(() => pets.find((pet) => pet.id === selectedPetId) ?? null, [pets, selectedPetId]);

  const value = useMemo(
    () => ({
      pets,
      petsLoading: petsQuery.isLoading,
      petsError: petsQuery.error,
      selectedPetId,
      selectedPet,
      setSelectedPetId,
    }),
    [pets, petsQuery.isLoading, petsQuery.error, selectedPetId, selectedPet, setSelectedPetId],
  );

  return <SelectedPetContext.Provider value={value}>{children}</SelectedPetContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useOptionalSelectedPet() { return useContext(SelectedPetContext); }

// eslint-disable-next-line react-refresh/only-export-components
export function useSelectedPet() {
  const context = useContext(SelectedPetContext);
  if (!context) {
    throw new Error('useSelectedPet must be used within SelectedPetProvider');
  }
  return context;
}
