use actix_web::{test, web, App};
use petmon::auth::AppState;
use petmon::{api, assets, mcp, middleware};
use sqlx::SqlitePool;

async fn setup_pool() -> SqlitePool {
    let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
    sqlx::migrate!("./migrations").run(&pool).await.unwrap();
    pool
}

/// Builds the /api/v1 slice only (used by CRUD tests).
/// Must stay in sync with the service registration in main.rs.
macro_rules! build_app {
    ($state:expr) => {
        test::init_service(
            App::new().app_data($state.clone()).service(
                web::scope("/api/v1")
                    .wrap(middleware::auth::RequireAuth)
                    .configure(api::auth::configure_public)
                    .configure(api::auth::configure_protected)
                    .configure(api::health::configure)
                    .configure(api::pets::configure)
                    .configure(api::nutrition::configure)
                    .configure(api::elimination::configure)
                    .configure(api::weight::configure)
                    .configure(api::days::configure)
                    .configure(api::notes::configure)
                    .configure(api::settings::configure)
                    .configure(api::settings::configure_api_tokens),
            ),
        )
        .await
    };
}

/// Builds the full app routing exactly as main.rs does, including MCP and assets.
/// This macro is the authoritative mirror of main.rs — if a route works here
/// it will work in production, and divergence is caught by the routing tests below.
macro_rules! build_full_app {
    ($state:expr) => {
        test::init_service(
            App::new()
                .wrap(actix_web::middleware::NormalizePath::trim())
                .app_data($state.clone())
                .service(
                    web::scope("/api/v1")
                        .wrap(middleware::auth::RequireAuth)
                        .configure(api::auth::configure_public)
                        .configure(api::auth::configure_protected)
                        .configure(api::health::configure)
                        .configure(api::info::configure)
                        .configure(api::pets::configure)
                        .configure(api::nutrition::configure)
                        .configure(api::elimination::configure)
                        .configure(api::weight::configure)
                        .configure(api::days::configure)
                        .configure(api::notes::configure)
                        .configure(api::settings::configure)
                        .configure(api::settings::configure_api_tokens),
                )
                .service(
                    web::scope("/mcp")
                        .wrap(middleware::auth::RequireAuth)
                        .configure(mcp::transport::configure),
                )
                .configure(assets::configure),
        )
        .await
    };
}

// ── Auth behaviour ───────────────────────────────────────────────────────────

#[actix_web::test]
async fn health_is_public_when_auth_is_enabled() {
    // Simulate production: dev_mode=false, no OIDC configured yet but auth
    // middleware is active. Health must still return 200 without a token.
    let pool = setup_pool().await;
    let state = web::Data::new(AppState::new(pool, false, None, None));
    let app = build_app!(state);

    let req = test::TestRequest::get().uri("/api/v1/health").to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(
        resp.status(),
        200,
        "health endpoint must be publicly accessible"
    );
}

#[actix_web::test]
async fn protected_endpoint_returns_401_without_token() {
    let pool = setup_pool().await;
    // Seed at least one token so auth is "configured" and middleware is active
    let state = web::Data::new(AppState::new(pool.clone(), false, None, None));
    sqlx::query(
        "INSERT INTO api_tokens (id, token_hash, alias, created_at, last_used_at, active) \
         VALUES ('test-id', 'deadbeef', 'test', datetime('now'), NULL, 1)",
    )
    .execute(&pool)
    .await
    .unwrap();

    let app = build_app!(state);

    let req = test::TestRequest::get().uri("/api/v1/pets").to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 401, "pets endpoint must require auth");
}

// ── Routing: static assets must not require auth ─────────────────────────────

#[actix_web::test]
async fn frontend_root_is_served_without_auth() {
    // STATIC_DIR not set — assets::serve_frontend returns 503 with an HTML body,
    // but crucially it must NOT return 401 (i.e. auth middleware must not intercept it).
    let pool = setup_pool().await;
    let state = web::Data::new(AppState::new(pool, false, None, None));
    let app = build_full_app!(state);

    let req = test::TestRequest::get().uri("/").to_request();
    let resp = test::call_service(&app, req).await;
    assert_ne!(
        resp.status(),
        401,
        "GET / must not be blocked by auth middleware"
    );
}

