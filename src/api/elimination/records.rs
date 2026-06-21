use crate::auth::AppState;
use crate::domain::elimination::{
    CreateEliminationRecord, CreateEliminationWithWeight, EliminationRecordFilters,
    UpdateEliminationRecord,
};
use crate::error::AppResult;
use crate::services::elimination_record_service;
use actix_web::{delete, get, patch, post, web, HttpResponse};

#[get("")]
pub async fn list_records(
    state: web::Data<AppState>,
    query: web::Query<EliminationRecordFilters>,
) -> AppResult<HttpResponse> {
    let records = elimination_record_service::list(&state.pool, query.into_inner()).await?;
    Ok(HttpResponse::Ok().json(records))
}

#[post("")]
pub async fn create_record(
    state: web::Data<AppState>,
    body: web::Json<CreateEliminationRecord>,
) -> AppResult<HttpResponse> {
    let record =
        elimination_record_service::create(&state.pool, body.into_inner(), state.timezone).await?;
    Ok(HttpResponse::Created().json(record))
}

#[get("/{id}")]
pub async fn get_record(
    state: web::Data<AppState>,
    id: web::Path<String>,
) -> AppResult<HttpResponse> {
    let record = elimination_record_service::get(&state.pool, &id).await?;
    Ok(HttpResponse::Ok().json(record))
}

#[patch("/{id}")]
pub async fn update_record(
    state: web::Data<AppState>,
    id: web::Path<String>,
    body: web::Json<UpdateEliminationRecord>,
) -> AppResult<HttpResponse> {
    let record = elimination_record_service::update(&state.pool, &id, body.into_inner()).await?;
    Ok(HttpResponse::Ok().json(record))
}

#[delete("/{id}")]
pub async fn delete_record(
    state: web::Data<AppState>,
    id: web::Path<String>,
) -> AppResult<HttpResponse> {
    elimination_record_service::delete(&state.pool, &id).await?;
    Ok(HttpResponse::NoContent().finish())
}

#[post("/with-weight")]
pub async fn create_record_with_weight(
    state: web::Data<AppState>,
    body: web::Json<CreateEliminationWithWeight>,
) -> AppResult<HttpResponse> {
    let result = elimination_record_service::create_with_weight(
        &state.pool,
        body.into_inner(),
        state.timezone,
    )
    .await?;
    Ok(HttpResponse::Created().json(result))
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/records")
            .service(list_records)
            .service(create_record)
            .service(create_record_with_weight)
            .service(get_record)
            .service(update_record)
            .service(delete_record),
    );
}
