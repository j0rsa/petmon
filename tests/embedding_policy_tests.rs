use actix_web::{test, web, App};
use chrono::{DateTime, Utc};
use chrono_tz::Tz;
use futures::future::BoxFuture;
use petmon::{
    auth::{
        identity::{Identity, IdentityKind},
        AppState,
    },
    embedding::{
        IdentityAdapter, PetVisibility, ResourceAction, ResourcePolicy, RuntimeResolver,
        ServiceContext,
    },
    error::{AppError, AppResult},
    services::{nutrition_record_service, pet_service},
};
use serde_json::{json, Value};
use sqlx::SqlitePool;
use std::sync::Arc;
use uuid::Uuid;

struct Restricted {
    visible: Vec<Uuid>,
}
impl ResourcePolicy for Restricted {
    fn authorize<'a>(
        &'a self,
        _: &'a SqlitePool,
        _: &'a Identity,
        pet: Option<Uuid>,
        action: ResourceAction,
    ) -> BoxFuture<'a, AppResult<()>> {
        Box::pin(async move {
            if pet.is_some_and(|id| self.visible.contains(&id))
                && !matches!(
                    action,
                    ResourceAction::ManageIntegrations | ResourceAction::ChangeStatus
                )
            {
                Ok(())
            } else {
                Err(AppError::Forbidden("test policy denied".into()))
            }
        })
    }
    fn visibility<'a>(
        &'a self,
        _: &'a SqlitePool,
        _: &'a Identity,
    ) -> BoxFuture<'a, AppResult<PetVisibility>> {
        Box::pin(async { Ok(PetVisibility::Ids(self.visible.clone())) })
    }
}
struct Session;
impl IdentityAdapter for Session {
    fn authenticate<'a>(
        &'a self,
        _: &'a SqlitePool,
        _: &'a str,
    ) -> BoxFuture<'a, AppResult<Identity>> {
        Box::pin(async { Ok(actor()) })
    }
}
fn actor() -> Identity {
    Identity {
        subject: "ordinary-user".into(),
        kind: IdentityKind::Oidc,
        ..Identity::dev()
    }
}
async fn setup() -> (ServiceContext, Uuid, Uuid) {
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    sqlx::migrate!("./migrations").run(&pool).await.unwrap();
    let context = ServiceContext::standalone(pool, chrono_tz::UTC);
    let visible = pet_service::create(
        &context,
        serde_json::from_value(json!({"name":"Visible"})).unwrap(),
    )
    .await
    .unwrap()
    .id;
    let hidden = pet_service::create(
        &context,
        serde_json::from_value(json!({"name":"Hidden"})).unwrap(),
    )
    .await
    .unwrap()
    .id;
    (context, visible, hidden)
}
fn restricted(base: &ServiceContext, pets: Vec<Uuid>) -> ServiceContext {
    ServiceContext {
        actor: actor(),
        policy: Arc::new(Restricted { visible: pets }),
        ..base.clone()
    }
}
fn state(context: &ServiceContext) -> web::Data<AppState> {
    let mut state = AppState::new(context.pool.clone(), false, None, None);
    state.resource_policy = context.policy.clone();
    state.runtime = context.runtime.clone();
    state.identity_adapter = Some(Arc::new(Session));
    web::Data::new(state)
}
macro_rules! app {
    ($state:expr) => {
        test::init_service(
            App::new()
                .app_data($state)
                .service(
                    web::scope("/api/v1")
                        .wrap(petmon::middleware::auth::RequireAuth)
                        .configure(petmon::api::configure_full),
                )
                .service(
                    web::scope("/mcp")
                        .wrap(petmon::middleware::auth::RequireAuth)
                        .configure(petmon::mcp::transport::configure),
                ),
        )
        .await
    };
}
fn record(
    pet: Uuid,
    amount: f64,
    occurred_at: &str,
) -> petmon::domain::nutrition_record::CreateNutritionRecord {
    let occurred_at = format!("{occurred_at}Z"); // These fixture wall times explicitly represent UTC.
    serde_json::from_value(
        json!({"pet_id":pet,"category":"water","amount":amount,"occurred_at":occurred_at}),
    )
    .unwrap()
}

