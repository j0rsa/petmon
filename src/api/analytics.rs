use crate::error::AppResult;
use crate::services::analytics_service;
use actix_web::{get, web, HttpResponse};
use serde::Deserialize;
use sqlx::SqlitePool;

#[derive(Deserialize)]
pub struct AnalyticsQuery {
    pub cat_id: Option<String>,
    pub date_from: String,
    pub date_to: String,
    pub category: Option<String>,
}

#[get("/daily-totals")]
pub async fn daily_totals(
    pool: web::Data<SqlitePool>,
    query: web::Query<AnalyticsQuery>,
) -> AppResult<HttpResponse> {
    let totals = analytics_service::daily_totals(
        pool.get_ref(),
        &query.date_from,
        &query.date_to,
        query.cat_id.as_deref(),
        query.category.as_deref(),
    )
    .await?;
    Ok(HttpResponse::Ok().json(totals))
}

#[get("/range-summary")]
pub async fn range_summary(
    pool: web::Data<SqlitePool>,
    query: web::Query<AnalyticsQuery>,
) -> AppResult<HttpResponse> {
    let summary = analytics_service::range_summary(
        pool.get_ref(),
        &query.date_from,
        &query.date_to,
        query.cat_id.as_deref(),
        query.category.as_deref(),
    )
    .await?;
    Ok(HttpResponse::Ok().json(summary))
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(web::scope("/analytics").service(daily_totals).service(range_summary));
}
