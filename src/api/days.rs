use crate::auth::AppState;
use crate::error::AppResult;
use crate::services::day_service;
use actix_web::{get, patch, web, HttpResponse};
use serde::Deserialize;
use uuid::Uuid;

#[derive(Deserialize)]
pub struct DayQuery {
    pub pet_id: Option<Uuid>,
}

#[derive(Deserialize)]
pub struct UpdateNoteBody {
    pub note: String,
    pub pet_id: Option<Uuid>,
}

#[get("/{date}")]
pub async fn get_day(
    state: web::Data<AppState>,
    date: web::Path<String>,
    query: web::Query<DayQuery>,
) -> AppResult<HttpResponse> {
    let summary = day_service::get_day_summary(&state.pool, &date, query.pet_id).await?;
    Ok(HttpResponse::Ok().json(summary))
}

#[patch("/{date}/note")]
pub async fn update_day_note(
    state: web::Data<AppState>,
    date: web::Path<String>,
    body: web::Json<UpdateNoteBody>,
) -> AppResult<HttpResponse> {
    day_service::update_day_note(&state.pool, &date, body.pet_id, &body.note).await?;
    Ok(HttpResponse::Ok().finish())
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/days")
            .service(get_day)
            .service(update_day_note),
    );
}
