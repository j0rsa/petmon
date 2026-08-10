import type { CumulativeFluidChartSettings } from '../api/userSettings';
import { WidgetSettingsCheckbox, WidgetSettingsField } from './WidgetSettingsGear';

interface CumulativeFluidChartSettingsFieldsProps {
  settings: CumulativeFluidChartSettings;
  onChange: (patch: Partial<CumulativeFluidChartSettings>) => void;
}

export function CumulativeFluidChartSettingsFields({ settings, onChange }: CumulativeFluidChartSettingsFieldsProps) {
  return (
    <div className="widget-settings-form">
      <p className="widget-settings-title">Chart metrics</p>
      <p className="widget-settings-hint muted-text">Choose which series appear on the chart and in the legend.</p>

      <WidgetSettingsField label="Current day">
        <div className="widget-settings-checkbox-list">
          <WidgetSettingsCheckbox label="Liquids" checked={settings.show_current_liquids} onChange={(show_current_liquids) => onChange({ show_current_liquids })} />
          <WidgetSettingsCheckbox label="Food fluid" checked={settings.show_current_food_fluid} onChange={(show_current_food_fluid) => onChange({ show_current_food_fluid })} />
          <WidgetSettingsCheckbox label="Total" checked={settings.show_current_total} onChange={(show_current_total) => onChange({ show_current_total })} />
        </div>
      </WidgetSettingsField>

      <WidgetSettingsField label="Best day">
        <div className="widget-settings-checkbox-list">
          <WidgetSettingsCheckbox label="Liquids" checked={settings.show_best_day_liquids} onChange={(show_best_day_liquids) => onChange({ show_best_day_liquids })} />
          <WidgetSettingsCheckbox label="Food fluid" checked={settings.show_best_day_food_fluid} onChange={(show_best_day_food_fluid) => onChange({ show_best_day_food_fluid })} />
          <WidgetSettingsCheckbox label="Total" checked={settings.show_best_day_total} onChange={(show_best_day_total) => onChange({ show_best_day_total })} />
        </div>
      </WidgetSettingsField>

      <WidgetSettingsField label="Other">
        <div className="widget-settings-checkbox-list">
          <WidgetSettingsCheckbox label="Schedule" checked={settings.show_schedule} onChange={(show_schedule) => onChange({ show_schedule })} />
          <WidgetSettingsCheckbox label="Now bar" checked={settings.show_now_bar} onChange={(show_now_bar) => onChange({ show_now_bar })} />
        </div>
      </WidgetSettingsField>
    </div>
  );
}
