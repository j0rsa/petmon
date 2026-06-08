use crate::domain::entry::{CreateEntry, EntryFilters, UpdateEntry};
use crate::error::AppResult;
use crate::services::entry_service;
use actix_web::{delete, get, patch, post, web, HttpResponse};
use sqlx::SqlitePool;

#[get("")]
pub async fn list_entries(
    pool: web::Data<SqlitePool>,
    query: web::Query<EntryFilters>,
) -> AppResult<HttpResponse> {
    let entries = entry_service::list(pool.get_ref(), query.into_inner()).await?;
    Ok(HttpResponse::Ok().json(entries))
}

#[post("")]
pub async fn create_entry(pool: web::Data<SqlitePool>, body: web::Json<CreateEntry>) -> AppResult<HttpResponse> {
    let entry = entry_service::create(pool.get_ref(), body.into_inner()).await?;
    Ok(HttpResponse::Created().json(entry))
}

#[get("/{id}")]
pub async fn get_entry(pool: web::Data<SqlitePool>, id: web::Path<String>) -> AppResult<HttpResponse> {
    let entry = entry_service::get(pool.get_ref(), &id).await?;
    Ok(HttpResponse::Ok().json(entry))
}

#[patch("/{id}")]
pub async fn update_entry(
    pool: web::Data<SqlitePool>,
    id: web::Path<String>,
    body: web::Json<UpdateEntry>,
) -> AppResult<HttpResponse> {
    let entry = entry_service::update(pool.get_ref(), &id, body.into_inner()).await?;
    Ok(HttpResponse::Ok().json(entry))
}

#[delete("/{id}")]
pub async fn delete_entry(pool: web::Data<SqlitePool>, id: web::Path<String>) -> AppResult<HttpResponse> {
    entry_service::delete(pool.get_ref(), &id).await?;
    Ok(HttpResponse::NoContent().finish())
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/entries")
            .service(list_entries)
            .service(create_entry)
            .service(get_entry)
            .service(update_entry)
            .service(delete_entry),
    );
}
