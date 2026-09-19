use crate::auth::AppState;
use crate::error::AppResult;
use crate::services::elimination_analytics_service;
use actix_web::{get, web, HttpResponse};
use petmon_macros::require_scope;
use serde::Deserialize;

#[derive(Deserialize)]
pub struct EliminationAnalyticsQuery {
    pub pet_id: Option<String>,
    pub date_from: String,
    pub date_to: String,
}

#[get("/daily-summaries")]
#[require_scope("api_read")]
pub async fn daily_summaries(
    state: web::Data<AppState>,
    query: web::Query<EliminationAnalyticsQuery>,
) -> AppResult<HttpResponse> {
    let context = state.request_context(&_scope_req)?;
    let summaries = elimination_analytics_service::daily_summaries(
        &context,
        query.pet_id.as_deref(),
        &query.date_from,
        &query.date_to,
    )
    .await?;
    Ok(HttpResponse::Ok().json(summaries))
}

#[get("/range-summary")]
#[require_scope("api_read")]
pub async fn range_summary(
    state: web::Data<AppState>,
    query: web::Query<EliminationAnalyticsQuery>,
) -> AppResult<HttpResponse> {
    let context = state.request_context(&_scope_req)?;
    let summary = elimination_analytics_service::range_summary(
        &context,
        query.pet_id.as_deref(),
        &query.date_from,
        &query.date_to,
    )
    .await?;
    Ok(HttpResponse::Ok().json(summary))
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/analytics")
            .service(daily_summaries)
            .service(range_summary),
    );
}
