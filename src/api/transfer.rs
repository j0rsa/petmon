//! User-owned OSS-to-Pro care-data export.
//!
//! The bundle is intentionally a portable JSON document rather than a SQLite
//! database copy. It includes only pet-scoped care data and intentionally
//! excludes identity, credentials, administration, push state, and historical
//! Telegram message delivery references. Pet Telegram destinations transfer
//! with the pet; the destination contains no bot credential.
use actix_web::{get, web, HttpResponse};
use petmon_macros::require_scope;
use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use sqlx::{Row, SqlitePool};
use std::collections::BTreeMap;

use crate::{
    auth::AppState,
    error::{AppError, AppResult},
};

const FORMAT: &str = "petmon-transfer";
const VERSION: u32 = 1;
const SCHEMA_VERSION: u32 = 24;

#[derive(Serialize)]
struct Bundle<'a> {
    format: &'static str,
    version: u32,
    manifest: Manifest,
    data: Data,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "_reserved")]
    reserved: Option<&'a str>,
}

#[derive(Serialize)]
struct Manifest {
    source_version: String,
    source_schema_version: u32,
    checksums: BTreeMap<String, String>,
}

#[derive(Serialize)]
struct Data {
    pets: Vec<Value>,
    nutrition_records: Vec<Value>,
    elimination_records: Vec<Value>,
    health_records: Vec<Value>,
    day_notes: Vec<Value>,
    nutrition_schedules: Vec<Value>,
    weight_records: Vec<Value>,
    medications: Vec<Value>,
    med_formulations: Vec<Value>,
    med_assignments: Vec<Value>,
    med_intake_records: Vec<Value>,
    med_bundles: Vec<Value>,
    med_bundle_items: Vec<Value>,
    pet_settings: Vec<Value>,
}

#[get("/transfer/oss")]
#[require_scope("api_read")]
pub async fn download_transfer(state: web::Data<AppState>) -> AppResult<HttpResponse> {
    let data = load_data(&state.pool).await?;
    let checksums = checksums(&data)?;
    let bundle = Bundle {
        format: FORMAT,
        version: VERSION,
        manifest: Manifest {
            source_version: state.application_version.clone(),
            source_schema_version: SCHEMA_VERSION,
            checksums,
        },
        data,
        reserved: None,
    };
    let body = serde_json::to_vec_pretty(&bundle)
        .map_err(|_| AppError::Internal("could not encode transfer bundle".into()))?;
    Ok(HttpResponse::Ok()
        .insert_header(("Cache-Control", "no-store"))
        .insert_header(("Content-Type", "application/json"))
        .insert_header((
            "Content-Disposition",
            "attachment; filename=petmon-transfer.json",
        ))
        .body(body))
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(web::scope("/exports").service(download_transfer));
}

