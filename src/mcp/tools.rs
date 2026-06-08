use crate::domain::cat::{CreateCat, UpdateCat};
use crate::domain::entry::{CreateEntry, EntryFilters, UpdateEntry};
use crate::domain::import::{ImportCommitRequest, ImportPreviewRequest};
use crate::domain::schedule::{CreateSchedule, UpdateSchedule};
use crate::error::{AppError, AppResult};
use crate::services::{
    analytics_service, cat_service, day_service, entry_service, import_service, schedule_service,
};
use serde_json::{json, Value};
use sqlx::SqlitePool;

pub async fn dispatch(pool: &SqlitePool, method: &str, params: Option<Value>) -> AppResult<Value> {
    let params = params.unwrap_or_else(|| json!({}));

    match method {
        "cats/list" => {
            let cats = cat_service::list(pool).await?;
            Ok(json!(cats))
        }
        "cats/get" => {
            let id = params["id"].as_str().ok_or_else(|| AppError::BadRequest("id required".to_string()))?;
            let cat = cat_service::get(pool, id).await?;
            Ok(json!(cat))
        }
        "cats/create" => {
            let req: CreateCat = serde_json::from_value(params).map_err(|e| AppError::BadRequest(e.to_string()))?;
            let cat = cat_service::create(pool, req).await?;
            Ok(json!(cat))
        }
        "cats/update" => {
            let id = params["id"].as_str().ok_or_else(|| AppError::BadRequest("id required".to_string()))?.to_string();
            let req: UpdateCat = serde_json::from_value(params).map_err(|e| AppError::BadRequest(e.to_string()))?;
            let cat = cat_service::update(pool, &id, req).await?;
            Ok(json!(cat))
        }
        "cats/delete" => {
            let id = params["id"].as_str().ok_or_else(|| AppError::BadRequest("id required".to_string()))?;
            cat_service::delete(pool, id).await?;
            Ok(json!({ "deleted": true }))
        }
        "entries/list" => {
            let filters: EntryFilters = serde_json::from_value(params).map_err(|e| AppError::BadRequest(e.to_string()))?;
            let entries = entry_service::list(pool, filters).await?;
            Ok(json!(entries))
        }
        "entries/get" => {
            let id = params["id"].as_str().ok_or_else(|| AppError::BadRequest("id required".to_string()))?;
            let entry = entry_service::get(pool, id).await?;
            Ok(json!(entry))
        }
        "entries/create" => {
            let req: CreateEntry = serde_json::from_value(params).map_err(|e| AppError::BadRequest(e.to_string()))?;
            let entry = entry_service::create(pool, req).await?;
            Ok(json!(entry))
        }
        "entries/update" => {
            let id = params["id"].as_str().ok_or_else(|| AppError::BadRequest("id required".to_string()))?.to_string();
            let req: UpdateEntry = serde_json::from_value(params).map_err(|e| AppError::BadRequest(e.to_string()))?;
            let entry = entry_service::update(pool, &id, req).await?;
            Ok(json!(entry))
        }
        "entries/delete" => {
            let id = params["id"].as_str().ok_or_else(|| AppError::BadRequest("id required".to_string()))?;
            entry_service::delete(pool, id).await?;
            Ok(json!({ "deleted": true }))
        }
        "days/summary" => {
            let date = params["date"].as_str().ok_or_else(|| AppError::BadRequest("date required".to_string()))?;
            let cat_id = params["cat_id"].as_str();
            let summary = day_service::get_day_summary(pool, date, cat_id).await?;
            Ok(json!(summary))
        }
        "analytics/daily-totals" => {
            let date_from = params["date_from"].as_str().ok_or_else(|| AppError::BadRequest("date_from required".to_string()))?;
            let date_to = params["date_to"].as_str().ok_or_else(|| AppError::BadRequest("date_to required".to_string()))?;
            let cat_id = params["cat_id"].as_str();
            let category = params["category"].as_str();
            let totals = analytics_service::daily_totals(pool, date_from, date_to, cat_id, category).await?;
            Ok(json!(totals))
        }
        "analytics/range-summary" => {
            let date_from = params["date_from"].as_str().ok_or_else(|| AppError::BadRequest("date_from required".to_string()))?;
            let date_to = params["date_to"].as_str().ok_or_else(|| AppError::BadRequest("date_to required".to_string()))?;
            let cat_id = params["cat_id"].as_str();
            let category = params["category"].as_str();
            let summary = analytics_service::range_summary(pool, date_from, date_to, cat_id, category).await?;
            Ok(json!(summary))
        }
        "schedules/list" => {
            let cat_id = params["cat_id"].as_str();
            let schedules = schedule_service::list(pool, cat_id).await?;
            Ok(json!(schedules))
        }
        "schedules/get" => {
            let id = params["id"].as_str().ok_or_else(|| AppError::BadRequest("id required".to_string()))?;
            let schedule = schedule_service::get(pool, id).await?;
            Ok(json!(schedule))
        }
        "schedules/create" => {
            let req: CreateSchedule = serde_json::from_value(params).map_err(|e| AppError::BadRequest(e.to_string()))?;
            let schedule = schedule_service::create(pool, req).await?;
            Ok(json!(schedule))
        }
        "schedules/update" => {
            let id = params["id"].as_str().ok_or_else(|| AppError::BadRequest("id required".to_string()))?.to_string();
            let req: UpdateSchedule = serde_json::from_value(params).map_err(|e| AppError::BadRequest(e.to_string()))?;
            let schedule = schedule_service::update(pool, &id, req).await?;
            Ok(json!(schedule))
        }
        "schedules/delete" => {
            let id = params["id"].as_str().ok_or_else(|| AppError::BadRequest("id required".to_string()))?;
            schedule_service::delete(pool, id).await?;
            Ok(json!({ "deleted": true }))
        }
        "imports/preview" => {
            let req: ImportPreviewRequest = serde_json::from_value(params).map_err(|e| AppError::BadRequest(e.to_string()))?;
            let preview = import_service::preview_text(&req);
            Ok(json!(preview))
        }
        "imports/commit" => {
            let req: ImportCommitRequest = serde_json::from_value(params).map_err(|e| AppError::BadRequest(e.to_string()))?;
            let batch = import_service::commit_import(pool, req).await?;
            Ok(json!(batch))
        }
        _ => Err(AppError::BadRequest(format!("Unknown method: {method}"))),
    }
}
