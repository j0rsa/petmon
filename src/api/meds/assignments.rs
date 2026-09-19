use crate::auth::AppState;
use crate::domain::medication::{
    CreateMedAssignment, EditMedAssignment, EndMedAssignment, MedAssignmentFilters,
    ReviseMedAssignment,
};
use crate::error::{AppError, AppResult};
use crate::services::medication_service;
use actix_web::{delete, get, post, put, web, HttpResponse};
use petmon_macros::require_scope;
use uuid::Uuid;

#[get("")]
#[require_scope("api_read")]
pub async fn list_assignments(
    state: web::Data<AppState>,
    query: web::Query<MedAssignmentFilters>,
) -> AppResult<HttpResponse> {
    let context = state.request_context(&_scope_req)?;
    let assignments = medication_service::list_assignments(&context, query.into_inner()).await?;
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
    let context = state.request_context(&_scope_req)?;
    let pet_id = Uuid::parse_str(&query.pet_id)
        .map_err(|_| AppError::BadRequest("invalid pet_id".into()))?;
    let daily = medication_service::daily_assignments(&context, pet_id, &query.date).await?;
    Ok(HttpResponse::Ok().json(daily))
}

#[post("")]
#[require_scope("api_write")]
pub async fn create_assignment(
    state: web::Data<AppState>,
    body: web::Json<CreateMedAssignment>,
) -> AppResult<HttpResponse> {
    let context = state.request_context(&_scope_req)?;
    let assignment = medication_service::create_assignment(&context, body.into_inner()).await?;
    Ok(HttpResponse::Created().json(assignment))
}

#[put("/{id}")]
#[require_scope("api_write")]
pub async fn edit_assignment(
    state: web::Data<AppState>,
    id: web::Path<String>,
    body: web::Json<EditMedAssignment>,
) -> AppResult<HttpResponse> {
    let context = state.request_context(&_scope_req)?;
    let assignment = medication_service::edit_assignment(&context, &id, body.into_inner()).await?;
    Ok(HttpResponse::Ok().json(assignment))
}

#[post("/{id}/revise")]
#[require_scope("api_write")]
pub async fn revise_assignment(
    state: web::Data<AppState>,
    id: web::Path<String>,
    body: web::Json<ReviseMedAssignment>,
) -> AppResult<HttpResponse> {
    let context = state.request_context(&_scope_req)?;
    let assignment =
        medication_service::revise_assignment(&context, &id, body.into_inner()).await?;
    Ok(HttpResponse::Created().json(assignment))
}

#[post("/{id}/end")]
#[require_scope("api_write")]
pub async fn end_assignment(
    state: web::Data<AppState>,
    id: web::Path<String>,
    body: web::Json<EndMedAssignment>,
) -> AppResult<HttpResponse> {
    let context = state.request_context(&_scope_req)?;
    let assignment =
        medication_service::end_assignment(&context, &id, body.into_inner(), state.timezone)
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
    let context = state.request_context(&_scope_req)?;
    medication_service::delete_assignment(&context, &id, query.cascade).await?;
    Ok(HttpResponse::NoContent().finish())
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
            .service(edit_assignment)
            .service(revise_assignment)
            .service(end_assignment)
            .service(delete_assignment),
    );
}