#[actix_web::test]
async fn visibility_precedes_pagination_and_aggregation_and_empty_means_none() {
    let (base, visible, hidden) = setup().await;
    for (pet, amount, time) in [
        (hidden, 999.0, "2026-01-01T08:00:00"),
        (visible, 1.0, "2026-01-01T09:00:00"),
        (visible, 2.0, "2026-01-01T10:00:00"),
    ] {
        nutrition_record_service::create(&base, record(pet, amount, time), chrono_tz::UTC)
            .await
            .unwrap();
    }
    let ctx = restricted(&base, vec![visible]);
    let filters = serde_json::from_value(json!({"limit":1,"offset":1})).unwrap();
    let records = nutrition_record_service::list(&ctx, filters).await.unwrap();
    assert_eq!(records.len(), 1);
    assert_eq!(records[0].amount, 2.0);
    let totals = petmon::services::nutrition_analytics_service::daily_totals(
        &ctx,
        "2026-01-01",
        "2026-01-01",
        None,
        None,
    )
    .await
    .unwrap();
    assert_eq!(totals.len(), 1);
    assert_eq!(totals[0].total_amount, 3.0);
    let best =
        petmon::services::nutrition_analytics_service::best_fluid_day(&ctx, None, "2026-01-02")
            .await
            .unwrap()
            .unwrap();
    assert_eq!(best.total_fluid_ml, 3.0);
    assert_eq!(best.curve.last().unwrap().cumulative_fluid_ml, 3.0);
    assert!(pet_service::list(&restricted(&base, vec![]))
        .await
        .unwrap()
        .is_empty());
    assert!(nutrition_record_service::list(
        &restricted(&base, vec![]),
        serde_json::from_value(json!({})).unwrap()
    )
    .await
    .unwrap()
    .is_empty());
}

#[actix_web::test]
async fn indirect_ids_mixed_batches_and_nullable_notes_are_denied() {
    let (base, visible, hidden) = setup().await;
    let hidden_record = nutrition_record_service::create(
        &base,
        record(hidden, 9.0, "2026-01-01T08:00:00"),
        chrono_tz::UTC,
    )
    .await
    .unwrap();
    let ctx = restricted(&base, vec![visible]);
    assert!(matches!(
        nutrition_record_service::get(&ctx, &hidden_record.id).await,
        Err(AppError::Forbidden(_))
    ));
    assert!(nutrition_record_service::batch_create(
        &ctx,
        vec![
            record(visible, 1.0, "2026-01-02T08:00:00"),
            record(hidden, 2.0, "2026-01-02T08:00:00")
        ],
        chrono_tz::UTC
    )
    .await
    .is_err());
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM nutrition_records")
        .fetch_one(&base.pool)
        .await
        .unwrap();
    assert_eq!(count, 1);
    let app = app!(state(&ctx));
    for path in [
        format!("/api/v1/nutrition/records/{}", hidden_record.id),
        "/api/v1/notes/2026-01-01".into(),
        format!("/api/v1/elimination/duration-profile?pet_id={hidden}"),
        format!("/api/v1/pets/{hidden}/settings/med_nudge"),
    ] {
        let res = test::call_service(
            &app,
            test::TestRequest::get()
                .uri(&path)
                .insert_header(("Authorization", "Bearer session"))
                .to_request(),
        )
        .await;
        assert_eq!(res.status(), 403, "{path}");
    }
}

#[actix_web::test]
async fn mixed_pet_fields_require_every_action() {
    let (base, visible, _) = setup().await;
    let ctx = restricted(&base, vec![visible]);
    let update =
        serde_json::from_value(json!({"name":"Allowed","telegram_meds_chat_id":"foreign-chat"}))
            .unwrap();
    assert!(matches!(
        pet_service::update(&ctx, visible, update).await,
        Err(AppError::Forbidden(_))
    ));
    assert_eq!(
        pet_service::get(&base, visible).await.unwrap().name,
        "Visible"
    );
    let update = serde_json::from_value(json!({"status":"archived"})).unwrap();
    assert!(pet_service::update(&ctx, visible, update).await.is_err());
}

