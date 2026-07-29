use crate::auth::AppState;
use crate::error::{AppError, AppResult};
use crate::repo::elimination_records;
use actix_web::{get, web, HttpResponse};
use petmon_macros::require_scope;
use serde::Deserialize;
use uuid::Uuid;

#[derive(Deserialize)]
pub struct DurationProfileQuery {
    pub pet_id: String,
}

#[get("/duration-profile")]
#[require_scope("api_read")]
pub async fn duration_profile(
    state: web::Data<AppState>,
    query: web::Query<DurationProfileQuery>,
) -> AppResult<HttpResponse> {
    let pet_id = Uuid::parse_str(&query.pet_id)
        .map_err(|_| AppError::BadRequest(format!("invalid pet_id: {}", query.pet_id)))?;
    let profile = elimination_records::duration_profile(&state.pool, pet_id).await?;
    Ok(HttpResponse::Ok().json(profile))
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(duration_profile);
}
