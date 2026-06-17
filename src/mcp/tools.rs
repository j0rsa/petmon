use crate::domain::nutrition_record::BatchCreateNutritionRecords;
use crate::domain::nutrition_record::{
    CreateNutritionRecord, NutritionRecordFilters, UpdateNutritionRecord,
};
use crate::domain::nutrition_schedule::{CreateNutritionSchedule, UpdateNutritionSchedule};
use crate::domain::pet::{CreatePet, UpdatePet};
use crate::error::{AppError, AppResult};
use crate::services::{
    day_service, nutrition_analytics_service, nutrition_record_service, nutrition_schedule_service,
    pet_service,
};
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

pub async fn dispatch(pool: &SqlitePool, method: &str, params: Option<Value>) -> AppResult<Value> {
    let params = params.unwrap_or_else(|| json!({}));

    match method {
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
        "pets/delete" => {
            let id = require_uuid(&params, "id")?;
            pet_service::delete(pool, id).await?;
            Ok(json!({ "deleted": true }))
        }
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
            let record = nutrition_record_service::create(pool, req).await?;
            Ok(json!(record))
        }
        "nutrition/records/batch-create" => {
            let req: BatchCreateNutritionRecords =
                serde_json::from_value(params).map_err(|e| AppError::BadRequest(e.to_string()))?;
            let records = nutrition_record_service::batch_create(pool, req.records).await?;
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
        "days/summary" => {
            let date = params["date"]
                .as_str()
                .ok_or_else(|| AppError::BadRequest("date required".to_string()))?;
            let pet_id = optional_uuid(&params, "pet_id")?;
            let summary = day_service::get_day_summary(pool, date, pet_id).await?;
            Ok(json!(summary))
        }
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
        _ => Err(AppError::BadRequest(format!("Unknown method: {method}"))),
    }
}
