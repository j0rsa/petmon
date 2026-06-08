use crate::domain::pet::{CreatePet, UpdatePet};
use crate::error::AppResult;
use crate::services::pet_service;
use actix_web::{delete, get, patch, post, web, HttpResponse};
use sqlx::SqlitePool;
use uuid::Uuid;

#[get("")]
pub async fn list_pets(pool: web::Data<SqlitePool>) -> AppResult<HttpResponse> {
    let pets = pet_service::list(pool.get_ref()).await?;
    Ok(HttpResponse::Ok().json(pets))
}

#[post("")]
pub async fn create_pet(pool: web::Data<SqlitePool>, body: web::Json<CreatePet>) -> AppResult<HttpResponse> {
    let pet = pet_service::create(pool.get_ref(), body.into_inner()).await?;
    Ok(HttpResponse::Created().json(pet))
}

#[get("/{id}")]
pub async fn get_pet(pool: web::Data<SqlitePool>, id: web::Path<Uuid>) -> AppResult<HttpResponse> {
    let pet = pet_service::get(pool.get_ref(), *id).await?;
    Ok(HttpResponse::Ok().json(pet))
}

#[patch("/{id}")]
pub async fn update_pet(
    pool: web::Data<SqlitePool>,
    id: web::Path<Uuid>,
    body: web::Json<UpdatePet>,
) -> AppResult<HttpResponse> {
    let pet = pet_service::update(pool.get_ref(), *id, body.into_inner()).await?;
    Ok(HttpResponse::Ok().json(pet))
}

#[delete("/{id}")]
pub async fn delete_pet(pool: web::Data<SqlitePool>, id: web::Path<Uuid>) -> AppResult<HttpResponse> {
    pet_service::delete(pool.get_ref(), *id).await?;
    Ok(HttpResponse::NoContent().finish())
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/pets")
            .service(list_pets)
            .service(create_pet)
            .service(get_pet)
            .service(update_pet)
            .service(delete_pet),
    );
}