#[actix_web::test]
async fn frontend_spa_path_is_served_without_auth() {
    let pool = setup_pool().await;
    let state = web::Data::new(AppState::new(pool, false, None, None));
    let app = build_full_app!(state);

    let req = test::TestRequest::get()
        .uri("/nutrition/2025-01-01")
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_ne!(
        resp.status(),
        401,
        "SPA routes must not be blocked by auth middleware"
    );
}

#[actix_web::test]
async fn mcp_endpoint_requires_auth() {
    let pool = setup_pool().await;
    // seed a token so auth is "configured"
    sqlx::query(
        "INSERT INTO api_tokens (id, token_hash, alias, created_at, last_used_at, active) \
         VALUES ('mcp-test-id', 'deadbeef2', 'mcp-test', datetime('now'), NULL, 1)",
    )
    .execute(&pool)
    .await
    .unwrap();
    let state = web::Data::new(AppState::new(pool, false, None, None));
    let app = build_full_app!(state);

    let req = test::TestRequest::post()
        .uri("/mcp")
        .set_json(serde_json::json!({"jsonrpc":"2.0","id":1,"method":"tools/list","params":null}))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 401, "POST /mcp must require auth");
}

#[actix_web::test]
async fn auth_info_is_public_at_full_app_level() {
    let pool = setup_pool().await;
    let state = web::Data::new(AppState::new(pool, false, None, None));
    let app = build_full_app!(state);

    let req = test::TestRequest::get()
        .uri("/api/v1/auth/info")
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(
        resp.status(),
        200,
        "GET /api/v1/auth/info must be publicly accessible"
    );
}

// ── Public routing ───────────────────────────────────────────────────────────

#[actix_web::test]
async fn api_docs_returns_swagger_html_without_auth() {
    let pool = setup_pool().await;
    let state = web::Data::new(AppState::new(pool, false, None, None));
    let app = build_full_app!(state);

    let req = test::TestRequest::get().uri("/api/docs").to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(
        resp.status(),
        200,
        "GET /api/docs must be publicly accessible"
    );
    let ct = resp
        .headers()
        .get("content-type")
        .unwrap()
        .to_str()
        .unwrap();
    assert!(
        ct.contains("text/html"),
        "GET /api/docs must return HTML, got: {ct}"
    );
    let body = String::from_utf8(test::read_body(resp).await.to_vec()).unwrap();
    assert!(
        body.contains("swagger"),
        "response must contain swagger UI markup"
    );
}

#[actix_web::test]
async fn api_docs_openapi_yaml_returns_yaml_without_auth() {
    let pool = setup_pool().await;
    let state = web::Data::new(AppState::new(pool, false, None, None));
    let app = build_full_app!(state);

    let req = test::TestRequest::get()
        .uri("/api/docs/openapi.yaml")
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(
        resp.status(),
        200,
        "GET /api/docs/openapi.yaml must be publicly accessible"
    );
    let ct = resp
        .headers()
        .get("content-type")
        .unwrap()
        .to_str()
        .unwrap();
    assert!(
        ct.contains("yaml"),
        "GET /api/docs/openapi.yaml must return YAML, got: {ct}"
    );
}

#[actix_web::test]
async fn api_docs_is_not_caught_by_spa_fallback() {
    let pool = setup_pool().await;
    let state = web::Data::new(AppState::new(pool, false, None, None));
    let app = build_full_app!(state);

    let req = test::TestRequest::get().uri("/api/docs").to_request();
    let resp = test::call_service(&app, req).await;
    // SPA fallback returns 503 (STATIC_DIR unset) or 200 with index.html.
    // Either way the body must NOT be an index.html SPA page.
    let body = String::from_utf8(test::read_body(resp).await.to_vec()).unwrap();
    assert!(
        !body.contains("<div id=\"root\">"),
        "GET /api/docs must not serve the React SPA"
    );
}

#[actix_web::test]
async fn api_docs_trailing_slash_is_not_caught_by_spa_fallback() {
    let pool = setup_pool().await;
    let state = web::Data::new(AppState::new(pool, false, None, None));
    let app = build_full_app!(state);

    let req = test::TestRequest::get().uri("/api/docs/").to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(
        resp.status(),
        200,
        "GET /api/docs/ must resolve to Swagger UI (not SPA or 404)"
    );
    let body = String::from_utf8(test::read_body(resp).await.to_vec()).unwrap();
    assert!(
        body.contains("swagger"),
        "GET /api/docs/ must return Swagger HTML, not SPA"
    );
}

