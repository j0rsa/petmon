use crate::auth::AppState;
use crate::domain::pet::{CreatePet, UpdatePet};
use crate::error::AppResult;
use crate::services::pet_service;
use actix_web::{delete, get, patch, post, web, HttpResponse};
use petmon_macros::require_scope;
use uuid::Uuid;

#[get("")]
#[require_scope("api_read")]
pub async fn list_pets(state: web::Data<AppState>) -> AppResult<HttpResponse> {
    let context = state.request_context(&_scope_req)?;
    let pets = pet_service::list(&context).await?;
    Ok(HttpResponse::Ok().json(pets))
}

#[post("")]
#[require_scope("api_write")]
pub async fn create_pet(
    state: web::Data<AppState>,
    body: web::Json<CreatePet>,
) -> AppResult<HttpResponse> {
    let context = state.request_context(&_scope_req)?;
    let pet = pet_service::create(&context, body.into_inner()).await?;
    Ok(HttpResponse::Created().json(pet))
}

#[get("/{id}")]
#[require_scope("api_read")]
pub async fn get_pet(state: web::Data<AppState>, id: web::Path<Uuid>) -> AppResult<HttpResponse> {
    let context = state.request_context(&_scope_req)?;
    let pet = pet_service::get(&context, *id).await?;
    Ok(HttpResponse::Ok().json(pet))
}

#[patch("/{id}")]
#[require_scope("api_write")]
pub async fn update_pet(
    state: web::Data<AppState>,
    id: web::Path<Uuid>,
    body: web::Json<UpdatePet>,
) -> AppResult<HttpResponse> {
    let context = state.request_context(&_scope_req)?;
    let pet = pet_service::update(&context, *id, body.into_inner()).await?;
    Ok(HttpResponse::Ok().json(pet))
}

#[delete("/{id}")]
#[require_scope("api_write")]
pub async fn delete_pet(
    state: web::Data<AppState>,
    id: web::Path<Uuid>,
) -> AppResult<HttpResponse> {
    let context = state.request_context(&_scope_req)?;
    pet_service::delete(&context, *id).await?;
    Ok(HttpResponse::NoContent().finish())
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/pets")
            .service(list_pets)
            .service(create_pet)
            .service(get_pet)
            .service(update_pet)
            .service(delete_pet)
            .configure(super::pet_settings::configure),
    );
}
