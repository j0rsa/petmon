use crate::auth::AppState;
use crate::error::{AppError, AppResult};
use crate::services::medication_service;
use actix_web::{get, web, HttpResponse};
use petmon_macros::require_scope;

#[derive(serde::Deserialize)]
pub struct FormulationListQuery {
    pub medication_id: String,
}

#[get("")]
#[require_scope("api_read")]
pub async fn list_formulations(
    state: web::Data<AppState>,
    query: web::Query<FormulationListQuery>,
) -> AppResult<HttpResponse> {
    let context = state.request_context(&_scope_req)?;
    if query.medication_id.is_empty() {
        return Err(AppError::BadRequest("medication_id required".into()));
    }
    let formulations =
        medication_service::list_formulations(&context, &query.medication_id).await?;
    Ok(HttpResponse::Ok().json(formulations))
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(web::scope("/formulations").service(list_formulations));
}
