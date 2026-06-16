import { useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { buildCumulativeFluidChart, FLUID_SERIES, formatRefMs, nowToRefMs, type FluidSeriesKey } from '../lib/cumulativeFluid';
import type { FluidCurvePoint, NutritionRecord, NutritionSchedule } from '../types';

interface TooltipEntry {
  dataKey: string;
  name: string;
  value: number | null;
  color: string;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: number;
}

function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length || label == null) return null;

  const rows = payload.filter((e) => e.value != null && e.value > 0);
  if (rows.length === 0) return null;

  return (
    <div className="fluid-chart-tooltip">
      <p className="fluid-tooltip-time">{formatRefMs(label)}</p>
      {rows.map((entry) => {
        let valueLabel: string;
        if (entry.dataKey === 'total') {
          valueLabel = `~${entry.value} ml`;
        } else {
          valueLabel = `${entry.value} ml`;
        }
        let detail: string | null = null;
        if (entry.dataKey === 'foodFluid') {
          detail = 'wet food × 77%';
        }
        return (
          <div key={entry.dataKey} className="fluid-tooltip-row">
            <span className="fluid-tooltip-swatch" style={{ background: entry.color }} />
            <span className="fluid-tooltip-name">{entry.name}</span>
            <span className="fluid-tooltip-value">
              {valueLabel}
              {detail && <span className="fluid-tooltip-detail"> ({detail})</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

interface CumulativeFluidChartProps {
  records: NutritionRecord[];
  focusDate: string;
  schedules?: NutritionSchedule[];
  bestDayCurve?: FluidCurvePoint[];
  bestDayDate?: string;
}

const DEFAULT_VISIBLE: Record<FluidSeriesKey, boolean> = {
  liquids: true,
  foodFluid: false,
  total: false,
  bestDay: true,
  schedule: true,
};

export function CumulativeFluidChart({ records, focusDate, schedules = [], bestDayCurve, bestDayDate }: CumulativeFluidChartProps) {
  const [visible, setVisible] = useState(DEFAULT_VISIBLE);

  const { points, bestDayLabel } = useMemo(
    () => buildCumulativeFluidChart(records, focusDate, schedules, bestDayCurve, bestDayDate),
    [records, focusDate, schedules, bestDayCurve, bestDayDate],
  );

  const nowX = nowToRefMs();

  if (points.length === 0) {
    return <div className="empty-state compact-empty">No fluid records for {focusDate} in this range.</div>;
  }

  return (
    <div className="cumulative-fluid-chart">
      <div className="fluid-series-toggles">
        {FLUID_SERIES.map((series) => (
          <button
            key={series.key}
            type="button"
            className={`fluid-series-pill${visible[series.key] ? ' active' : ''}`}
            style={
              visible[series.key]
                ? {
                    borderColor: series.color,
                    color: series.color,
                    backgroundColor: `${series.color}22`,
                  }
                : undefined
            }
            onClick={() => setVisible((current) => ({ ...current, [series.key]: !current[series.key] }))}
          >
            {series.label}
          </button>
        ))}
      </div>

      <div className="chart-wrapper chart-wrapper-fluid">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points}>
            <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
            <XAxis
              dataKey="x"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              stroke="var(--chart-axis)"
              tick={{ fill: 'var(--chart-axis)', fontFamily: 'DM Mono, monospace', fontSize: 11 }}
              tickFormatter={formatRefMs}
              interval="preserveStartEnd"
            />
            <YAxis
              stroke="var(--chart-axis)"
              tick={{ fill: 'var(--chart-axis)', fontFamily: 'DM Mono, monospace', fontSize: 11 }}
              unit=" ml"
            />
            <Tooltip content={<ChartTooltip />} />
            <Legend />
            <ReferenceLine
              x={nowX}
              stroke="rgba(251,191,36,0.85)"
              strokeWidth={2}
              strokeDasharray="5 4"
              label={{ value: 'now', fill: 'rgba(251,191,36,0.85)', fontSize: 11, fontFamily: 'DM Mono, monospace' }}
            />
            {visible.liquids && (
              <Line
                type="stepAfter"
                dataKey="liquids"
                name="liquids"
                stroke="#4fd8f8"
                strokeWidth={2}
                dot={false}
              />
            )}
            {visible.foodFluid && (
              <Line
                type="stepAfter"
                dataKey="foodFluid"
                name="food fluid"
                stroke="#4fc8a0"
                strokeWidth={2}
                dot={false}
              />
            )}
            {visible.total && (
              <Line type="stepAfter" dataKey="total" name="total" stroke="#d9612a" strokeWidth={2.5} dot={false} />
            )}
            {visible.bestDay && (
              <Line
                type="stepAfter"
                dataKey="bestDay"
                name={bestDayLabel ?? 'best day'}
                stroke="#888882"
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
                connectNulls
              />
            )}
            {visible.schedule && (
              <Line
                type="stepAfter"
                dataKey="schedule"
                name="schedule"
                stroke="#d9612a"
                strokeWidth={2}
                strokeDasharray="4 3"
                dot={false}
                connectNulls
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