#[actix_web::test]
async fn api_docs_openapi_yaml_trailing_slash_serves_yaml() {
    let pool = setup_pool().await;
    let state = web::Data::new(AppState::new(pool, false, None, None));
    let app = build_full_app!(state);

    let req = test::TestRequest::get()
        .uri("/api/docs/openapi.yaml/")
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(
        resp.status(),
        200,
        "GET /api/docs/openapi.yaml/ must resolve to YAML (trailing slash trimmed)"
    );
    let ct = resp
        .headers()
        .get("content-type")
        .unwrap()
        .to_str()
        .unwrap();
    assert!(
        ct.contains("yaml"),
        "must return YAML content-type, got: {ct}"
    );
}

#[actix_web::test]
async fn app_info_is_public() {
    let pool = setup_pool().await;
    let state = web::Data::new(AppState::new(pool, false, None, None));
    let app = build_full_app!(state);

    let req = test::TestRequest::get().uri("/api/v1/info").to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(
        resp.status(),
        200,
        "GET /api/v1/info must be publicly accessible"
    );
    let body: serde_json::Value = test::read_body_json(resp).await;
    assert!(
        body.get("version").is_some(),
        "response must contain version field"
    );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/// Build a dev-mode app+state and return both.
macro_rules! build_dev_app {
    () => {{
        let pool = setup_pool().await;
        let state = web::Data::new(AppState::new(pool, true, None, None));
        let app = build_app!(state.clone());
        (app, state)
    }};
}

/// Create a pet via the API and return its UUID string.
/// Uses a macro so the opaque app type doesn't need to be named.
macro_rules! api_create_pet {
    ($app:expr, $name:expr) => {{
        let req = test::TestRequest::post()
            .uri("/api/v1/pets")
            .set_json(serde_json::json!({ "name": $name, "species": "cat" }))
            .to_request();
        let resp = test::call_service($app, req).await;
        assert_eq!(resp.status(), 201, "failed to create pet '{}'", $name);
        let body: serde_json::Value = test::read_body_json(resp).await;
        body["id"].as_str().unwrap().to_string()
    }};
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

#[actix_web::test]
async fn pets_crud() {
    let pool = setup_pool().await;
    let state = web::Data::new(AppState::new(pool, true, None, None));
    let app = build_app!(state);

    // Create
    let req = test::TestRequest::post()
        .uri("/api/v1/pets")
        .set_json(serde_json::json!({
            "name": "Whiskers",
            "species": "cat",
            "breed": "Siamese",
            "birth_date": "2021-05-10",
            "blood_type": "B",
            "color": "cream"
        }))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 201);
    let body: serde_json::Value = test::read_body_json(resp).await;
    let pet_id = body["id"].as_str().unwrap().to_string();
    assert_eq!(body["species"].as_str(), Some("cat"));
    assert_eq!(body["status"].as_str(), Some("active"));
    assert_eq!(body["breed"].as_str(), Some("Siamese"));
    assert_eq!(body["birth_date"].as_str(), Some("2021-05-10"));
    assert_eq!(body["blood_type"].as_str(), Some("B"));
    assert_eq!(body["color"].as_str(), Some("cream"));

    // Read
    let req = test::TestRequest::get()
        .uri(&format!("/api/v1/pets/{pet_id}"))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 200);

    // Delete
    let req = test::TestRequest::delete()
        .uri(&format!("/api/v1/pets/{pet_id}"))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 204);
}

// ── Nutrition records ─────────────────────────────────────────────────────────