struct IntegrationOnly;
impl ResourcePolicy for IntegrationOnly {
    fn authorize<'a>(
        &'a self,
        _: &'a SqlitePool,
        _: &'a Identity,
        _: Option<Uuid>,
        action: ResourceAction,
    ) -> BoxFuture<'a, AppResult<()>> {
        Box::pin(async move {
            if matches!(
                action,
                ResourceAction::View | ResourceAction::ManageIntegrations
            ) {
                Ok(())
            } else {
                Err(AppError::Forbidden(
                    "only integration changes allowed".into(),
                ))
            }
        })
    }
    fn visibility<'a>(
        &'a self,
        _: &'a SqlitePool,
        _: &'a Identity,
    ) -> BoxFuture<'a, AppResult<PetVisibility>> {
        Box::pin(async { Ok(PetVisibility::All) })
    }
}
#[actix_web::test]
async fn integration_only_updates_do_not_require_profile_permission() {
    let (base, visible, _) = setup().await;
    let context = ServiceContext {
        policy: Arc::new(IntegrationOnly),
        ..base.clone()
    };
    let pet = pet_service::update(
        &context,
        visible,
        serde_json::from_value(json!({"telegram_meds_chat_id":"approved"})).unwrap(),
    )
    .await
    .unwrap();
    assert_eq!(pet.telegram_meds_chat_id.as_deref(), Some("approved"));
    assert!(pet_service::update(
        &context,
        visible,
        serde_json::from_value(json!({"name":"Denied","telegram_meds_chat_id":"replacement"}))
            .unwrap()
    )
    .await
    .is_err());
    assert_eq!(
        pet_service::get(&base, visible)
            .await
            .unwrap()
            .telegram_meds_chat_id
            .as_deref(),
        Some("approved")
    );
}

#[actix_web::test]
async fn extension_failure_rolls_back_pet_and_lifecycle_denies_missing_transaction_policy() {
    let (base, visible, _) = setup().await;
    let mut tx = base.pool.begin().await.unwrap();
    let pet = pet_service::create_in_transaction(
        &base,
        &mut tx,
        serde_json::from_value(json!({"name":"Rollback"})).unwrap(),
    )
    .await
    .unwrap();
    assert!(
        sqlx::query("INSERT INTO missing_extension_table VALUES (1)")
            .execute(&mut *tx)
            .await
            .is_err()
    );
    tx.rollback().await.unwrap();
    assert!(pet_service::get(&base, pet.id).await.is_err());
    let ctx = restricted(&base, vec![visible]);
    assert!(pet_service::create(
        &ctx,
        serde_json::from_value(json!({"name":"Denied"})).unwrap()
    )
    .await
    .is_err());
}

