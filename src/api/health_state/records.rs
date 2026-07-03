use crate::auth::AppState;
use crate::domain::health_state::HealthStateRecordFilters;
use crate::error::AppResult;
use crate::services::health_state_service;
use actix_web::{delete, get, post, web, HttpResponse};
use petmon_macros::require_scope;

#[get("")]
#[require_scope("api_read")]
pub async fn list_records(
    state: web::Data<AppState>,
    query: web::Query<HealthStateRecordFilters>,
) -> AppResult<HttpResponse> {
    let records = health_state_service::list(&state.pool, query.into_inner()).await?;
    Ok(HttpResponse::Ok().json(records))
}

#[post("")]
#[require_scope("api_write")]
pub async fn create_record(
    state: web::Data<AppState>,
    body: web::Json<crate::domain::health_state::CreateHealthStateRecord>,
) -> AppResult<HttpResponse> {
    let record =
        health_state_service::create(&state.pool, body.into_inner(), state.timezone).await?;
    Ok(HttpResponse::Created().json(record))
}

#[delete("/{id}")]
#[require_scope("api_write")]
pub async fn delete_record(
    state: web::Data<AppState>,
    id: web::Path<String>,
) -> AppResult<HttpResponse> {
    health_state_service::delete(&state.pool, &id).await?;
    Ok(HttpResponse::NoContent().finish())
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(list_records)
        .service(create_record)
        .service(delete_record);
}
