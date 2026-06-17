use crate::auth::AppState;
use crate::error::AppResult;
use crate::services::nutrition_analytics_service;
use actix_web::{get, web, HttpResponse};
use serde::Deserialize;
use uuid::Uuid;

#[derive(Deserialize)]
pub struct AnalyticsQuery {
    pub pet_id: Option<Uuid>,
    pub date_from: String,
    pub date_to: String,
    pub category: Option<String>,
}

#[get("/daily-totals")]
pub async fn daily_totals(
    state: web::Data<AppState>,
    query: web::Query<AnalyticsQuery>,
) -> AppResult<HttpResponse> {
    let totals = nutrition_analytics_service::daily_totals(
        &state.pool,
        &query.date_from,
        &query.date_to,
        query.pet_id,
        query.category.as_deref(),
    )
    .await?;
    Ok(HttpResponse::Ok().json(totals))
}

#[get("/range-summary")]
pub async fn range_summary(
    state: web::Data<AppState>,
    query: web::Query<AnalyticsQuery>,
) -> AppResult<HttpResponse> {
    let summary = nutrition_analytics_service::range_summary(
        &state.pool,
        &query.date_from,
        &query.date_to,
        query.pet_id,
        query.category.as_deref(),
    )
    .await?;
    Ok(HttpResponse::Ok().json(summary))
}

#[derive(Deserialize)]
pub struct BestFluidDayQuery {
    pub pet_id: Option<Uuid>,
    pub exclude_date: String,
}

#[get("/best-fluid-day")]
pub async fn best_fluid_day(
    state: web::Data<AppState>,
    query: web::Query<BestFluidDayQuery>,
) -> AppResult<HttpResponse> {
    let result =
        nutrition_analytics_service::best_fluid_day(&state.pool, query.pet_id, &query.exclude_date)
            .await?;
    Ok(HttpResponse::Ok().json(result))
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/analytics")
            .service(daily_totals)
            .service(range_summary)
            .service(best_fluid_day),
    );
}