/// When `occurred_at` is omitted the server uses the configured timezone,
/// not the OS timezone or UTC. The resulting string must be naive (no Z/offset)
/// and must match the wall-clock time in that timezone.
#[actix_web::test]
async fn nutrition_record_default_occurred_at_uses_configured_timezone() {
    // Use Tokyo (UTC+9) — far enough from UTC that the hour differs detectably.
    let pool = setup_pool().await;
    let state = web::Data::new(AppState::new_with_tz(
        pool,
        true,
        None,
        None,
        "Asia/Tokyo".parse().unwrap(),
    ));
    let app = build_app!(state);
    let pet_id = api_create_pet!(&app, "TzTest");

    // Record the expected time window in Tokyo before and after the request.
    let before = chrono::Utc::now()
        .with_timezone(&"Asia/Tokyo".parse::<chrono_tz::Tz>().unwrap())
        .format("%Y-%m-%dT%H:%M:%S")
        .to_string();

    let req = test::TestRequest::post()
        .uri("/api/v1/nutrition/records")
        .set_json(serde_json::json!({
            "pet_id": pet_id,
            "category": "water",
            "amount": 10,
            "unit": "ml"
        }))
        .to_request();
    let resp = test::call_service(&app, req).await;
    let status = resp.status();
    let body: serde_json::Value = test::read_body_json(resp).await;
    assert_eq!(status, 201, "create failed: {body}");

    let after = chrono::Utc::now()
        .with_timezone(&"Asia/Tokyo".parse::<chrono_tz::Tz>().unwrap())
        .format("%Y-%m-%dT%H:%M:%S")
        .to_string();

    let occurred_at = body["occurred_at"].as_str().expect("occurred_at missing");
    // Must be naive — no Z or offset
    assert!(
        !occurred_at.ends_with('Z') && !occurred_at.contains('+'),
        "occurred_at '{occurred_at}' must be naive (no Z or +offset)"
    );
    // Must fall within the Tokyo time window captured around the request
    assert!(
        occurred_at >= before.as_str() && occurred_at <= after.as_str(),
        "occurred_at '{occurred_at}' must be within Tokyo time window [{before}, {after}]"
    );
}

/// When `occurred_at` is omitted the server must store a naive local datetime —
/// no UTC offset (`Z` or `+HH:MM`) appended.
#[actix_web::test]
async fn nutrition_record_default_occurred_at_is_naive_local() {
    let (app, state) = build_dev_app!();
    let _ = state; // keep state alive
    let pet_id = api_create_pet!(&app, "TimezoneTest");

    let req = test::TestRequest::post()
        .uri("/api/v1/nutrition/records")
        .set_json(serde_json::json!({
            "pet_id": pet_id,
            "category": "water",
            "amount": 50,
            "unit": "ml"
        }))
        .to_request();
    let resp = test::call_service(&app, req).await;
    let status = resp.status();
    let body: serde_json::Value = test::read_body_json(resp).await;
    assert_eq!(status, 201, "create record failed: {body}");

    let occurred_at = body["occurred_at"].as_str().expect("occurred_at missing");
    assert!(
        !occurred_at.ends_with('Z') && !occurred_at.contains('+'),
        "occurred_at '{occurred_at}' must be a naive local datetime (no Z or +offset)"
    );
    assert!(
        occurred_at.len() >= 19,
        "occurred_at '{occurred_at}' too short to be a valid datetime"
    );
}

/// When `occurred_at` is supplied explicitly it must be stored exactly as sent.
#[actix_web::test]
async fn nutrition_record_explicit_occurred_at_is_preserved() {
    let (app, state) = build_dev_app!();
    let _ = state;
    let pet_id = api_create_pet!(&app, "ExplicitTime");

    let occurred_at = "2026-03-15T09:30:00";
    let req = test::TestRequest::post()
        .uri("/api/v1/nutrition/records")
        .set_json(serde_json::json!({
            "pet_id": pet_id,
            "category": "wet_food",
            "amount": 80,
            "unit": "g",
            "occurred_at": occurred_at
        }))
        .to_request();
    let resp = test::call_service(&app, req).await;
    let status = resp.status();
    let body: serde_json::Value = test::read_body_json(resp).await;
    assert_eq!(status, 201, "create record failed: {body}");
    assert_eq!(
        body["occurred_at"].as_str(),
        Some(occurred_at),
        "occurred_at must round-trip unchanged"
    );
}

