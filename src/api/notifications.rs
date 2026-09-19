use actix_web::{get, post, web, HttpRequest, HttpResponse};
use petmon_macros::require_scope;

use crate::auth::AppState;
use crate::domain::notification::NotificationListQuery;
use crate::error::AppResult;
use crate::services::notification_service;

#[get("")]
#[require_scope("api_read")]
pub async fn list_notifications(
    req: HttpRequest,
    state: web::Data<AppState>,
    query: web::Query<NotificationListQuery>,
) -> AppResult<HttpResponse> {
    let context = state.request_context(&req)?;
    let limit = query.limit.unwrap_or(50);
    let unread_only = query.unread_only.unwrap_or(false);
    let items = notification_service::list(&context, limit, unread_only).await?;
    Ok(HttpResponse::Ok().json(items))
}

#[get("/unread-count")]
#[require_scope("api_read")]
pub async fn unread_count(req: HttpRequest, state: web::Data<AppState>) -> AppResult<HttpResponse> {
    let context = state.request_context(&req)?;
    let count = notification_service::unread_count(&context).await?;
    Ok(HttpResponse::Ok().json(count))
}

#[post("/{id}/read")]
#[require_scope("api_write")]
pub async fn mark_read(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<String>,
) -> AppResult<HttpResponse> {
    let context = state.request_context(&req)?;
    notification_service::mark_read(&context, &path.into_inner()).await?;
    Ok(HttpResponse::NoContent().finish())
}

#[post("/read-all")]
#[require_scope("api_write")]
pub async fn mark_all_read(
    req: HttpRequest,
    state: web::Data<AppState>,
) -> AppResult<HttpResponse> {
    let context = state.request_context(&req)?;
    let count = notification_service::mark_all_read(&context).await?;
    Ok(HttpResponse::Ok().json(count))
}

#[post("/dismiss-all")]
#[require_scope("api_write")]
pub async fn dismiss_all(req: HttpRequest, state: web::Data<AppState>) -> AppResult<HttpResponse> {
    let context = state.request_context(&req)?;
    let count = notification_service::dismiss_all(&context).await?;
    Ok(HttpResponse::Ok().json(count))
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/notifications")
            .service(list_notifications)
            .service(unread_count)
            .service(mark_read)
            .service(mark_all_read)
            .service(dismiss_all),
    );
}