async fn load_data(pool: &SqlitePool) -> AppResult<Data> {
    // Pro cannot safely attach a global day note to a household. Refuse an
    // export rather than silently dropping it from a supposedly complete dump.
    let global_notes: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM day_notes WHERE pet_id IS NULL")
            .fetch_one(pool)
            .await?;
    if global_notes != 0 {
        return Err(AppError::BadRequest(
            "move or remove instance-wide day notes before exporting to Pro".into(),
        ));
    }
    Ok(Data {
        pets: json_rows(pool, "SELECT json_object('id', lower(hex(id)), 'name', name, 'species', species, 'status', status, 'breed', breed, 'birth_date', birth_date, 'blood_type', blood_type, 'color', color, 'weight_kg', weight_kg, 'feeding_notes', feeding_notes, 'telegram_nutrition_chat_id', telegram_nutrition_chat_id, 'telegram_nutrition_thread_id', telegram_nutrition_thread_id, 'telegram_meds_chat_id', telegram_meds_chat_id, 'telegram_meds_thread_id', telegram_meds_thread_id, 'elimination_auto_categorize_by_duration', elimination_auto_categorize_by_duration, 'created_at', created_at, 'updated_at', updated_at) FROM pets ORDER BY id").await?,
        nutrition_records: json_rows(pool, "SELECT json_object('id', id, 'pet_id', lower(hex(pet_id)), 'occurred_at', occurred_at, 'local_date', local_date, 'category', category, 'amount', amount, 'unit', unit, 'note', note, 'source_type', source_type, 'created_at', created_at, 'updated_at', updated_at) FROM nutrition_records ORDER BY id").await?,
        elimination_records: json_rows(pool, "SELECT json_object('id', id, 'pet_id', lower(hex(pet_id)), 'occurred_at', occurred_at, 'local_date', local_date, 'event_type', event_type, 'subtype', subtype, 'duration_seconds', duration_seconds, 'note', note, 'source_type', source_type, 'is_auto_categorized', is_auto_categorized, 'auto_categorize_confidence', auto_categorize_confidence, 'created_at', created_at, 'updated_at', updated_at) FROM elimination_records ORDER BY id").await?,
        health_records: json_rows(pool, "SELECT json_object('id', id, 'pet_id', lower(hex(pet_id)), 'occurred_at', occurred_at, 'local_date', local_date, 'record_type', record_type, 'note', note, 'payload_json', payload_json, 'source_type', source_type, 'created_at', created_at, 'updated_at', updated_at) FROM health_records ORDER BY id").await?,
        day_notes: json_rows(pool, "SELECT json_object('id', id, 'pet_id', lower(hex(pet_id)), 'local_date', local_date, 'note', note, 'created_at', created_at, 'updated_at', updated_at) FROM day_notes ORDER BY id").await?,
        nutrition_schedules: json_rows(pool, "SELECT json_object('id', id, 'pet_id', lower(hex(pet_id)), 'name', name, 'active', active, 'notify', notify, 'rules_json', rules_json, 'created_at', created_at, 'updated_at', updated_at) FROM nutrition_schedules ORDER BY id").await?,
        weight_records: json_rows(pool, "SELECT json_object('id', id, 'pet_id', lower(hex(pet_id)), 'measured_at', measured_at, 'local_date', local_date, 'weight_kg', weight_kg, 'note', note, 'source_type', source_type, 'created_at', created_at) FROM weight_records ORDER BY id").await?,
        medications: json_rows(pool, "SELECT json_object('id', id, 'pet_id', lower(hex(pet_id)), 'name', name, 'med_type', med_type, 'color', color, 'emoji', emoji, 'description', description, 'created_at', created_at, 'updated_at', updated_at) FROM medications ORDER BY id").await?,
        med_formulations: json_rows(pool, "SELECT json_object('id', id, 'medication_id', medication_id, 'tablet_strength_mg', tablet_strength_mg, 'pill_shape', pill_shape, 'liquid_concentration_mg_per_ml', liquid_concentration_mg_per_ml, 'created_at', created_at) FROM med_formulations ORDER BY id").await?,
        med_assignments: json_rows(pool, "SELECT json_object('id', id, 'medication_id', medication_id, 'pet_id', lower(hex(pet_id)), 'formulation_id', formulation_id, 'dose_fraction', dose_fraction, 'liquid_dose_ml', liquid_dose_ml, 'frequency_json', frequency_json, 'date_from', date_from, 'date_to', date_to, 'optional', optional, 'meal_wait_minutes', meal_wait_minutes, 'created_at', created_at, 'updated_at', updated_at) FROM med_assignments ORDER BY id").await?,
        med_intake_records: json_rows(pool, "SELECT json_object('id', id, 'pet_id', lower(hex(pet_id)), 'medication_id', medication_id, 'assignment_id', assignment_id, 'dose_fraction_override', dose_fraction_override, 'liquid_dose_ml_override', liquid_dose_ml_override, 'occurred_at', occurred_at, 'local_date', local_date, 'taken', taken, 'note', note, 'source_type', source_type, 'created_at', created_at) FROM med_intake_records ORDER BY id").await?,
        med_bundles: json_rows(pool, "SELECT json_object('id', id, 'pet_id', lower(hex(pet_id)), 'name', name, 'created_at', created_at, 'updated_at', updated_at) FROM med_bundles ORDER BY id").await?,
        med_bundle_items: json_rows(pool, "SELECT json_object('bundle_id', bundle_id, 'medication_id', medication_id, 'position', position) FROM med_bundle_items ORDER BY bundle_id, medication_id").await?,
        pet_settings: json_rows(pool, "SELECT json_object('pet_id', lower(hex(pet_id)), 'key', key, 'value_json', value_json, 'updated_at', updated_at) FROM pet_settings WHERE key = 'med_nudge' ORDER BY pet_id").await?,
    })
}

async fn json_rows(pool: &SqlitePool, sql: &'static str) -> AppResult<Vec<Value>> {
    let rows = sqlx::query(sql).fetch_all(pool).await?;
    rows.into_iter()
        .map(|row| {
            let json: String = row.try_get(0)?;
            serde_json::from_str(&json)
                .map_err(|_| AppError::Internal("database returned invalid transfer JSON".into()))
        })
        .collect()
}

fn checksums(data: &Data) -> AppResult<BTreeMap<String, String>> {
    [
        ("pets", &data.pets),
        ("nutrition_records", &data.nutrition_records),
        ("elimination_records", &data.elimination_records),
        ("health_records", &data.health_records),
        ("day_notes", &data.day_notes),
        ("nutrition_schedules", &data.nutrition_schedules),
        ("weight_records", &data.weight_records),
        ("medications", &data.medications),
        ("med_formulations", &data.med_formulations),
        ("med_assignments", &data.med_assignments),
        ("med_intake_records", &data.med_intake_records),
        ("med_bundles", &data.med_bundles),
        ("med_bundle_items", &data.med_bundle_items),
        ("pet_settings", &data.pet_settings),
    ]
    .into_iter()
    .map(|(name, rows)| {
        let bytes = serde_json::to_vec(rows)
            .map_err(|_| AppError::Internal("could not checksum transfer bundle".into()))?;
        Ok((name.to_string(), format!("{:x}", Sha256::digest(bytes))))
    })
    .collect()
}
