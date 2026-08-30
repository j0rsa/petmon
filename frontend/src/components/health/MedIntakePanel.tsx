import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Code } from 'lucide-react';
import {
  medicationsApi,
  type CreateMedBundleIntake,
  type CreateMedIntakeRecord,
  type DailyMedAssignment,
  type DoseFraction,
  type MedBundle,
} from '../../api/medications';
import { localToday } from '../../lib/dates';
import {
  expectedDoseCount,
  DOSE_FRACTIONS,
  doseFractionLabel,
  formatFrequency,
  intakeStatus,
  intakeStatusLabel,
  bundleCanTakeNow,
  bundleDailyMembers,
  lastBundleIntakes,
} from '../../lib/medications';
import { buildMedIntakeCurl } from '../../lib/medIntakeCurl';
import { parseDecimal } from '../../lib/numbers';
import { isDoseSupported } from '../../lib/pillDoseCuts';
import { medIntakeShortcutLinkProps } from '../../lib/medIntakeShortcut';
import { showMedIntakeShortcutLink } from '../../lib/medIntakePlatform';
import { isoFromDateAndTime, nowTimeString } from '../../lib/time';
import { infoApi } from '../../api/info';
import { usePermissions } from '../../context/usePermissions';
import { useFormatTime } from '../../context/useDisplaySettings';
import { useUserSettings } from '../../api/userSettings';
import { TimeInput } from '../TimeInput';
import { MedIcon } from './MedIcon';

export interface MedIntakePanelProps {
  petId: string;
}

