use serde_json::{json, Value};
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::services::{day_service, nutrition_schedule_service, nutrition_status_service, pet_service};

/// Static resource descriptors — returned by `resources/list`.
pub fn resource_list() -> Value {
    json!({
        "resources": [
            {
                "uri": "petmon://pets",
                "name": "All pets",
                "description": "List of all pets with their profiles. Use as ambient context to get pet IDs before calling other tools.",
                "mimeType": "application/json"
            },
            {
                "uri": "petmon://pets/{id}",
                "name": "Pet profile",
                "description": "Full profile for a single pet identified by UUID.",
                "mimeType": "application/json"
            },
            {
                "uri": "petmon://pets/{id}/today",
                "name": "Pet — today's nutrition summary",
                "description": "Today's nutrition records, category totals, and day note for a pet. For on-track status vs schedule, use petmon://pets/{id}/nutrition-status instead.",
                "mimeType": "application/json"
            },
            {
                "uri": "petmon://pets/{id}/nutrition-status",
                "name": "Pet — nutrition on-track status",
                "description": "Precomputed on-track status: cumulative liquid intake vs schedule expectation as of now, including on_track and delta_ml.",
                "mimeType": "application/json"
            },
            {
                "uri": "petmon://pets/{id}/schedules",
                "name": "Pet — active nutrition schedules",
                "description": "Active feeding schedules for a pet, including time windows.",
                "mimeType": "application/json"
            }
        ]
    })
}

/// Resolve a `petmon://` URI to its content.
pub async fn read_resource(pool: &SqlitePool, uri: &str, timezone: chrono_tz::Tz) -> AppResult<Value> {
    // petmon://pets
    if uri == "petmon://pets" {
        let pets = pet_service::list(pool).await?;
        return Ok(json!({
            "uri": uri,
            "mimeType": "application/json",
            "text": serde_json::to_string_pretty(&pets).unwrap_or_default()
        }));
    }

    // petmon://pets/{id} or petmon://pets/{id}/...
    let rest = uri
        .strip_prefix("petmon://pets/")
        .ok_or_else(|| AppError::NotFound(format!("Unknown resource URI: {uri}")))?;

    let (id_str, suffix) = match rest.split_once('/') {
        Some((id, suffix)) => (id, Some(suffix)),
        None => (rest, None),
    };

    let pet_id = Uuid::parse_str(id_str)
        .map_err(|_| AppError::BadRequest(format!("Invalid pet UUID in URI: {uri}")))?;

    match suffix {
        None => {
            let pet = pet_service::get(pool, pet_id).await?;
            Ok(json!({
                "uri": uri,
                "mimeType": "application/json",
                "text": serde_json::to_string_pretty(&pet).unwrap_or_default()
            }))
        }
        Some("today") => {
            let today = chrono::Utc::now()
                .with_timezone(&timezone)
                .date_naive()
                .to_string();
            let summary = day_service::get_day_summary(pool, &today, Some(pet_id)).await?;
            Ok(json!({
                "uri": uri,
                "mimeType": "application/json",
                "text": serde_json::to_string_pretty(&summary).unwrap_or_default()
            }))
        }
        Some("nutrition-status") => {
            let status = nutrition_status_service::get_status(pool, pet_id, None, timezone).await?;
            Ok(json!({
                "uri": uri,
                "mimeType": "application/json",
                "text": serde_json::to_string_pretty(&status).unwrap_or_default()
            }))
        }
        Some("schedules") => {
            let schedules = nutrition_schedule_service::list(pool, Some(pet_id)).await?;
            let active: Vec<_> = schedules.iter().filter(|s| s.active).collect();
            Ok(json!({
                "uri": uri,
                "mimeType": "application/json",
                "text": serde_json::to_string_pretty(&active).unwrap_or_default()
            }))
        }
        Some(other) => Err(AppError::NotFound(format!(
            "Unknown resource path: pets/{id_str}/{other}"
        ))),
    }
}
