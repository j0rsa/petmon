use crate::domain::schedule::{CreateSchedule, UpdateSchedule};
use crate::error::AppResult;
use crate::services::schedule_service;
use actix_web::{delete, get, patch, post, web, HttpResponse};
use serde::Deserialize;
use sqlx::SqlitePool;

#[derive(Deserialize)]
pub struct ScheduleQuery {
    pub cat_id: Option<String>,
}

#[get("")]
pub async fn list_schedules(
    pool: web::Data<SqlitePool>,
    query: web::Query<ScheduleQuery>,
) -> AppResult<HttpResponse> {
    let schedules = schedule_service::list(pool.get_ref(), query.cat_id.as_deref()).await?;
    Ok(HttpResponse::Ok().json(schedules))
}

#[post("")]
pub async fn create_schedule(
    pool: web::Data<SqlitePool>,
    body: web::Json<CreateSchedule>,
) -> AppResult<HttpResponse> {
    let schedule = schedule_service::create(pool.get_ref(), body.into_inner()).await?;
    Ok(HttpResponse::Created().json(schedule))
}

#[get("/{id}")]
pub async fn get_schedule(pool: web::Data<SqlitePool>, id: web::Path<String>) -> AppResult<HttpResponse> {
    let schedule = schedule_service::get(pool.get_ref(), &id).await?;
    Ok(HttpResponse::Ok().json(schedule))
}

#[patch("/{id}")]
pub async fn update_schedule(
    pool: web::Data<SqlitePool>,
    id: web::Path<String>,
    body: web::Json<UpdateSchedule>,
) -> AppResult<HttpResponse> {
    let schedule = schedule_service::update(pool.get_ref(), &id, body.into_inner()).await?;
    Ok(HttpResponse::Ok().json(schedule))
}

#[delete("/{id}")]
pub async fn delete_schedule(pool: web::Data<SqlitePool>, id: web::Path<String>) -> AppResult<HttpResponse> {
    schedule_service::delete(pool.get_ref(), &id).await?;
    Ok(HttpResponse::NoContent().finish())
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/schedules")
            .service(list_schedules)
            .service(create_schedule)
            .service(get_schedule)
            .service(update_schedule)
            .service(delete_schedule),
    );
}
