use crate::domain::elimination::{
    CreateEliminationRecord, EliminationRecordFilters, UpdateEliminationRecord,
};
use crate::domain::health_state::{CreateHealthStateRecord, HealthStateRecordFilters};
use crate::domain::nutrition_record::BatchCreateNutritionRecords;
use crate::domain::nutrition_record::{
    CreateNutritionRecord, NutritionRecordFilters, UpdateNutritionRecord,
};
use crate::domain::nutrition_schedule::{CreateNutritionSchedule, UpdateNutritionSchedule};
use crate::domain::pet::{CreatePet, UpdatePet};
use crate::domain::weight::{CreateWeightRecord, WeightRecordFilters};
use crate::error::{AppError, AppResult};
use crate::services::{
    day_service, elimination_analytics_service, elimination_record_service, health_state_service,
    nutrition_analytics_service, nutrition_record_service, nutrition_schedule_service,
    nutrition_status_service, pet_service, weight_service,
};
use chrono::Utc;
use chrono_tz::Tz;
use serde_json::{json, Value};
use sqlx::SqlitePool;
use uuid::Uuid;

fn require_uuid(params: &Value, key: &str) -> AppResult<Uuid> {
    let value = params
        .get(key)
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::BadRequest(format!("{key} required")))?;
    Uuid::parse_str(value).map_err(|_| AppError::BadRequest(format!("invalid {key}")))
}

fn optional_uuid(params: &Value, key: &str) -> AppResult<Option<Uuid>> {
    match params.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(value) => {
            let text = value
                .as_str()
                .ok_or_else(|| AppError::BadRequest(format!("{key} must be a string")))?;
            if text.is_empty() {
                return Ok(None);
            }
            Uuid::parse_str(text)
                .map(Some)
                .map_err(|_| AppError::BadRequest(format!("invalid {key}")))
        }
    }
}

