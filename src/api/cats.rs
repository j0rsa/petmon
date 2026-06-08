use crate::domain::cat::{CreateCat, UpdateCat};
use crate::error::AppResult;
use crate::services::cat_service;
use actix_web::{delete, get, patch, post, web, HttpResponse};
use sqlx::SqlitePool;

#[get("")]
pub async fn list_cats(pool: web::Data<SqlitePool>) -> AppResult<HttpResponse> {
    let cats = cat_service::list(pool.get_ref()).await?;
    Ok(HttpResponse::Ok().json(cats))
}

#[post("")]
pub async fn create_cat(pool: web::Data<SqlitePool>, body: web::Json<CreateCat>) -> AppResult<HttpResponse> {
    let cat = cat_service::create(pool.get_ref(), body.into_inner()).await?;
    Ok(HttpResponse::Created().json(cat))
}

#[get("/{id}")]
pub async fn get_cat(pool: web::Data<SqlitePool>, id: web::Path<String>) -> AppResult<HttpResponse> {
    let cat = cat_service::get(pool.get_ref(), &id).await?;
    Ok(HttpResponse::Ok().json(cat))
}

#[patch("/{id}")]
pub async fn update_cat(
    pool: web::Data<SqlitePool>,
    id: web::Path<String>,
    body: web::Json<UpdateCat>,
) -> AppResult<HttpResponse> {
    let cat = cat_service::update(pool.get_ref(), &id, body.into_inner()).await?;
    Ok(HttpResponse::Ok().json(cat))
}

#[delete("/{id}")]
pub async fn delete_cat(pool: web::Data<SqlitePool>, id: web::Path<String>) -> AppResult<HttpResponse> {
    cat_service::delete(pool.get_ref(), &id).await?;
    Ok(HttpResponse::NoContent().finish())
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/cats")
            .service(list_cats)
            .service(create_cat)
            .service(get_cat)
            .service(update_cat)
            .service(delete_cat),
    );
}
