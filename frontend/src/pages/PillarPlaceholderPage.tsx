import { Link } from 'react-router-dom';
import { pillarById, type MonitoringPillar } from '../types/pillars';

export default function PillarPlaceholderPage({ pillarId }: { pillarId: MonitoringPillar }) {
  const pillar = pillarById(pillarId);

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <p className="eyebrow">{pillar.label} pillar</p>
          <h2>Not available yet</h2>
          <p className="muted-text">{pillar.description}</p>
        </div>
        <span className="status-pill">Planned</span>
      </section>
      <section className="panel">
        <p className="muted-text">
          This pillar will get its own journal, calendar hints, and overview metrics—mirroring the nutrition layout once records and parsers are in place.
        </p>
        <div className="button-row">
          <Link className="button button-secondary" to="/">
            Back to overview
          </Link>
          <Link className="button" to="/nutrition">
            Open nutrition
          </Link>
        </div>
      </section>
    </div>
  );
}
