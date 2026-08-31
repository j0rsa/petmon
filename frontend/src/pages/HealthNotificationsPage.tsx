import { useEffect, useState } from 'react';
import { useSelectedPet } from '../context/SelectedPetContext';
import { usePermissions } from '../context/usePermissions';
import { NoPetSelected } from '../components/NoPetSelected';
import {
  usePetSettings,
  type PetNudgeSchedule,
  type NudgeSlot,
} from '../api/petSettings';
import { getPushSupportStatus } from '../lib/pushNotifications';

type Slot = 'morning' | 'midday' | 'evening';

const SLOT_LABELS: Record<Slot, string> = {
  morning: 'Morning',
  midday: 'Midday',
  evening: 'Evening',
};

const SLOTS: Slot[] = ['morning', 'midday', 'evening'];

const HOURS = Array.from({ length: 24 }, (_, i) => i);

function hourLabel(h: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:00`;
}

function SlotRow({
  slot,
  value,
  disabled,
  onChange,
}: {
  slot: Slot;
  value: NudgeSlot;
  disabled: boolean;
  onChange: (updated: NudgeSlot) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        padding: '0.75rem 0',
        borderBottom: '1px solid var(--border)',
        flexWrap: 'wrap',
      }}
    >
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: disabled ? 'not-allowed' : 'pointer' }}>
        <input
          type="checkbox"
          checked={value.enabled}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, enabled: e.target.checked })}
        />
        <span style={{ fontWeight: 500, fontSize: '0.92rem', minWidth: '5.5rem' }}>
          {SLOT_LABELS[slot]}
        </span>
      </label>

      <span className="muted-text" style={{ fontSize: '0.82rem', flex: 1 }}>
        {value.enabled ? 'Nudge if not logged by:' : 'Off'}
      </span>

      {value.enabled && (
        <select
          value={value.deadline_hour}
          disabled={disabled}
          style={{ width: '7rem' }}
          onChange={(e) => onChange({ ...value, deadline_hour: parseInt(e.target.value, 10) })}
        >
          {HOURS.map((h) => (
            <option key={h} value={h}>{hourLabel(h)}</option>
          ))}
        </select>
      )}
    </div>
  );
}

function computeCronHours(s: PetNudgeSchedule): number[] {
  return [s.morning, s.midday, s.evening]
    .filter((slot) => slot.enabled)
    .map((slot) => slot.deadline_hour)
    .filter((h, i, arr) => arr.indexOf(h) === i)
    .sort((a, b) => a - b);
}

export default function HealthNotificationsPage() {
  const { selectedPetId, selectedPet, petsLoading } = useSelectedPet();
  const { canWrite } = usePermissions();
  const { settings, update, isSaving } = usePetSettings(selectedPetId ?? undefined, 'med_nudge');

  const [pushStatus, setPushStatus] = useState<string | null>(null);

  useEffect(() => {
    getPushSupportStatus().then((s) => setPushStatus(s));
  }, []);

  if (petsLoading) return <div className="loading-state">Loading…</div>;
  if (!selectedPetId || !selectedPet) return <NoPetSelected />;

  const cronHours = computeCronHours(settings);

  function updateSlot(slot: Slot, updated: NudgeSlot) {
    if (!canWrite) return;
    update({ ...settings, [slot]: updated });
  }

  const pushWarning = pushStatus != null && pushStatus !== 'subscribed';

  return (
    <section className="panel">
      <p className="eyebrow">Medications</p>
      <h3 style={{ marginBottom: '0.25rem' }}>Nudge reminders · {selectedPet.name}</h3>
      <p className="muted-text" style={{ fontSize: '0.85rem', margin: '0 0 1.25rem' }}>
        Get a push notification if {selectedPet.name}&apos;s medications haven&apos;t been logged
        by the selected hour.
      </p>

      {pushWarning && (
        <div
          role="alert"
          style={{
            marginBottom: '1rem',
            padding: '0.6rem 0.85rem',
            borderRadius: 8,
            background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
            fontSize: '0.83rem',
          }}
        >
          {pushStatus === 'unsupported'
            ? 'Push notifications are not supported in this browser.'
            : pushStatus === 'denied'
              ? 'Notifications are blocked. Allow them in browser/OS settings.'
              : 'Push notifications are not enabled for this device. Go to Settings → Notifications to enable them.'}
        </div>
      )}

      <div>
        {SLOTS.map((slot) => (
          <SlotRow
            key={slot}
            slot={slot}
            value={settings[slot]}
            disabled={!canWrite || isSaving}
            onChange={(updated) => updateSlot(slot, updated)}
          />
        ))}
      </div>

      {isSaving && (
        <p className="muted-text" style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>Saving…</p>
      )}

      {cronHours.length > 0 && (
        <div
          style={{
            marginTop: '1.25rem',
            padding: '0.6rem 0.85rem',
            borderRadius: 8,
            background: 'var(--surface-muted)',
            fontSize: '0.82rem',
          }}
        >
          <strong>Server checks at:</strong>{' '}
          {cronHours.map((h) => hourLabel(h)).join(', ')}
          <p className="muted-text" style={{ margin: '0.25rem 0 0', fontSize: '0.78rem' }}>
            The server runs a nudge check at the top of each of these hours.
            If any doses from passed slots remain untaken, a push is sent.
          </p>
        </div>
      )}

      <p className="muted-text" style={{ fontSize: '0.78rem', marginTop: '1rem', lineHeight: 1.5 }}>
        Changes are saved immediately. At each scheduled hour the server finds
        all doses that should have been taken by then but haven&apos;t been, and
        sends: &ldquo;Don&apos;t forget to give &lt;meds&gt; to &lt;pet&gt; in
        time&rdquo;.
      </p>
    </section>
  );
}
