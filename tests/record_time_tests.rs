use chrono::{DateTime, Utc};
use petmon::{domain::nutrition_record::NutritionRecord, record_time, repo};
use serde_json::json;

fn now() -> DateTime<Utc> {
    "2026-09-19T18:30:00Z".parse().unwrap()
}
fn canonical(raw: &str) -> String {
    record_time::format_utc(record_time::parse_instant(raw).unwrap())
}

#[test]
fn offsets_midnight_and_journal_dates_are_separate() {
    let time = record_time::resolve(
        Some("2026-09-19T20:30:00+02:00"),
        None,
        chrono_tz::Asia::Tokyo,
        now(),
    )
    .unwrap();
    assert_eq!(time.utc, canonical("2026-09-19T18:30:00Z"));
    assert_eq!(time.local_date, "2026-09-20");
    let backdated =
        record_time::resolve(None, Some("2026-09-17"), chrono_tz::Asia::Tokyo, now()).unwrap();
    assert_eq!(backdated.utc, canonical("2026-09-16T18:30:00Z"));
    assert_eq!(backdated.local_date, "2026-09-17");
    let journal = record_time::resolve(
        Some("2026-09-19T20:30:00+02:00"),
        Some("2026-09-18"),
        chrono_tz::Asia::Tokyo,
        now(),
    )
    .unwrap();
    assert_eq!(journal.local_date, "2026-09-18");
    assert_eq!(journal.utc, time.utc);
}

#[test]
fn new_timestamp_inputs_require_offsets_even_when_naive_time_is_unambiguous() {
    for raw in [
        "2026-10-25T02:30:00",
        "2026-03-29T02:30:00",
        "2026-09-19T10:00:00",
        "",
        "garbage",
    ] {
        assert!(record_time::resolve(Some(raw), None, chrono_tz::Europe::Berlin, now()).is_err());
    }
    let first = record_time::resolve(
        Some("2026-10-25T02:30:00+02:00"),
        None,
        chrono_tz::Europe::Berlin,
        now(),
    )
    .unwrap();
    let second = record_time::resolve(
        Some("2026-10-25T02:30:00+01:00"),
        None,
        chrono_tz::Europe::Berlin,
        now(),
    )
    .unwrap();
    assert_eq!(first.utc, canonical("2026-10-25T00:30:00Z"));
    assert_eq!(second.utc, canonical("2026-10-25T01:30:00Z"));
}

#[test]
fn fixed_precision_preserves_subsecond_order() {
    let first = canonical("2026-01-01T00:00:00Z");
    let second = canonical("2026-01-01T00:00:00.000000001Z");
    assert!(first < second);
    assert_eq!(first, "2026-01-01T00:00:00.000000000Z");
}

async fn pool() -> sqlx::SqlitePool {
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    petmon::db::run_migrations(&pool).await.unwrap();
    pool
}
async fn pet(pool: &sqlx::SqlitePool) -> uuid::Uuid {
    repo::pets::create_pet(
        pool,
        petmon::domain::pet::Pet::new(
            serde_json::from_value(json!({"name":"Time","species":"cat"})).unwrap(),
        ),
    )
    .await
    .unwrap()
    .id
}

