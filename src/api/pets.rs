use crate::auth::AppState;
use crate::domain::pet::{CreatePet, UpdatePet};
use crate::error::AppResult;
use crate::services::pet_service;
use actix_web::{delete, get, patch, post, web, HttpResponse};
use uuid::Uuid;

#[get("")]
pub async fn list_pets(state: web::Data<AppState>) -> AppResult<HttpResponse> {
    let pets = pet_service::list(&state.pool).await?;
    Ok(HttpResponse::Ok().json(pets))
}

#[post("")]
pub async fn create_pet(state: web::Data<AppState>, body: web::Json<CreatePet>) -> AppResult<HttpResponse> {
    let pet = pet_service::create(&state.pool, body.into_inner()).await?;
    Ok(HttpResponse::Created().json(pet))
}

#[get("/{id}")]
pub async fn get_pet(state: web::Data<AppState>, id: web::Path<Uuid>) -> AppResult<HttpResponse> {
    let pet = pet_service::get(&state.pool, *id).await?;
    Ok(HttpResponse::Ok().json(pet))
}

#[patch("/{id}")]
pub async fn update_pet(
    state: web::Data<AppState>,
    id: web::Path<Uuid>,
    body: web::Json<UpdatePet>,
) -> AppResult<HttpResponse> {
    let pet = pet_service::update(&state.pool, *id, body.into_inner()).await?;
    Ok(HttpResponse::Ok().json(pet))
}

#[delete("/{id}")]
pub async fn delete_pet(state: web::Data<AppState>, id: web::Path<Uuid>) -> AppResult<HttpResponse> {
    pet_service::delete(&state.pool, *id).await?;
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
