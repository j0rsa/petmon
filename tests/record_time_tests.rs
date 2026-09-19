use chrono::{DateTime, Utc};
use petmon::{domain::nutrition_record::NutritionRecord, record_time, repo};
use serde_json::json;

fn now() -> DateTime<Utc> {
    "2026-09-19T18:30:00Z".parse().unwrap()
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
    assert_eq!(time.utc, "2026-09-19T18:30:00Z");
    assert_eq!(time.civil, "2026-09-20T03:30:00");
    assert_eq!(time.local_date, "2026-09-20");
    let backdated =
        record_time::resolve(None, Some("2026-09-17"), chrono_tz::Asia::Tokyo, now()).unwrap();
    assert_eq!(backdated.civil, "2026-09-17T03:30:00");
    assert_eq!(backdated.utc, "2026-09-16T18:30:00Z");
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
fn ambiguous_or_nonexistent_civil_times_require_an_offset() {
    let tz = chrono_tz::Europe::Berlin;
    for raw in ["2026-10-25T02:30:00", "2026-03-29T02:30:00", "garbage"] {
        assert!(record_time::resolve(Some(raw), None, tz, now()).is_err());
    }
    let first = record_time::resolve(Some("2026-10-25T02:30:00+02:00"), None, tz, now()).unwrap();
    let second = record_time::resolve(Some("2026-10-25T02:30:00+01:00"), None, tz, now()).unwrap();
    assert_eq!(first.civil, second.civil);
    assert_eq!(first.utc, "2026-10-25T00:30:00Z");
    assert_eq!(second.utc, "2026-10-25T01:30:00Z");
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
async fn canonical_fields_survive_storage_and_note_edits() {
    let pool = pool().await;
    let pet_id = pet(&pool).await;
    let record = NutritionRecord::new(serde_json::from_value(json!({"pet_id":pet_id,"category":"wet_food","amount":10,"occurred_at":"2026-10-25T02:30:00+02:00"})).unwrap(), chrono_tz::Europe::Berlin).unwrap();
    let record = repo::nutrition_records::create_record(&pool, record)
        .await
        .unwrap();
    assert_eq!(record.occurred_at, "2026-10-25T02:30:00");
    assert_eq!(
        record.occurred_at_utc.as_deref(),
        Some("2026-10-25T00:30:00Z")
    );
    assert_eq!(record.source_timezone.as_deref(), Some("Europe/Berlin"));
    let edited = repo::nutrition_records::update_record(
        &pool,
        &record.id,
        serde_json::from_value(json!({"note":"different zone now"})).unwrap(),
        chrono_tz::Asia::Tokyo,
    )
    .await
    .unwrap();
    assert_eq!(edited.occurred_at_utc, record.occurred_at_utc);
    assert_eq!(edited.source_timezone, record.source_timezone);
    let edited = repo::nutrition_records::update_record(
        &pool,
        &record.id,
        serde_json::from_value(json!({"occurred_at":"2026-10-25T03:00:00"})).unwrap(),
        chrono_tz::Asia::Tokyo,
    )
    .await
    .unwrap();
    assert_eq!(
        edited.occurred_at_utc.as_deref(),
        Some("2026-10-24T18:00:00Z")
    );
    assert_eq!(edited.source_timezone.as_deref(), Some("Asia/Tokyo"));
}

#[tokio::test]
async fn injected_realtime_clock_keeps_the_exact_instant_during_dst_fold() {
    struct FoldClock;
    impl petmon::embedding::RuntimeResolver for FoldClock {
        fn timezone<'a>(
            &'a self,
            _: &'a sqlx::SqlitePool,
            _: uuid::Uuid,
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
    assert_eq!(record.occurred_at, "2026-10-25T02:30:00");
    assert_eq!(
        record.occurred_at_utc.as_deref(),
        Some("2026-10-25T00:30:00Z")
    );
    assert_eq!(record.source_timezone.as_deref(), Some("Europe/Berlin"));
}

#[tokio::test]
async fn legacy_backfill_is_explicit_dry_run_and_atomic_on_ambiguity() {
    let pool = pool().await;
    let pet_id = pet(&pool).await;
    for (id, civil) in [
        ("valid", "2026-09-19T10:00:00"),
        ("ambiguous", "2026-10-25T02:30:00"),
    ] {
        sqlx::query("INSERT INTO nutrition_records (id,pet_id,occurred_at,local_date,category,amount,created_at,updated_at) VALUES (?,?,?,'2026-09-19','wet_food',10,'old','old')")
            .bind(id).bind(pet_id).bind(civil).execute(&pool).await.unwrap();
    }
    let before = repo::nutrition_records::get_record(&pool, "valid")
        .await
        .unwrap();
    assert!(before.occurred_at_utc.is_none());
    let dry = record_time::backfill_legacy(&pool, chrono_tz::Europe::Berlin, false)
        .await
        .unwrap();
    assert_eq!(dry.candidates, 2);
    assert!(!dry.applied);
    assert_eq!(dry.issues.len(), 1);
    let blocked = record_time::backfill_legacy(&pool, chrono_tz::Europe::Berlin, true)
        .await
        .unwrap();
    assert!(!blocked.applied);
    assert!(repo::nutrition_records::get_record(&pool, "valid")
        .await
        .unwrap()
        .occurred_at_utc
        .is_none());
    sqlx::query(
        "UPDATE nutrition_records SET occurred_at='2026-10-25T02:30:00+02:00' WHERE id='ambiguous'",
    )
    .execute(&pool)
    .await
    .unwrap();
    let applied = record_time::backfill_legacy(&pool, chrono_tz::Europe::Berlin, true)
        .await
        .unwrap();
    assert!(applied.applied);
    let after = repo::nutrition_records::get_record(&pool, "valid")
        .await
        .unwrap();
    assert_eq!(after.occurred_at, before.occurred_at);
    assert_eq!(after.local_date, before.local_date);
    assert_eq!(
        after.occurred_at_utc.as_deref(),
        Some("2026-09-19T08:00:00Z")
    );
    assert_eq!(
        record_time::backfill_legacy(&pool, chrono_tz::UTC, true)
            .await
            .unwrap()
            .candidates,
        0
    );
}

#[tokio::test]
async fn legacy_blank_timestamps_are_never_fabricated_from_the_current_clock() {
    let pool = pool().await;
    let pet_id = pet(&pool).await;
    sqlx::query("INSERT INTO nutrition_records (id,pet_id,occurred_at,local_date,category,amount,created_at,updated_at) VALUES ('blank',?,'','2020-01-01','wet_food',10,'old','old')")
        .bind(pet_id).execute(&pool).await.unwrap();
    let report = record_time::backfill_legacy(&pool, chrono_tz::UTC, true)
        .await
        .unwrap();
    assert!(!report.applied);
    assert_eq!(report.issues.len(), 1);
    assert!(repo::nutrition_records::get_record(&pool, "blank")
        .await
        .unwrap()
        .occurred_at_utc
        .is_none());
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
    assert_eq!(status.as_of, "2026-10-25T02:35:00");
}
