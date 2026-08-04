use crate::auth::AppState;
use crate::error::{AppError, AppResult};
use crate::services::elimination_classifier;
use actix_web::{get, post, web, HttpResponse};
use petmon_macros::require_scope;
use serde::Deserialize;
use uuid::Uuid;

#[derive(Deserialize)]
pub struct ClassifierPetQuery {
    pub pet_id: String,
}

#[get("/classifier/status")]
#[require_scope("api_read")]
pub async fn classifier_status(
    state: web::Data<AppState>,
    query: web::Query<ClassifierPetQuery>,
) -> AppResult<HttpResponse> {
    let pet_id = Uuid::parse_str(&query.pet_id)
        .map_err(|_| AppError::BadRequest(format!("invalid pet_id: {}", query.pet_id)))?;
    let status = elimination_classifier::get_status(&state.pool, pet_id).await?;
    Ok(HttpResponse::Ok().json(status))
}

#[post("/classifier/retrain")]
#[require_scope("api_write")]
pub async fn classifier_retrain(
    state: web::Data<AppState>,
    query: web::Query<ClassifierPetQuery>,
) -> AppResult<HttpResponse> {
    let pet_id = Uuid::parse_str(&query.pet_id)
        .map_err(|_| AppError::BadRequest(format!("invalid pet_id: {}", query.pet_id)))?;
    let result = elimination_classifier::retrain(&state.pool, pet_id).await?;
    Ok(HttpResponse::Ok().json(result))
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(classifier_status);
    cfg.service(classifier_retrain);
}
