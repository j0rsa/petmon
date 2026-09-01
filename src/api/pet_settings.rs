use actix_web::{get, post, web, HttpResponse};
use petmon_macros::require_scope;
use serde_json::Value;
use uuid::Uuid;

use crate::auth::AppState;
use crate::domain::pet_settings::{is_known_pet_settings_key, PetNudgeSchedule, MED_NUDGE_KEY};
use crate::error::{AppError, AppResult};
use crate::repo::pet_settings;

#[get("/{id}/settings/{key}")]
#[require_scope("api_read")]
pub async fn get_pet_settings(
    state: web::Data<AppState>,
    path: web::Path<(String, String)>,
) -> AppResult<HttpResponse> {
    let (pet_id_str, key) = path.into_inner();
    Uuid::parse_str(&pet_id_str).map_err(|_| AppError::BadRequest("invalid pet_id".into()))?;
    if !is_known_pet_settings_key(&key) {
        return Err(AppError::NotFound(format!(
            "unknown pet settings key '{key}'"
        )));
    }
    let value: Value = match key.as_str() {
        MED_NUDGE_KEY => {
            let s: PetNudgeSchedule = pet_settings::get(&state.pool, &pet_id_str, &key).await?;
            serde_json::to_value(s).map_err(|e| AppError::Internal(e.to_string()))?
        }
        _ => unreachable!(),
    };
    Ok(HttpResponse::Ok().json(value))
}

#[post("/{id}/settings/{key}")]
#[require_scope("api_write")]
pub async fn update_pet_settings(
    state: web::Data<AppState>,
    path: web::Path<(String, String)>,
    body: web::Json<Value>,
) -> AppResult<HttpResponse> {
    let (pet_id_str, key) = path.into_inner();
    let pet_id =
        Uuid::parse_str(&pet_id_str).map_err(|_| AppError::BadRequest("invalid pet_id".into()))?;
    crate::repo::pets::get_pet(&state.pool, pet_id)
        .await
        .map_err(|_| AppError::NotFound(format!("Pet {pet_id_str} not found")))?;
    if !is_known_pet_settings_key(&key) {
        return Err(AppError::NotFound(format!(
            "unknown pet settings key '{key}'"
        )));
    }
    let merged: Value = match key.as_str() {
        MED_NUDGE_KEY => {
            let schedule: PetNudgeSchedule = serde_json::from_value(body.into_inner())
                .map_err(|e| AppError::BadRequest(format!("invalid nudge settings: {e}")))?;
            pet_settings::upsert(&state.pool, &pet_id_str, &key, &schedule).await?;
            serde_json::to_value(&schedule).map_err(|e| AppError::Internal(e.to_string()))?
        }
        _ => unreachable!(),
    };
    Ok(HttpResponse::Ok().json(merged))
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(get_pet_settings).service(update_pet_settings);
}
