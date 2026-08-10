import type { NutritionCalendarSettings } from '../api/userSettings';
import { WidgetSettingsCheckbox, WidgetSettingsField, WidgetSettingsRadioGroup } from './WidgetSettingsGear';

interface NutritionCalendarSettingsFieldsProps {
  settings: NutritionCalendarSettings;
  onChange: (patch: Partial<NutritionCalendarSettings>) => void;
}

export function NutritionCalendarSettingsFields({ settings, onChange }: NutritionCalendarSettingsFieldsProps) {
  return (
    <div className="widget-settings-form">
      <p className="widget-settings-title">Calendar display</p>

      <WidgetSettingsField label="Week starts on">
        <WidgetSettingsRadioGroup
          name="calendar_week_start"
          value={settings.week_start}
          options={[
            { value: 'sunday', label: 'Sunday' },
            { value: 'monday', label: 'Monday' },
          ]}
          onChange={(week_start) => onChange({ week_start })}
        />
      </WidgetSettingsField>

      <WidgetSettingsField label="Day cell metrics">
        <div className="widget-settings-checkbox-list">
          <WidgetSettingsCheckbox label="Total fluid (ml)" checked={settings.show_total_fluid} onChange={(show_total_fluid) => onChange({ show_total_fluid })} />
          <WidgetSettingsCheckbox label="Wet food (g)" checked={settings.show_wet_food} onChange={(show_wet_food) => onChange({ show_wet_food })} />
          <WidgetSettingsCheckbox label="Liquids (ml)" checked={settings.show_liquids} onChange={(show_liquids) => onChange({ show_liquids })} />
          <WidgetSettingsCheckbox label="Water (ml)" checked={settings.show_water} onChange={(show_water) => onChange({ show_water })} />
          <WidgetSettingsCheckbox label="Dry food (g)" checked={settings.show_dry_food} onChange={(show_dry_food) => onChange({ show_dry_food })} />
          <WidgetSettingsCheckbox label="Record count (fallback)" checked={settings.show_record_count} onChange={(show_record_count) => onChange({ show_record_count })} />
        </div>
      </WidgetSettingsField>
    </div>
  );
}
