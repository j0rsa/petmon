# Home Assistant Integration

Log toileting events (and optionally weight) from Home Assistant automations using the petmon REST API.

## Prerequisites

1. **API token** — go to petmon → Settings → API tokens → Create token. Copy the token; it is shown only once.
2. **Pet UUID** — go to petmon → Pets → open the pet profile. The UUID is in the URL: `/pets/<uuid>`.
3. petmon must be reachable from your Home Assistant instance (`http://petmon.local:8080` or your external URL).

---

## `rest_command` definitions

Add these to `configuration.yaml` (or a file included via `!include`). Replace the placeholder values:

- `PETMON_HOST` → your petmon URL, e.g. `http://petmon.local:8080`
- Store your token in `secrets.yaml` as shown below — the full `Bearer …` prefix must be included because `!secret` inside a quoted string is not resolved by HA

**`secrets.yaml`:**
```yaml
petmon_auth_header: "Bearer pm_api_YOURTOKEN"
```

**`configuration.yaml`:**
```yaml
rest_command:

  # Log a toileting event (urination / defecation / vomit / general)
  petmon_log_elimination:
    url: "http://PETMON_HOST/api/v1/elimination/records"
    method: POST
    content_type: "application/json"
    headers:
      Authorization: !secret petmon_auth_header
    payload: >
      {
        "pet_id": "{{ pet_id }}",
        "event_type": "{{ event_type }}",
        "subtype": {{ ('\"' ~ subtype ~ '\"') if subtype else 'null' }},
        "duration_seconds": {{ duration_seconds | default(None) | tojson }},
        "note": {{ ('\"' ~ note ~ '\"') if note else 'null' }},
        "occurred_at": "{{ occurred_at | default('') }}"
      }

  # Log a standalone weight measurement
  petmon_log_weight:
    url: "http://PETMON_HOST/api/v1/health/weight"
    method: POST
    content_type: "application/json"
    headers:
      Authorization: !secret petmon_auth_header
    payload: >
      {
        "pet_id": "{{ pet_id }}",
        "weight_kg": {{ weight_kg | string | replace(',', '.') | float }},
        "note": {{ ('\"' ~ note ~ '\"') if note else 'null' }},
        "measured_at": "{{ measured_at | default('') }}"
      }

  # Log a toileting event and a weight measurement together
  petmon_log_elimination_with_weight:
    url: "http://PETMON_HOST/api/v1/elimination/records/with-weight"
    method: POST
    content_type: "application/json"
    headers:
      Authorization: !secret petmon_auth_header
    payload: >
      {
        "pet_id": "{{ pet_id }}",
        "event_type": {{ ('\"' ~ event_type ~ '\"') if event_type else 'null' }},
        "weight_kg": {{ weight_kg | string | replace(',', '.') | float }},
        "note": {{ ('\"' ~ note ~ '\"') if note else 'null' }},
        "occurred_at": "{{ occurred_at | default('') }}"
      }
```

> **`occurred_at`** accepts a naive local datetime string `YYYY-MM-DDTHH:MM:SS`. When omitted or empty the server defaults to the current time in the configured timezone. For automations triggered by a sensor you can pass the sensor's last-changed time; for manual button presses you can omit it entirely.

> **`weight_kg` decimal separator:** the payload renders through `| replace(',', '.') | float`, so both `4.2` and `4,2` are accepted regardless of locale.

---

## Example: automation triggered by a litter-box sensor

```yaml
automation:
  - alias: "Mittens used the litter box"
    trigger:
      - platform: state
        entity_id: binary_sensor.litter_box_occupied
        from: "on"
        to: "off"
    action:
      - service: rest_command.petmon_log_elimination
        data:
          pet_id: "550e8400-e29b-41d4-a716-446655440000"   # Mittens' UUID
          event_type: "urination"
          subtype: ""
          duration_seconds: >
            {{ (as_timestamp(now()) - as_timestamp(states.binary_sensor.litter_box_occupied.last_changed)) | int }}
          note: ""
```

---

## Example: automation triggered by a smart scale

```yaml
automation:
  - alias: "Mittens stepped off the scale"
    trigger:
      - platform: state
        entity_id: sensor.smart_scale_weight
    action:
      - service: rest_command.petmon_log_weight
        data:
          pet_id: "550e8400-e29b-41d4-a716-446655440000"
          weight_kg: "{{ states('sensor.smart_scale_weight') }}"
          note: ""
```

---

## Example: automation triggered by a smart scale under the litter box

```yaml
automation:
  - alias: "Mittens used the litter box (with weight)"
    trigger:
      - platform: state
        entity_id: binary_sensor.litter_box_occupied
        from: "on"
        to: "off"
    action:
      - service: rest_command.petmon_log_elimination_with_weight
        data:
          pet_id: "550e8400-e29b-41d4-a716-446655440000"
          event_type: "defecation"
          weight_kg: "{{ states('sensor.smart_scale_weight') }}"
          note: ""
```

`event_type` is optional for this endpoint — omit it (pass `null`) to log the weight as a general visit.

---

## Event types and subtypes

| `event_type` | `subtype` values |
|---|---|
| `urination` | *(none)* |
| `defecation` | `normal`, `soft`, `liquid`, `hard`, `blood`, `mucus` |
| `vomit` | `food`, `fur`, `fur_with_food`, `bile`, `other` |
| `general` | *(none)* |

Leave `subtype` empty or omit it when not applicable.

---

## Troubleshooting

- **401 Unauthorized** — verify `secrets.yaml` has `petmon_auth_header: "Bearer pm_api_YOURTOKEN"` (the full value including `Bearer `). Using `"Bearer !secret petmon_token"` won't work — `!secret` inside a quoted string is not resolved.
- **400 Bad Request** — verify `pet_id` is a valid UUID and `event_type` is one of the values above.
- **No records appearing** — confirm the request reaches petmon (check logs with `RUST_LOG=petmon=debug`).
- Test a command manually from HA's Developer Tools → Services → `rest_command.petmon_log_elimination`.
