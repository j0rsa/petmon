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

#[derive(RustEmbed)]
#[folder = "assets/automate"]
#[include = "Petmon Take Meds.flo"]
struct AutomateAssets;

const SHORTCUT_FILENAME: &str = "Petmon Take Meds.shortcut";
const AUTOMATE_FILENAME: &str = "Petmon Take Meds.flo";

#[derive(serde::Deserialize)]
pub struct MedIntakeMenuQuery {
    pub pet_id: String,
    pub date: String,
}

/// Query params of a shortcut take.
///
/// `deny_unknown_fields` is the point, not a detail: this endpoint is real-time
/// only, so an `occurred_at` / `local_date` from a generator that has drifted
/// must fail loudly instead of being silently dropped, which would look like a
/// backdated dose that quietly landed on today.
#[derive(serde::Deserialize, Default)]
#[serde(deny_unknown_fields)]
pub struct MedIntakeTakeQuery {
    pub dose_fraction: Option<DoseFraction>,
    pub liquid_dose_ml: Option<f64>,
    dose_fraction_override: Option<DoseFraction>,
    liquid_dose_ml_override: Option<f64>,
    /// Intake source label (e.g. `shortcut`, `automate`). Defaults to `shortcut`.
    pub source: Option<String>,
}

#[derive(serde::Deserialize, Default)]
pub struct MedIntakeTakeBody {
    pub dose_fraction_override: Option<DoseFraction>,
    pub liquid_dose_ml_override: Option<f64>,
}

impl MedIntakeTakeQuery {
    fn dose_fraction_override(&self) -> Option<DoseFraction> {
        self.dose_fraction_override.or(self.dose_fraction)
    }

    fn liquid_dose_ml_override(&self) -> Option<f64> {
        self.liquid_dose_ml_override.or(self.liquid_dose_ml)
    }
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

#[post("/meds/intake/take/{token}")]
#[require_scope("api_write")]
pub async fn med_intake_take(
    state: web::Data<AppState>,
    token: web::Path<String>,
    query: web::Query<MedIntakeTakeQuery>,
    body: Option<web::Json<MedIntakeTakeBody>>,
) -> AppResult<HttpResponse> {
    let payload = shortcut_menu::decode_take_token(&token)?;
    let pet_id = Uuid::parse_str(&payload.pet_id)
        .map_err(|_| AppError::BadRequest("invalid pet_id in token".into()))?;

    let dose_fraction_override = body
        .as_ref()
        .and_then(|b| b.dose_fraction_override)
        .or_else(|| query.dose_fraction_override());
    let liquid_dose_ml_override = body
        .as_ref()
        .and_then(|b| b.liquid_dose_ml_override)
        .or_else(|| query.liquid_dose_ml_override());

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
            medication_id: payload.medication_id,
            assignment_id: Some(payload.assignment_id),
            dose_fraction_override,
            liquid_dose_ml_override,
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

#[get("/meds/intake.flo")]
pub async fn download_med_intake_automate() -> HttpResponse {
    match AutomateAssets::get(AUTOMATE_FILENAME) {
        Some(content) => HttpResponse::Ok()
            .insert_header((header::CONTENT_TYPE, "application/octet-stream"))
            .insert_header((
                header::CONTENT_DISPOSITION,
                format!("attachment; filename=\"{AUTOMATE_FILENAME}\""),
            ))
            .body(content.data.to_vec()),
        None => HttpResponse::NotFound().body(format!("{AUTOMATE_FILENAME} not found")),
    }
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
            .service(download_med_intake_automate)
            .service(download_med_intake_shortcut),
    );
}
