use crate::auth::AppState;
use crate::domain::nutrition_record::{
    BatchCreateNutritionRecords, CreateNutritionRecord, NutritionRecordFilters, UpdateNutritionRecord,
};
use crate::error::AppResult;
use crate::services::nutrition_record_service;
use actix_web::{delete, get, patch, post, web, HttpResponse};

#[get("")]
pub async fn list_records(
    state: web::Data<AppState>,
    query: web::Query<NutritionRecordFilters>,
) -> AppResult<HttpResponse> {
    let records = nutrition_record_service::list(&state.pool, query.into_inner()).await?;
    Ok(HttpResponse::Ok().json(records))
}

#[post("")]
pub async fn create_record(
    state: web::Data<AppState>,
    body: web::Json<CreateNutritionRecord>,
) -> AppResult<HttpResponse> {
    let record = nutrition_record_service::create(&state.pool, body.into_inner()).await?;
    Ok(HttpResponse::Created().json(record))
}

#[post("/batch")]
pub async fn batch_create_records(
    state: web::Data<AppState>,
    body: web::Json<BatchCreateNutritionRecords>,
) -> AppResult<HttpResponse> {
    let records = nutrition_record_service::batch_create(&state.pool, body.into_inner().records).await?;
    Ok(HttpResponse::Created().json(records))
}

#[get("/{id}")]
pub async fn get_record(state: web::Data<AppState>, id: web::Path<String>) -> AppResult<HttpResponse> {
    let record = nutrition_record_service::get(&state.pool, &id).await?;
    Ok(HttpResponse::Ok().json(record))
}

#[patch("/{id}")]
pub async fn update_record(
    state: web::Data<AppState>,
    id: web::Path<String>,
    body: web::Json<UpdateNutritionRecord>,
) -> AppResult<HttpResponse> {
    let record = nutrition_record_service::update(&state.pool, &id, body.into_inner()).await?;
    Ok(HttpResponse::Ok().json(record))
}

#[delete("/{id}")]
pub async fn delete_record(state: web::Data<AppState>, id: web::Path<String>) -> AppResult<HttpResponse> {
    nutrition_record_service::delete(&state.pool, &id).await?;
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