/// All tools available via MCP, used to respond to `tools/list`.
fn tool_list() -> Value {
    json!({
        "tools": [
            // ── Pets ─────────────────────────────────────────────────────────
            {
                "name": "pets/list",
                "description": "List all pets.",
                "inputSchema": { "type": "object", "properties": {} }
            },
            {
                "name": "pets/get",
                "description": "Get a pet by UUID.",
                "inputSchema": {
                    "type": "object",
                    "required": ["id"],
                    "properties": { "id": { "type": "string", "format": "uuid" } }
                }
            },
            {
                "name": "pets/create",
                "description": "Create a new pet.",
                "inputSchema": {
                    "type": "object",
                    "required": ["name"],
                    "properties": {
                        "name":            { "type": "string" },
                        "species":         { "type": "string", "enum": ["cat", "dog", "bunny", "parrot", "other"] },
                        "status":          { "type": "string", "enum": ["active", "archived"] },
                        "breed":           { "type": "string" },
                        "birth_date":      { "type": "string", "format": "date" },
                        "blood_type":      { "type": "string" },
                        "color":           { "type": "string" },
                        "feeding_notes":   { "type": "string" },
                        "telegram_chat_id":   { "type": "string" },
                        "telegram_thread_id": { "type": "string" }
                    }
                }
            },
            {
                "name": "pets/update",
                "description": "Update fields on an existing pet. Weight is managed via weight/records/create — do not pass weight_kg here.",
                "inputSchema": {
                    "type": "object",
                    "required": ["id"],
                    "properties": {
                        "id":              { "type": "string", "format": "uuid" },
                        "name":            { "type": "string" },
                        "species":         { "type": "string" },
                        "status":          { "type": "string", "enum": ["active", "archived"] },
                        "breed":           { "type": "string" },
                        "birth_date":      { "type": "string", "format": "date" },
                        "blood_type":      { "type": "string" },
                        "color":           { "type": "string" },
                        "feeding_notes":   { "type": "string" },
                        "telegram_chat_id":   { "type": "string" },
                        "telegram_thread_id": { "type": "string" }
                    }
                }
            },
            // pets/delete intentionally omitted — use pets/update with status=archived instead.

            // ── Nutrition records ────────────────────────────────────────────
            {
                "name": "nutrition/records/list",
                "description": "List nutrition records with optional filters.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "pet_id":    { "type": "string", "format": "uuid" },
                        "date":      { "type": "string", "format": "date", "description": "Exact date filter (YYYY-MM-DD)" },
                        "date_from": { "type": "string", "format": "date" },
                        "date_to":   { "type": "string", "format": "date" },
                        "category":  { "type": "string", "enum": ["wet_food", "dry_food", "water", "liquids"] },
                        "limit":     { "type": "integer" },
                        "offset":    { "type": "integer" }
                    }
                }
            },
            {
                "name": "nutrition/records/get",
                "description": "Get a single nutrition record by ID.",
                "inputSchema": {
                    "type": "object",
                    "required": ["id"],
                    "properties": { "id": { "type": "string" } }
                }
            },
            {
                "name": "nutrition/records/create",
                "description": "Create a single nutrition record. Also triggers a Telegram notification if configured.",
                "inputSchema": {
                    "type": "object",
                    "required": ["pet_id", "category", "amount"],
                    "properties": {
                        "pet_id":      { "type": "string", "format": "uuid" },
                        "occurred_at": { "type": "string", "description": "Naive local datetime YYYY-MM-DDTHH:MM:SS. Defaults to now." },
                        "local_date":  { "type": "string", "format": "date" },
                        "category":    { "type": "string", "enum": ["wet_food", "dry_food", "water", "liquids"] },
                        "amount":      { "type": "number" },
                        "unit":        { "type": "string" },
                        "note":        { "type": "string", "description": "Optional note about this intake (food type, medication, etc.)" },
                        "source_type": { "type": "string" }
                    }
                }
            },
            {
                "name": "nutrition/records/batch-create",
                "description": "Create multiple nutrition records in one call. Note: does NOT trigger Telegram notifications.",
                "inputSchema": {
                    "type": "object",
                    "required": ["records"],
                    "properties": {
                        "records": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "required": ["pet_id", "category", "amount"],
                                "properties": {
                                    "pet_id":      { "type": "string", "format": "uuid" },
                                    "occurred_at": { "type": "string" },
                                    "local_date":  { "type": "string", "format": "date" },
                                    "category":    { "type": "string" },
                                    "amount":      { "type": "number" },
                                    "unit":        { "type": "string" },
                                    "note":        { "type": "string" },
                                    "source_type": { "type": "string" }
                                }
                            }
                        }
                    }
                }
            },
            {
                "name": "nutrition/records/update",
                "description": "Update a nutrition record. Also updates the Telegram message if one was sent.",
                "inputSchema": {
                    "type": "object",
                    "required": ["id"],
                    "properties": {
                        "id":          { "type": "string" },
                        "occurred_at": { "type": "string" },
                        "local_date":  { "type": "string", "format": "date" },
                        "category":    { "type": "string" },
                        "amount":      { "type": "number" },
                        "unit":        { "type": "string" },
                        "note":        { "type": ["string", "null"], "description": "Optional note; pass null to clear" }
                    }
                }
            },
            {
                "name": "nutrition/records/delete",
                "description": "Delete a nutrition record by ID. Also deletes the Telegram message if one was sent.",
                "inputSchema": {
                    "type": "object",
                    "required": ["id"],
                    "properties": { "id": { "type": "string" } }
                }
            },

            // ── Days & notes ─────────────────────────────────────────────────
            {
                "name": "days/summary",
                "description": "Get a day summary: all nutrition records, totals by category, and the day note.",
                "inputSchema": {
                    "type": "object",
                    "required": ["date"],
                    "properties": {
                        "date":   { "type": "string", "format": "date" },
                        "pet_id": { "type": "string", "format": "uuid" }
                    }
                }
            },
            {
                "name": "days/note/get",
                "description": "Get the note for a specific day.",
                "inputSchema": {
                    "type": "object",
                    "required": ["date"],
                    "properties": {
                        "date":   { "type": "string", "format": "date" },
                        "pet_id": { "type": "string", "format": "uuid" }
                    }
                }
            },
            {
                "name": "days/note/set",
                "description": "Create or update the note for a specific day.",
                "inputSchema": {
                    "type": "object",
                    "required": ["date", "note"],
                    "properties": {
                        "date":   { "type": "string", "format": "date" },
                        "pet_id": { "type": "string", "format": "uuid" },
                        "note":   { "type": "string" }
                    }
                }
            },

            // ── Nutrition context (high-level summary) ───────────────────────
            {
                "name": "pets/nutrition-context",
                "description": "Returns nutrition context for a single pet: profile, today's records, active schedules, 7-day trend, and a precomputed status block (on_track, cumulative intake vs schedule as of now). Prefer nutrition/on-track for a simple on-track yes/no; use this when you also need records, schedule windows, or weekly trend.",
                "inputSchema": {
                    "type": "object",
                    "required": ["pet_id"],
                    "properties": {
                        "pet_id": { "type": "string", "format": "uuid", "description": "UUID of the pet" },
                        "today":  { "type": "string", "format": "date", "description": "Override today's date (YYYY-MM-DD). Defaults to server timezone date." }
                    }
                }
            },

            // ── Nutrition analytics ──────────────────────────────────────────
            {
                "name": "nutrition/analytics/daily-totals",
                "description": "Get per-category daily totals for a date range.",
                "inputSchema": {
                    "type": "object",
                    "required": ["date_from", "date_to"],
                    "properties": {
                        "date_from": { "type": "string", "format": "date" },
                        "date_to":   { "type": "string", "format": "date" },
                        "pet_id":    { "type": "string", "format": "uuid" },
                        "category":  { "type": "string" }
                    }
                }
            },
            {
                "name": "nutrition/analytics/range-summary",
                "description": "Get aggregated nutrition summary with per-category averages for a date range.",
                "inputSchema": {
                    "type": "object",
                    "required": ["date_from", "date_to"],
                    "properties": {
                        "date_from": { "type": "string", "format": "date" },
                        "date_to":   { "type": "string", "format": "date" },
                        "pet_id":    { "type": "string", "format": "uuid" },
                        "category":  { "type": "string" }
                    }
                }
            },
            {
                "name": "nutrition/analytics/best-fluid-day",
                "description": "Get the best historical fluid intake day with a cumulative curve.",
                "inputSchema": {
                    "type": "object",
                    "required": ["exclude_date"],
                    "properties": {
                        "exclude_date": { "type": "string", "format": "date", "description": "Exclude this date (usually today)" },
                        "pet_id":       { "type": "string", "format": "uuid" }
                    }
                }
            },
            {
                "name": "nutrition/status",
                "description": "Get cumulative nutrition intake and liquid schedule expectations for a pet as of a point in time. Returns on_track, delta_ml, and expected_ml. When ts is omitted, uses the current server time.",
                "inputSchema": {
                    "type": "object",
                    "required": ["pet_id"],
                    "properties": {
                        "pet_id": { "type": "string", "format": "uuid" },
                        "ts":     { "type": "string", "description": "As-of timestamp (RFC3339 or YYYY-MM-DDTHH:MM:SS). Defaults to now." }
                    }
                }
            },
            {
                "name": "nutrition/on-track",
                "description": "Quick on-track check for a pet's liquid intake vs the active schedule as of now. Returns on_track (boolean|null), delta_ml, expected_ml, direct_liquid_ml, and a plain-language summary. Use this first for questions like 'is the pet still on track?'",
                "inputSchema": {
                    "type": "object",
                    "required": ["pet_id"],
                    "properties": {
                        "pet_id": { "type": "string", "format": "uuid" },
                        "ts":     { "type": "string", "description": "As-of timestamp (RFC3339 or YYYY-MM-DDTHH:MM:SS). Defaults to now." }
                    }
                }
            },

            // ── Nutrition schedules ──────────────────────────────────────────
            {
                "name": "nutrition/schedules/list",
                "description": "List nutrition schedules.",
                "inputSchema": {
                    "type": "object",
                    "properties": { "pet_id": { "type": "string", "format": "uuid" } }
                }
            },
            {
                "name": "nutrition/schedules/get",
                "description": "Get a nutrition schedule by ID.",
                "inputSchema": {
                    "type": "object",
                    "required": ["id"],
                    "properties": { "id": { "type": "string" } }
                }
            },
            {
                "name": "nutrition/schedules/create",
                "description": "Create a nutrition schedule.",
                "inputSchema": {
                    "type": "object",
                    "required": ["pet_id", "name"],
                    "properties": {
                        "pet_id": { "type": "string", "format": "uuid" },
                        "name":   { "type": "string" },
                        "active": { "type": "boolean" },
                        "rules":  { "type": "array" }
                    }
                }
            },
            {
                "name": "nutrition/schedules/update",
                "description": "Update a nutrition schedule.",
                "inputSchema": {
                    "type": "object",
                    "required": ["id"],
                    "properties": {
                        "id":     { "type": "string" },
                        "name":   { "type": "string" },
                        "active": { "type": "boolean" },
                        "rules":  { "type": "array" }
                    }
                }
            },
            {
                "name": "nutrition/schedules/delete",
                "description": "Delete a nutrition schedule by ID.",
                "inputSchema": {
                    "type": "object",
                    "required": ["id"],
                    "properties": { "id": { "type": "string" } }
                }
            },

            // ── Elimination / toileting records ──────────────────────────────
            {
                "name": "elimination/records/list",
                "description": "List toileting/elimination records for a pet. event_type: general|urination|defecation|vomit",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "pet_id":     { "type": "string", "format": "uuid" },
                        "date":       { "type": "string", "format": "date" },
                        "date_from":  { "type": "string", "format": "date" },
                        "date_to":    { "type": "string", "format": "date" },
                        "event_type": { "type": "string", "enum": ["general", "urination", "defecation", "vomit"] },
                        "limit":      { "type": "integer" },
                        "offset":     { "type": "integer" }
                    }
                }
            },
            {
                "name": "elimination/records/create",
                "description": "Log a toileting event. subtype for defecation: normal|soft|liquid|hard|blood|mucus; for vomit: food|fur|bile|other",
                "inputSchema": {
                    "type": "object",
                    "required": ["pet_id", "event_type"],
                    "properties": {
                        "pet_id":           { "type": "string", "format": "uuid" },
                        "event_type":       { "type": "string", "enum": ["general", "urination", "defecation", "vomit"] },
                        "subtype":          { "type": "string" },
                        "duration_seconds": { "type": "integer" },
                        "occurred_at":      { "type": "string", "format": "date-time" },
                        "note":             { "type": "string" }
                    }
                }
            },
            {
                "name": "elimination/records/update",
                "description": "Update an elimination record.",
                "inputSchema": {
                    "type": "object",
                    "required": ["id"],
                    "properties": {
                        "id":               { "type": "string" },
                        "event_type":       { "type": "string", "enum": ["general", "urination", "defecation", "vomit"] },
                        "subtype":          { "type": ["string", "null"] },
                        "duration_seconds": { "type": ["integer", "null"] },
                        "occurred_at":      { "type": "string" },
                        "note":             { "type": ["string", "null"] }
                    }
                }
            },
            {
                "name": "elimination/records/delete",
                "description": "Delete an elimination record by ID.",
                "inputSchema": {
                    "type": "object",
                    "required": ["id"],
                    "properties": { "id": { "type": "string" } }
                }
            },
            {
                "name": "elimination/analytics/range-summary",
                "description": "Get aggregated elimination summary with daily breakdown and percentiles for a date range.",
                "inputSchema": {
                    "type": "object",
                    "required": ["date_from", "date_to"],
                    "properties": {
                        "date_from": { "type": "string", "format": "date" },
                        "date_to":   { "type": "string", "format": "date" },
                        "pet_id":    { "type": "string", "format": "uuid" }
                    }
                }
            },

            // ── Elimination context ──────────────────────────────────────────
            {
                "name": "pets/elimination-context",
                "description": "Returns a complete toileting context for a single pet in one call: pet profile, today's elimination records with type breakdown, and a 7-day trend summary (avg visits/day, vomit days, p50/p90 per day). Use this as the starting point for any question about a pet's toileting habits — it answers 'how many times today?', 'any vomit recently?', 'is the frequency normal?', and 'what types occurred?' without additional tool calls. Event types use informal labels: urination=wee, defecation=poop.",
                "inputSchema": {
                    "type": "object",
                    "required": ["pet_id"],
                    "properties": {
                        "pet_id": { "type": "string", "format": "uuid", "description": "UUID of the pet" },
                        "today":  { "type": "string", "format": "date", "description": "Override today's date (YYYY-MM-DD). Defaults to server UTC date." }
                    }
                }
            },

            // ── API token scopes ─────────────────────────────────────────────
            {
                "name": "api-tokens/scopes/update",
                "description": "Update the scopes on an existing API token. Valid scopes: all, api_read, api_write, mcp.",
                "inputSchema": {
                    "type": "object",
                    "required": ["id", "scopes"],
                    "properties": {
                        "id":     { "type": "string", "description": "Token ID" },
                        "scopes": { "type": "array", "items": { "type": "string", "enum": ["all", "api_read", "api_write", "mcp"] } }
                    }
                }
            },

            // ── Weight records ───────────────────────────────────────────────
            {
                "name": "weight/records/list",
                "description": "List weight records for a pet. Without date_from/date_to returns the last 10 records (newest first). With a date range returns all matches (oldest first) for charting.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "pet_id":    { "type": "string", "format": "uuid" },
                        "date_from": { "type": "string", "format": "date" },
                        "date_to":   { "type": "string", "format": "date" },
                        "limit":     { "type": "integer" },
                        "offset":    { "type": "integer" }
                    }
                }
            },
            {
                "name": "weight/records/create",
                "description": "Record a weight measurement. Also updates the pet's current weight_kg.",
                "inputSchema": {
                    "type": "object",
                    "required": ["pet_id", "weight_kg"],
                    "properties": {
                        "pet_id":      { "type": "string", "format": "uuid" },
                        "weight_kg":   { "type": "number" },
                        "measured_at": { "type": "string", "format": "date-time" },
                        "note":        { "type": "string" }
                    }
                }
            },
            {
                "name": "weight/records/delete",
                "description": "Delete a weight record by ID.",
                "inputSchema": {
                    "type": "object",
                    "required": ["id"],
                    "properties": { "id": { "type": "string" } }
                }
            },
            {
                "name": "weight/summary",
                "description": "Get aggregated weight history bucketed by granularity. Use raw for ≤30d windows, daily for ≤90d, weekly for longer periods. Returns avg/min/max per bucket for chart rendering.",
                "inputSchema": {
                    "type": "object",
                    "required": ["pet_id", "date_to"],
                    "properties": {
                        "pet_id":      { "type": "string", "format": "uuid" },
                        "date_from":   { "type": "string", "format": "date" },
                        "date_to":     { "type": "string", "format": "date" },
                        "granularity": { "type": "string", "enum": ["raw", "daily", "weekly"], "default": "daily" }
                    }
                }
            },

            // ── Overall health state (wellbeing check-ins) ───────────────────
            {
                "name": "health/state/list",
                "description": "List overall wellbeing check-ins for a pet. Without date_from/date_to returns the last 10 records (newest first). With a date range returns all matches (oldest first) for charting.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "pet_id":    { "type": "string", "format": "uuid" },
                        "date_from": { "type": "string", "format": "date" },
                        "date_to":   { "type": "string", "format": "date" },
                        "limit":     { "type": "integer" },
                        "offset":    { "type": "integer" }
                    }
                }
            },
            {
                "name": "health/state/create",
                "description": "Log an overall wellbeing check-in. Levels: terrible, poor, ok, good, amazing.",
                "inputSchema": {
                    "type": "object",
                    "required": ["pet_id", "level"],
                    "properties": {
                        "pet_id":      { "type": "string", "format": "uuid" },
                        "level":       { "type": "string", "enum": ["terrible", "poor", "ok", "good", "amazing"] },
                        "occurred_at": { "type": "string", "description": "Naive local datetime YYYY-MM-DDTHH:MM:SS. Defaults to now." },
                        "local_date":  { "type": "string", "format": "date" },
                        "note":        { "type": "string", "description": "Optional caregiver note (energy, appetite, mood, etc.)" },
                        "source_type": { "type": "string" }
                    }
                }
            },
            {
                "name": "health/state/delete",
                "description": "Delete a wellbeing check-in by ID.",
                "inputSchema": {
                    "type": "object",
                    "required": ["id"],
                    "properties": { "id": { "type": "string" } }
                }
            },

            // ── Health context ───────────────────────────────────────────────
            {
                "name": "pets/health-context",
                "description": "Returns a complete health context for a single pet in one call: pet profile, the last 10 weight records (most recent first), 30-day weight stats (latest_kg, avg_kg, count), and the last 10 overall wellbeing check-ins (level + optional note, most recent first). Weight is not included in the pet profile — use stats_30d.latest_kg for current weight. Use recent_state_checks to answer 'how has the pet been feeling?' and read any caregiver notes. Levels: terrible, poor, ok, good, amazing.",
                "inputSchema": {
                    "type": "object",
                    "required": ["pet_id"],
                    "properties": {
                        "pet_id": { "type": "string", "format": "uuid", "description": "UUID of the pet" }
                    }
                }
            }
        ]
    })
}

