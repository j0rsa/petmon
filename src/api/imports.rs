use crate::domain::import::{ImportCommitRequest, ImportPreviewRequest};
use crate::error::AppResult;
use crate::services::import_service;
use actix_web::{get, post, web, HttpResponse};
use sqlx::SqlitePool;

#[post("/preview")]
pub async fn preview_import(body: web::Json<ImportPreviewRequest>) -> AppResult<HttpResponse> {
    let result = import_service::preview_text(&body.into_inner());
    Ok(HttpResponse::Ok().json(result))
}

#[post("/commit")]
pub async fn commit_import(
    pool: web::Data<SqlitePool>,
    body: web::Json<ImportCommitRequest>,
) -> AppResult<HttpResponse> {
    let batch = import_service::commit_import(pool.get_ref(), body.into_inner()).await?;
    Ok(HttpResponse::Created().json(batch))
}

#[get("")]
pub async fn list_imports(pool: web::Data<SqlitePool>) -> AppResult<HttpResponse> {
    let batches = crate::repo::imports::list_batches(pool.get_ref()).await?;
    Ok(HttpResponse::Ok().json(batches))
}

#[get("/{id}")]
pub async fn get_import(pool: web::Data<SqlitePool>, id: web::Path<String>) -> AppResult<HttpResponse> {
    let batch = crate::repo::imports::get_batch(pool.get_ref(), &id).await?;
    Ok(HttpResponse::Ok().json(batch))
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/imports")
            .service(preview_import)
            .service(commit_import)
            .service(list_imports)
            .service(get_import),
    );
}