struct Override;
impl petmon::mcp::registry::ToolHandler for Override {
    fn call<'a>(
        &'a self,
        context: &'a ServiceContext,
        arguments: Value,
    ) -> BoxFuture<'a, AppResult<Value>> {
        Box::pin(async move {
            Ok(json!({"actor":context.actor.subject,"destination":arguments["destination"]}))
        })
    }
}
#[actix_web::test]
async fn mcp_schema_overrides_normalized_calls_and_resources_use_same_policy() {
    let (base, visible, hidden) = setup().await;
    let ctx = restricted(&base, vec![visible]);
    let mut state = AppState::new(base.pool.clone(), false, None, None);
    state.resource_policy = ctx.policy.clone();
    state.identity_adapter = Some(Arc::new(Session));
    let schema =
        json!({"name":"pets.create","inputSchema":{"type":"object","required":["destination"]}});
    state
        .mcp_registry
        .register(schema.clone(), Arc::new(Override))
        .unwrap();
    assert!(state
        .mcp_registry
        .register(schema, Arc::new(Override))
        .is_err());
    let app = app!(web::Data::new(state));
    for method in ["pets.create", "pets/create"] {
        let res:Value=test::call_and_read_body_json(&app,test::TestRequest::post().uri("/mcp").insert_header(("Authorization","Bearer session")).set_json(json!({"jsonrpc":"2.0","id":1,"method":method,"params":{"destination":"target"}})).to_request()).await;
        assert_eq!(res["result"]["destination"], "target");
        assert_eq!(res["result"]["actor"], "ordinary-user");
    }
    let res:Value=test::call_and_read_body_json(&app,test::TestRequest::post().uri("/mcp").insert_header(("Authorization","Bearer session")).set_json(json!({"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"pets/create","arguments":{"destination":"wrapped"}}})).to_request()).await;
    let result: Value =
        serde_json::from_str(res["result"]["content"][0]["text"].as_str().unwrap()).unwrap();
    assert_eq!(result["destination"], "wrapped");
    let res: Value = test::call_and_read_body_json(
        &app,
        test::TestRequest::post()
            .uri("/mcp")
            .insert_header(("Authorization", "Bearer session"))
            .set_json(json!({"jsonrpc":"2.0","id":1,"method":"tools/list"}))
            .to_request(),
    )
    .await;
    let definitions = res["result"]["tools"].as_array().unwrap();
    let replacements: Vec<_> = definitions
        .iter()
        .filter(|tool| tool["name"] == "pets.create")
        .collect();
    assert_eq!(replacements.len(), 1);
    assert_eq!(replacements[0]["inputSchema"]["required"][0], "destination");
    let res:Value=test::call_and_read_body_json(&app,test::TestRequest::post().uri("/mcp").insert_header(("Authorization","Bearer session")).set_json(json!({"jsonrpc":"2.0","id":1,"method":"resources/read","params":{"uri":format!("petmon://pets/{hidden}")}})).to_request()).await;
    assert!(res.get("error").is_some());
}

struct FixedRuntime;
impl RuntimeResolver for FixedRuntime {
    fn timezone<'a>(&'a self, _: &'a SqlitePool, _: Uuid, _: Tz) -> BoxFuture<'a, AppResult<Tz>> {
        Box::pin(async { Ok(chrono_tz::America::Los_Angeles) })
    }
    fn now(&self) -> DateTime<Utc> {
        "2026-01-01T00:30:00Z".parse().unwrap()
    }
}

struct TokyoRuntime;
impl RuntimeResolver for TokyoRuntime {
    fn timezone<'a>(&'a self, _: &'a SqlitePool, _: Uuid, _: Tz) -> BoxFuture<'a, AppResult<Tz>> {
        Box::pin(async { Ok(chrono_tz::Asia::Tokyo) })
    }
}
#[actix_web::test]
async fn best_day_projects_utc_instants_into_each_pets_effective_timezone() {
    let (base, visible, hidden) = setup().await;
    let mut context = restricted(&base, vec![visible]);
    context.runtime = Arc::new(TokyoRuntime);
    for (pet, amount) in [(visible, 42), (hidden, 999)] {
        let req=serde_json::from_value(json!({"pet_id":pet,"category":"water","amount":amount,"occurred_at":"2026-01-01T16:00:00Z","local_date":"2026-01-02"})).unwrap();
        nutrition_record_service::create(&base, req, chrono_tz::UTC)
            .await
            .unwrap();
    }
    let best =
        petmon::services::nutrition_analytics_service::best_fluid_day(&context, None, "2026-01-03")
            .await
            .unwrap()
            .unwrap();
    assert_eq!(best.local_date, "2026-01-02");
    assert_eq!(best.total_fluid_ml, 42.0);
    assert_eq!(best.curve.len(), 1);
    assert_eq!(best.curve[0].time, "01:00");
    assert_eq!(best.curve[0].cumulative_fluid_ml, 42.0);
}
#[actix_web::test]
async fn realtime_and_resource_today_use_resource_timezone_and_injected_clock() {
    let (base, visible, _) = setup().await;
    let mut ctx = restricted(&base, vec![visible]);
    ctx.runtime = Arc::new(FixedRuntime);
    let req =
        serde_json::from_value(json!({"pet_id":visible,"category":"water","amount":42})).unwrap();
    let record = nutrition_record_service::create(&ctx, req, chrono_tz::UTC)
        .await
        .unwrap();
    assert_eq!(record.local_date, "2025-12-31");
    assert_eq!(record.occurred_at, "2026-01-01T00:30:00.000000000Z");
    let resource = petmon::mcp::resources::read_resource(
        &ctx,
        &format!("petmon://pets/{visible}/today"),
        chrono_tz::UTC,
    )
    .await
    .unwrap();
    let summary: Value = serde_json::from_str(resource["text"].as_str().unwrap()).unwrap();
    assert_eq!(summary["local_date"], "2025-12-31");
    assert_eq!(summary["records"].as_array().unwrap().len(), 1);
    for params in [
        json!({"pet_id": visible}),
        json!({"pet_id": visible, "today": "2025-12-31"}),
    ] {
        let context = petmon::mcp::tools::dispatch(
            &ctx,
            "pets.nutrition-context",
            Some(params),
            chrono_tz::UTC,
        )
        .await
        .unwrap();
        assert_eq!(context["today"], "2025-12-31");
        assert_eq!(context["status"]["local_date"], "2025-12-31");
        let as_of = context["status"]["as_of"]
            .as_str()
            .unwrap()
            .parse::<DateTime<Utc>>()
            .unwrap();
        assert_eq!(as_of, ctx.runtime.now());
        assert_eq!(context["status"]["intake"]["water_ml"], 42.0);
    }
}

struct AccountAdapter {
    disabled: std::sync::atomic::AtomicBool,
}
impl IdentityAdapter for AccountAdapter {
    fn authenticate<'a>(
        &'a self,
        _: &'a SqlitePool,
        _: &'a str,
    ) -> BoxFuture<'a, AppResult<Identity>> {
        Box::pin(async { Err(AppError::Forbidden("only cookie sessions".into())) })
    }
    fn authenticate_request<'a>(
        &'a self,
        _: &'a SqlitePool,
        method: &'a str,
        _: &'a str,
        headers: &'a actix_web::http::header::HeaderMap,
    ) -> BoxFuture<'a, AppResult<Identity>> {
        Box::pin(async move {
            if headers
                .get("Cookie")
                .is_some_and(|value| value == "session=test")
                && (method == "GET"
                    || headers
                        .get("X-CSRF-Token")
                        .is_some_and(|value| value == "checked"))
            {
                Ok(actor())
            } else {
                Err(AppError::Forbidden("invalid session or CSRF".into()))
            }
        })
    }
    fn resolve_api_token_owner<'a>(
        &'a self,
        _: &'a SqlitePool,
        subject: &'a str,
    ) -> BoxFuture<'a, AppResult<petmon::embedding::CanonicalActor>> {
        Box::pin(async move {
            if self.disabled.load(std::sync::atomic::Ordering::SeqCst) {
                Err(AppError::Forbidden("account disabled".into()))
            } else {
                Ok(petmon::embedding::CanonicalActor {
                    subject: subject.into(),
                    email: Some("canonical@example.test".into()),
                })
            }
        })
    }
}
#[actix_web::test]
async fn adapter_cookie_sessions_and_live_token_owner_resolution_preserve_credentials() {
    let (base, visible, _) = setup().await;
    let (_, token) = petmon::repo::api_tokens::create(
        &base.pool,
        petmon::domain::settings::CreateApiToken {
            alias: None,
            scopes: Some(vec!["api_read".into()]),
            created_by: None,
            owner_subject: Some("ordinary-user".into()),
        },
    )
    .await
    .unwrap();
    let adapter = Arc::new(AccountAdapter {
        disabled: std::sync::atomic::AtomicBool::new(false),
    });
    let mut state = AppState::new(base.pool.clone(), false, None, None);
    state.resource_policy = Arc::new(Restricted {
        visible: vec![visible],
    });
    state.identity_adapter = Some(adapter.clone());
    let app = app!(web::Data::new(state));
    let res = test::call_service(
        &app,
        test::TestRequest::get()
            .uri("/api/v1/pets")
            .insert_header(("Cookie", "session=test"))
            .to_request(),
    )
    .await;
    assert_eq!(res.status(), 200);
    let res = test::call_service(
        &app,
        test::TestRequest::post()
            .uri("/api/v1/pets")
            .insert_header(("Cookie", "session=test"))
            .set_json(json!({"name":"Blocked"}))
            .to_request(),
    )
    .await;
    assert_eq!(res.status(), 401);
    let bearer = format!("Bearer {}", token.token);
    let res = test::call_service(
        &app,
        test::TestRequest::get()
            .uri("/api/v1/pets")
            .insert_header(("Authorization", bearer.clone()))
            .to_request(),
    )
    .await;
    assert_eq!(res.status(), 200);
    let res = test::call_service(
        &app,
        test::TestRequest::post()
            .uri("/api/v1/pets")
            .insert_header(("Authorization", bearer.clone()))
            .set_json(json!({"name":"Blocked"}))
            .to_request(),
    )
    .await;
    assert_eq!(res.status(), 403);
    adapter
        .disabled
        .store(true, std::sync::atomic::Ordering::SeqCst);
    let res = test::call_service(
        &app,
        test::TestRequest::get()
            .uri("/api/v1/pets")
            .insert_header(("Authorization", bearer))
            .to_request(),
    )
    .await;
    assert_eq!(res.status(), 401);
}

