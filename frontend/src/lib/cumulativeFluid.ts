import type { FluidCurvePoint, NutritionRecord, NutritionSchedule } from '../types';
import type { CumulativeFluidChartSettings } from '../api/userSettings';

export const WET_FOOD_FLUID_RATIO = 0.77;

const REF_DATE = { year: 2000, month: 0, day: 1 };

export interface TimePoint {
  x: number;
  label: string;
}

export interface CumulativeFluidPoint extends TimePoint {
  liquids: number;
  foodFluid: number;
  total: number;
  bestDayLiquids: number | null;
  bestDayFoodFluid: number | null;
  bestDayTotal: number | null;
  schedule: number | null;
}

interface ScheduleWindow {
  from: string;
  to: string;
  min: number;
  max: number;
  note?: string;
}

interface ParsedScheduleRules {
  type?: 'liquid' | 'food';
  windows?: ScheduleWindow[];
}

export type FluidSeriesKey =
  | 'liquids'
  | 'foodFluid'
  | 'total'
  | 'bestDayLiquids'
  | 'bestDayFoodFluid'
  | 'bestDayTotal'
  | 'schedule';

export const FLUID_SERIES: Array<{
  key: FluidSeriesKey;
  label: string;
  color: string;
  dashed?: boolean;
  settingsKey: keyof CumulativeFluidChartSettings;
}> = [
  { key: 'liquids', label: 'liquids', color: '#4fd8f8', settingsKey: 'show_current_liquids' },
  { key: 'foodFluid', label: 'food fluid', color: '#4fc8a0', settingsKey: 'show_current_food_fluid' },
  { key: 'total', label: 'total', color: '#d9612a', settingsKey: 'show_current_total' },
  { key: 'bestDayLiquids', label: 'best day — liquids', color: '#888882', dashed: true, settingsKey: 'show_best_day_liquids' },
  { key: 'bestDayFoodFluid', label: 'best day — food fluid', color: '#7a9e8e', dashed: true, settingsKey: 'show_best_day_food_fluid' },
  { key: 'bestDayTotal', label: 'best day — total', color: '#6b6b66', dashed: true, settingsKey: 'show_best_day_total' },
  { key: 'schedule', label: 'schedule', color: '#d9612a', dashed: true, settingsKey: 'show_schedule' },
];

function pad(value: number) {
  return value.toString().padStart(2, '0');
}

export function timeLabelFromOccurredAt(occurredAt: string) {
  return occurredAt.slice(11, 16);
}

export function timeToRefMs(time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(REF_DATE.year, REF_DATE.month, REF_DATE.day, hours, minutes).getTime();
}

export function nowToRefMs() {
  const now = new Date();
  return new Date(REF_DATE.year, REF_DATE.month, REF_DATE.day, now.getHours(), now.getMinutes()).getTime();
}

