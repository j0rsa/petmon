use crate::auth::identity::Identity;
use crate::auth::AppState;
use crate::domain::medication::{CreateMedIntakeRecord, MedIntakeRecordFilters};
use crate::domain::settings::DateFormat;
use crate::domain::user_settings::{UserDisplaySettings, DISPLAY_KEY};
use crate::error::AppResult;
use crate::repo::user_settings;
use crate::services::medication_service;
use actix_web::{delete, get, post, web, HttpMessage, HttpRequest, HttpResponse};
use petmon_macros::require_scope;

#[get("")]
#[require_scope("api_read")]
pub async fn list_intake(
    state: web::Data<AppState>,
    query: web::Query<MedIntakeRecordFilters>,
) -> AppResult<HttpResponse> {
    let records = medication_service::list_intake(&state.pool, query.into_inner()).await?;
    Ok(HttpResponse::Ok().json(records))
}

#[post("")]
#[require_scope("api_write")]
pub async fn create_intake(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<CreateMedIntakeRecord>,
) -> AppResult<HttpResponse> {
    let reader_key = req.extensions().get::<Identity>().map(Identity::reader_key);
    let date_format = match reader_key {
        Some(reader_key) => {
            user_settings::get::<UserDisplaySettings>(&state.pool, &reader_key, DISPLAY_KEY)
                .await?
                .date_format
        }
        None => DateFormat::default(),
    };
    let record = medication_service::create_intake(
        &state.pool,
        body.into_inner(),
        state.timezone,
        date_format,
    )
    .await?;
    Ok(HttpResponse::Created().json(record))
}

#[delete("/{id}")]
#[require_scope("api_write")]
pub async fn delete_intake(
    state: web::Data<AppState>,
    id: web::Path<String>,
) -> AppResult<HttpResponse> {
    medication_service::delete_intake(&state.pool, &id).await?;
    Ok(HttpResponse::NoContent().finish())
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/intake")
            .service(list_intake)
            .service(create_intake)
            .service(delete_intake),
    );
}
