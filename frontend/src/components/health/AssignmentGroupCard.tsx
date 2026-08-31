import type { CSSProperties } from 'react';
import type { MedAssignment, Medication } from '../../api/medications';
import { useFormatDate } from '../../context/useDisplaySettings';
import { daysInclusive } from '../../lib/dates';
import {
  assignmentHistoryLabel,
  assignmentScheduleLabel,
  assignmentStatus,
  assignmentStatusLabel,
  consecutiveCourse,
  consecutiveCourseLabel,
  formulationLabel,
} from '../../lib/medications';
import { MedIcon } from './MedIcon';

interface AssignmentGroupCardProps {
  medication: Medication | undefined;
  current: MedAssignment;
  past: MedAssignment[];
  today: string;
  canWrite: boolean;
  canAssign: boolean;
  deleting: boolean;
  pausing: boolean;
  onRevise: (assignment: MedAssignment) => void;
  onPause: (assignment: MedAssignment) => void;
  onAssign: () => void;
  onDelete: (assignment: MedAssignment) => void;
  onEdit: (assignment: MedAssignment) => void;
}

function dateRangeLabel(
  assignment: MedAssignment,
  formatDate: (date: string, style?: 'long' | 'short') => string,
  today: string,
): string {
  const from = formatDate(assignment.date_from, 'short');
  const end = assignment.date_to ?? today;
  const days = daysInclusive(assignment.date_from, end);
  const count = days === 1 ? '1 day' : `${days} days`;
  if (assignment.date_to == null) return `${count} · ${from} → ongoing`;
  return `${count} · ${from} → ${formatDate(assignment.date_to, 'short')}`;
}

export function AssignmentGroupCard({
  medication,
  current,
  past,
  today,
  canWrite,
  canAssign,
  deleting,
  pausing,
  onRevise,
  onPause,
  onAssign,
  onDelete,
  onEdit,
}: AssignmentGroupCardProps) {
  const formatDate = useFormatDate();
  const name = medication?.name ?? 'Unknown';
  const status = assignmentStatus(current, today);
  const accent = medication?.color ?? 'var(--accent)';
  const course = consecutiveCourse(current, past, today);

  return (
    <article
      className="plan-entity"
      style={{ '--plan-entity-accent': accent } as CSSProperties}
    >
      <div className="plan-entity__header">
        <MedIcon
          medType={medication?.med_type ?? 'pill'}
          color={accent}
          pillShape={current.formulation.pill_shape}
          doseFraction={current.dose_fraction}
          size={40}
        />
        <div className="plan-entity__identity">
          <div className="plan-entity__title-row">
            <h4 className="plan-entity__name">{name}</h4>
            <span className={`status-pill${status === 'active' ? ' active' : ''}`}>
              {assignmentStatusLabel(status)}
            </span>
          </div>
          <p className="plan-entity__dose">{current.dose_label}</p>
        </div>
        {canWrite && (
          <div className="plan-entity__actions">
            {status === 'active' && (
              <>
                <button
                  type="button"
                  className="button button-secondary button-compact"
                  aria-label={`Edit ${name} assignment`}
                  onClick={() => onEdit(current)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="button button-secondary button-compact"
                  aria-label={`Revise ${name}`}
                  onClick={() => onRevise(current)}
                >
                  Revise
                </button>
                <button
                  type="button"
                  className="button button-secondary button-compact"
                  disabled={pausing}
                  aria-label={`Pause ${name}`}
                  onClick={() => onPause(current)}
                >
                  Pause
                </button>
              </>
            )}
            {canAssign && status !== 'active' && (
              <button type="button" className="button button-compact" onClick={onAssign}>
                Assign
              </button>
            )}
            <button
              type="button"
              className="button button-danger button-compact"
              disabled={deleting}
              aria-label={`Delete ${name} assignment`}
              onClick={() => onDelete(current)}
            >
              Delete
            </button>
          </div>
        )}
      </div>

      <dl className="plan-entity__facts">
        {course != null && (
          <div>
            <dt>On course</dt>
            <dd>{consecutiveCourseLabel(course, formatDate)}</dd>
          </div>
        )}
        <div>
          <dt>Schedule</dt>
          <dd>{assignmentScheduleLabel(current)}</dd>
        </div>
        <div>
          <dt>Formulation</dt>
          <dd>
            {formulationLabel(
              current.formulation.tablet_strength_mg,
              current.formulation.pill_shape,
            )}
          </dd>
        </div>
        {current.meal_wait_minutes != null && (
          <div>
            <dt>Meal wait</dt>
            <dd>{current.meal_wait_minutes} min</dd>
          </div>
        )}
        <div>
          <dt>Dates</dt>
          <dd>{dateRangeLabel(current, formatDate, today)}</dd>
        </div>
      </dl>

      {past.length > 0 && (
        <details className="plan-entity__history">
          <summary>{assignmentHistoryLabel(past.length)}</summary>
          <ul className="plan-entity__history-list">
            {past.map((assignment) => {
              const pastStatus = assignmentStatus(assignment, today);
              return (
                <li key={assignment.id} className="plan-entity__history-item">
                  <div className="plan-entity__history-copy">
                    <div className="plan-entity__title-row">
                      <strong>{assignment.dose_label}</strong>
                      <span className="status-pill">{assignmentStatusLabel(pastStatus)}</span>
                    </div>
                    <span className="muted-text">
                      {assignmentScheduleLabel(assignment)}
                    </span>
                    <span className="muted-text">
                      {dateRangeLabel(assignment, formatDate, today)}
                    </span>
                  </div>
                  {canWrite && (
                    <button
                      type="button"
                      className="button button-danger button-compact"
                      disabled={deleting}
                      aria-label={`Delete earlier ${name} assignment from ${assignment.date_from}`}
                      onClick={() => onDelete(assignment)}
                    >
                      Delete
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </article>
  );
}
