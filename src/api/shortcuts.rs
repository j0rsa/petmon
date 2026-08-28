use actix_web::{get, http::header, post, web, HttpResponse};
use petmon_macros::require_scope;
use rust_embed::RustEmbed;
use uuid::Uuid;

use crate::auth::AppState;
use crate::domain::medication::{CreateMedIntakeRecord, DoseFraction};
use crate::domain::user_settings::UserDisplaySettings;
use crate::error::{AppError, AppResult};
use crate::services::{medication_service, shortcut_menu};

#[derive(RustEmbed)]
#[folder = "assets/shortcuts"]
#[include = "Petmon Take Meds.shortcut"]
struct ShortcutAssets;

const SHORTCUT_FILENAME: &str = "Petmon Take Meds.shortcut";

#[derive(serde::Deserialize)]
pub struct MedIntakeMenuQuery {
    pub pet_id: String,
    pub date: String,
}

/// Query params of the shortcut take endpoint.
///
/// `deny_unknown_fields` is the point, not a detail: this endpoint is real-time
/// only, so an `occurred_at` / `local_date` from a generator that has drifted
/// must fail loudly instead of being silently dropped, which would look like a
/// backdated dose that quietly landed on today.
#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MedIntakeTakeQuery {
    pub pet_id: String,
    pub medication_id: String,
    pub assignment_id: String,
    pub dose_fraction: Option<DoseFraction>,
    pub liquid_dose_ml: Option<f64>,
    /// Intake source label (e.g. `shortcut`). Defaults to `shortcut`.
    pub source: Option<String>,
}

#[get("/meds/intake/menu")]
#[require_scope("api_read")]
pub async fn med_intake_menu_handler(
    state: web::Data<AppState>,
    query: web::Query<MedIntakeMenuQuery>,
) -> AppResult<HttpResponse> {
    let pet_id = Uuid::parse_str(&query.pet_id)
        .map_err(|_| AppError::BadRequest("invalid pet_id".into()))?;
    let menu = shortcut_menu::med_intake_menu(&state.pool, pet_id, &query.date).await?;
    Ok(HttpResponse::Ok().json(menu))
}

#[post("/meds/intake/take")]
#[require_scope("api_write")]
pub async fn med_intake_take(
    state: web::Data<AppState>,
    query: web::Query<MedIntakeTakeQuery>,
) -> AppResult<HttpResponse> {
    let pet_id = Uuid::parse_str(&query.pet_id)
        .map_err(|_| AppError::BadRequest("invalid pet_id".into()))?;

    let source_type = query
        .source
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("shortcut")
        .to_string();

    // Real-time only: no caller can pass a clock, so the repo stamps
    // server-local now and Telegram prints the plain `#pills` line, exactly
    // like a take from the web UI. Backdating goes through the normal intake
    // API instead.
    let record = medication_service::create_intake(
        &state.pool,
        CreateMedIntakeRecord {
            pet_id: pet_id.to_string(),
            medication_id: query.medication_id.clone(),
            assignment_id: Some(query.assignment_id.clone()),
            dose_fraction_override: query.dose_fraction,
            liquid_dose_ml_override: query.liquid_dose_ml,
            taken: Some(true),
            occurred_at: None,
            local_date: None,
            note: None,
            source_type: Some(source_type),
        },
        state.timezone,
        UserDisplaySettings::default(),
    )
    .await?;

    Ok(HttpResponse::Created().json(record))
}

#[get("/meds/intake.shortcut")]
pub async fn download_med_intake_shortcut() -> HttpResponse {
    match ShortcutAssets::get(SHORTCUT_FILENAME) {
        Some(content) => HttpResponse::Ok()
            .insert_header((header::CONTENT_TYPE, "application/octet-stream"))
            .insert_header((
                header::CONTENT_DISPOSITION,
                format!("attachment; filename=\"{SHORTCUT_FILENAME}\""),
            ))
            .body(content.data.to_vec()),
        None => HttpResponse::NotFound().body(format!("{SHORTCUT_FILENAME} not found")),
    }
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/shortcuts")
            .service(med_intake_menu_handler)
            .service(med_intake_take)
            .service(download_med_intake_shortcut),
    );
}