function DailyMedRow({
  item,
  petId,
  canWrite,
  developerMode,
  panelDate,
  onLogged,
}: {
  item: DailyMedAssignment;
  petId: string;
  canWrite: boolean;
  developerMode: boolean;
  panelDate: string;
  onLogged: () => void;
}) {
  const formatTime = useFormatTime();
  const { medication, assignment } = item;
  const expected = expectedDoseCount(assignment.frequency);
  const status = intakeStatus(item.intakes, expected);
  const [intakeMode, setIntakeMode] = useState<'record' | 'now' | null>(null);
  const [intakeDate, setIntakeDate] = useState(panelDate);
  const [intakeLocalDate, setIntakeLocalDate] = useState(panelDate);
  const [intakeTime, setIntakeTime] = useState(nowTimeString);
  const [doseFraction, setDoseFraction] = useState<DoseFraction>('whole');
  const [liquidDoseMl, setLiquidDoseMl] = useState('');
  const [curlCopied, setCurlCopied] = useState(false);

  const logMutation = useMutation({
    mutationFn: (payload: CreateMedIntakeRecord) => medicationsApi.createIntake(payload),
    onSuccess: onLogged,
  });

  const undoMutation = useMutation({
    mutationFn: (id: string) => medicationsApi.deleteIntake(id),
    onSuccess: onLogged,
  });

  function resetIntakePrompt() {
    setIntakeMode(null);
    setIntakeDate(panelDate);
    setIntakeLocalDate(panelDate);
    setIntakeTime(nowTimeString());
    setLiquidDoseMl('');
  }

  function intakeTiming() {
    return {
      local_date: intakeLocalDate,
      occurred_at: isoFromDateAndTime(intakeDate, intakeTime),
    };
  }

  function logIntake(
    timing: { local_date?: string; occurred_at?: string } = {},
    overrides: Partial<CreateMedIntakeRecord> = {},
  ) {
    logMutation.mutate({
      pet_id: petId,
      medication_id: medication.id,
      assignment_id: assignment.id,
      taken: true,
      ...timing,
      ...overrides,
    }, {
      onSuccess: resetIntakePrompt,
    });
  }

  function handleAddRecord() {
    setIntakeDate(panelDate);
    setIntakeLocalDate(panelDate);
    setIntakeTime(nowTimeString());
    setIntakeMode('record');
  }

  function handleTakeNow() {
    if (assignment.optional) {
      setLiquidDoseMl('');
      setIntakeMode('now');
      return;
    }
    logIntake();
  }

  function confirmIntake() {
    const timing = intakeMode === 'record' ? intakeTiming() : {};
    if (assignment.optional) {
      if (medication.med_type === 'pill') {
        logIntake(timing, { dose_fraction_override: doseFraction });
        return;
      }
      const ml = parseDecimal(liquidDoseMl);
      if (Number.isFinite(ml) && ml > 0) {
        logIntake(timing, { liquid_dose_ml_override: ml });
      }
      return;
    }
    logIntake(timing);
  }

  const lastIntake = [...item.intakes]
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))[0];

  const iconFraction = assignment.optional ? 'whole' : assignment.dose_fraction;
  const iconShape = assignment.formulation.pill_shape;
  const liquidDoseValid = parseDecimal(liquidDoseMl) > 0;
  const canConfirmIntake = !assignment.optional
    || medication.med_type === 'pill'
    || liquidDoseValid;
  const optionalOverrides = assignment.optional
    ? medication.med_type === 'pill'
      ? { dose_fraction_override: doseFraction }
      : liquidDoseValid
        ? { liquid_dose_ml_override: parseDecimal(liquidDoseMl) }
        : { liquid_dose_ml_override: 0.6 }
    : undefined;

  function handleCopyCurl() {
    const timing = intakeMode === 'record' ? intakeTiming() : {};
    const curl = buildMedIntakeCurl(petId, item, timing, optionalOverrides);
    navigator.clipboard.writeText(curl).then(() => {
      setCurlCopied(true);
      setTimeout(() => setCurlCopied(false), 2000);
    });
  }

  const showTake = assignment.optional || status !== 'done';
  const showActions = canWrite || developerMode;

  return (
    <div className="med-intake-row">
      <MedIcon
        medType={medication.med_type}
        color={medication.color}
        pillShape={iconShape}
        doseFraction={iconFraction}
        size={40}
      />
      <div className="med-intake-row__body">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <strong style={{ fontSize: '0.92rem' }}>{medication.name}</strong>
          {assignment.optional && (
            <span className="muted-text" style={{ fontSize: '0.75rem' }}>Optional</span>
          )}
          <span
            style={{
              fontSize: '0.72rem',
              padding: '0.1rem 0.45rem',
              borderRadius: 999,
              background:
                status === 'done'
                  ? 'color-mix(in srgb, var(--accent) 18%, transparent)'
                  : status === 'skipped'
                    ? 'color-mix(in srgb, var(--danger) 15%, transparent)'
                    : 'var(--surface-muted)',
              color: 'var(--text-muted)',
            }}
          >
            {intakeStatusLabel(status)}
          </span>
        </div>
        <p className="muted-text" style={{ fontSize: '0.8rem', margin: '0.15rem 0 0' }}>
          {assignment.optional
            ? 'As needed · Choose dosage when taken'
            : `${assignment.dose_label} · ${formatFrequency(assignment.frequency)}`}
        </p>
        {item.intakes.length > 0 && (
          <p className="muted-text" style={{ fontSize: '0.75rem', margin: '0.2rem 0 0' }}>
            {item.intakes.map((i) => `Taken ${formatTime(i.occurred_at)} (${i.dose_label})`).join(' · ')}
          </p>
        )}
      </div>
      {showActions && (
        <div className="med-intake-row__actions">
          {developerMode && (
            <button
              type="button"
              className="button button-secondary"
              style={{ padding: '0.25rem 0.45rem', fontSize: '0.78rem', lineHeight: 0 }}
              title={curlCopied ? 'Copied curl command' : assignment.optional ? 'Copy curl command with example dosage' : 'Copy curl command for this intake'}
              aria-label={curlCopied ? 'Copied curl command' : assignment.optional ? 'Copy curl command with example dosage' : 'Copy curl command for this intake'}
              onClick={handleCopyCurl}
            >
              <Code size={15} aria-hidden="true" />
            </button>
          )}
          {canWrite && (
            <>
              <button
                type="button"
                className="button button-secondary"
                style={{ padding: '0.25rem 0.65rem', fontSize: '0.78rem' }}
                disabled={logMutation.isPending}
                onClick={handleAddRecord}
              >
                Add record
              </button>
              {showTake && (
                <button
                  type="button"
                  className="button"
                  style={{ padding: '0.25rem 0.65rem', fontSize: '0.78rem' }}
                  disabled={logMutation.isPending}
                  onClick={handleTakeNow}
                >
                  Take now
                </button>
              )}
            </>
          )}
          {canWrite && lastIntake && (
            <button
              type="button"
              className="button button-secondary"
              style={{ padding: '0.25rem 0.65rem', fontSize: '0.78rem' }}
              disabled={undoMutation.isPending}
              onClick={() => undoMutation.mutate(lastIntake.id)}
            >
              Undo
            </button>
          )}
        </div>
      )}
      {intakeMode && (
        <div
          style={{
            flexBasis: '100%',
            marginLeft: 0,
            padding: '0.65rem',
            borderRadius: 8,
            background: 'var(--surface-muted)',
          }}
        >
          <strong style={{ display: 'block', fontSize: '0.82rem', marginBottom: '0.45rem' }}>
            {intakeMode === 'record' ? 'Add medication record' : 'Record medication taken now'}
          </strong>
          {intakeMode === 'record' && (
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.55rem' }}>
              <div className="form-row" style={{ flex: '0 0 auto' }}>
                <label style={{ fontSize: '0.78rem' }}>Taken date</label>
                <input
                  type="date"
                  value={intakeDate}
                  onChange={(event) => {
                    setIntakeDate(event.target.value);
                    setIntakeLocalDate(event.target.value);
                  }}
                  style={{ width: '10.5rem' }}
                />
              </div>
              <div className="form-row" style={{ flex: '0 0 auto' }}>
                <label style={{ fontSize: '0.78rem' }}>Time</label>
                <TimeInput
                  variant="form"
                  aria-label="Intake time"
                  value={intakeTime}
                  onChange={setIntakeTime}
                />
              </div>
              <div className="form-row" style={{ flex: '0 0 auto', marginLeft: '0.5rem' }}>
                <label style={{ fontSize: '0.78rem' }}>Credit date</label>
                <input
                  type="date"
                  value={intakeLocalDate}
                  onChange={(event) => setIntakeLocalDate(event.target.value)}
                  style={{ width: '10.5rem' }}
                />
              </div>
            </div>
          )}
          {assignment.optional && (
            <>
              <strong style={{ display: 'block', fontSize: '0.82rem', marginBottom: '0.45rem' }}>
                Dosage taken
              </strong>
              {medication.med_type === 'pill' ? (
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                  {DOSE_FRACTIONS.map((fraction) => {
                    const supported = isDoseSupported(assignment.formulation.pill_shape ?? 'round', fraction);
                    return (
                      <button
                        key={fraction}
                        type="button"
                        className={`button${doseFraction === fraction ? '' : ' button-secondary'}`}
                        disabled={!supported}
                        style={{ padding: '0.3rem 0.55rem', fontSize: '0.78rem' }}
                        onClick={() => setDoseFraction(fraction)}
                      >
                        {doseFractionLabel(fraction)}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="form-row" style={{ maxWidth: '10rem' }}>
                  <label style={{ fontSize: '0.78rem' }}>Amount (ml)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={liquidDoseMl}
                    placeholder="e.g. 0,6"
                    autoFocus
                    onChange={(event) => setLiquidDoseMl(event.target.value)}
                  />
                </div>
              )}
            </>
          )}
          <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.55rem' }}>
            <button
              type="button"
              className="button"
              disabled={logMutation.isPending || !canConfirmIntake}
              onClick={confirmIntake}
            >
              Confirm
            </button>
            <button
              type="button"
              className="button button-secondary"
              onClick={resetIntakePrompt}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function BundleTakeRow({
  bundle,
  members,
  canWrite,
  panelDate,
  onLogged,
}: {
  bundle: MedBundle;
  members: DailyMedAssignment[];
  canWrite: boolean;
  panelDate: string;
  onLogged: () => void;
}) {
  const formatTime = useFormatTime();
  const [intakeMode, setIntakeMode] = useState<'record' | null>(null);
  const [intakeDate, setIntakeDate] = useState(panelDate);
  const [intakeLocalDate, setIntakeLocalDate] = useState(panelDate);
  const [intakeTime, setIntakeTime] = useState(nowTimeString);

  const takeMutation = useMutation({
    mutationFn: (payload: CreateMedBundleIntake) =>
      medicationsApi.createBundleIntake(bundle.id, payload),
    onSuccess: onLogged,
  });

  const undoMutation = useMutation({
    mutationFn: async () => {
      for (const record of lastBundleIntakes(members)) {
        await medicationsApi.deleteIntake(record.id);
      }
    },
    onSuccess: onLogged,
  });

  function resetIntakePrompt() {
    setIntakeMode(null);
    setIntakeDate(panelDate);
    setIntakeLocalDate(panelDate);
    setIntakeTime(nowTimeString());
  }

  function handleAddRecord() {
    setIntakeDate(panelDate);
    setIntakeLocalDate(panelDate);
    setIntakeTime(nowTimeString());
    setIntakeMode('record');
  }

  function confirmRecord() {
    takeMutation.mutate({
      local_date: intakeLocalDate,
      occurred_at: isoFromDateAndTime(intakeDate, intakeTime),
    }, {
      onSuccess: resetIntakePrompt,
    });
  }

  const lastIntakes = lastBundleIntakes(members);
  const canTake = canWrite && bundleCanTakeNow(members);

  return (
    <div className="med-intake-row">
      <div className="med-intake-bundle-icons">
        {members.map((item) => (
          <MedIcon
            key={item.medication.id}
            medType={item.medication.med_type}
            color={item.medication.color}
            pillShape={item.assignment.formulation.pill_shape}
            doseFraction={item.assignment.dose_fraction}
            size={40}
          />
        ))}
      </div>
      <div className="med-intake-row__body">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <strong style={{ fontSize: '0.92rem' }}>{bundle.name}</strong>
          <span
            style={{
              fontSize: '0.72rem',
              padding: '0.1rem 0.45rem',
              borderRadius: 999,
              background: 'var(--surface-muted)',
              color: 'var(--text-muted)',
            }}
          >
            Bundle
          </span>
        </div>
        <p className="muted-text" style={{ fontSize: '0.8rem', margin: '0.15rem 0 0' }}>
          {members.map((item) => item.assignment.dose_label).join(' · ')}
        </p>
        {members.some((item) => item.intakes.length > 0) && (
          <p className="muted-text" style={{ fontSize: '0.75rem', margin: '0.2rem 0 0' }}>
            {members.flatMap((item) =>
              item.intakes.map((intake) => `Taken ${formatTime(intake.occurred_at)} (${intake.dose_label})`),
            ).join(' · ')}
          </p>
        )}
      </div>
      {canWrite && (
        <div className="med-intake-row__actions">
          <button
            type="button"
            className="button button-secondary"
            style={{ padding: '0.25rem 0.65rem', fontSize: '0.78rem' }}
            disabled={takeMutation.isPending}
            aria-label={`Add record for ${bundle.name}`}
            onClick={handleAddRecord}
          >
            Add record
          </button>
          {canTake && (
            <button
              type="button"
              className="button"
              style={{ padding: '0.25rem 0.65rem', fontSize: '0.78rem' }}
              disabled={takeMutation.isPending}
              aria-label={`Take ${bundle.name} now`}
              onClick={() => takeMutation.mutate({})}
            >
              Take now
            </button>
          )}
          {lastIntakes.length > 0 && (
            <button
              type="button"
              className="button button-secondary"
              style={{ padding: '0.25rem 0.65rem', fontSize: '0.78rem' }}
              disabled={undoMutation.isPending}
              aria-label={`Undo ${bundle.name}`}
              onClick={() => undoMutation.mutate()}
            >
              Undo
            </button>
          )}
        </div>
      )}
      {intakeMode === 'record' && (
        <div
          style={{
            flexBasis: '100%',
            marginLeft: 0,
            padding: '0.65rem',
            borderRadius: 8,
            background: 'var(--surface-muted)',
          }}
        >
          <strong style={{ display: 'block', fontSize: '0.82rem', marginBottom: '0.45rem' }}>
            Add medication record
          </strong>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.55rem' }}>
            <div className="form-row" style={{ flex: '0 0 auto' }}>
              <label style={{ fontSize: '0.78rem' }}>Taken date</label>
              <input
                type="date"
                value={intakeDate}
                onChange={(event) => {
                  setIntakeDate(event.target.value);
                  setIntakeLocalDate(event.target.value);
                }}
                style={{ width: '10.5rem' }}
              />
            </div>
            <div className="form-row" style={{ flex: '0 0 auto' }}>
              <label style={{ fontSize: '0.78rem' }}>Time</label>
              <TimeInput
                variant="form"
                aria-label={`Intake time for ${bundle.name}`}
                value={intakeTime}
                onChange={setIntakeTime}
              />
            </div>
            <div className="form-row" style={{ flex: '0 0 auto', marginLeft: '0.5rem' }}>
              <label style={{ fontSize: '0.78rem' }}>Credit date</label>
              <input
                type="date"
                value={intakeLocalDate}
                onChange={(event) => setIntakeLocalDate(event.target.value)}
                style={{ width: '10.5rem' }}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.55rem' }}>
            <button
              type="button"
              className="button"
              disabled={takeMutation.isPending}
              onClick={confirmRecord}
            >
              Confirm
            </button>
            <button
              type="button"
              className="button button-secondary"
              onClick={resetIntakePrompt}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function MedIntakePanel({ petId }: MedIntakePanelProps) {
  const queryClient = useQueryClient();
  const { canWrite } = usePermissions();
  const today = localToday();
  const { settings: developerSettings } = useUserSettings('developer_mode');

  const dailyQuery = useQuery({
    queryKey: ['med-daily', petId, today],
    queryFn: () => medicationsApi.dailyAssignments(petId, today),
    enabled: Boolean(petId),
  });

  const bundlesQuery = useQuery({
    queryKey: ['med-bundles', petId],
    queryFn: () => medicationsApi.listBundles(petId),
    enabled: Boolean(petId),
  });

  const appInfoQuery = useQuery({
    queryKey: ['app-info'],
    queryFn: infoApi.get,
    staleTime: Infinity,
    retry: false,
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['med-daily', petId] });
    queryClient.invalidateQueries({ queryKey: ['med-intake'] });
    queryClient.invalidateQueries({ queryKey: ['med-bundles', petId] });
  }

  const items = dailyQuery.data ?? [];
  const dueBundles = (bundlesQuery.data ?? [])
    .flatMap((bundle) => {
      const members = bundleDailyMembers(bundle, items);
      return members ? [{ bundle, members }] : [];
    })
    .sort((a, b) => a.bundle.name.localeCompare(b.bundle.name));

  const bundleMemberIds = new Set(
    dueBundles.flatMap(({ members }) => members.map((m) => m.medication.id)),
  );
  const individualItems = items.filter((item) => !bundleMemberIds.has(item.medication.id));
  const scheduledItems = individualItems
    .filter((item) => !item.assignment.optional)
    .sort((a, b) => a.medication.name.localeCompare(b.medication.name));
  const optionalItems = individualItems
    .filter((item) => item.assignment.optional)
    .sort((a, b) => a.medication.name.localeCompare(b.medication.name));

  const loading = dailyQuery.isPending || bundlesQuery.isPending;
  const empty = scheduledItems.length === 0 && optionalItems.length === 0 && dueBundles.length === 0;

  return (
    <section className="panel" id="medications">
      <div className="section-heading med-intake-heading">
        <div>
          <p className="eyebrow">Medications</p>
          <h3>Today&apos;s meds</h3>
        </div>
        {/* Card action, so it sits on the header row at the card's right edge
            and wraps below the title on narrow screens. */}
        {!loading && !empty && (
          <div className="med-intake-import-links">
            {showMedIntakeShortcutLink() && (
              <a
                {...medIntakeShortcutLinkProps(undefined, appInfoQuery.data?.med_intake_shortcut_icloud_url)}
                className="shortcuts-import-link"
                aria-label="Apple Shortcut"
                title={
                  appInfoQuery.data?.med_intake_shortcut_icloud_url
                    ? 'Import the Petmon Take Meds shortcut from iCloud (configure URL, pet id, and API key on first run)'
                    : 'Download the Petmon Take Meds shortcut (iPhone needs an iCloud link — see docs/apple-shortcut-med-intake.md)'
                }
              >
                <img src="/icons/shortcuts.png" alt="" width={22} height={22} className="shortcuts-import-link__icon" />
              </a>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div className="loading-state">Loading…</div>
      ) : empty ? (
        <p className="muted-text" style={{ fontSize: '0.88rem' }}>
          No medications are due today.
        </p>
      ) : (
        <div className="med-intake-groups">
          {dueBundles.length > 0 && (
            <div className="med-intake-group">
              <h4 className="med-intake-group__title">Bundles</h4>
              {dueBundles.map(({ bundle, members }) => (
                <BundleTakeRow
                  key={bundle.id}
                  bundle={bundle}
                  members={members}
                  canWrite={canWrite}
                  panelDate={today}
                  onLogged={invalidate}
                />
              ))}
            </div>
          )}
          {scheduledItems.length > 0 && (
            <div className="med-intake-group">
              <h4 className="med-intake-group__title">Meds</h4>
              {scheduledItems.map((item) => (
                <DailyMedRow
                  key={item.medication.id}
                  item={item}
                  petId={petId}
                  canWrite={canWrite}
                  developerMode={developerSettings.enabled}
                  panelDate={today}
                  onLogged={invalidate}
                />
              ))}
            </div>
          )}
          {optionalItems.length > 0 && (
            <div className="med-intake-group">
              <h4 className="med-intake-group__title">Optional</h4>
              {optionalItems.map((item) => (
                <DailyMedRow
                  key={item.medication.id}
                  item={item}
                  petId={petId}
                  canWrite={canWrite}
                  developerMode={developerSettings.enabled}
                  panelDate={today}
                  onLogged={invalidate}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
