use actix_web::{test, web, App};
use chrono::{DateTime, TimeZone, Utc};
use chrono_tz::Tz;
use futures::future::BoxFuture;
use petmon::{
    api,
    auth::{identity::Identity, AppState},
    domain::{
        notification::{CreateNotification, Notification},
        nutrition_schedule::NutritionSchedule,
        pet::Pet,
    },
    embedding::{RuntimeResolver, ServiceContext},
    error::{AppError, AppResult},
    notification_runtime::{NotificationBackend, Recipients},
    repo,
    services::{feeding_nudge_service, notification_service, push_service},
};
use sqlx::SqlitePool;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use uuid::Uuid;

#[derive(Default)]
struct PrivateNotifications {
    events: Mutex<Vec<Notification>>,
    revoked: AtomicBool,
    fail_audience: AtomicBool,
    reads: Mutex<Vec<String>>,
}
impl NotificationBackend for PrivateNotifications {
    fn create<'a>(
        &'a self,
        _: &'a SqlitePool,
        request: CreateNotification,
    ) -> BoxFuture<'a, AppResult<Option<Notification>>> {
        Box::pin(async move {
            let mut events = self.events.lock().unwrap();
            if events.iter().any(|event| {
                event.source_kind == request.source_kind && event.source_id == request.source_id
            }) {
                return Ok(None);
            }
            let event = request.into_row();
            events.push(event.clone());
            Ok(Some(event))
        })
    }
    fn list<'a>(
        &'a self,
        _: &'a SqlitePool,
        actor: &'a Identity,
        limit: i64,
        _: bool,
    ) -> BoxFuture<'a, AppResult<Vec<(Notification, bool)>>> {
        Box::pin(async move {
            self.reads.lock().unwrap().push(actor.subject.clone());
            if self.revoked.load(Ordering::SeqCst) {
                return Ok(vec![]);
            }
            Ok(self
                .events
                .lock()
                .unwrap()
                .iter()
                .take(limit as usize)
                .map(|event| (event.clone(), false))
                .collect())
        })
    }
    fn unread_count<'a>(
        &'a self,
        _: &'a SqlitePool,
        _: &'a Identity,
    ) -> BoxFuture<'a, AppResult<i64>> {
        Box::pin(async move {
            Ok(if self.revoked.load(Ordering::SeqCst) {
                0
            } else {
                self.events.lock().unwrap().len() as i64
            })
        })
    }
    fn mark_read<'a>(
        &'a self,
        _: &'a SqlitePool,
        _: &'a Identity,
        _: &'a str,
    ) -> BoxFuture<'a, AppResult<()>> {
        Box::pin(async { Err(AppError::NotFound("notification".into())) })
    }
    fn mark_all_read<'a>(
        &'a self,
        _: &'a SqlitePool,
        _: &'a Identity,
    ) -> BoxFuture<'a, AppResult<()>> {
        Box::pin(async { Err(AppError::Forbidden("read denied".into())) })
    }
    fn dismiss_all<'a>(
        &'a self,
        _: &'a SqlitePool,
        _: &'a Identity,
    ) -> BoxFuture<'a, AppResult<()>> {
        Box::pin(async { Err(AppError::Forbidden("dismiss denied".into())) })
    }
    fn recipients<'a>(
        &'a self,
        _: &'a SqlitePool,
        _: &'a Notification,
    ) -> BoxFuture<'a, AppResult<Recipients>> {
        Box::pin(async move {
            if self.fail_audience.load(Ordering::SeqCst) {
                return Err(AppError::Forbidden("audience unavailable".into()));
            }
            Ok(Recipients::Readers(vec![]))
        })
    }
}

async fn pool() -> SqlitePool {
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    sqlx::migrate!("./migrations").run(&pool).await.unwrap();
    pool
}

async fn pet(pool: &SqlitePool, name: &str) -> Pet {
    repo::pets::create_pet(
        pool,
        Pet::new(serde_json::from_value(serde_json::json!({"name": name})).unwrap()),
    )
    .await
    .unwrap()
}

async fn schedule(pool: &SqlitePool, pet_id: Uuid, from: &str) -> NutritionSchedule {
    repo::nutrition_schedules::create_schedule(
        pool,
        NutritionSchedule {
            id: Uuid::new_v4().to_string(),
            pet_id,
            name: "Feeding".into(),
            active: true,
            notify: true,
            rules_json:
                serde_json::json!({"type":"liquid","windows":[{"from":from,"min":20,"max":40}]})
                    .to_string(),
            created_at: Utc::now().to_rfc3339(),
            updated_at: Utc::now().to_rfc3339(),
        },
    )
    .await
    .unwrap()
}