/// `local_date` must equal the date portion of `occurred_at`.
#[actix_web::test]
async fn nutrition_record_local_date_matches_occurred_at_date() {
    let (app, state) = build_dev_app!();
    let _ = state;
    let pet_id = api_create_pet!(&app, "LocalDateTest");

    let occurred_at = "2026-06-18T23:55:00";
    let req = test::TestRequest::post()
        .uri("/api/v1/nutrition/records")
        .set_json(serde_json::json!({
            "pet_id": pet_id,
            "category": "liquids",
            "amount": 30,
            "unit": "ml",
            "occurred_at": occurred_at
        }))
        .to_request();
    let resp = test::call_service(&app, req).await;
    let status = resp.status();
    let body: serde_json::Value = test::read_body_json(resp).await;
    assert_eq!(status, 201, "create record failed: {body}");
    assert_eq!(
        body["local_date"].as_str(),
        Some("2026-06-18"),
        "local_date must equal the date component of occurred_at"
    );
}

/// Full nutrition record CRUD: create → read → update → list → delete.
#[actix_web::test]
async fn nutrition_record_crud() {
    let (app, state) = build_dev_app!();
    let _ = state;
    let pet_id = api_create_pet!(&app, "NutritionCRUD");

    // Create
    let req = test::TestRequest::post()
        .uri("/api/v1/nutrition/records")
        .set_json(serde_json::json!({
            "pet_id": pet_id,
            "category": "wet_food",
            "amount": 75,
            "unit": "g",
            "occurred_at": "2026-06-01T08:00:00",
            "local_date": "2026-06-01"
        }))
        .to_request();
    let resp = test::call_service(&app, req).await;
    let status = resp.status();
    let body: serde_json::Value = test::read_body_json(resp).await;
    assert_eq!(status, 201, "create failed: {body}");
    let record_id = body["id"].as_str().unwrap().to_string();
    assert_eq!(body["category"].as_str(), Some("wet_food"));
    assert_eq!(body["amount"].as_f64(), Some(75.0));
    assert_eq!(body["unit"].as_str(), Some("g"));
    assert_eq!(body["local_date"].as_str(), Some("2026-06-01"));

    // Read
    let req = test::TestRequest::get()
        .uri(&format!("/api/v1/nutrition/records/{record_id}"))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = test::read_body_json(resp).await;
    assert_eq!(body["id"].as_str(), Some(record_id.as_str()));

    // Update
    let req = test::TestRequest::patch()
        .uri(&format!("/api/v1/nutrition/records/{record_id}"))
        .set_json(serde_json::json!({ "amount": 90 }))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = test::read_body_json(resp).await;
    assert_eq!(
        body["amount"].as_f64(),
        Some(90.0),
        "amount must be updated"
    );

    // List — filter by pet_id and date
    let req = test::TestRequest::get()
        .uri(&format!(
            "/api/v1/nutrition/records?pet_id={pet_id}&date=2026-06-01"
        ))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = test::read_body_json(resp).await;
    let records = body.as_array().expect("expected array");
    assert_eq!(
        records.len(),
        1,
        "should find exactly one record for the day"
    );
    assert_eq!(records[0]["id"].as_str(), Some(record_id.as_str()));

    // Delete
    let req = test::TestRequest::delete()
        .uri(&format!("/api/v1/nutrition/records/{record_id}"))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 204);

    // Confirm gone
    let req = test::TestRequest::get()
        .uri(&format!("/api/v1/nutrition/records/{record_id}"))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 404);
}

// ── Elimination + weight combined ────────────────────────────────────────────

/// POST /elimination/records/with-weight creates both records atomically and
/// returns the composite response. The shared timestamp must match on both.
#[actix_web::test]
async fn elimination_record_with_weight_creates_both_records() {
    let (app, state) = build_dev_app!();
    let _ = state;
    let pet_id = api_create_pet!(&app, "ComboTest");

    let occurred_at = "2026-06-01T10:00:00";
    let req = test::TestRequest::post()
        .uri("/api/v1/elimination/records/with-weight")
        .set_json(serde_json::json!({
            "pet_id": pet_id,
            "occurred_at": occurred_at,
            "event_type": "defecation",
            "subtype": "normal",
            "weight_kg": 4.35,
            "weight_note": "post-breakfast"
        }))
        .to_request();
    let resp = test::call_service(&app, req).await;
    let status = resp.status();
    let body: serde_json::Value = test::read_body_json(resp).await;
    assert_eq!(status, 201, "create failed: {body}");

    let elim = &body["elimination"];
    let weight = &body["weight"];

    // Both records must exist with the correct fields
    assert!(elim["id"].as_str().is_some(), "elimination.id missing");
    assert_eq!(elim["event_type"].as_str(), Some("defecation"));
    assert_eq!(elim["subtype"].as_str(), Some("normal"));
    assert_eq!(elim["occurred_at"].as_str(), Some(occurred_at));
    assert_eq!(elim["local_date"].as_str(), Some("2026-06-01"));

    assert!(weight["id"].as_str().is_some(), "weight.id missing");
    assert_eq!(weight["weight_kg"].as_f64(), Some(4.35));
    assert_eq!(weight["note"].as_str(), Some("post-breakfast"));
    assert_eq!(weight["measured_at"].as_str(), Some(occurred_at));
    assert_eq!(weight["local_date"].as_str(), Some("2026-06-01"));

    // Both records must belong to the same pet
    assert_eq!(elim["pet_id"].as_str(), weight["pet_id"].as_str());
}

