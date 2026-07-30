use actix_web::{get, post, web, HttpMessage, HttpRequest, HttpResponse};
use petmon_macros::require_scope;
use serde::Deserialize;

use crate::auth::identity::Identity;
use crate::auth::AppState;
use crate::domain::push::PushSubscribeRequest;
use crate::error::{AppError, AppResult};
use crate::services::push_service;

fn reader_key(req: &HttpRequest) -> AppResult<String> {
    req.extensions()
        .get::<Identity>()
        .map(|identity| identity.reader_key())
        .ok_or_else(|| AppError::Internal("missing identity in request".to_string()))
}

#[get("/config")]
#[require_scope("api_read")]
pub async fn get_config(state: web::Data<AppState>) -> AppResult<HttpResponse> {
    let config = push_service::public_config(&state.pool).await?;
    Ok(HttpResponse::Ok().json(config))
}

#[post("/subscribe")]
#[require_scope("api_write")]
pub async fn subscribe(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<PushSubscribeRequest>,
) -> AppResult<HttpResponse> {
    let reader_key = reader_key(&req)?;
    let user_agent = req
        .headers()
        .get("user-agent")
        .and_then(|v| v.to_str().ok());
    push_service::subscribe(&state.pool, &reader_key, body.into_inner(), user_agent).await?;
    Ok(HttpResponse::NoContent().finish())
}

#[derive(Debug, Deserialize)]
struct UnsubscribeRequest {
    endpoint: String,
}

#[post("/unsubscribe")]
#[require_scope("api_write")]
pub async fn unsubscribe(
    state: web::Data<AppState>,
    body: web::Json<UnsubscribeRequest>,
) -> AppResult<HttpResponse> {
    push_service::unsubscribe(&state.pool, &body.endpoint).await?;
    Ok(HttpResponse::NoContent().finish())
}

#[post("/test")]
#[require_scope("api_write")]
pub async fn send_test(state: web::Data<AppState>) -> AppResult<HttpResponse> {
    let result = push_service::send_test(&state.pool).await?;
    Ok(HttpResponse::Ok().json(result))
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/push")
            .service(get_config)
            .service(subscribe)
            .service(unsubscribe)
            .service(send_test),
    );
}
