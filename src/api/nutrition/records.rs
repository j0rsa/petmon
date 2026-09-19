use crate::auth::AppState;
use crate::domain::nutrition_record::{
    BatchCreateNutritionRecords, CreateNutritionRecord, NutritionRecordFilters,
    UpdateNutritionRecord,
};
use crate::error::AppResult;
use crate::services::nutrition_record_service;
use actix_web::{delete, get, patch, post, web, HttpResponse};
use petmon_macros::require_scope;

#[get("")]
#[require_scope("api_read")]
pub async fn list_records(
    state: web::Data<AppState>,
    query: web::Query<NutritionRecordFilters>,
) -> AppResult<HttpResponse> {
    let context = state.request_context(&_scope_req)?;
    let records = nutrition_record_service::list(&context, query.into_inner()).await?;
    Ok(HttpResponse::Ok().json(records))
}

#[post("")]
#[require_scope("api_write")]
pub async fn create_record(
    state: web::Data<AppState>,
    body: web::Json<CreateNutritionRecord>,
) -> AppResult<HttpResponse> {
    let context = state.request_context(&_scope_req)?;
    let record =
        nutrition_record_service::create(&context, body.into_inner(), state.timezone).await?;
    Ok(HttpResponse::Created().json(record))
}

#[post("/batch")]
#[require_scope("api_write")]
pub async fn batch_create_records(
    state: web::Data<AppState>,
    body: web::Json<BatchCreateNutritionRecords>,
) -> AppResult<HttpResponse> {
    let context = state.request_context(&_scope_req)?;
    let records =
        nutrition_record_service::batch_create(&context, body.into_inner().records, state.timezone)
            .await?;
    Ok(HttpResponse::Created().json(records))
}

#[get("/{id}")]
#[require_scope("api_read")]
pub async fn get_record(
    state: web::Data<AppState>,
    id: web::Path<String>,
) -> AppResult<HttpResponse> {
    let context = state.request_context(&_scope_req)?;
    let record = nutrition_record_service::get(&context, &id).await?;
    Ok(HttpResponse::Ok().json(record))
}

#[patch("/{id}")]
#[require_scope("api_write")]
pub async fn update_record(
    state: web::Data<AppState>,
    id: web::Path<String>,
    body: web::Json<UpdateNutritionRecord>,
) -> AppResult<HttpResponse> {
    let context = state.request_context(&_scope_req)?;
    let record = nutrition_record_service::update(&context, &id, body.into_inner()).await?;
    Ok(HttpResponse::Ok().json(record))
}

#[delete("/{id}")]
#[require_scope("api_write")]
pub async fn delete_record(
    state: web::Data<AppState>,
    id: web::Path<String>,
) -> AppResult<HttpResponse> {
    let context = state.request_context(&_scope_req)?;
    nutrition_record_service::delete(&context, &id).await?;
    Ok(HttpResponse::NoContent().finish())
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/records")
            .service(list_records)
            .service(create_record)
            .service(batch_create_records)
            .service(get_record)
            .service(update_record)
            .service(delete_record),
    );
}
