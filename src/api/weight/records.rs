use crate::auth::AppState;
use crate::domain::weight::{CreateWeightRecord, WeightGranularity, WeightRecordFilters};
use crate::error::{AppError, AppResult};
use crate::services::weight_service;
use actix_web::{delete, get, post, web, HttpResponse};
use serde::Deserialize;

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

#[derive(Deserialize)]
pub struct StatsQuery {
    pub pet_id: String,
    pub date_from: String,
    pub date_to: String,
}

#[get("/stats")]
pub async fn stats(
    state: web::Data<AppState>,
    query: web::Query<StatsQuery>,
) -> AppResult<HttpResponse> {
    if query.pet_id.is_empty() {
        return Err(AppError::BadRequest("pet_id required".to_string()));
    }
    let s =
        weight_service::stats(&state.pool, &query.pet_id, &query.date_from, &query.date_to).await?;
    Ok(HttpResponse::Ok().json(s))
}

#[derive(Deserialize)]
pub struct SummaryQuery {
    pub pet_id: String,
    pub date_from: Option<String>,
    pub date_to: String,
    pub granularity: Option<WeightGranularity>,
}

#[get("/summary")]
pub async fn summary(
    state: web::Data<AppState>,
    query: web::Query<SummaryQuery>,
) -> AppResult<HttpResponse> {
    if query.pet_id.is_empty() {
        return Err(AppError::BadRequest("pet_id required".to_string()));
    }
    let granularity = query.granularity.clone().unwrap_or_default();
    let buckets = weight_service::summary(
        &state.pool,
        &query.pet_id,
        query.date_from.as_deref(),
        &query.date_to,
        &granularity,
    )
    .await?;
    Ok(HttpResponse::Ok().json(buckets))
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(list_records)
        .service(create_record)
        .service(stats)
        .service(summary)
        .service(delete_record);
}
