import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { AssignmentCreateCard } from './AssignmentCreateCard';
import type { MedFrequency } from '../../api/medications';
import {
  defaultFormulationPickerValue,
  defaultMedFrequency,
} from '../../lib/medicationDefaults';
import { localToday } from '../../lib/dates';
import type { FormulationPickerValue } from './FormulationPicker';
import { mockMedications } from '../../stories/fixtures';
import { asNarrowStory } from '../../stories/viewport';

interface PlaygroundProps {
  revising?: boolean;
  initialMedId?: string | null;
}

function Playground({ revising = false, initialMedId = null }: PlaygroundProps) {
  const [planMedId, setPlanMedId] = useState<string | null>(initialMedId);
  const [formulation, setFormulation] = useState<FormulationPickerValue>(defaultFormulationPickerValue);
  const [formulationLocked, setFormulationLocked] = useState(true);
  const [planOptional, setPlanOptional] = useState(false);
  const [liquidDoseMl, setLiquidDoseMl] = useState('2.5');
  const [liquidConcentration, setLiquidConcentration] = useState('');
  const [planFrequency, setPlanFrequency] = useState<MedFrequency>(defaultMedFrequency);
  const today = localToday();
  const [planFrom, setPlanFrom] = useState(today);
  const [reviseFrom, setReviseFrom] = useState(today);
  const [planTo, setPlanTo] = useState('');
  const [mealWaitMinutes, setMealWaitMinutes] = useState('');

  return (
    <AssignmentCreateCard
      revising={revising}
      editing={false}
      medications={mockMedications}
      planMedId={planMedId}
      onPlanMedIdChange={setPlanMedId}
      formulation={formulation}
      onFormulationChange={setFormulation}
      formulationLocked={formulationLocked}
      onFormulationLockedChange={setFormulationLocked}
      planOptional={planOptional}
      onPlanOptionalChange={setPlanOptional}
      liquidDoseMl={liquidDoseMl}
      onLiquidDoseMlChange={setLiquidDoseMl}
      liquidConcentration={liquidConcentration}
      onLiquidConcentrationChange={setLiquidConcentration}
      planFrequency={planFrequency}
      onPlanFrequencyChange={setPlanFrequency}
      planFrom={planFrom}
      onPlanFromChange={setPlanFrom}
      reviseFrom={reviseFrom}
      onReviseFromChange={setReviseFrom}
      planTo={planTo}
      onPlanToChange={setPlanTo}
      mealWaitMinutes={mealWaitMinutes}
      onMealWaitMinutesChange={setMealWaitMinutes}
      saving={false}
      error={false}
      onSave={() => {}}
      onCancel={() => {}}
    />
  );
}

const meta = {
  title: 'Components/Health/AssignmentCreateCard',
  component: Playground,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Playground>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Create: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'New assignment' })).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Create assignment' })).toBeDisabled();
    await userEvent.selectOptions(canvas.getByLabelText('Medication'), 'med-pill-1');
    await expect(canvas.getByRole('button', { name: 'Create assignment' })).toBeEnabled();
    await expect(canvas.getByLabelText('Optional medication (take as needed)')).toBeInTheDocument();
  },
};

export const Revise: Story = {
  args: { revising: true, initialMedId: 'med-pill-1' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Revise assignment' })).toBeInTheDocument();
    await expect(canvas.getByText('Prednisolone')).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Save revision' })).toBeEnabled();
    await expect(canvas.queryByLabelText('Medication')).not.toBeInTheDocument();
  },
};

export const ReviseLiquid: Story = {
  args: { revising: true, initialMedId: 'med-liquid-1' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Metronidazole')).toBeInTheDocument();
    const concentration = canvas.getByLabelText('Concentration (mg/ml, optional)');
    const optional = canvas.getByLabelText('Optional medication (take as needed)');
    const dose = canvas.getByLabelText('Dose (ml)');
    await expect(
      concentration.compareDocumentPosition(dose) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await expect(
      dose.compareDocumentPosition(optional) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  },
};

export const CreateNarrow = asNarrowStory(Create);
export const ReviseNarrow = asNarrowStory(Revise);
export const ReviseLiquidNarrow = asNarrowStory(ReviseLiquid);