struct ActorTimezones;
impl RuntimeResolver for ActorTimezones {
    fn timezone<'a>(
        &'a self,
        _: &'a SqlitePool,
        actor: &'a Identity,
        _: Tz,
    ) -> BoxFuture<'a, AppResult<Tz>> {
        Box::pin(async move {
            Ok(if actor.subject == "east" {
                chrono_tz::Asia::Tokyo
            } else {
                chrono_tz::America::Los_Angeles
            })
        })
    }
}

#[actix_web::test]
async fn workers_use_job_actor_timezone_and_injected_notification_backend() {
    let pool = pool().await;
    let east = pet(&pool, "East").await;
    let west = pet(&pool, "West").await;
    schedule(&pool, east.id, "08:00").await;
    schedule(&pool, west.id, "08:00").await;
    let backend = Arc::new(PrivateNotifications::default());
    let mut context = ServiceContext::standalone(pool.clone(), chrono_tz::UTC);
    context.notifications = backend.clone();
    context.runtime = Arc::new(ActorTimezones);
    context.actor.subject = "east".into();
    let now: DateTime<Utc> = Utc.with_ymd_and_hms(2026, 9, 19, 23, 1, 0).unwrap();
    feeding_nudge_service::run_feeding_nudge_check_at(&context, now)
        .await
        .unwrap();
    feeding_nudge_service::run_feeding_nudge_check_at(&context, now)
        .await
        .unwrap();
    {
        let events = backend.events.lock().unwrap();
        assert_eq!(
            events.len(),
            2,
            "both pets use the job actor's local slot, including repeated worker checks"
        );
        assert!(events.iter().any(|e| e.pet_id == Some(east.id)
            && e.source_id.as_ref().unwrap().contains("2026-09-20:08:00")));
        assert!(events.iter().any(|e| e.pet_id == Some(west.id)
            && e.source_id.as_ref().unwrap().contains("2026-09-20:08:00")));
    }
    let (count,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM notifications")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(
        count, 0,
        "workers must not bypass the injected persistence backend"
    );
    context.actor.subject = "west".into();
    assert_eq!(
        context.timezone().await.unwrap(),
        chrono_tz::America::Los_Angeles
    );
    feeding_nudge_service::run_feeding_nudge_check_at(&context, now)
        .await
        .unwrap();
    assert_eq!(
        backend.events.lock().unwrap().len(),
        2,
        "the west actor is not in either pet's 08:00 slot"
    );
}

#[actix_web::test]
async fn notification_http_operations_cannot_fall_back_to_global_storage() {
    let pool = pool().await;
    let backend = Arc::new(PrivateNotifications::default());
    backend.events.lock().unwrap().push(
        CreateNotification {
            kind: "test".into(),
            title: "Retained event".into(),
            body: None,
            link_path: "/".into(),
            link_hash: None,
            pet_id: None,
            pet_name: None,
            source_kind: None,
            source_id: None,
        }
        .into_row(),
    );
    let mut state = AppState::new(pool.clone(), true, None, None);
    state.notifications = backend.clone();
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(state))
            .configure(api::configure),
    )
    .await;
    let response = test::call_service(
        &app,
        test::TestRequest::get()
            .uri("/api/v1/notifications")
            .to_request(),
    )
    .await;
    let values: serde_json::Value = test::read_body_json(response).await;
    assert_eq!(values.as_array().unwrap().len(), 1);
    assert_eq!(backend.reads.lock().unwrap().as_slice(), ["dev"]);
    for (path, status) in [
        ("/api/v1/notifications/read-all", 403),
        ("/api/v1/notifications/dismiss-all", 403),
        ("/api/v1/notifications/foreign/read", 404),
    ] {
        let response =
            test::call_service(&app, test::TestRequest::post().uri(path).to_request()).await;
        assert_eq!(response.status().as_u16(), status);
    }
    backend.revoked.store(true, Ordering::SeqCst);
    let response = test::call_service(
        &app,
        test::TestRequest::get()
            .uri("/api/v1/notifications")
            .to_request(),
    )
    .await;
    let values: serde_json::Value = test::read_body_json(response).await;
    assert_eq!(values, serde_json::json!([]));
    let response = test::call_service(
        &app,
        test::TestRequest::get()
            .uri("/api/v1/notifications/unread-count")
            .to_request(),
    )
    .await;
    let value: serde_json::Value = test::read_body_json(response).await;
    assert_eq!(value["count"], 0);
}

