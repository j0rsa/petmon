use crate::auth::identity::Identity;
use crate::auth::AppState;
use crate::domain::medication::{CreateMedBundle, CreateMedBundleIntake, UpdateMedBundle};
use crate::domain::user_settings::{UserDisplaySettings, DISPLAY_KEY};
use crate::error::{AppError, AppResult};
use crate::repo::user_settings;
use crate::services::medication_service;
use actix_web::{delete, get, patch, post, web, HttpMessage, HttpRequest, HttpResponse};
use petmon_macros::require_scope;
use uuid::Uuid;

#[derive(serde::Deserialize)]
pub struct BundleListQuery {
    pub pet_id: String,
}

#[get("")]
#[require_scope("api_read")]
pub async fn list_bundles(
    state: web::Data<AppState>,
    query: web::Query<BundleListQuery>,
) -> AppResult<HttpResponse> {
    let pet_id = Uuid::parse_str(&query.pet_id)
        .map_err(|_| AppError::BadRequest("invalid pet_id".into()))?;
    let bundles = medication_service::list_bundles(&state.pool, pet_id).await?;
    Ok(HttpResponse::Ok().json(bundles))
}

#[post("")]
#[require_scope("api_write")]
pub async fn create_bundle(
    state: web::Data<AppState>,
    body: web::Json<CreateMedBundle>,
) -> AppResult<HttpResponse> {
    let bundle = medication_service::create_bundle(&state.pool, body.into_inner()).await?;
    Ok(HttpResponse::Created().json(bundle))
}

#[patch("/{id}")]
#[require_scope("api_write")]
pub async fn update_bundle(
    state: web::Data<AppState>,
    id: web::Path<String>,
    body: web::Json<UpdateMedBundle>,
) -> AppResult<HttpResponse> {
    let bundle = medication_service::update_bundle(&state.pool, &id, body.into_inner()).await?;
    Ok(HttpResponse::Ok().json(bundle))
}

#[delete("/{id}")]
#[require_scope("api_write")]
pub async fn delete_bundle(
    state: web::Data<AppState>,
    id: web::Path<String>,
) -> AppResult<HttpResponse> {
    medication_service::delete_bundle(&state.pool, &id).await?;
    Ok(HttpResponse::NoContent().finish())
}

#[post("/{id}/intake")]
#[require_scope("api_write")]
pub async fn create_bundle_intake(
    req: HttpRequest,
    state: web::Data<AppState>,
    id: web::Path<String>,
    body: web::Json<CreateMedBundleIntake>,
) -> AppResult<HttpResponse> {
    let reader_key = req.extensions().get::<Identity>().map(Identity::reader_key);
    let display = match reader_key {
        Some(reader_key) => {
            user_settings::get::<UserDisplaySettings>(&state.pool, &reader_key, DISPLAY_KEY).await?
        }
        None => UserDisplaySettings::default(),
    };
    let records = medication_service::create_bundle_intake(
        &state.pool,
        &id,
        body.into_inner(),
        state.timezone,
        display,
    )
    .await?;
    Ok(HttpResponse::Created().json(records))
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/bundles")
            .service(list_bundles)
            .service(create_bundle)
            .service(update_bundle)
            .service(delete_bundle)
            .service(create_bundle_intake),
    );
}
