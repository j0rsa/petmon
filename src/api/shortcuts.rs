use actix_web::{get, http::header, post, web, HttpResponse};
use petmon_macros::require_scope;
use rust_embed::RustEmbed;
use uuid::Uuid;

use crate::auth::AppState;
use crate::domain::medication::CreateMedIntakeRecord;
use crate::domain::user_settings::UserDisplaySettings;
use crate::error::{AppError, AppResult};
use crate::services::{medication_service, shortcut_menu};

#[derive(RustEmbed)]
#[folder = "assets/shortcuts"]
#[include = "petmon-med-intake.shortcut"]
struct ShortcutAssets;

#[derive(serde::Deserialize)]
pub struct MedIntakeMenuQuery {
    pub pet_id: String,
    pub date: String,
}

#[derive(serde::Serialize)]
struct MedIntakeMenuResponse {
    choices: Vec<String>,
}

#[get("/med-intake/menu")]
#[require_scope("api_read")]
pub async fn med_intake_menu(
    state: web::Data<AppState>,
    query: web::Query<MedIntakeMenuQuery>,
) -> AppResult<HttpResponse> {
    let pet_id = Uuid::parse_str(&query.pet_id)
        .map_err(|_| AppError::BadRequest("invalid pet_id".into()))?;
    let choices = shortcut_menu::med_intake_menu_choices(&state.pool, pet_id, &query.date).await?;
    Ok(HttpResponse::Ok().json(MedIntakeMenuResponse { choices }))
}

#[post("/med-intake/take/{token}")]
#[require_scope("api_write")]
pub async fn med_intake_take(
    state: web::Data<AppState>,
    token: web::Path<String>,
) -> AppResult<HttpResponse> {
    let payload = shortcut_menu::decode_take_token(&token)?;
    let pet_id = Uuid::parse_str(&payload.pet_id)
        .map_err(|_| AppError::BadRequest("invalid pet_id in token".into()))?;

    let record = medication_service::create_intake(
        &state.pool,
        CreateMedIntakeRecord {
            pet_id: pet_id.to_string(),
            medication_id: payload.medication_id,
            assignment_id: Some(payload.assignment_id),
            dose_fraction_override: None,
            liquid_dose_ml_override: None,
            taken: Some(true),
            occurred_at: None,
            local_date: None,
            note: None,
            source_type: Some("shortcut".into()),
        },
        state.timezone,
        UserDisplaySettings::default(),
    )
    .await?;

    Ok(HttpResponse::Created().json(record))
}

#[get("/med-intake.shortcut")]
pub async fn download_med_intake_shortcut() -> HttpResponse {
    match ShortcutAssets::get("petmon-med-intake.shortcut") {
        Some(content) => HttpResponse::Ok()
            .insert_header((header::CONTENT_TYPE, "application/octet-stream"))
            .insert_header((
                header::CONTENT_DISPOSITION,
                "attachment; filename=\"petmon-med-intake.shortcut\"",
            ))
            .body(content.data.to_vec()),
        None => HttpResponse::NotFound().body("petmon-med-intake.shortcut not found"),
    }
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/shortcuts")
            .service(med_intake_menu)
            .service(med_intake_take)
            .service(download_med_intake_shortcut),
    );
}
