import { useMemo, useState } from 'react';
import { CartesianGrid, DefaultLegendContent, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useUserWidgetSettings } from '../api/userSettings';
import {
  buildCumulativeFluidChart,
  enabledFluidSeries,
  formatRefMs,
  nowToRefMs,
  type FluidSeriesKey,
} from '../lib/cumulativeFluid';
import { CumulativeFluidChartSettingsFields } from './CumulativeFluidChartSettingsFields';
import { WidgetSettingsGear } from './WidgetSettingsGear';
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
        if (entry.dataKey === 'total' || entry.dataKey === 'bestDayTotal') {
          valueLabel = `~${entry.value} ml`;
        } else {
          valueLabel = `${entry.value} ml`;
        }
        let detail: string | null = null;
        if (entry.dataKey === 'foodFluid' || entry.dataKey === 'bestDayFoodFluid') {
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

export function CumulativeFluidChart({ records, focusDate, schedules = [], bestDayCurve, bestDayDate }: CumulativeFluidChartProps) {
  const { settings, update } = useUserWidgetSettings('cumulative_fluid_chart');
  const [soloSeriesKey, setSoloSeriesKey] = useState<FluidSeriesKey | null>(null);

  const { points, bestDayLabel } = useMemo(
    () => buildCumulativeFluidChart(records, focusDate, schedules, bestDayCurve, bestDayDate),
    [records, focusDate, schedules, bestDayCurve, bestDayDate],
  );

  const exposedSeries = useMemo(() => enabledFluidSeries(settings), [settings]);
  const visibleSeries = useMemo(
    () => exposedSeries.filter((series) => soloSeriesKey === null || soloSeriesKey === series.key),
    [exposedSeries, soloSeriesKey],
  );

  const legendPayload = useMemo(
    () => exposedSeries.map((series) => ({
      value: series.key.startsWith('bestDay') && bestDayDate ? `${series.label} (${bestDayDate})` : series.label,
      type: 'line' as const,
      color: series.color,
      inactive: soloSeriesKey !== null && soloSeriesKey !== series.key,
      dataKey: series.key,
    })),
    [exposedSeries, soloSeriesKey, bestDayDate],
  );

  const nowX = nowToRefMs();

  if (points.length === 0) {
    return <div className="empty-state compact-empty">No fluid records for {focusDate} in this range.</div>;
  }

  function handleLegendClick(entry: { value?: string }) {
    const series = exposedSeries.find((item) => {
      const label = item.key.startsWith('bestDay') && bestDayDate ? `${item.label} (${bestDayDate})` : item.label;
      return label === entry.value;
    });
    if (!series) return;
    setSoloSeriesKey((current) => (current === series.key ? null : series.key));
  }

  return (
    <div className="cumulative-fluid-chart">
      <div className="cumulative-fluid-chart-toolbar">
        {bestDayLabel && <p className="muted-text fluid-chart-best-day-label">{bestDayLabel}</p>}
        <WidgetSettingsGear label="Cumulative fluid chart settings">
          <CumulativeFluidChartSettingsFields settings={settings} onChange={update} />
        </WidgetSettingsGear>
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
            {exposedSeries.length > 0 && (
              <Legend
                className="chart-legend-interactive"
                wrapperStyle={{ fontFamily: 'DM Mono, monospace', fontSize: 12 }}
                content={(props) => (
                  <DefaultLegendContent
                    {...props}
                    payload={legendPayload}
                    onClick={(entry) => handleLegendClick(entry)}
                  />
                )}
              />
            )}
            {settings.show_now_bar && (
              <ReferenceLine
                x={nowX}
                stroke="rgba(251,191,36,0.85)"
                strokeWidth={2}
                strokeDasharray="5 4"
                label={{ value: 'now', fill: 'rgba(251,191,36,0.85)', fontSize: 11, fontFamily: 'DM Mono, monospace' }}
              />
            )}
            {visibleSeries.map((series) => (
              <Line
                key={series.key}
                type="stepAfter"
                dataKey={series.key}
                name={series.label}
                stroke={series.color}
                strokeWidth={series.key === 'total' || series.key === 'bestDayTotal' ? 2.5 : 2}
                strokeDasharray={series.dashed ? '6 4' : undefined}
                dot={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