#[tokio::test]
async fn single_canonical_field_survives_note_edits_and_preserves_journal_day() {
    let pool = pool().await;
    let pet_id = pet(&pool).await;
    let record=NutritionRecord::new(serde_json::from_value(json!({"pet_id":pet_id,"category":"wet_food","amount":10,"occurred_at":"2026-10-25T02:30:00+02:00","local_date":"2026-10-24"})).unwrap(),chrono_tz::Europe::Berlin).unwrap();
    let record = repo::nutrition_records::create_record(&pool, record)
        .await
        .unwrap();
    assert_eq!(record.occurred_at, canonical("2026-10-25T00:30:00Z"));
    let json = serde_json::to_value(&record).unwrap();
    assert!(json.get("occurred_at_utc").is_none());
    assert!(json.get("source_timezone").is_none());
    let edited = repo::nutrition_records::update_record(
        &pool,
        &record.id,
        serde_json::from_value(json!({"note":"different zone now"})).unwrap(),
        chrono_tz::Asia::Tokyo,
    )
    .await
    .unwrap();
    assert_eq!(edited.occurred_at, record.occurred_at);
    assert_eq!(edited.local_date, "2026-10-24");
    let edited = repo::nutrition_records::update_record(
        &pool,
        &record.id,
        serde_json::from_value(json!({"occurred_at":"2026-10-25T03:00:00+09:00"})).unwrap(),
        chrono_tz::Asia::Tokyo,
    )
    .await
    .unwrap();
    assert_eq!(edited.occurred_at, canonical("2026-10-24T18:00:00Z"));
    assert_eq!(edited.local_date, "2026-10-24");
    petmon::record_time::ensure_canonical(&pool).await.unwrap();
    for (table, removed) in [
        ("nutrition_records", "occurred_at_utc"),
        ("weight_records", "measured_at_utc"),
    ] {
        let query = format!("SELECT name FROM pragma_table_info('{table}')");
        let names: Vec<String> = sqlx::query_scalar(sqlx::AssertSqlSafe(query))
            .fetch_all(&pool)
            .await
            .unwrap();
        assert!(!names
            .iter()
            .any(|name| name == removed || name == "source_timezone"));
    }
}

#[tokio::test]
async fn injected_realtime_clock_keeps_exact_instant_during_dst_fold() {
    struct FoldClock;
    impl petmon::embedding::RuntimeResolver for FoldClock {
        fn timezone<'a>(
            &'a self,
            _: &'a sqlx::SqlitePool,
            _: &'a petmon::auth::identity::Identity,
            _: chrono_tz::Tz,
        ) -> futures::future::BoxFuture<'a, petmon::error::AppResult<chrono_tz::Tz>> {
            Box::pin(async { Ok(chrono_tz::Europe::Berlin) })
        }
        fn now(&self) -> DateTime<Utc> {
            "2026-10-25T00:30:00Z".parse().unwrap()
        }
    }
    let pool = pool().await;
    let pet_id = pet(&pool).await;
    let mut context = petmon::embedding::ServiceContext::standalone(pool, chrono_tz::UTC);
    context.runtime = std::sync::Arc::new(FoldClock);
    let record = petmon::services::nutrition_record_service::create(
        &context,
        serde_json::from_value(json!({"pet_id":pet_id,"category":"wet_food","amount":10})).unwrap(),
        chrono_tz::UTC,
    )
    .await
    .unwrap();
    assert_eq!(record.occurred_at, canonical("2026-10-25T00:30:00Z"));
    assert_eq!(record.local_date, "2026-10-25");
}

