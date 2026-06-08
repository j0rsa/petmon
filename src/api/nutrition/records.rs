use crate::domain::nutrition_record::{
    BatchCreateNutritionRecords, CreateNutritionRecord, NutritionRecordFilters, UpdateNutritionRecord,
};
use crate::error::AppResult;
use crate::services::nutrition_record_service;
use actix_web::{delete, get, patch, post, web, HttpResponse};
use sqlx::SqlitePool;

#[get("")]
pub async fn list_records(
    pool: web::Data<SqlitePool>,
    query: web::Query<NutritionRecordFilters>,
) -> AppResult<HttpResponse> {
    let records = nutrition_record_service::list(pool.get_ref(), query.into_inner()).await?;
    Ok(HttpResponse::Ok().json(records))
}

#[post("")]
pub async fn create_record(
    pool: web::Data<SqlitePool>,
    body: web::Json<CreateNutritionRecord>,
) -> AppResult<HttpResponse> {
    let record = nutrition_record_service::create(pool.get_ref(), body.into_inner()).await?;
    Ok(HttpResponse::Created().json(record))
}

#[post("/batch")]
pub async fn batch_create_records(
    pool: web::Data<SqlitePool>,
    body: web::Json<BatchCreateNutritionRecords>,
) -> AppResult<HttpResponse> {
    let records = nutrition_record_service::batch_create(pool.get_ref(), body.into_inner().records).await?;
    Ok(HttpResponse::Created().json(records))
}

#[get("/{id}")]
pub async fn get_record(pool: web::Data<SqlitePool>, id: web::Path<String>) -> AppResult<HttpResponse> {
    let record = nutrition_record_service::get(pool.get_ref(), &id).await?;
    Ok(HttpResponse::Ok().json(record))
}

#[patch("/{id}")]
pub async fn update_record(
    pool: web::Data<SqlitePool>,
    id: web::Path<String>,
    body: web::Json<UpdateNutritionRecord>,
) -> AppResult<HttpResponse> {
    let record = nutrition_record_service::update(pool.get_ref(), &id, body.into_inner()).await?;
    Ok(HttpResponse::Ok().json(record))
}

#[delete("/{id}")]
pub async fn delete_record(pool: web::Data<SqlitePool>, id: web::Path<String>) -> AppResult<HttpResponse> {
    nutrition_record_service::delete(pool.get_ref(), &id).await?;
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