#[actix_web::test]
async fn medication_assignment_formulation_and_shortcut_references_cannot_cross_pets() {
    use petmon::services::medication_service as meds;
    let (base, visible, hidden) = setup().await;
    let visible_med = meds::create_medication(
        &base,
        serde_json::from_value(json!({"pet_id":visible,"name":"Visible med","med_type":"pill"}))
            .unwrap(),
    )
    .await
    .unwrap();
    let hidden_med = meds::create_medication(
        &base,
        serde_json::from_value(json!({"pet_id":hidden,"name":"Hidden med","med_type":"pill"}))
            .unwrap(),
    )
    .await
    .unwrap();
    let hidden_assignment=meds::create_assignment(&base,serde_json::from_value(json!({"medication_id":hidden_med.id,"tablet_strength_mg":5,"pill_shape":"round","dose_fraction":"whole","date_from":"2020-01-01"})).unwrap()).await.unwrap();
    let ctx = restricted(&base, vec![visible]);
    let foreign_formulation=serde_json::from_value(json!({"medication_id":visible_med.id,"formulation_id":hidden_assignment.formulation_id,"dose_fraction":"whole","date_from":"2020-01-01"})).unwrap();
    assert!(matches!(
        meds::create_assignment(&ctx, foreign_formulation).await,
        Err(AppError::Forbidden(_))
    ));
    let foreign_intake=serde_json::from_value(json!({"pet_id":visible,"medication_id":hidden_med.id,"assignment_id":hidden_assignment.id})).unwrap();
    assert!(matches!(
        meds::create_intake(&ctx, foreign_intake, chrono_tz::UTC, Default::default()).await,
        Err(AppError::Forbidden(_))
    ));
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM med_intake_records")
        .fetch_one(&base.pool)
        .await
        .unwrap();
    assert_eq!(count, 0);
    let app = app!(state(&ctx));
    let path = format!(
        "/api/v1/shortcuts/meds/intake/take?pet_id={visible}&medication_id={}&assignment_id={}",
        hidden_med.id, hidden_assignment.id
    );
    let response = test::call_service(
        &app,
        test::TestRequest::post()
            .uri(&path)
            .insert_header(("Authorization", "Bearer session"))
            .to_request(),
    )
    .await;
    assert_eq!(response.status(), 403);
    let path = format!("/api/v1/shortcuts/meds/intake/menu?pet_id={hidden}&date=2026-01-01");
    let response = test::call_service(
        &app,
        test::TestRequest::get()
            .uri(&path)
            .insert_header(("Authorization", "Bearer session"))
            .to_request(),
    )
    .await;
    assert_eq!(response.status(), 403);
}