export function formatRefMs(ms: number) {
  const date = new Date(ms);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fluidFromRecord(record: NutritionRecord) {
  if (record.category === 'liquids' || record.category === 'water') {
    return { liquids: record.amount, foodFluid: 0 };
  }
  if (record.category === 'wet_food') {
    return { liquids: 0, foodFluid: Math.round(record.amount * WET_FOOD_FLUID_RATIO) };
  }
  return { liquids: 0, foodFluid: 0 };
}

function buildStepCurve(records: NutritionRecord[]) {
  const sorted = [...records].sort((left, right) => left.occurred_at.localeCompare(right.occurred_at));
  const times = [...new Set(sorted.map((record) => timeLabelFromOccurredAt(record.occurred_at)))].sort();

  let cumLiquids = 0;
  let cumFood = 0;
  const points: Array<{ x: number; liquids: number; foodFluid: number; total: number }> = [];

  if (times.length === 0) {
    return points;
  }

  const leadIn = timeToRefMs(times[0]) - 20 * 60 * 1000;
  points.push({ x: leadIn, liquids: 0, foodFluid: 0, total: 0 });

  for (const time of times) {
    const atTime = sorted.filter((record) => timeLabelFromOccurredAt(record.occurred_at) === time);
    for (const record of atTime) {
      const contribution = fluidFromRecord(record);
      cumLiquids += contribution.liquids;
      cumFood += contribution.foodFluid;
    }
    points.push({ x: timeToRefMs(time), liquids: cumLiquids, foodFluid: cumFood, total: cumLiquids + cumFood });
  }

  return points;
}

export function bestDayCurvesFromApi(points: FluidCurvePoint[]): Array<{ x: number; liquids: number; foodFluid: number; total: number }> {
  if (points.length === 0) return [];
  const result: Array<{ x: number; liquids: number; foodFluid: number; total: number }> = [];
  const leadIn = timeToRefMs(points[0].time) - 20 * 60 * 1000;
  result.push({ x: leadIn, liquids: 0, foodFluid: 0, total: 0 });
  for (const point of points) {
    const total = point.cumulative_fluid_ml;
    const liquids = point.cumulative_liquids_ml;
    const foodFluid = Math.max(0, total - liquids);
    result.push({ x: timeToRefMs(point.time), liquids, foodFluid, total });
  }
  return result;
}

function parseLiquidScheduleWindows(rulesJson: string): ScheduleWindow[] {
  try {
    const parsed = JSON.parse(rulesJson) as ParsedScheduleRules;
    if (parsed.type !== 'liquid') return [];
    return Array.isArray(parsed.windows) ? parsed.windows : [];
  } catch {
    return [];
  }
}

export function buildScheduleCurve(windows: ScheduleWindow[]) {
  const active = windows
    .filter((w) => w.max > 0)
    .sort((a, b) => a.from.localeCompare(b.from));

  if (active.length === 0) {
    return [] as Array<{ x: number; total: number }>;
  }

  let cumulative = 0;
  const points: Array<{ x: number; total: number }> = [];

  const leadIn = timeToRefMs(active[0].from) - 20 * 60 * 1000;
  points.push({ x: leadIn, total: 0 });

  for (const w of active) {
    const midX = Math.round((timeToRefMs(w.from) + timeToRefMs(w.to)) / 2);
    cumulative += w.max;
    points.push({ x: midX, total: cumulative });
  }

  return points;
}

function projectSeries(
  points: Array<{ x: number; liquids?: number; foodFluid?: number; total?: number }>,
  allX: number[],
  valueKey: 'liquids' | 'foodFluid' | 'total',
) {
  if (points.length === 0) {
    return allX.map((x) => ({ x, value: null as number | null }));
  }

  let last = 0;
  return allX.map((x) => {
    for (let index = points.length - 1; index >= 0; index -= 1) {
      if (points[index].x <= x) {
        last = points[index][valueKey] ?? last;
        break;
      }
    }
    return { x, value: last };
  });
}

function projectTotalSeries(points: Array<{ x: number; total: number }>, allX: number[]) {
  if (points.length === 0) {
    return allX.map((x) => ({ x, value: null as number | null }));
  }

  return allX.map((x) => {
    let value: number | null = null;
    for (let index = points.length - 1; index >= 0; index -= 1) {
      if (points[index].x <= x) {
        value = points[index].total;
        break;
      }
    }
    return { x, value };
  });
}

export function buildCumulativeFluidChart(
  records: NutritionRecord[],
  _focusDate: string,
  schedules: NutritionSchedule[],
  bestDayCurvePoints?: FluidCurvePoint[],
  bestDayDate?: string,
) {
  const dayCurve = buildStepCurve(records);
  const bestDayCurve = bestDayCurvePoints ? bestDayCurvesFromApi(bestDayCurvePoints) : [];

  const liquidSchedule = schedules.find((s) => s.active && s.rules_json.includes('"type":"liquid"'))
    ?? schedules.find((s) => s.rules_json.includes('"type":"liquid"'));
  const scheduleWindows = liquidSchedule ? parseLiquidScheduleWindows(liquidSchedule.rules_json) : [];
  const scheduleCurve = buildScheduleCurve(scheduleWindows);

  const allX = [
    ...new Set([
      ...dayCurve.map((point) => point.x),
      ...bestDayCurve.map((point) => point.x),
      ...scheduleCurve.map((point) => point.x),
    ]),
  ].sort((left, right) => left - right);

  if (allX.length === 0) {
    return { points: [] as CumulativeFluidPoint[], bestDayLabel: null as string | null };
  }

  const liquids = projectSeries(dayCurve, allX, 'liquids');
  const foodFluid = projectSeries(dayCurve, allX, 'foodFluid');
  const total = projectSeries(dayCurve, allX, 'total');
  const bestLiquids = bestDayCurve.length > 0 ? projectSeries(bestDayCurve, allX, 'liquids') : allX.map((x) => ({ x, value: null as number | null }));
  const bestFoodFluid = bestDayCurve.length > 0 ? projectSeries(bestDayCurve, allX, 'foodFluid') : allX.map((x) => ({ x, value: null as number | null }));
  const bestTotal = bestDayCurve.length > 0 ? projectSeries(bestDayCurve, allX, 'total') : allX.map((x) => ({ x, value: null as number | null }));
  const schedule = projectTotalSeries(scheduleCurve, allX);

  const points: CumulativeFluidPoint[] = allX.map((x, index) => ({
    x,
    label: formatRefMs(x),
    liquids: liquids[index].value ?? 0,
    foodFluid: foodFluid[index].value ?? 0,
    total: total[index].value ?? 0,
    bestDayLiquids: bestLiquids[index].value,
    bestDayFoodFluid: bestFoodFluid[index].value,
    bestDayTotal: bestTotal[index].value,
    schedule: schedule[index].value,
  }));

  const bestDayLiquidsMl = bestDayCurve.at(-1)?.liquids ?? 0;
  const bestDayTotalMl = bestDayCurve.at(-1)?.total ?? 0;
  const bestDayLabel = bestDayDate
    ? `best day — ${bestDayDate} (~${Math.round(bestDayLiquidsMl)} ml liquids, ~${Math.round(bestDayTotalMl)} ml total)`
    : null;

  return { points, bestDayLabel };
}

export function enabledFluidSeries(settings: CumulativeFluidChartSettings) {
  return FLUID_SERIES.filter((series) => settings[series.settingsKey]);
}
