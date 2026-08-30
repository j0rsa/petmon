use crate::auth::AppState;
use crate::domain::medication::{
    CreateMedAssignment, EndMedAssignment, MedAssignmentFilters, ReviseMedAssignment,
};
use crate::error::{AppError, AppResult};
use crate::services::medication_service;
use actix_web::{delete, get, patch, post, web, HttpResponse};
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

#[post("/{id}/end")]
#[require_scope("api_write")]
pub async fn end_assignment(
    state: web::Data<AppState>,
    id: web::Path<String>,
    body: web::Json<EndMedAssignment>,
) -> AppResult<HttpResponse> {
    let assignment =
        medication_service::end_assignment(&state.pool, &id, body.into_inner(), state.timezone)
            .await?;
    Ok(HttpResponse::Ok().json(assignment))
}

#[delete("/{id}")]
#[require_scope("api_write")]
pub async fn delete_assignment(
    state: web::Data<AppState>,
    id: web::Path<String>,
    query: web::Query<DeleteAssignmentQuery>,
) -> AppResult<HttpResponse> {
    medication_service::delete_assignment(&state.pool, &id, query.cascade).await?;
    Ok(HttpResponse::NoContent().finish())
}

#[derive(serde::Deserialize)]
pub struct PatchAssignmentBody {
    pub meal_wait_minutes: Option<i32>,
}

#[patch("/{id}")]
#[require_scope("api_write")]
pub async fn patch_assignment(
    state: web::Data<AppState>,
    id: web::Path<String>,
    body: web::Json<PatchAssignmentBody>,
) -> AppResult<HttpResponse> {
    let assignment =
        medication_service::patch_assignment_timer(&state.pool, &id, body.meal_wait_minutes)
            .await?;
    Ok(HttpResponse::Ok().json(assignment))
}

#[derive(serde::Deserialize)]
pub struct DeleteAssignmentQuery {
    #[serde(default)]
    pub cascade: bool,
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/assignments")
            .service(daily_assignments)
            .service(list_assignments)
            .service(create_assignment)
            .service(revise_assignment)
            .service(patch_assignment)
            .service(end_assignment)
            .service(delete_assignment),
    );
}