// ── Route registration smoke tests ───────────────────────────────────────────
// These guard against routes silently falling through to the SPA/assets
// fallback. Each test hits a real endpoint and asserts it returns JSON (not
// HTML), which proves actix matched the route.

#[actix_web::test]
async fn settings_display_returns_json_not_spa() {
    let pool = setup_pool().await;
    let state = web::Data::new(AppState::new(pool, true, None, None));
    let app = build_app!(state);

    let req = test::TestRequest::get()
        .uri("/api/v1/settings/display")
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(
        resp.status(),
        200,
        "GET /api/v1/settings/display must return 200"
    );
    let ct = resp
        .headers()
        .get("content-type")
        .unwrap()
        .to_str()
        .unwrap();
    assert!(
        ct.contains("application/json"),
        "settings/display must return JSON, got: {ct}"
    );
}

#[actix_web::test]
async fn settings_oidc_returns_json_not_spa() {
    let pool = setup_pool().await;
    let state = web::Data::new(AppState::new(pool, true, None, None));
    let app = build_app!(state);

    let req = test::TestRequest::get()
        .uri("/api/v1/settings/oidc")
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(
        resp.status(),
        200,
        "GET /api/v1/settings/oidc must return 200"
    );
    let ct = resp
        .headers()
        .get("content-type")
        .unwrap()
        .to_str()
        .unwrap();
    assert!(
        ct.contains("application/json"),
        "settings/oidc must return JSON, got: {ct}"
    );
}

#[actix_web::test]
async fn api_tokens_returns_json_not_spa() {
    let pool = setup_pool().await;
    let state = web::Data::new(AppState::new(pool, true, None, None));
    let app = build_app!(state);

    let req = test::TestRequest::get()
        .uri("/api/v1/api-tokens")
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 200, "GET /api/v1/api-tokens must return 200");
    let ct = resp
        .headers()
        .get("content-type")
        .unwrap()
        .to_str()
        .unwrap();
    assert!(
        ct.contains("application/json"),
        "api-tokens must return JSON, got: {ct}"
    );
}

#[actix_web::test]
async fn elimination_records_returns_json_not_spa() {
    let pool = setup_pool().await;
    let state = web::Data::new(AppState::new(pool, true, None, None));
    let app = build_app!(state);

    let req = test::TestRequest::get()
        .uri("/api/v1/elimination/records")
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(
        resp.status(),
        200,
        "GET /api/v1/elimination/records must return 200"
    );
    let ct = resp
        .headers()
        .get("content-type")
        .unwrap()
        .to_str()
        .unwrap();
    assert!(
        ct.contains("application/json"),
        "elimination/records must return JSON, got: {ct}"
    );
}

#[actix_web::test]
async fn weight_records_returns_json_not_spa() {
    let pool = setup_pool().await;
    let state = web::Data::new(AppState::new(pool, true, None, None));
    let app = build_app!(state);

    let req = test::TestRequest::get()
        .uri("/api/v1/health/weight")
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(
        resp.status(),
        200,
        "GET /api/v1/health/weight must return 200"
    );
    let ct = resp
        .headers()
        .get("content-type")
        .unwrap()
        .to_str()
        .unwrap();
    assert!(
        ct.contains("application/json"),
        "health/weight must return JSON, got: {ct}"
    );
}
