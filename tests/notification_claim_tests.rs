use petmon::{domain::notification::CreateNotification, repo::notifications};

async fn pool() -> sqlx::SqlitePool {
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    petmon::db::run_migrations(&pool).await.unwrap();
    pool
}

fn event(id: &str) -> CreateNotification {
    CreateNotification {
        kind: "med.nudge".into(),
        title: "Reminder".into(),
        body: None,
        link_path: "/health".into(),
        link_hash: None,
        pet_id: None,
        pet_name: None,
        source_kind: Some("med_nudge".into()),
        source_id: Some(id.into()),
    }
}

#[tokio::test]
async fn reminder_claims_survive_dismissal_and_concurrent_ticks() {
    let pool = pool().await;
    let (first, concurrent) = tokio::join!(
        notifications::create(&pool, event("pet:date:8")),
        notifications::create(&pool, event("pet:date:8"))
    );
    assert_eq!(
        usize::from(first.unwrap().is_some()) + usize::from(concurrent.unwrap().is_some()),
        1
    );
    notifications::delete_all(&pool).await.unwrap();
    assert!(notifications::create(&pool, event("pet:date:8"))
        .await
        .unwrap()
        .is_none());
    assert!(notifications::create(&pool, event("pet:date:12"))
        .await
        .unwrap()
        .is_some());
}

#[tokio::test]
async fn failed_notification_insert_rolls_back_delivery_claim() {
    let pool = pool().await;
    let mut invalid = event("retry");
    invalid.pet_id = Some(uuid::Uuid::new_v4());
    assert!(notifications::create(&pool, invalid).await.is_err());
    assert!(notifications::create(&pool, event("retry"))
        .await
        .unwrap()
        .is_some());
}

#[tokio::test]
async fn migration_claims_existing_events_before_they_can_be_dismissed() {
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    sqlx::migrate!("./migrations")
        .run_to(23, &pool)
        .await
        .unwrap();
    // Use the released schema: the current notification repository requires claims.
    sqlx::query("INSERT INTO notifications (id, kind, title, link_path, source_kind, source_id, created_at) VALUES ('existing', 'med.nudge', 'Reminder', '/health', 'med_nudge', 'existing', '2026-01-01T00:00:00Z')")
        .execute(&pool).await.unwrap();
    petmon::db::run_migrations(&pool).await.unwrap();
    notifications::delete_all(&pool).await.unwrap();
    assert!(notifications::create(&pool, event("existing"))
        .await
        .unwrap()
        .is_none());
}
