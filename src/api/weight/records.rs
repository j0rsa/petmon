use crate::auth::AppState;
use crate::domain::weight::{CreateWeightRecord, WeightRecordFilters};
use crate::error::AppResult;
use crate::services::weight_service;
use actix_web::{delete, get, post, web, HttpResponse};

#[get("")]
pub async fn list_records(
    state: web::Data<AppState>,
    query: web::Query<WeightRecordFilters>,
) -> AppResult<HttpResponse> {
    let records = weight_service::list(&state.pool, query.into_inner()).await?;
    Ok(HttpResponse::Ok().json(records))
}

#[post("")]
pub async fn create_record(
    state: web::Data<AppState>,
    body: web::Json<CreateWeightRecord>,
) -> AppResult<HttpResponse> {
    let record = weight_service::create(&state.pool, body.into_inner(), state.timezone).await?;
    Ok(HttpResponse::Created().json(record))
}

#[delete("/{id}")]
pub async fn delete_record(
    state: web::Data<AppState>,
    id: web::Path<String>,
) -> AppResult<HttpResponse> {
    weight_service::delete(&state.pool, &id).await?;
    Ok(HttpResponse::NoContent().finish())
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(list_records)
        .service(create_record)
        .service(delete_record);
}
