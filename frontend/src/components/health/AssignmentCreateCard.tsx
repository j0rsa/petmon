import type { MedFrequency, Medication } from '../../api/medications';
import { expectedDoseCount } from '../../lib/medications';
import {
  FormulationPicker,
  type FormulationPickerValue,
} from './FormulationPicker';
import { MedScheduleEditor } from './MedScheduleEditor';

interface AssignmentCreateCardProps {
  revising: boolean;
  medications: Medication[];
  planMedId: string | null;
  onPlanMedIdChange: (id: string | null) => void;
  formulation: FormulationPickerValue;
  onFormulationChange: (value: FormulationPickerValue) => void;
  formulationLocked: boolean;
  onFormulationLockedChange: (locked: boolean) => void;
  planOptional: boolean;
  onPlanOptionalChange: (optional: boolean) => void;
  liquidDoseMl: string;
  onLiquidDoseMlChange: (value: string) => void;
  liquidConcentration: string;
  onLiquidConcentrationChange: (value: string) => void;
  planFrequency: MedFrequency;
  onPlanFrequencyChange: (value: MedFrequency) => void;
  planFrom: string;
  onPlanFromChange: (value: string) => void;
  reviseFrom: string;
  onReviseFromChange: (value: string) => void;
  planTo: string;
  onPlanToChange: (value: string) => void;
  mealWaitMinutes: string;
  onMealWaitMinutesChange: (value: string) => void;
  saving: boolean;
  error: boolean;
  onSave: () => void;
  onCancel: () => void;
}

function OptionalToggle({
  id,
  checked,
  onChange,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="plan-entity__check" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      Optional medication (take as needed)
    </label>
  );
}

