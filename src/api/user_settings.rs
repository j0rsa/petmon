use actix_web::{get, post, web, HttpMessage, HttpRequest, HttpResponse};
use petmon_macros::require_scope;
use serde_json::Value;

use crate::auth::identity::Identity;
use crate::auth::AppState;
use crate::domain::user_settings::{
    is_known_widget_key, CumulativeFluidChartSettings, NutritionCalendarSettings,
    UpdateCumulativeFluidChartSettings, UpdateNutritionCalendarSettings,
    CUMULATIVE_FLUID_CHART_KEY, NUTRITION_CALENDAR_KEY,
};
use crate::error::{AppError, AppResult};
use crate::repo::user_settings;

fn reader_key(req: &HttpRequest) -> AppResult<String> {
    req.extensions()
        .get::<Identity>()
        .map(|identity| identity.reader_key())
        .ok_or_else(|| AppError::Internal("missing identity in request".to_string()))
}

#[get("/{key}")]
#[require_scope("api_read")]
pub async fn get_widget_settings(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<String>,
) -> AppResult<HttpResponse> {
    let key = path.into_inner();
    if !is_known_widget_key(&key) {
        return Err(AppError::NotFound(format!(
            "unknown widget settings key '{key}'"
        )));
    }

    let reader_key = reader_key(&req)?;
    let value: Value = match key.as_str() {
        NUTRITION_CALENDAR_KEY => {
            let settings: NutritionCalendarSettings =
                user_settings::get(&state.pool, &reader_key, &key).await?;
            serde_json::to_value(settings).map_err(|e| AppError::Internal(e.to_string()))?
        }
        CUMULATIVE_FLUID_CHART_KEY => {
            let settings: CumulativeFluidChartSettings =
                user_settings::get(&state.pool, &reader_key, &key).await?;
            serde_json::to_value(settings).map_err(|e| AppError::Internal(e.to_string()))?
        }
        _ => unreachable!(),
    };

    Ok(HttpResponse::Ok().json(value))
}

#[post("/{key}")]
#[require_scope("api_write")]
pub async fn update_widget_settings(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<String>,
    body: web::Json<Value>,
) -> AppResult<HttpResponse> {
    let key = path.into_inner();
    if !is_known_widget_key(&key) {
        return Err(AppError::NotFound(format!(
            "unknown widget settings key '{key}'"
        )));
    }

    let reader_key = reader_key(&req)?;
    let merged: Value = match key.as_str() {
        NUTRITION_CALENDAR_KEY => {
            let existing: NutritionCalendarSettings =
                user_settings::get(&state.pool, &reader_key, &key).await?;
            let update: UpdateNutritionCalendarSettings = serde_json::from_value(body.into_inner())
                .map_err(|e| {
                    AppError::BadRequest(format!("invalid nutrition calendar settings: {e}"))
                })?;
            let merged = update.apply(existing);
            user_settings::upsert(&state.pool, &reader_key, &key, &merged).await?;
            serde_json::to_value(merged).map_err(|e| AppError::Internal(e.to_string()))?
        }
        CUMULATIVE_FLUID_CHART_KEY => {
            let existing: CumulativeFluidChartSettings =
                user_settings::get(&state.pool, &reader_key, &key).await?;
            let update: UpdateCumulativeFluidChartSettings =
                serde_json::from_value(body.into_inner()).map_err(|e| {
                    AppError::BadRequest(format!("invalid cumulative fluid chart settings: {e}"))
                })?;
            let merged = update.apply(existing);
            user_settings::upsert(&state.pool, &reader_key, &key, &merged).await?;
            serde_json::to_value(merged).map_err(|e| AppError::Internal(e.to_string()))?
        }
        _ => unreachable!(),
    };

    Ok(HttpResponse::Ok().json(merged))
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/me/widget-settings")
            .service(get_widget_settings)
            .service(update_widget_settings),
    );
}
