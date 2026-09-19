use crate::auth::AppState;
use crate::error::AppResult;
use crate::services::nutrition_status_service;
use actix_web::{get, web, HttpResponse};
use petmon_macros::require_scope;
use serde::Deserialize;
use uuid::Uuid;

#[derive(Deserialize)]
pub struct NutritionStatusQuery {
    pub pet_id: Uuid,
    pub ts: Option<String>,
}

#[get("/status")]
#[require_scope("api_read")]
pub async fn nutrition_status(
    state: web::Data<AppState>,
    query: web::Query<NutritionStatusQuery>,
) -> AppResult<HttpResponse> {
    let context = state.request_context(&_scope_req)?;
    let status = nutrition_status_service::get_status(
        &context,
        query.pet_id,
        query.ts.as_deref(),
        state.timezone,
    )
    .await?;
    Ok(HttpResponse::Ok().json(status))
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(nutrition_status);
}