#[tokio::test]
async fn legacy_conversion_is_explicit_and_atomic_and_startup_refuses_legacy_rows() {
    let pool = pool().await;
    let pet_id = pet(&pool).await;
    let current_version = petmon::domain::elimination_classifier::CURRENT_MODEL_VERSION as i64;
    sqlx::query("INSERT INTO elimination_classifiers (pet_id,model_version,model_json,sample_count,trained_at,pending_retrain,created_at,updated_at) VALUES (?,?,'{}',8,'old',0,'old','old')").bind(pet_id).bind(current_version).execute(&pool).await.unwrap();
    for (id, civil) in [
        ("valid", "2026-09-19T10:00:00"),
        ("ambiguous", "2026-10-25T02:30:00"),
        ("gap", "2026-03-29T02:30:00"),
    ] {
        sqlx::query("INSERT INTO nutrition_records (id,pet_id,occurred_at,local_date,category,amount,created_at,updated_at) VALUES (?,?,?,'2026-09-18','wet_food',10,'old','old')").bind(id).bind(pet_id).bind(civil).execute(&pool).await.unwrap();
    }
    assert!(petmon::db::run_migrations(&pool).await.is_err());
    let dry = record_time::backfill_legacy(&pool, chrono_tz::Europe::Berlin, false)
        .await
        .unwrap();
    assert_eq!(dry.candidates, 3);
    assert!(!dry.applied);
    assert_eq!(dry.issues.len(), 2);
    let blocked = record_time::backfill_legacy(&pool, chrono_tz::Europe::Berlin, true)
        .await
        .unwrap();
    assert!(!blocked.applied);
    let version: i64 =
        sqlx::query_scalar("SELECT model_version FROM elimination_classifiers WHERE pet_id=?")
            .bind(pet_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(version, current_version);
    assert_eq!(
        repo::nutrition_records::get_record(&pool, "valid")
            .await
            .unwrap()
            .occurred_at,
        "2026-09-19T10:00:00"
    );
    sqlx::query(
        "UPDATE nutrition_records SET occurred_at='2026-10-25T02:30:00+02:00' WHERE id='ambiguous'",
    )
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "UPDATE nutrition_records SET occurred_at='2026-03-29T03:30:00+02:00' WHERE id='gap'",
    )
    .execute(&pool)
    .await
    .unwrap();
    let applied = record_time::backfill_legacy(&pool, chrono_tz::Europe::Berlin, true)
        .await
        .unwrap();
    assert!(applied.applied);
    assert!(repo::elimination_classifiers::get(&pool, pet_id)
        .await
        .unwrap()
        .is_none());
    assert_eq!(
        repo::elimination_classifiers::pending_pet_ids(&pool, 10)
            .await
            .unwrap(),
        vec![pet_id]
    );
    let after = repo::nutrition_records::get_record(&pool, "valid")
        .await
        .unwrap();
    assert_eq!(after.occurred_at, canonical("2026-09-19T08:00:00Z"));
    assert_eq!(after.local_date, "2026-09-18");
    petmon::db::run_migrations(&pool).await.unwrap();
    assert_eq!(
        record_time::backfill_legacy(&pool, chrono_tz::UTC, true)
            .await
            .unwrap()
            .candidates,
        0
    );
}

#[tokio::test]
async fn migration_cli_requires_historical_timezone_and_never_infers_empty_instants() {
    let pool = pool().await;
    let pet_id = pet(&pool).await;
    assert!(
        record_time::run_cli(&pool, &["migrate-record-times".into(), "--apply".into()])
            .await
            .is_err()
    );
    sqlx::query("INSERT INTO nutrition_records (id,pet_id,occurred_at,local_date,category,amount,created_at,updated_at) VALUES ('blank',?,'','2020-01-01','wet_food',10,'old','old')").bind(pet_id).execute(&pool).await.unwrap();
    let report = record_time::backfill_legacy(&pool, chrono_tz::UTC, true)
        .await
        .unwrap();
    assert!(!report.applied);
    assert_eq!(report.issues.len(), 1);
    assert_eq!(
        repo::nutrition_records::get_record(&pool, "blank")
            .await
            .unwrap()
            .occurred_at,
        ""
    );
}

#[tokio::test]
async fn nutrition_status_uses_absolute_cutoff_across_repeated_dst_hour() {
    let pool = pool().await;
    let pet_id = pet(&pool).await;
    for (timestamp, amount) in [
        ("2026-10-25T02:45:00+02:00", 100),
        ("2026-10-25T02:50:00+01:00", 1000),
    ] {
        let record = NutritionRecord::new(
            serde_json::from_value(
                json!({"pet_id":pet_id,"category":"water","amount":amount,"occurred_at":timestamp}),
            )
            .unwrap(),
            chrono_tz::Europe::Berlin,
        )
        .unwrap();
        repo::nutrition_records::create_record(&pool, record)
            .await
            .unwrap();
    }
    let context = petmon::embedding::ServiceContext::standalone(pool, chrono_tz::Europe::Berlin);
    let status = petmon::services::nutrition_status_service::get_status(
        &context,
        pet_id,
        Some("2026-10-25T02:35:00+01:00"),
        chrono_tz::Europe::Berlin,
    )
    .await
    .unwrap();
    assert_eq!(status.intake.water_ml, 100.0);
}
