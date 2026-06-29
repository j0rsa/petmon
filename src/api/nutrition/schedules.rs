use crate::auth::AppState;
use crate::domain::nutrition_schedule::{CreateNutritionSchedule, UpdateNutritionSchedule};
use crate::error::AppResult;
use crate::services::nutrition_schedule_service;
use actix_web::{delete, get, patch, post, web, HttpResponse};
use petmon_macros::require_scope;
use serde::Deserialize;
use uuid::Uuid;

#[derive(Deserialize)]
pub struct ScheduleQuery {
    pub pet_id: Option<Uuid>,
}

#[get("")]
#[require_scope("api_read")]
pub async fn list_schedules(
    state: web::Data<AppState>,
    query: web::Query<ScheduleQuery>,
) -> AppResult<HttpResponse> {
    let schedules = nutrition_schedule_service::list(&state.pool, query.pet_id).await?;
    Ok(HttpResponse::Ok().json(schedules))
}

#[post("")]
#[require_scope("api_write")]
pub async fn create_schedule(
    state: web::Data<AppState>,
    body: web::Json<CreateNutritionSchedule>,
) -> AppResult<HttpResponse> {
    let schedule = nutrition_schedule_service::create(&state.pool, body.into_inner()).await?;
    Ok(HttpResponse::Created().json(schedule))
}

#[get("/{id}")]
#[require_scope("api_read")]
pub async fn get_schedule(
    state: web::Data<AppState>,
    id: web::Path<String>,
) -> AppResult<HttpResponse> {
    let schedule = nutrition_schedule_service::get(&state.pool, &id).await?;
    Ok(HttpResponse::Ok().json(schedule))
}

#[patch("/{id}")]
#[require_scope("api_write")]
pub async fn update_schedule(
    state: web::Data<AppState>,
    id: web::Path<String>,
    body: web::Json<UpdateNutritionSchedule>,
) -> AppResult<HttpResponse> {
    let schedule = nutrition_schedule_service::update(&state.pool, &id, body.into_inner()).await?;
    Ok(HttpResponse::Ok().json(schedule))
}

#[delete("/{id}")]
#[require_scope("api_write")]
pub async fn delete_schedule(
    state: web::Data<AppState>,
    id: web::Path<String>,
) -> AppResult<HttpResponse> {
    nutrition_schedule_service::delete(&state.pool, &id).await?;
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
