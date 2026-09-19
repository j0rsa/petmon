use crate::auth::AppState;
use crate::domain::weight::{
    CreateWeightRecord, UpdateWeightRecord, WeightGranularity, WeightGroupBy, WeightRecordFilters,
};
use crate::error::{AppError, AppResult};
use crate::services::weight_service;
use actix_web::{delete, get, patch, post, web, HttpResponse};
use petmon_macros::require_scope;
use serde::Deserialize;

#[get("")]
#[require_scope("api_read")]
pub async fn list_records(
    state: web::Data<AppState>,
    query: web::Query<WeightRecordFilters>,
) -> AppResult<HttpResponse> {
    let context = state.request_context(&_scope_req)?;
    let records = weight_service::list(&context, query.into_inner()).await?;
    Ok(HttpResponse::Ok().json(records))
}

#[post("")]
#[require_scope("api_write")]
pub async fn create_record(
    state: web::Data<AppState>,
    body: web::Json<CreateWeightRecord>,
) -> AppResult<HttpResponse> {
    let context = state.request_context(&_scope_req)?;
    let record = weight_service::create(&context, body.into_inner(), state.timezone).await?;
    Ok(HttpResponse::Created().json(record))
}

#[patch("/{id}")]
#[require_scope("api_write")]
pub async fn update_record(
    state: web::Data<AppState>,
    id: web::Path<String>,
    body: web::Json<UpdateWeightRecord>,
) -> AppResult<HttpResponse> {
    let context = state.request_context(&_scope_req)?;
    let record = weight_service::update(&context, &id, body.into_inner()).await?;
    Ok(HttpResponse::Ok().json(record))
}

#[delete("/{id}")]
#[require_scope("api_write")]
pub async fn delete_record(
    state: web::Data<AppState>,
    id: web::Path<String>,
) -> AppResult<HttpResponse> {
    let context = state.request_context(&_scope_req)?;
    weight_service::delete(&context, &id).await?;
    Ok(HttpResponse::NoContent().finish())
}

#[derive(Deserialize)]
pub struct StatsQuery {
    pub pet_id: String,
    pub date_from: String,
    pub date_to: String,
}

#[get("/stats")]
#[require_scope("api_read")]
pub async fn stats(
    state: web::Data<AppState>,
    query: web::Query<StatsQuery>,
) -> AppResult<HttpResponse> {
    let context = state.request_context(&_scope_req)?;
    if query.pet_id.is_empty() {
        return Err(AppError::BadRequest("pet_id required".to_string()));
    }
    let s =
        weight_service::stats(&context, &query.pet_id, &query.date_from, &query.date_to).await?;
    Ok(HttpResponse::Ok().json(s))
}

#[derive(Deserialize)]
pub struct SummaryQuery {
    pub pet_id: String,
    pub date_from: Option<String>,
    pub date_to: String,
    pub granularity: Option<WeightGranularity>,
    pub group_by: Option<WeightGroupBy>,
}

#[get("/summary")]
#[require_scope("api_read")]
pub async fn summary(
    state: web::Data<AppState>,
    query: web::Query<SummaryQuery>,
) -> AppResult<HttpResponse> {
    let context = state.request_context(&_scope_req)?;
    if query.pet_id.is_empty() {
        return Err(AppError::BadRequest("pet_id required".to_string()));
    }
    let granularity = query.granularity.clone().unwrap_or_default();
    let group_by = query.group_by.clone().unwrap_or_default();
    let buckets = weight_service::summary(
        &context,
        &query.pet_id,
        query.date_from.as_deref(),
        &query.date_to,
        &granularity,
        &group_by,
    )
    .await?;
    Ok(HttpResponse::Ok().json(buckets))
}

#[derive(Deserialize)]
pub struct TagsQuery {
    pub pet_id: String,
}

#[get("/tags")]
#[require_scope("api_read")]
pub async fn list_tags(
    state: web::Data<AppState>,
    query: web::Query<TagsQuery>,
) -> AppResult<HttpResponse> {
    let context = state.request_context(&_scope_req)?;
    if query.pet_id.is_empty() {
        return Err(AppError::BadRequest("pet_id required".to_string()));
    }
    let tags = weight_service::list_tags(&context, &query.pet_id).await?;
    Ok(HttpResponse::Ok().json(tags))
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(list_records)
        .service(create_record)
        .service(stats)
        .service(summary)
        .service(list_tags)
        .service(update_record)
        .service(delete_record);
}