export function AssignmentCreateCard({
  revising,
  medications,
  planMedId,
  onPlanMedIdChange,
  formulation,
  onFormulationChange,
  formulationLocked,
  onFormulationLockedChange,
  planOptional,
  onPlanOptionalChange,
  liquidDoseMl,
  onLiquidDoseMlChange,
  liquidConcentration,
  onLiquidConcentrationChange,
  planFrequency,
  onPlanFrequencyChange,
  planFrom,
  onPlanFromChange,
  reviseFrom,
  onReviseFromChange,
  planTo,
  onPlanToChange,
  mealWaitMinutes,
  onMealWaitMinutesChange,
  saving,
  error,
  onSave,
  onCancel,
}: AssignmentCreateCardProps) {
  const planMed = medications.find((medication) => medication.id === planMedId);

  return (
    <article className="plan-entity plan-entity--editing">
      <div className="plan-entity__identity">
        <h4 className="plan-entity__name">{revising ? 'Revise assignment' : 'New assignment'}</h4>
        <p className="muted-text" style={{ fontSize: '0.85rem', margin: 0 }}>
          {revising
            ? 'Change the dose or schedule from a date you choose.'
            : 'Start a course for a registered medication.'}
        </p>
      </div>
      {!revising && (
        <div className="form-row">
          <label htmlFor="plan-medication" style={{ fontSize: '0.82rem' }}>Medication</label>
          <select
            id="plan-medication"
            value={planMedId ?? ''}
            onChange={(event) => onPlanMedIdChange(event.target.value || null)}
          >
            <option value="">Select…</option>
            {medications.map((medication) => (
              <option key={medication.id} value={medication.id}>{medication.name}</option>
            ))}
          </select>
        </div>
      )}
      {revising && planMed && (
        <p style={{ margin: 0 }}>
          <strong>{planMed.name}</strong>
        </p>
      )}

      {planMed && (
        <>
          {revising && planMed.med_type === 'liquid' && formulationLocked && (
            <p className="muted-text" style={{ fontSize: '0.82rem', margin: 0 }}>
              Keeping the same bottle concentration.{' '}
              <button
                type="button"
                style={{
                  fontSize: 'inherit',
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent)',
                  cursor: 'pointer',
                  padding: 0,
                  textDecoration: 'underline',
                }}
                onClick={() => onFormulationLockedChange(false)}
              >
                Change concentration
              </button>
            </p>
          )}

          {planMed.med_type === 'pill' ? (
            <FormulationPicker
              color={planMed.color}
              value={formulation}
              onChange={onFormulationChange}
              formulationLocked={revising ? formulationLocked : undefined}
              onFormulationLockedChange={revising ? onFormulationLockedChange : undefined}
              showDose={!planOptional}
              beforeDose={(
                <OptionalToggle
                  id="plan-optional-pill"
                  checked={planOptional}
                  onChange={onPlanOptionalChange}
                />
              )}
            />
          ) : (
            <div style={{ display: 'grid', gap: '0.65rem' }}>
              <div
                className="form-row"
                style={revising && formulationLocked ? { opacity: 0.55, pointerEvents: 'none' } : undefined}
              >
                <label htmlFor="liquid-concentration" style={{ fontSize: '0.82rem' }}>
                  Concentration (mg/ml, optional)
                </label>
                <input
                  id="liquid-concentration"
                  type="text"
                  inputMode="decimal"
                  value={liquidConcentration}
                  onChange={(event) => onLiquidConcentrationChange(event.target.value)}
                />
              </div>
              {!planOptional && (
                <div className="form-row">
                  <label htmlFor="liquid-dose" style={{ fontSize: '0.82rem' }}>Dose (ml)</label>
                  <input
                    id="liquid-dose"
                    type="text"
                    inputMode="decimal"
                    value={liquidDoseMl}
                    onChange={(event) => onLiquidDoseMlChange(event.target.value)}
                  />
                </div>
              )}
              <OptionalToggle
                id="plan-optional-liquid"
                checked={planOptional}
                onChange={onPlanOptionalChange}
              />
            </div>
          )}

          {!planOptional && (
            <MedScheduleEditor value={planFrequency} onChange={onPlanFrequencyChange} />
          )}

          <div
            style={{
              display: 'grid',
              gap: '0.65rem',
              gridTemplateColumns: 'repeat(auto-fit, minmax(10rem, 1fr))',
            }}
          >
            {revising ? (
              <div className="form-row">
                <label htmlFor="plan-revise-from" style={{ fontSize: '0.82rem' }}>Effective from</label>
                <input
                  id="plan-revise-from"
                  type="date"
                  value={reviseFrom}
                  onChange={(event) => onReviseFromChange(event.target.value)}
                />
              </div>
            ) : (
              <div className="form-row">
                <label htmlFor="plan-from" style={{ fontSize: '0.82rem' }}>From</label>
                <input
                  id="plan-from"
                  type="date"
                  value={planFrom}
                  onChange={(event) => onPlanFromChange(event.target.value)}
                />
              </div>
            )}
            <div className="form-row">
              <label htmlFor="plan-to" style={{ fontSize: '0.82rem' }}>Until (optional)</label>
              <input
                id="plan-to"
                type="date"
                value={planTo}
                onChange={(event) => onPlanToChange(event.target.value)}
              />
            </div>
          </div>
          <label className="plan-entity__check" htmlFor="meal-wait-enabled">
            <input
              id="meal-wait-enabled"
              type="checkbox"
              checked={mealWaitMinutes !== ''}
              onChange={(e) => {
                if (!e.target.checked) onMealWaitMinutesChange('');
                else onMealWaitMinutesChange('30');
              }}
            />
            Set meal wait timer (shortcut starts a countdown after logging)
          </label>
          {mealWaitMinutes !== '' && (
            <div className="form-row">
              <label htmlFor="meal-wait-minutes" style={{ fontSize: '0.82rem' }}>
                Wait before feeding (minutes)
              </label>
              <input
                id="meal-wait-minutes"
                type="text"
                inputMode="numeric"
                value={mealWaitMinutes}
                style={{ maxWidth: '8rem' }}
                onChange={(e) => onMealWaitMinutesChange(e.target.value)}
              />
            </div>
          )}
        </>
      )}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="button"
          disabled={
            !planMedId
            || (!planOptional && expectedDoseCount(planFrequency) === 0)
            || saving
          }
          onClick={onSave}
        >
          {saving ? 'Saving…' : revising ? 'Save revision' : 'Create assignment'}
        </button>
        <button type="button" className="button button-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {error && (
        <div className="error-state" role="alert">
          Assignment could not be saved. Check the effective date and dose, then try again.
        </div>
      )}
    </article>
  );
}