pub async fn dispatch(
    pool: &SqlitePool,
    method: &str,
    params: Option<Value>,
    timezone: Tz,
) -> AppResult<Value> {
    let params = params.unwrap_or_else(|| json!({}));

    match method {
        // ── MCP protocol ─────────────────────────────────────────────────────
        "tools/list" => Ok(tool_list()),

        // ── Pets ─────────────────────────────────────────────────────────────
        "pets/list" => {
            let pets = pet_service::list(pool).await?;
            Ok(json!(pets))
        }
        "pets/get" => {
            let id = require_uuid(&params, "id")?;
            let pet = pet_service::get(pool, id).await?;
            Ok(json!(pet))
        }
        "pets/create" => {
            let req: CreatePet =
                serde_json::from_value(params).map_err(|e| AppError::BadRequest(e.to_string()))?;
            let pet = pet_service::create(pool, req).await?;
            Ok(json!(pet))
        }
        "pets/update" => {
            let id = require_uuid(&params, "id")?;
            let req: UpdatePet =
                serde_json::from_value(params).map_err(|e| AppError::BadRequest(e.to_string()))?;
            let pet = pet_service::update(pool, id, req).await?;
            Ok(json!(pet))
        }
        // pets/delete removed — use pets/update with status=archived

        // ── Nutrition records ─────────────────────────────────────────────────
        "nutrition/records/list" => {
            let filters: NutritionRecordFilters =
                serde_json::from_value(params).map_err(|e| AppError::BadRequest(e.to_string()))?;
            let records = nutrition_record_service::list(pool, filters).await?;
            Ok(json!(records))
        }
        "nutrition/records/get" => {
            let id = params["id"]
                .as_str()
                .ok_or_else(|| AppError::BadRequest("id required".to_string()))?;
            let record = nutrition_record_service::get(pool, id).await?;
            Ok(json!(record))
        }
        "nutrition/records/create" => {
            let req: CreateNutritionRecord =
                serde_json::from_value(params).map_err(|e| AppError::BadRequest(e.to_string()))?;
            let record = nutrition_record_service::create(pool, req, timezone).await?;
            Ok(json!(record))
        }
        "nutrition/records/batch-create" => {
            let req: BatchCreateNutritionRecords =
                serde_json::from_value(params).map_err(|e| AppError::BadRequest(e.to_string()))?;
            let records =
                nutrition_record_service::batch_create(pool, req.records, timezone).await?;
            Ok(json!(records))
        }
        "nutrition/records/update" => {
            let id = params["id"]
                .as_str()
                .ok_or_else(|| AppError::BadRequest("id required".to_string()))?
                .to_string();
            let req: UpdateNutritionRecord =
                serde_json::from_value(params).map_err(|e| AppError::BadRequest(e.to_string()))?;
            let record = nutrition_record_service::update(pool, &id, req).await?;
            Ok(json!(record))
        }
        "nutrition/records/delete" => {
            let id = params["id"]
                .as_str()
                .ok_or_else(|| AppError::BadRequest("id required".to_string()))?;
            nutrition_record_service::delete(pool, id).await?;
            Ok(json!({ "deleted": true }))
        }

        // ── Days & notes ──────────────────────────────────────────────────────
        "days/summary" => {
            let date = params["date"]
                .as_str()
                .ok_or_else(|| AppError::BadRequest("date required".to_string()))?;
            let pet_id = optional_uuid(&params, "pet_id")?;
            let summary = day_service::get_day_summary(pool, date, pet_id).await?;
            Ok(json!(summary))
        }
        "days/note/get" => {
            let date = params["date"]
                .as_str()
                .ok_or_else(|| AppError::BadRequest("date required".to_string()))?;
            let pet_id = optional_uuid(&params, "pet_id")?;
            let summary = day_service::get_day_summary(pool, date, pet_id).await?;
            Ok(json!({ "date": date, "note": summary.note }))
        }
        "days/note/set" => {
            let date = params["date"]
                .as_str()
                .ok_or_else(|| AppError::BadRequest("date required".to_string()))?;
            let note = params["note"]
                .as_str()
                .ok_or_else(|| AppError::BadRequest("note required".to_string()))?;
            let pet_id = optional_uuid(&params, "pet_id")?;
            day_service::update_day_note(pool, date, pet_id, note).await?;
            Ok(json!({ "date": date, "note": note }))
        }

        // ── Nutrition context ─────────────────────────────────────────────────
        "pets/nutrition-context" => {
            let pet_id = require_uuid(&params, "pet_id")?;
            let today = params["today"]
                .as_str()
                .map(str::to_owned)
                .unwrap_or_else(|| Utc::now().with_timezone(&timezone).date_naive().to_string());
            let week_from = {
                let d = chrono::NaiveDate::parse_from_str(&today, "%Y-%m-%d")
                    .map_err(|_| AppError::BadRequest("invalid today date".to_string()))?;
                (d - chrono::Duration::days(6)).to_string()
            };
            let now_time = Utc::now().with_timezone(&timezone).format("%H:%M:%S").to_string();
            let status_ts = format!("{today}T{now_time}");

            let (pet, today_summary, schedules, trend, status) = tokio::try_join!(
                pet_service::get(pool, pet_id),
                day_service::get_day_summary(pool, &today, Some(pet_id)),
                nutrition_schedule_service::list(pool, Some(pet_id)),
                nutrition_analytics_service::range_summary(
                    pool,
                    &week_from,
                    &today,
                    Some(pet_id),
                    None
                ),
                nutrition_status_service::get_status(pool, pet_id, Some(&status_ts), timezone),
            )?;

            let active_schedules: Vec<_> = schedules.iter().filter(|s| s.active).collect();

            Ok(json!({
                "pet": pet,
                "today": today,
                "status": status,
                "today_summary": today_summary,
                "active_schedules": active_schedules,
                "trend_7d": trend
            }))
        }

        // ── Nutrition analytics ───────────────────────────────────────────────
        "nutrition/analytics/daily-totals" => {
            let date_from = params["date_from"]
                .as_str()
                .ok_or_else(|| AppError::BadRequest("date_from required".to_string()))?;
            let date_to = params["date_to"]
                .as_str()
                .ok_or_else(|| AppError::BadRequest("date_to required".to_string()))?;
            let pet_id = optional_uuid(&params, "pet_id")?;
            let category = params["category"].as_str();
            let totals = nutrition_analytics_service::daily_totals(
                pool, date_from, date_to, pet_id, category,
            )
            .await?;
            Ok(json!(totals))
        }
        "nutrition/analytics/range-summary" => {
            let date_from = params["date_from"]
                .as_str()
                .ok_or_else(|| AppError::BadRequest("date_from required".to_string()))?;
            let date_to = params["date_to"]
                .as_str()
                .ok_or_else(|| AppError::BadRequest("date_to required".to_string()))?;
            let pet_id = optional_uuid(&params, "pet_id")?;
            let category = params["category"].as_str();
            let summary = nutrition_analytics_service::range_summary(
                pool, date_from, date_to, pet_id, category,
            )
            .await?;
            Ok(json!(summary))
        }
        "nutrition/analytics/best-fluid-day" => {
            let exclude_date = params["exclude_date"]
                .as_str()
                .ok_or_else(|| AppError::BadRequest("exclude_date required".to_string()))?;
            let pet_id = optional_uuid(&params, "pet_id")?;
            let result =
                nutrition_analytics_service::best_fluid_day(pool, pet_id, exclude_date).await?;
            Ok(json!(result))
        }
        "nutrition/status" => {
            let pet_id = require_uuid(&params, "pet_id")?;
            let ts = params["ts"].as_str();
            let status =
                nutrition_status_service::get_status(pool, pet_id, ts, timezone).await?;
            Ok(json!(status))
        }
        "nutrition/on-track" => {
            let pet_id = require_uuid(&params, "pet_id")?;
            let ts = params["ts"].as_str();
            let status =
                nutrition_status_service::get_status(pool, pet_id, ts, timezone).await?;
            Ok(nutrition_status_service::on_track_summary(&status))
        }

        // ── Nutrition schedules ───────────────────────────────────────────────
        "nutrition/schedules/list" => {
            let pet_id = optional_uuid(&params, "pet_id")?;
            let schedules = nutrition_schedule_service::list(pool, pet_id).await?;
            Ok(json!(schedules))
        }
        "nutrition/schedules/get" => {
            let id = params["id"]
                .as_str()
                .ok_or_else(|| AppError::BadRequest("id required".to_string()))?;
            let schedule = nutrition_schedule_service::get(pool, id).await?;
            Ok(json!(schedule))
        }
        "nutrition/schedules/create" => {
            let req: CreateNutritionSchedule =
                serde_json::from_value(params).map_err(|e| AppError::BadRequest(e.to_string()))?;
            let schedule = nutrition_schedule_service::create(pool, req).await?;
            Ok(json!(schedule))
        }
        "nutrition/schedules/update" => {
            let id = params["id"]
                .as_str()
                .ok_or_else(|| AppError::BadRequest("id required".to_string()))?
                .to_string();
            let req: UpdateNutritionSchedule =
                serde_json::from_value(params).map_err(|e| AppError::BadRequest(e.to_string()))?;
            let schedule = nutrition_schedule_service::update(pool, &id, req).await?;
            Ok(json!(schedule))
        }
        "nutrition/schedules/delete" => {
            let id = params["id"]
                .as_str()
                .ok_or_else(|| AppError::BadRequest("id required".to_string()))?;
            nutrition_schedule_service::delete(pool, id).await?;
            Ok(json!({ "deleted": true }))
        }

        // ── Elimination records ───────────────────────────────────────────────
        "elimination/records/list" => {
            let filters: EliminationRecordFilters =
                serde_json::from_value(params).map_err(|e| AppError::BadRequest(e.to_string()))?;
            let records = elimination_record_service::list(pool, filters).await?;
            Ok(json!(records))
        }
        "elimination/records/create" => {
            let req: CreateEliminationRecord =
                serde_json::from_value(params).map_err(|e| AppError::BadRequest(e.to_string()))?;
            let record = elimination_record_service::create(pool, req, timezone).await?;
            Ok(json!(record))
        }
        "elimination/records/update" => {
            let id = params["id"]
                .as_str()
                .ok_or_else(|| AppError::BadRequest("id required".to_string()))?
                .to_string();
            let req: UpdateEliminationRecord =
                serde_json::from_value(params).map_err(|e| AppError::BadRequest(e.to_string()))?;
            let record = elimination_record_service::update(pool, &id, req).await?;
            Ok(json!(record))
        }
        "elimination/records/delete" => {
            let id = params["id"]
                .as_str()
                .ok_or_else(|| AppError::BadRequest("id required".to_string()))?;
            elimination_record_service::delete(pool, id).await?;
            Ok(json!({ "deleted": true }))
        }
        "elimination/analytics/range-summary" => {
            let date_from = params["date_from"]
                .as_str()
                .ok_or_else(|| AppError::BadRequest("date_from required".to_string()))?;
            let date_to = params["date_to"]
                .as_str()
                .ok_or_else(|| AppError::BadRequest("date_to required".to_string()))?;
            let pet_id = params["pet_id"].as_str();
            let summary =
                elimination_analytics_service::range_summary(pool, pet_id, date_from, date_to)
                    .await?;
            Ok(json!(summary))
        }

        // ── Elimination context ───────────────────────────────────────────────
        "pets/elimination-context" => {
            let pet_id = require_uuid(&params, "pet_id")?;
            let today = params["today"]
                .as_str()
                .map(str::to_owned)
                .unwrap_or_else(|| Utc::now().date_naive().to_string());
            let week_from = {
                let d = chrono::NaiveDate::parse_from_str(&today, "%Y-%m-%d")
                    .map_err(|_| AppError::BadRequest("invalid today date".to_string()))?;
                (d - chrono::Duration::days(6)).to_string()
            };

            let today_filters = crate::domain::elimination::EliminationRecordFilters {
                pet_id: Some(pet_id.to_string()),
                date: Some(today.clone()),
                date_from: None,
                date_to: None,
                event_type: None,
                limit: None,
                offset: None,
            };

            let pet_id_str = pet_id.to_string();
            let (pet, today_records, trend) = tokio::try_join!(
                pet_service::get(pool, pet_id),
                elimination_record_service::list(pool, today_filters),
                elimination_analytics_service::range_summary(
                    pool,
                    Some(pet_id_str.as_str()),
                    &week_from,
                    &today
                ),
            )?;

            let wee_count = today_records
                .iter()
                .filter(|r| r.event_type.to_string() == "urination")
                .count();
            let poop_count = today_records
                .iter()
                .filter(|r| r.event_type.to_string() == "defecation")
                .count();
            let vomit_count = today_records
                .iter()
                .filter(|r| r.event_type.to_string() == "vomit")
                .count();

            Ok(json!({
                "pet": pet,
                "today": today,
                "today_summary": {
                    "total": today_records.len(),
                    "wee": wee_count,
                    "poop": poop_count,
                    "vomit": vomit_count,
                    "general": today_records.len() - wee_count - poop_count - vomit_count,
                    "records": today_records
                },
                "trend_7d": trend
            }))
        }

        // ── API token scopes ──────────────────────────────────────────────────
        "api-tokens/scopes/update" => {
            use crate::domain::settings::{is_valid_scope, UpdateApiTokenScopes};
            let id = params["id"]
                .as_str()
                .ok_or_else(|| AppError::BadRequest("id required".to_string()))?;
            let scopes: Vec<String> = params["scopes"]
                .as_array()
                .ok_or_else(|| AppError::BadRequest("scopes must be an array".to_string()))?
                .iter()
                .map(|v| {
                    v.as_str()
                        .ok_or_else(|| AppError::BadRequest("scope must be a string".to_string()))
                        .map(str::to_owned)
                })
                .collect::<AppResult<Vec<_>>>()?;
            for s in &scopes {
                if !is_valid_scope(s) {
                    return Err(AppError::BadRequest(format!("unknown scope '{s}'")));
                }
            }
            let req = UpdateApiTokenScopes { scopes };
            let token = crate::repo::api_tokens::update_scopes(pool, id, req).await?;
            let scopes = token.scopes_vec();
            Ok(json!({
                "id": token.id,
                "alias": token.alias,
                "active": token.active,
                "scopes": scopes,
                "created_at": token.created_at,
            }))
        }

        // ── Weight records ────────────────────────────────────────────────────
        "weight/records/list" => {
            let filters: WeightRecordFilters =
                serde_json::from_value(params).map_err(|e| AppError::BadRequest(e.to_string()))?;
            let records = weight_service::list(pool, filters).await?;
            Ok(json!(records))
        }
        "weight/records/create" => {
            let req: CreateWeightRecord =
                serde_json::from_value(params).map_err(|e| AppError::BadRequest(e.to_string()))?;
            let record = weight_service::create(pool, req, timezone).await?;
            Ok(json!(record))
        }
        "weight/records/delete" => {
            let id = params["id"]
                .as_str()
                .ok_or_else(|| AppError::BadRequest("id required".to_string()))?;
            weight_service::delete(pool, id).await?;
            Ok(json!({ "deleted": true }))
        }
        "weight/summary" => {
            let pet_id = params["pet_id"]
                .as_str()
                .ok_or_else(|| AppError::BadRequest("pet_id required".to_string()))?;
            let date_to = params["date_to"]
                .as_str()
                .ok_or_else(|| AppError::BadRequest("date_to required".to_string()))?;
            let date_from = params["date_from"].as_str();
            let granularity: crate::domain::weight::WeightGranularity = params["granularity"]
                .as_str()
                .and_then(|s| serde_json::from_value(serde_json::Value::String(s.to_owned())).ok())
                .unwrap_or_default();
            let buckets =
                weight_service::summary(pool, pet_id, date_from, date_to, &granularity).await?;
            Ok(json!(buckets))
        }

        // ── Overall health state ──────────────────────────────────────────────
        "health/state/list" => {
            let filters: HealthStateRecordFilters =
                serde_json::from_value(params).map_err(|e| AppError::BadRequest(e.to_string()))?;
            let records = health_state_service::list(pool, filters).await?;
            Ok(json!(records))
        }
        "health/state/create" => {
            let req: CreateHealthStateRecord =
                serde_json::from_value(params).map_err(|e| AppError::BadRequest(e.to_string()))?;
            let record = health_state_service::create(pool, req, timezone).await?;
            Ok(json!(record))
        }
        "health/state/delete" => {
            let id = params["id"]
                .as_str()
                .ok_or_else(|| AppError::BadRequest("id required".to_string()))?;
            health_state_service::delete(pool, id).await?;
            Ok(json!({ "deleted": true }))
        }

        // ── Health context ────────────────────────────────────────────────────
        "pets/health-context" => {
            let pet_id = require_uuid(&params, "pet_id")?;
            let pet_id_str = pet_id.to_string();
            let today = Utc::now().date_naive().to_string();
            let thirty_days_ago =
                (Utc::now().date_naive() - chrono::Duration::days(29)).to_string();

            let (pet, recent_weights, stats, recent_state_checks) = tokio::try_join!(
                pet_service::get(pool, pet_id),
                weight_service::list(
                    pool,
                    crate::domain::weight::WeightRecordFilters {
                        pet_id: Some(pet_id_str.clone()),
                        date_from: None,
                        date_to: None,
                        limit: Some(10),
                        offset: None,
                    }
                ),
                weight_service::stats(pool, &pet_id_str, &thirty_days_ago, &today),
                health_state_service::list(
                    pool,
                    HealthStateRecordFilters {
                        pet_id: Some(pet_id_str.clone()),
                        date_from: None,
                        date_to: None,
                        limit: None,
                        offset: None,
                    },
                ),
            )?;

            let latest_state = recent_state_checks.first().map(|record| {
                json!({
                    "level": record.level,
                    "note": record.note,
                    "occurred_at": record.occurred_at,
                    "local_date": record.local_date,
                })
            });

            Ok(json!({
                "pet": pet,
                "recent_weights": recent_weights,
                "stats_30d": stats,
                "latest_state": latest_state,
                "recent_state_checks": recent_state_checks,
            }))
        }

        _ => Err(AppError::BadRequest(format!("Unknown method: {method}"))),
    }
}
