use crate::auth::AppState;
use crate::domain::medication::{CreateMedication, UpdateMedication};
use crate::error::AppResult;
use crate::services::medication_service;
use actix_web::{delete, get, patch, post, web, HttpResponse};
use petmon_macros::require_scope;
use uuid::Uuid;

#[derive(serde::Deserialize)]
pub struct MedicationListQuery {
    pub pet_id: String,
}

#[get("")]
#[require_scope("api_read")]
pub async fn list_medications(
    state: web::Data<AppState>,
    query: web::Query<MedicationListQuery>,
) -> AppResult<HttpResponse> {
    let context = state.request_context(&_scope_req)?;
    let pet_id = Uuid::parse_str(&query.pet_id)
        .map_err(|_| crate::error::AppError::BadRequest("invalid pet_id".into()))?;
    let meds = medication_service::list_medications(&context, pet_id).await?;
    Ok(HttpResponse::Ok().json(meds))
}

#[get("/{id}")]
#[require_scope("api_read")]
pub async fn get_medication(
    state: web::Data<AppState>,
    id: web::Path<String>,
) -> AppResult<HttpResponse> {
    let context = state.request_context(&_scope_req)?;
    let med = medication_service::get_medication(&context, &id).await?;
    Ok(HttpResponse::Ok().json(med))
}

#[post("")]
#[require_scope("api_write")]
pub async fn create_medication(
    state: web::Data<AppState>,
    body: web::Json<CreateMedication>,
) -> AppResult<HttpResponse> {
    let context = state.request_context(&_scope_req)?;
    let med = medication_service::create_medication(&context, body.into_inner()).await?;
    Ok(HttpResponse::Created().json(med))
}

#[patch("/{id}")]
#[require_scope("api_write")]
pub async fn update_medication(
    state: web::Data<AppState>,
    id: web::Path<String>,
    body: web::Json<UpdateMedication>,
) -> AppResult<HttpResponse> {
    let context = state.request_context(&_scope_req)?;
    let med = medication_service::update_medication(&context, &id, body.into_inner()).await?;
    Ok(HttpResponse::Ok().json(med))
}

#[delete("/{id}")]
#[require_scope("api_write")]
pub async fn delete_medication(
    state: web::Data<AppState>,
    id: web::Path<String>,
) -> AppResult<HttpResponse> {
    let context = state.request_context(&_scope_req)?;
    medication_service::delete_medication(&context, &id).await?;
    Ok(HttpResponse::NoContent().finish())
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(list_medications)
        .service(get_medication)
        .service(create_medication)
        .service(update_medication)
        .service(delete_medication);
}
