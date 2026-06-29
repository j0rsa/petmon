use crate::auth::AppState;
use crate::error::AppResult;
use crate::repo::day_notes;
use actix_web::{get, patch, web, HttpResponse};
use petmon_macros::require_scope;
use serde::Deserialize;
use uuid::Uuid;

#[derive(Deserialize)]
pub struct NoteQuery {
    pub pet_id: Option<Uuid>,
}

#[derive(Deserialize)]
pub struct UpdateNoteBody {
    pub note: String,
}

#[get("/{date}")]
#[require_scope("api_read")]
pub async fn get_note(
    state: web::Data<AppState>,
    date: web::Path<String>,
    query: web::Query<NoteQuery>,
) -> AppResult<HttpResponse> {
    let note = day_notes::get_day_note(&state.pool, &date, query.pet_id).await?;
    Ok(HttpResponse::Ok().json(note))
}

#[patch("/{date}")]
#[require_scope("api_write")]
pub async fn update_note(
    state: web::Data<AppState>,
    date: web::Path<String>,
    query: web::Query<NoteQuery>,
    body: web::Json<UpdateNoteBody>,
) -> AppResult<HttpResponse> {
    let note = day_notes::upsert_day_note(&state.pool, &date, query.pet_id, &body.note).await?;
    Ok(HttpResponse::Ok().json(note))
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(web::scope("/notes").service(get_note).service(update_note));
}
