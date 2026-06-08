use crate::error::AppResult;
use crate::repo::day_notes;
use actix_web::{get, patch, web, HttpResponse};
use serde::Deserialize;
use sqlx::SqlitePool;
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
pub async fn get_note(
    pool: web::Data<SqlitePool>,
    date: web::Path<String>,
    query: web::Query<NoteQuery>,
) -> AppResult<HttpResponse> {
    let note = day_notes::get_day_note(pool.get_ref(), &date, query.pet_id).await?;
    Ok(HttpResponse::Ok().json(note))
}

#[patch("/{date}")]
pub async fn update_note(
    pool: web::Data<SqlitePool>,
    date: web::Path<String>,
    query: web::Query<NoteQuery>,
    body: web::Json<UpdateNoteBody>,
) -> AppResult<HttpResponse> {
    let note = day_notes::upsert_day_note(pool.get_ref(), &date, query.pet_id, &body.note).await?;
    Ok(HttpResponse::Ok().json(note))
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(web::scope("/notes").service(get_note).service(update_note));
}