#[actix_web::test]
async fn audience_failure_denies_delivery_before_vapid_or_subscription_work() {
    let pool = pool().await;
    let backend = Arc::new(PrivateNotifications::default());
    backend.fail_audience.store(true, Ordering::SeqCst);
    let mut context = ServiceContext::standalone(pool.clone(), chrono_tz::UTC);
    context.notifications = backend.clone();
    let event = CreateNotification {
        kind: "test".into(),
        title: "Private".into(),
        body: None,
        link_path: "/".into(),
        link_hash: None,
        pet_id: None,
        pet_name: None,
        source_kind: None,
        source_id: None,
    }
    .into_row();
    push_service::broadcast_notification(&context, &event).await;
    backend.fail_audience.store(false, Ordering::SeqCst);
    push_service::broadcast_notification(&context, &event).await;
    let (count,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM app_settings WHERE key = 'vapid'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 0, "failed or empty audience must not start delivery");
    assert_eq!(
        notification_service::unread_count(&context)
            .await
            .unwrap()
            .count,
        0
    );
}

#[actix_web::test]
async fn direct_notification_services_enforce_scopes_and_bound_page_size() {
    let pool = pool().await;
    let backend = Arc::new(PrivateNotifications::default());
    for index in 0..205 {
        backend.events.lock().unwrap().push(
            CreateNotification {
                kind: "test".into(),
                title: index.to_string(),
                body: None,
                link_path: "/".into(),
                link_hash: None,
                pet_id: None,
                pet_name: None,
                source_kind: None,
                source_id: None,
            }
            .into_row(),
        );
    }
    let mut context = ServiceContext::standalone(pool, chrono_tz::UTC);
    context.notifications = backend;
    context.actor.kind = petmon::auth::identity::IdentityKind::ApiToken {
        token_id: "test".into(),
    };
    context.actor.scopes = [petmon::domain::auth::Scope::ApiRead].into_iter().collect();
    assert_eq!(
        notification_service::list(&context, -1, false)
            .await
            .unwrap()
            .len(),
        1
    );
    assert_eq!(
        notification_service::list(&context, 5000, false)
            .await
            .unwrap()
            .len(),
        200
    );
    assert!(matches!(
        notification_service::mark_read(&context, "id").await,
        Err(AppError::Forbidden(_))
    ));
    context.actor.scopes = [petmon::domain::auth::Scope::ApiWrite]
        .into_iter()
        .collect();
    assert!(matches!(
        notification_service::list(&context, 1, false).await,
        Err(AppError::Forbidden(_))
    ));
    assert!(matches!(
        notification_service::unread_count(&context).await,
        Err(AppError::Forbidden(_))
    ));
}

#[actix_web::test]
async fn medication_reminders_deduplicate_by_due_deadline_not_current_hour() {
    use petmon::services::{medication_service, nudge_service};
    let pool = pool().await;
    let pet = pet(&pool, "Reminder").await;
    let backend = Arc::new(PrivateNotifications::default());
    let mut context = ServiceContext::standalone(pool.clone(), chrono_tz::UTC);
    context.notifications = backend.clone();
    let medication = medication_service::create_medication(
        &context,
        serde_json::from_value(serde_json::json!({
            "pet_id": pet.id, "name": "Daily", "med_type": "pill"
        }))
        .unwrap(),
    )
    .await
    .unwrap();
    medication_service::create_assignment(
        &context,
        serde_json::from_value(serde_json::json!({
            "medication_id": medication.id, "tablet_strength_mg": 5,
            "pill_shape": "round", "dose_fraction": "whole", "date_from": "2026-09-01",
            "frequency": {"morning": 1, "midday": 1}
        }))
        .unwrap(),
    )
    .await
    .unwrap();
    repo::pet_settings::upsert(
        &pool,
        &pet.id.to_string(),
        "med_nudge",
        &serde_json::json!({
            "morning": {"enabled": true, "deadline_hour": 9},
            "midday": {"enabled": true, "deadline_hour": 12}
        }),
    )
    .await
    .unwrap();
    for hour in [9, 9, 10, 11] {
        nudge_service::run_nudge_check_at(
            &context,
            Utc.with_ymd_and_hms(2026, 9, 19, hour, 1, 0).unwrap(),
            None,
        )
        .await
        .unwrap();
    }
    assert_eq!(backend.events.lock().unwrap().len(), 1);
    for hour in [12, 13, 23] {
        nudge_service::run_nudge_check_at(
            &context,
            Utc.with_ymd_and_hms(2026, 9, 19, hour, 1, 0).unwrap(),
            None,
        )
        .await
        .unwrap();
    }
    assert_eq!(backend.events.lock().unwrap().len(), 2);
}
