use crate::auth::AppState;
use crate::domain::medication::{CreateMedAssignment, MedAssignmentFilters, ReviseMedAssignment};
use crate::error::{AppError, AppResult};
use crate::services::medication_service;
use actix_web::{get, post, web, HttpResponse};
use petmon_macros::require_scope;
use uuid::Uuid;

#[get("")]
#[require_scope("api_read")]
pub async fn list_assignments(
    state: web::Data<AppState>,
    query: web::Query<MedAssignmentFilters>,
) -> AppResult<HttpResponse> {
    let assignments = medication_service::list_assignments(&state.pool, query.into_inner()).await?;
    Ok(HttpResponse::Ok().json(assignments))
}

#[derive(serde::Deserialize)]
pub struct DailyAssignmentsQuery {
    pub pet_id: String,
    pub date: String,
}

#[get("/daily")]
#[require_scope("api_read")]
pub async fn daily_assignments(
    state: web::Data<AppState>,
    query: web::Query<DailyAssignmentsQuery>,
) -> AppResult<HttpResponse> {
    let pet_id = Uuid::parse_str(&query.pet_id)
        .map_err(|_| AppError::BadRequest("invalid pet_id".into()))?;
    let daily = medication_service::daily_assignments(&state.pool, pet_id, &query.date).await?;
    Ok(HttpResponse::Ok().json(daily))
}

#[post("")]
#[require_scope("api_write")]
pub async fn create_assignment(
    state: web::Data<AppState>,
    body: web::Json<CreateMedAssignment>,
) -> AppResult<HttpResponse> {
    let assignment = medication_service::create_assignment(&state.pool, body.into_inner()).await?;
    Ok(HttpResponse::Created().json(assignment))
}

#[post("/{id}/revise")]
#[require_scope("api_write")]
pub async fn revise_assignment(
    state: web::Data<AppState>,
    id: web::Path<String>,
    body: web::Json<ReviseMedAssignment>,
) -> AppResult<HttpResponse> {
    let assignment =
        medication_service::revise_assignment(&state.pool, &id, body.into_inner()).await?;
    Ok(HttpResponse::Created().json(assignment))
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/assignments")
            .service(daily_assignments)
            .service(list_assignments)
            .service(create_assignment)
            .service(revise_assignment),
    );
}
