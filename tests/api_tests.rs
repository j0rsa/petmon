use actix_web::{test, web, App};
use petmon::auth::AppState;
use petmon::{api, assets, mcp, middleware};
use sha2::{Digest, Sha256};
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
                    .configure(api::notifications::configure)
                    .configure(api::push::configure)
                    .configure(api::settings::configure)
                    .configure(api::settings::configure_api_tokens)
                    .configure(api::user_settings::configure),
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
                        .configure(api::notifications::configure)
                        .configure(api::push::configure)
                        .configure(api::settings::configure)
                        .configure(api::settings::configure_api_tokens)
                        .configure(api::user_settings::configure),
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
async fn frontend_static_files_include_cache_control_headers() {
    use std::fs;

    let dir = std::env::temp_dir().join(format!("petmon-static-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(dir.join("assets")).unwrap();
    fs::write(dir.join("index.html"), "<html></html>").unwrap();
    fs::write(dir.join("sw.js"), "// sw").unwrap();
    fs::write(dir.join("assets/app.js"), "console.log(1)").unwrap();

    let pool = setup_pool().await;
    let static_dir = dir.to_string_lossy().into_owned();
    let state = web::Data::new(AppState::new(pool, false, None, Some(static_dir)));
    let app = build_full_app!(state);

    let index_resp = test::call_service(
        &app,
        test::TestRequest::get().uri("/index.html").to_request(),
    )
    .await;
    assert_eq!(index_resp.status(), 200);
    assert_eq!(
        index_resp
            .headers()
            .get("cache-control")
            .and_then(|v| v.to_str().ok()),
        Some("no-cache")
    );

    let sw_resp =
        test::call_service(&app, test::TestRequest::get().uri("/sw.js").to_request()).await;
    assert_eq!(sw_resp.status(), 200);
    assert_eq!(
        sw_resp
            .headers()
            .get("cache-control")
            .and_then(|v| v.to_str().ok()),
        Some("no-cache")
    );

    let asset_resp = test::call_service(
        &app,
        test::TestRequest::get().uri("/assets/app.js").to_request(),
    )
    .await;
    assert_eq!(asset_resp.status(), 200);
    assert_eq!(
        asset_resp
            .headers()
            .get("cache-control")
            .and_then(|v| v.to_str().ok()),
        Some("public, max-age=31536000, immutable")
    );

    let spa_resp = test::call_service(
        &app,
        test::TestRequest::get()
            .uri("/nutrition/2025-01-01")
            .to_request(),
    )
    .await;
    assert_eq!(spa_resp.status(), 200);
    assert_eq!(
        spa_resp
            .headers()
            .get("cache-control")
            .and_then(|v| v.to_str().ok()),
        Some("no-cache")
    );

    let _ = fs::remove_dir_all(&dir);
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

/// tools/list must advertise MCP 2025-11-25 compliant names (no `/`).
#[actix_web::test]
async fn mcp_tools_list_names_have_no_slashes() {
    let pool = setup_pool().await;
    let raw = "pm_api_mcp_toolnames_00000000000000000000000000000000000000000000000";
    seed_token(&pool, raw, "mcp").await;
    let state = web::Data::new(AppState::new(pool, false, None, None));
    let app = build_full_app!(state);

    let resp = test::call_service(
        &app,
        test::TestRequest::post()
            .uri("/mcp")
            .insert_header(("Authorization", format!("Bearer {raw}")))
            .set_json(serde_json::json!({
                "jsonrpc": "2.0",
                "id": 1,
                "method": "tools/list",
                "params": null
            }))
            .to_request(),
    )
    .await;
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = test::read_body_json(resp).await;
    let tools = body["result"]["tools"].as_array().expect("tools array");
    assert!(!tools.is_empty(), "expected at least one tool");

    // MCP tool names: A-Z a-z 0-9 _ - . only (no slash). See CLAUDE.md / SEP-986.
    let is_valid_tool_name = |name: &str| -> bool {
        !name.is_empty()
            && name.len() <= 128
            && name
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '.')
    };
    for tool in tools {
        let name = tool["name"].as_str().expect("tool name");
        assert!(
            is_valid_tool_name(name),
            "tool name {name:?} must match MCP 2025-11-25 allowed characters"
        );
        assert!(
            !name.contains('/'),
            "tool name {name:?} must not contain '/'"
        );
    }
    let names: Vec<_> = tools.iter().filter_map(|t| t["name"].as_str()).collect();
    assert!(names.contains(&"weight.records.create"));
    assert!(names.contains(&"pets.list"));
    assert!(!names.iter().any(|n| n.contains('/')));
}

/// Legacy slash tool names remain callable aliases of the dotted names.
#[actix_web::test]
async fn mcp_tools_call_accepts_legacy_slash_alias() {
    let pool = setup_pool().await;
    let raw = "pm_api_mcp_slash_alias_000000000000000000000000000000000000000000000";
    seed_token(&pool, raw, "mcp").await;
    let state = web::Data::new(AppState::new(pool, true, None, None));
    let app = build_full_app!(state);

    let resp = test::call_service(
        &app,
        test::TestRequest::post()
            .uri("/mcp")
            .insert_header(("Authorization", format!("Bearer {raw}")))
            .set_json(serde_json::json!({
                "jsonrpc": "2.0",
                "id": 1,
                "method": "tools/call",
                "params": {
                    "name": "pets/list",
                    "arguments": {}
                }
            }))
            .to_request(),
    )
    .await;
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = test::read_body_json(resp).await;
    assert!(
        body["error"].is_null(),
        "legacy slash alias must succeed: {body}"
    );
    let text = body["result"]["content"][0]["text"]
        .as_str()
        .expect("tool text");
    let pets: serde_json::Value = serde_json::from_str(text).expect("pets json");
    assert!(pets.is_array());
}

#[actix_web::test]
async fn sign_out_deletes_api_token() {
    let pool = setup_pool().await;
    let raw = "pm_api_signout_test_0000000000000000000000000000000000000000000000";
    let token_id = uuid::Uuid::new_v4().to_string();
    let hash = {
        let mut hasher = Sha256::new();
        hasher.update(raw.as_bytes());
        format!("{:x}", hasher.finalize())
    };
    sqlx::query(
        "INSERT INTO api_tokens (id, token_hash, alias, scopes, created_by, owner_subject, created_at, last_used_at, active) \
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'), NULL, 1)",
    )
    .bind(&token_id)
    .bind(&hash)
    .bind("My Device")
    .bind("all")
    .bind("Alice")
    .bind("google-oauth2|alice")
    .execute(&pool)
    .await
    .unwrap();

    // Keep auth configured after sign-out so invalid tokens return 401, not 503.
    sqlx::query(
        "INSERT INTO api_tokens (id, token_hash, alias, scopes, created_at, last_used_at, active) \
         VALUES ('other-token', 'otherhash', 'other', 'all', datetime('now'), NULL, 1)",
    )
    .execute(&pool)
    .await
    .unwrap();

    let state = web::Data::new(AppState::new(pool.clone(), false, None, None));
    let app = build_app!(state);

    let resp = test::call_service(
        &app,
        test::TestRequest::get()
            .uri("/api/v1/auth/me")
            .insert_header(("Authorization", format!("Bearer {raw}")))
            .to_request(),
    )
    .await;
    assert_eq!(
        resp.status(),
        200,
        "token must authenticate before sign-out"
    );
    let me: serde_json::Value = test::read_body_json(resp).await;
    assert_eq!(me["kind"].as_str(), Some("api_token"));
    assert_eq!(me["subject"].as_str(), Some("google-oauth2|alice"));
    assert_eq!(me["display_name"].as_str(), Some("My Device"));
    assert_eq!(me["token_created_by"].as_str(), Some("Alice"));

    let resp = test::call_service(
        &app,
        test::TestRequest::post()
            .uri("/api/v1/auth/sign-out")
            .insert_header(("Authorization", format!("Bearer {raw}")))
            .to_request(),
    )
    .await;
    assert_eq!(resp.status(), 204, "sign-out must return 204");

    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM api_tokens WHERE id = ?")
        .bind(&token_id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 0, "sign-out must permanently delete the API token");

    let resp = test::call_service(
        &app,
        test::TestRequest::get()
            .uri("/api/v1/auth/me")
            .insert_header(("Authorization", format!("Bearer {raw}")))
            .to_request(),
    )
    .await;
    assert_eq!(
        resp.status(),
        401,
        "deleted token must no longer authenticate"
    );
}

#[actix_web::test]
async fn api_token_without_owner_subject_is_unauthorized() {
    let pool = setup_pool().await;
    let raw = "pm_api_no_owner_000000000000000000000000000000000000000000000000000";
    let hash = sha256_hex(raw);
    sqlx::query(
        "INSERT INTO api_tokens (id, token_hash, alias, scopes, created_at, last_used_at, active) \
         VALUES (?, ?, 'orphan', 'all', datetime('now'), NULL, 1)",
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(&hash)
    .execute(&pool)
    .await
    .unwrap();

    let state = web::Data::new(AppState::new(pool, false, None, None));
    let app = build_app!(state);
    let resp = test::call_service(
        &app,
        test::TestRequest::get()
            .uri("/api/v1/auth/me")
            .insert_header(("Authorization", format!("Bearer {raw}")))
            .to_request(),
    )
    .await;
    assert_eq!(
        resp.status(),
        401,
        "API tokens without owner_subject must not authenticate"
    );
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
async fn push_config_is_not_caught_by_spa_fallback() {
    let pool = setup_pool().await;
    let state = web::Data::new(AppState::new(pool, true, None, None));
    let app = build_full_app!(state);

    let req = test::TestRequest::get()
        .uri("/api/v1/push/config")
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(
        resp.status(),
        200,
        "GET /api/v1/push/config must be registered (not SPA fallback)"
    );
    let ct = resp
        .headers()
        .get("content-type")
        .unwrap()
        .to_str()
        .unwrap();
    assert!(
        ct.contains("application/json"),
        "GET /api/v1/push/config must return JSON, got: {ct}"
    );
    let body = String::from_utf8(test::read_body(resp).await.to_vec()).unwrap();
    assert!(
        !body.contains("<div id=\"root\">"),
        "GET /api/v1/push/config must not serve the React SPA"
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
    assert_eq!(body.get("demo_mode").and_then(|v| v.as_bool()), Some(false));
}

#[actix_web::test]
async fn app_info_reports_demo_mode() {
    let pool = setup_pool().await;
    let state = web::Data::new(AppState::new_with_tz(
        pool,
        false,
        None,
        None,
        chrono_tz::UTC,
        true,
    ));
    let app = build_full_app!(state);

    let req = test::TestRequest::get().uri("/api/v1/info").to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = test::read_body_json(resp).await;
    assert_eq!(body.get("demo_mode").and_then(|v| v.as_bool()), Some(true));
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
        false,
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
            "note": "chicken pate",
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
    assert_eq!(body["note"].as_str(), Some("chicken pate"));
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
        .set_json(serde_json::json!({ "amount": 90, "note": "salmon pate" }))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = test::read_body_json(resp).await;
    assert_eq!(
        body["amount"].as_f64(),
        Some(90.0),
        "amount must be updated"
    );
    assert_eq!(body["note"].as_str(), Some("salmon pate"));

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

/// PATCH nutrition record with `note: null` must clear an existing note (issue #15).
#[actix_web::test]
async fn nutrition_record_patch_clears_note_when_null() {
    let (app, _state) = build_dev_app!();
    let pet_id = api_create_pet!(&app, "NutritionClearNote");

    // Create a record with a note.
    let req = test::TestRequest::post()
        .uri("/api/v1/nutrition/records")
        .set_json(serde_json::json!({
            "pet_id": pet_id,
            "category": "wet_food",
            "amount": 75,
            "unit": "g",
            "note": "original note",
            "occurred_at": "2026-06-01T08:00:00",
            "local_date": "2026-06-01"
        }))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 201);
    let body: serde_json::Value = test::read_body_json(resp).await;
    let record_id = body["id"].as_str().unwrap().to_string();
    assert_eq!(body["note"].as_str(), Some("original note"));

    // PATCH with note: null — must clear the note.
    let req = test::TestRequest::patch()
        .uri(&format!("/api/v1/nutrition/records/{record_id}"))
        .set_json(serde_json::json!({ "note": null }))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = test::read_body_json(resp).await;
    assert!(
        body["note"].is_null(),
        "note must be null after clearing, got: {}",
        body["note"]
    );

    // PATCH without note key — must leave note unchanged (still null).
    let req = test::TestRequest::patch()
        .uri(&format!("/api/v1/nutrition/records/{record_id}"))
        .set_json(serde_json::json!({ "amount": 80 }))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = test::read_body_json(resp).await;
    assert!(
        body["note"].is_null(),
        "note must remain null when not included in patch, got: {}",
        body["note"]
    );
}

/// PATCH elimination record with `note: null` must clear an existing note (issue #15).
#[actix_web::test]
async fn elimination_record_patch_clears_note_when_null() {
    let (app, _state) = build_dev_app!();
    let pet_id = api_create_pet!(&app, "EliminationClearNote");

    // Create a record with a note.
    let req = test::TestRequest::post()
        .uri("/api/v1/elimination/records")
        .set_json(serde_json::json!({
            "pet_id": pet_id,
            "event_type": "urination",
            "note": "original note",
            "occurred_at": "2026-06-01T09:00:00",
            "local_date": "2026-06-01"
        }))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 201);
    let body: serde_json::Value = test::read_body_json(resp).await;
    let record_id = body["id"].as_str().unwrap().to_string();
    assert_eq!(body["note"].as_str(), Some("original note"));

    // PATCH with note: null — must clear the note.
    let req = test::TestRequest::patch()
        .uri(&format!("/api/v1/elimination/records/{record_id}"))
        .set_json(serde_json::json!({ "note": null }))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = test::read_body_json(resp).await;
    assert!(
        body["note"].is_null(),
        "note must be null after clearing, got: {}",
        body["note"]
    );

    // PATCH without note key — must leave note unchanged (still null).
    let req = test::TestRequest::patch()
        .uri(&format!("/api/v1/elimination/records/{record_id}"))
        .set_json(serde_json::json!({ "event_type": "defecation" }))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = test::read_body_json(resp).await;
    assert!(
        body["note"].is_null(),
        "note must remain null when not included in patch, got: {}",
        body["note"]
    );
}

/// Schedule rules must not persist denormalized daily target_min/target_max fields.
#[actix_web::test]
async fn nutrition_schedule_rules_strip_stored_targets() {
    let (app, _state) = build_dev_app!();
    let pet_id = api_create_pet!(&app, "ScheduleTargetTest");

    let req = test::TestRequest::post()
        .uri("/api/v1/nutrition/schedules")
        .set_json(serde_json::json!({
            "pet_id": pet_id,
            "name": "Hydration",
            "rules": {
                "type": "liquid",
                "target_min": 79,
                "target_max": 109,
                "windows": [
                    { "from": "08:00", "to": "09:00", "min": 10, "max": 12, "note": "morning" }
                ]
            }
        }))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 201);
    let created: serde_json::Value = test::read_body_json(resp).await;
    let schedule_id = created["id"].as_str().unwrap();
    let rules: serde_json::Value =
        serde_json::from_str(created["rules_json"].as_str().unwrap()).unwrap();
    assert_eq!(rules["type"], "liquid");
    assert!(
        rules.get("target_min").is_none(),
        "target_min must not be stored"
    );
    assert!(
        rules.get("target_max").is_none(),
        "target_max must not be stored"
    );
    assert_eq!(rules["windows"].as_array().unwrap().len(), 1);

    let req = test::TestRequest::patch()
        .uri(&format!("/api/v1/nutrition/schedules/{schedule_id}"))
        .set_json(serde_json::json!({
            "rules": {
                "type": "liquid",
                "target_min": 50,
                "target_max": 60,
                "windows": [
                    { "from": "08:00", "to": "09:00", "min": 10, "max": 12, "note": "morning" },
                    { "from": "12:00", "to": "13:00", "min": 8, "max": 10, "note": "midday" }
                ]
            }
        }))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 200);
    let updated: serde_json::Value = test::read_body_json(resp).await;
    let rules: serde_json::Value =
        serde_json::from_str(updated["rules_json"].as_str().unwrap()).unwrap();
    assert!(
        rules.get("target_min").is_none(),
        "target_min must not be stored on update"
    );
    assert!(
        rules.get("target_max").is_none(),
        "target_max must not be stored on update"
    );
    assert_eq!(rules["windows"].as_array().unwrap().len(), 2);
}

#[actix_web::test]
async fn nutrition_schedule_rejects_legacy_array_rules() {
    let (app, _state) = build_dev_app!();
    let pet_id = api_create_pet!(&app, "ScheduleLegacyTest");

    let req = test::TestRequest::post()
        .uri("/api/v1/nutrition/schedules")
        .set_json(serde_json::json!({
            "pet_id": pet_id,
            "name": "Legacy",
            "rules": [
                { "category": "liquids", "target_amount": 10.0 }
            ]
        }))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 422);
}

/// GET /nutrition/status returns cumulative intake and schedule expectations as of ts.
#[actix_web::test]
async fn nutrition_status_as_of_timestamp() {
    let (app, _state) = build_dev_app!();
    let pet_id = api_create_pet!(&app, "NutritionStatusTest");

    let req = test::TestRequest::post()
        .uri("/api/v1/nutrition/schedules")
        .set_json(serde_json::json!({
            "pet_id": pet_id,
            "name": "Hydration",
            "rules": {
                "type": "liquid",
                "windows": [
                    { "from": "08:00", "to": "10:00", "min": 10, "max": 100, "note": "morning" },
                    { "from": "12:00", "to": "14:00", "min": 20, "max": 50, "note": "midday" }
                ]
            }
        }))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 201);
    let schedule: serde_json::Value = test::read_body_json(resp).await;
    let schedule_id = schedule["id"].as_str().unwrap();

    for (time, category, amount) in [
        ("2026-07-18T08:30:00", "liquids", 60.0),
        ("2026-07-18T11:00:00", "water", 20.0),
        ("2026-07-18T15:00:00", "liquids", 999.0),
    ] {
        let req = test::TestRequest::post()
            .uri("/api/v1/nutrition/records")
            .set_json(serde_json::json!({
                "pet_id": pet_id,
                "category": category,
                "amount": amount,
                "unit": "ml",
                "occurred_at": time,
                "local_date": "2026-07-18"
            }))
            .to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), 201, "failed to create record at {time}");
    }

    let req = test::TestRequest::get()
        .uri(&format!(
            "/api/v1/nutrition/status?pet_id={pet_id}&ts=2026-07-18T13:00:00"
        ))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = test::read_body_json(resp).await;

    assert_eq!(body["local_date"].as_str(), Some("2026-07-18"));
    assert_eq!(body["as_of"].as_str(), Some("2026-07-18T13:00:00"));
    assert_eq!(body["on_track"].as_bool(), Some(false));
    assert_eq!(body["intake"]["liquids_ml"].as_f64(), Some(60.0));
    assert_eq!(body["intake"]["water_ml"].as_f64(), Some(20.0));
    assert_eq!(body["intake"]["direct_liquid_ml"].as_f64(), Some(80.0));

    let schedule_body = &body["schedule"];
    assert_eq!(schedule_body["schedule_id"].as_str(), Some(schedule_id));
    assert_eq!(schedule_body["expected_ml"].as_f64(), Some(150.0));
    assert_eq!(schedule_body["daily_min_ml"].as_f64(), Some(30.0));
    assert_eq!(schedule_body["daily_max_ml"].as_f64(), Some(150.0));
    assert_eq!(schedule_body["delta_ml"].as_f64(), Some(-70.0));
}

#[actix_web::test]
async fn nutrition_status_requires_pet_id() {
    let (app, _state) = build_dev_app!();
    let req = test::TestRequest::get()
        .uri("/api/v1/nutrition/status")
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 400);
}

#[actix_web::test]
async fn mcp_nutrition_on_track_returns_summary() {
    let pool = setup_pool().await;
    let raw = "pm_api_mcp_ontrack_000000000000000000000000000000000000000000000000";
    seed_token(&pool, raw, "mcp").await;
    let state = web::Data::new(AppState::new(pool, true, None, None));
    let app = build_full_app!(state);

    let create_pet = test::TestRequest::post()
        .uri("/api/v1/pets")
        .set_json(serde_json::json!({ "name": "McpOnTrack", "species": "cat" }))
        .to_request();
    let resp = test::call_service(&app, create_pet).await;
    assert_eq!(resp.status(), 201);
    let pet: serde_json::Value = test::read_body_json(resp).await;
    let pet_id = pet["id"].as_str().unwrap();

    let create_schedule = test::TestRequest::post()
        .uri("/api/v1/nutrition/schedules")
        .set_json(serde_json::json!({
            "pet_id": pet_id,
            "name": "Hydration",
            "rules": {
                "type": "liquid",
                "windows": [
                    { "from": "08:00", "to": "10:00", "min": 10, "max": 100 }
                ]
            }
        }))
        .to_request();
    assert_eq!(
        test::call_service(&app, create_schedule).await.status(),
        201
    );

    let create_record = test::TestRequest::post()
        .uri("/api/v1/nutrition/records")
        .set_json(serde_json::json!({
            "pet_id": pet_id,
            "category": "liquids",
            "amount": 120,
            "unit": "ml",
            "occurred_at": "2026-07-18T09:00:00",
            "local_date": "2026-07-18"
        }))
        .to_request();
    assert_eq!(test::call_service(&app, create_record).await.status(), 201);

    let resp = test::call_service(
        &app,
        test::TestRequest::post()
            .uri("/mcp")
            .insert_header(("Authorization", format!("Bearer {raw}")))
            .set_json(serde_json::json!({
                "jsonrpc": "2.0",
                "id": 1,
                "method": "tools/call",
                "params": {
                    "name": "nutrition.on-track",
                    "arguments": {
                        "pet_id": pet_id,
                        "ts": "2026-07-18T09:30:00"
                    }
                }
            }))
            .to_request(),
    )
    .await;
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = test::read_body_json(resp).await;
    let text = body["result"]["content"][0]["text"]
        .as_str()
        .expect("tool text");
    let summary: serde_json::Value = serde_json::from_str(text).expect("tool json");
    assert_eq!(summary["on_track"].as_bool(), Some(true));
    assert_eq!(summary["direct_liquid_ml"].as_f64(), Some(120.0));
    assert_eq!(summary["expected_ml"].as_f64(), Some(100.0));
    assert!(summary["summary"].as_str().unwrap().contains("ahead"));
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

macro_rules! api_enable_elimination_auto_categorize {
    ($app:expr, $pet_id:expr) => {{
        let req = test::TestRequest::patch()
            .uri(&format!("/api/v1/pets/{}", $pet_id))
            .set_json(serde_json::json!({ "elimination_auto_categorize_by_duration": true }))
            .to_request();
        let resp = test::call_service($app, req).await;
        assert_eq!(resp.status(), 200, "failed to enable auto-categorize");
    }};
}

macro_rules! api_create_elimination {
    ($app:expr, $pet_id:expr, $event_type:expr, $duration_seconds:expr, $occurred_at:expr) => {{
        let req = test::TestRequest::post()
            .uri("/api/v1/elimination/records")
            .set_json(serde_json::json!({
                "pet_id": $pet_id,
                "event_type": $event_type,
                "duration_seconds": $duration_seconds,
                "occurred_at": $occurred_at,
                "local_date": $occurred_at.split('T').next().unwrap()
            }))
            .to_request();
        let resp = test::call_service($app, req).await;
        assert_eq!(resp.status(), 201, "failed to create elimination record");
        test::read_body_json::<serde_json::Value, _>(resp).await
    }};
}

/// General elimination records with duration are auto-tagged on the backend when enabled.
#[actix_web::test]
async fn elimination_auto_categorize_by_duration() {
    let (app, _state) = build_dev_app!();
    let pet_id = api_create_pet!(&app, "AutoCat");

    for (event_type, duration, hour) in [
        ("urination", 45, 8),
        ("urination", 50, 9),
        ("defecation", 120, 10),
        ("defecation", 125, 11),
    ] {
        api_create_elimination!(
            &app,
            pet_id,
            event_type,
            duration,
            format!("2026-06-01T{hour:02}:00:00")
        );
    }

    api_enable_elimination_auto_categorize!(&app, pet_id);

    let body = api_create_elimination!(&app, pet_id, "general", 48, "2026-06-02T08:30:00");
    assert_eq!(body["event_type"].as_str(), Some("urination"));
    assert_eq!(body["is_auto_categorized"].as_bool(), Some(true));
    let auto_id = body["id"].as_str().unwrap().to_string();

    let body = api_create_elimination!(&app, pet_id, "general", 122, "2026-06-02T10:30:00");
    assert_eq!(body["event_type"].as_str(), Some("defecation"));
    assert_eq!(body["is_auto_categorized"].as_bool(), Some(true));

    let manual = api_create_elimination!(&app, pet_id, "urination", 45, "2026-06-02T11:00:00");
    assert_eq!(manual["is_auto_categorized"].as_bool(), Some(false));

    let req = test::TestRequest::patch()
        .uri(&format!("/api/v1/elimination/records/{auto_id}"))
        .set_json(serde_json::json!({ "event_type": "defecation" }))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 200);
    let updated: serde_json::Value = test::read_body_json(resp).await;
    assert_eq!(updated["event_type"].as_str(), Some("defecation"));
    assert_eq!(updated["is_auto_categorized"].as_bool(), Some(false));

    let body = api_create_elimination!(&app, pet_id, "general", 30, "2026-06-02T12:00:00");
    assert_eq!(body["event_type"].as_str(), Some("general"));
    assert_eq!(body["is_auto_categorized"].as_bool(), Some(false));
    let record_id = body["id"].as_str().unwrap().to_string();

    let req = test::TestRequest::get()
        .uri("/api/v1/notifications/unread-count")
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 200);
    let unread: serde_json::Value = test::read_body_json(resp).await;
    assert_eq!(unread["count"].as_i64(), Some(1));

    let req = test::TestRequest::get()
        .uri("/api/v1/notifications?unread_only=true")
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 200);
    let notifications: serde_json::Value = test::read_body_json(resp).await;
    let first = &notifications[0];
    assert_eq!(
        first["kind"].as_str(),
        Some("elimination.auto_categorize_failed")
    );
    assert_eq!(first["read"].as_bool(), Some(false));
    assert_eq!(
        first["link_hash"].as_str(),
        Some(format!("record-{record_id}").as_str())
    );
    let notification_id = first["id"].as_str().unwrap().to_string();

    let req = test::TestRequest::post()
        .uri(&format!("/api/v1/notifications/{notification_id}/read"))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 204);

    let req = test::TestRequest::get()
        .uri("/api/v1/notifications/unread-count")
        .to_request();
    let resp = test::call_service(&app, req).await;
    let unread: serde_json::Value = test::read_body_json(resp).await;
    assert_eq!(unread["count"].as_i64(), Some(0));

    let req = test::TestRequest::patch()
        .uri(&format!("/api/v1/pets/{pet_id}"))
        .set_json(serde_json::json!({ "elimination_auto_categorize_by_duration": false }))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 200);

    let body = api_create_elimination!(&app, pet_id, "general", 47, "2026-06-02T14:00:00");
    assert_eq!(body["event_type"].as_str(), Some("general"));
    assert_eq!(body["is_auto_categorized"].as_bool(), Some(false));
}

#[actix_web::test]
async fn elimination_duration_profile_returns_buckets() {
    let (app, _state) = build_dev_app!();
    let pet_id = api_create_pet!(&app, "DurationProfile");

    api_create_elimination!(&app, pet_id, "urination", 40, "2026-06-01T08:00:00");
    api_create_elimination!(&app, pet_id, "urination", 60, "2026-06-01T09:00:00");
    api_create_elimination!(&app, pet_id, "defecation", 100, "2026-06-01T10:00:00");

    let req = test::TestRequest::get()
        .uri(&format!(
            "/api/v1/elimination/duration-profile?pet_id={pet_id}"
        ))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = test::read_body_json(resp).await;

    assert_eq!(body["pet_id"].as_str(), Some(pet_id.as_str()));
    assert_eq!(body["wee"]["sample_count"].as_i64(), Some(2));
    assert_eq!(body["wee"]["avg_duration_seconds"].as_f64(), Some(50.0));
    assert_eq!(body["poo"]["sample_count"].as_i64(), Some(1));
    assert_eq!(body["poo"]["avg_duration_seconds"].as_f64(), Some(100.0));
}

/// Contextual classifier uses rolling 24h windows to disambiguate overlapping durations.
#[actix_web::test]
async fn elimination_classifier_rolling_window_disambiguates_overlap() {
    let (app, _state) = build_dev_app!();
    let pet_id = api_create_pet!(&app, "ContextCat");
    for (event_type, duration, occurred) in [
        ("urination", 44, "2026-05-28T08:00:00"),
        ("urination", 46, "2026-05-29T08:00:00"),
        ("urination", 45, "2026-05-30T08:00:00"),
        ("urination", 47, "2026-05-31T08:00:00"),
        ("defecation", 118, "2026-05-28T10:00:00"),
        ("defecation", 122, "2026-05-29T10:00:00"),
        ("defecation", 120, "2026-05-30T10:00:00"),
        ("defecation", 119, "2026-05-31T10:00:00"),
    ] {
        api_create_elimination!(&app, pet_id, event_type, duration, occurred);
    }
    api_enable_elimination_auto_categorize!(&app, pet_id);

    let req = test::TestRequest::post()
        .uri(&format!(
            "/api/v1/elimination/classifier/retrain?pet_id={pet_id}"
        ))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 200);
    let retrain: serde_json::Value = test::read_body_json(resp).await;
    assert_eq!(retrain["trained"].as_bool(), Some(true));

    api_create_elimination!(&app, pet_id, "defecation", 120, "2026-06-01T23:00:00");

    let body = api_create_elimination!(&app, pet_id, "general", 55, "2026-06-02T01:00:00");
    assert_eq!(
        body["event_type"].as_str(),
        Some("urination"),
        "expected wee: poop already within rolling 24h and duration is ambiguous"
    );
    assert_eq!(body["is_auto_categorized"].as_bool(), Some(true));
    let confidence = body["auto_categorize_confidence"].as_f64();
    assert!(confidence.is_some(), "classifier should persist confidence");
    assert!(
        confidence.unwrap() >= 0.72,
        "confidence should meet threshold, got {confidence:?}"
    );
}

#[actix_web::test]
async fn elimination_classifier_status_and_retrain() {
    let (app, _state) = build_dev_app!();
    let pet_id = api_create_pet!(&app, "ClassifierStatus");
    for (event_type, duration, occurred) in [
        ("urination", 44, "2026-05-28T08:00:00"),
        ("urination", 46, "2026-05-29T08:00:00"),
        ("urination", 45, "2026-05-30T08:00:00"),
        ("urination", 47, "2026-05-31T08:00:00"),
        ("defecation", 118, "2026-05-28T10:00:00"),
        ("defecation", 122, "2026-05-29T10:00:00"),
        ("defecation", 120, "2026-05-30T10:00:00"),
        ("defecation", 119, "2026-05-31T10:00:00"),
    ] {
        api_create_elimination!(&app, pet_id, event_type, duration, occurred);
    }
    api_enable_elimination_auto_categorize!(&app, pet_id);

    let req = test::TestRequest::get()
        .uri(&format!(
            "/api/v1/elimination/classifier/status?pet_id={pet_id}"
        ))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 200);
    let status: serde_json::Value = test::read_body_json(resp).await;
    assert_eq!(status["enabled"].as_bool(), Some(true));
    assert!(status["baselines"]["p50_wees_per_day"].as_f64().is_some());

    let req = test::TestRequest::post()
        .uri(&format!(
            "/api/v1/elimination/classifier/retrain?pet_id={pet_id}"
        ))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 200);
    let retrain: serde_json::Value = test::read_body_json(resp).await;
    assert_eq!(retrain["trained"].as_bool(), Some(true));
    assert!(retrain["model"]["sample_count"].as_i64().unwrap() >= 8);
}

#[actix_web::test]
async fn notifications_are_global_with_per_reader_read_state() {
    let (app, _state) = build_dev_app!();
    let pet_id = api_create_pet!(&app, "NotifyPet");
    api_enable_elimination_auto_categorize!(&app, pet_id);
    api_create_elimination!(&app, pet_id, "urination", 40, "2026-06-01T08:00:00");
    api_create_elimination!(&app, pet_id, "urination", 42, "2026-06-01T09:00:00");
    api_create_elimination!(&app, pet_id, "defecation", 100, "2026-06-01T10:00:00");
    api_create_elimination!(&app, pet_id, "defecation", 105, "2026-06-01T11:00:00");

    api_create_elimination!(&app, pet_id, "general", 60, "2026-06-02T12:00:00");

    let req = test::TestRequest::get()
        .uri("/api/v1/notifications")
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 200);
    let notifications: serde_json::Value = test::read_body_json(resp).await;
    assert_eq!(notifications.as_array().unwrap().len(), 1);

    let req = test::TestRequest::post()
        .uri("/api/v1/notifications/read-all")
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = test::read_body_json(resp).await;
    assert_eq!(body["count"].as_i64(), Some(0));

    let req = test::TestRequest::post()
        .uri("/api/v1/notifications/dismiss-all")
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = test::read_body_json(resp).await;
    assert_eq!(body["count"].as_i64(), Some(0));

    let req = test::TestRequest::get()
        .uri("/api/v1/notifications")
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 200);
    let notifications: serde_json::Value = test::read_body_json(resp).await;
    assert_eq!(notifications.as_array().unwrap().len(), 0);
}

#[actix_web::test]
async fn push_config_auto_generates_vapid_keys() {
    let (app, _state) = build_dev_app!();

    let req = test::TestRequest::get()
        .uri("/api/v1/push/config")
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = test::read_body_json(resp).await;
    assert_eq!(body["enabled"].as_bool(), Some(true));
    assert!(body["public_key"].as_str().is_some_and(|k| !k.is_empty()));
}

#[actix_web::test]
async fn push_repairs_localhost_vapid_subject() {
    use petmon::domain::push::VapidConfig;
    use petmon::repo::settings;

    let pool = setup_pool().await;
    let broken = VapidConfig {
        public_key: "BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
            .to_string(),
        private_key: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA".to_string(),
        subject: "mailto:admin@localhost".to_string(),
    };
    settings::upsert(&pool, "vapid", &broken)
        .await
        .expect("store broken vapid");

    // Hitting public config runs ensure_vapid, which must rewrite the subject.
    let cfg = petmon::services::push_service::public_config(&pool)
        .await
        .expect("public config");
    assert!(cfg.enabled);
    assert!(cfg.public_key.is_some());

    let repaired: VapidConfig = settings::get(&pool, "vapid").await.expect("load vapid");
    assert_ne!(repaired.subject, "mailto:admin@localhost");
    assert!(
        repaired.subject.starts_with("mailto:") || repaired.subject.starts_with("https://"),
        "subject should be a contact URI, got {}",
        repaired.subject
    );
    assert!(
        !repaired.subject.to_ascii_lowercase().contains("localhost"),
        "subject must not use localhost for Apple Web Push"
    );
}

#[actix_web::test]
async fn push_subscribe_and_test_endpoints_work() {
    let (app, _state) = build_dev_app!();

    let subscribe_body = serde_json::json!({
        "endpoint": "https://push.example.test/device/abc",
        "keys": {
            "p256dh": "test-p256dh-key",
            "auth": "test-auth-key"
        }
    });

    let req = test::TestRequest::post()
        .uri("/api/v1/push/subscribe")
        .set_json(&subscribe_body)
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 204);

    let req = test::TestRequest::post()
        .uri("/api/v1/push/test")
        .set_json(&serde_json::json!({
            "endpoint": "https://push.example.test/device/abc"
        }))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = test::read_body_json(resp).await;
    assert!(body["sent"].is_number());
    assert!(body["failed"].is_number());
    // Fake endpoint keys cannot deliver — expect failure with an error message,
    // not a broadcast fan-out to other devices.
    assert_eq!(body["sent"], 0);
    assert_eq!(body["failed"], 1);
    assert!(body["error"].as_str().is_some_and(|e| !e.is_empty()));

    // Unknown endpoint is rejected (does not silently fan out).
    let req = test::TestRequest::post()
        .uri("/api/v1/push/test")
        .set_json(&serde_json::json!({
            "endpoint": "https://push.example.test/device/missing"
        }))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 400);

    let req = test::TestRequest::post()
        .uri("/api/v1/push/unsubscribe")
        .set_json(&serde_json::json!({ "endpoint": "https://push.example.test/device/abc" }))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 204);
}

#[actix_web::test]
async fn push_stale_subscriptions_are_cleaned_up() {
    use chrono::{Duration, Utc};
    use petmon::services::push_service;

    let pool = setup_pool().await;
    let old = (Utc::now() - Duration::days(120)).to_rfc3339();

    sqlx::query(
        "INSERT INTO push_subscriptions (id, endpoint, p256dh, auth, reader_key, created_at, last_attempt_at) \
         VALUES ('sub-old', 'https://push.example.test/stale', 'k', 'a', 'dev', ?, ?)",
    )
    .bind(&old)
    .bind(&old)
    .execute(&pool)
    .await
    .unwrap();

    std::env::set_var("PUSH_SUBSCRIPTION_TTL_DAYS", "90");
    let removed = push_service::cleanup_stale_subscriptions(&pool)
        .await
        .unwrap();
    std::env::remove_var("PUSH_SUBSCRIPTION_TTL_DAYS");

    assert_eq!(removed, 1);

    let remaining: (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM push_subscriptions WHERE endpoint = ?")
            .bind("https://push.example.test/stale")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(remaining.0, 0);
}

// ── Route registration smoke tests ───────────────────────────────────────────
// These guard against routes silently falling through to the SPA/assets
// fallback. Each test hits a real endpoint and asserts it returns JSON (not
// HTML), which proves actix matched the route.

#[actix_web::test]
async fn user_settings_nutrition_calendar_roundtrip() {
    let pool = setup_pool().await;
    let state = web::Data::new(AppState::new(pool, true, None, None));
    let app = build_app!(state);

    let get_req = test::TestRequest::get()
        .uri("/api/v1/me/settings/nutrition_calendar")
        .to_request();
    let get_resp = test::call_service(&app, get_req).await;
    assert_eq!(get_resp.status(), 200);
    let initial: serde_json::Value = test::read_body_json(get_resp).await;
    assert_eq!(initial["week_start"], "sunday");
    assert_eq!(initial["show_total_fluid"], true);

    let post_req = test::TestRequest::post()
        .uri("/api/v1/me/settings/nutrition_calendar")
        .set_json(serde_json::json!({
            "week_start": "monday",
            "show_water": false
        }))
        .to_request();
    let post_resp = test::call_service(&app, post_req).await;
    assert_eq!(post_resp.status(), 200);
    let updated: serde_json::Value = test::read_body_json(post_resp).await;
    assert_eq!(updated["week_start"], "monday");
    assert_eq!(updated["show_water"], false);
    assert_eq!(updated["show_liquids"], true);

    let get_req2 = test::TestRequest::get()
        .uri("/api/v1/me/settings/nutrition_calendar")
        .to_request();
    let get_resp2 = test::call_service(&app, get_req2).await;
    assert_eq!(get_resp2.status(), 200);
    let persisted: serde_json::Value = test::read_body_json(get_resp2).await;
    assert_eq!(persisted["week_start"], "monday");
    assert_eq!(persisted["show_water"], false);
}

#[tokio::test]
async fn demo_mode_seeds_empty_database_once() {
    let pool = setup_pool().await;
    assert!(petmon::demo_seed::is_empty_database(&pool).await.unwrap());

    petmon::services::startup::maybe_seed_demo(&pool, true).await;

    assert!(!petmon::demo_seed::is_empty_database(&pool).await.unwrap());
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM pets")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 4);

    petmon::services::startup::maybe_seed_demo(&pool, true).await;
    let count_again: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM pets")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count_again, 4);
}

#[tokio::test]
async fn demo_mode_off_leaves_empty_database() {
    let pool = setup_pool().await;
    petmon::services::startup::maybe_seed_demo(&pool, false).await;
    assert!(petmon::demo_seed::is_empty_database(&pool).await.unwrap());
}

#[actix_web::test]
async fn user_settings_display_roundtrip() {
    let pool = setup_pool().await;
    let state = web::Data::new(AppState::new(pool, true, None, None));
    let app = build_app!(state);

    let get_req = test::TestRequest::get()
        .uri("/api/v1/me/settings/display")
        .to_request();
    let get_resp = test::call_service(&app, get_req).await;
    assert_eq!(get_resp.status(), 200);
    let initial: serde_json::Value = test::read_body_json(get_resp).await;
    assert_eq!(initial["time_format"], "h24");
    assert_eq!(initial["show_water_card"], true);

    let post_req = test::TestRequest::post()
        .uri("/api/v1/me/settings/display")
        .set_json(serde_json::json!({
            "date_format": "mmm_dd_yyyy",
            "show_water_card": false
        }))
        .to_request();
    let post_resp = test::call_service(&app, post_req).await;
    assert_eq!(post_resp.status(), 200);
    let updated: serde_json::Value = test::read_body_json(post_resp).await;
    assert_eq!(updated["date_format"], "mmm_dd_yyyy");
    assert_eq!(updated["show_water_card"], false);
    assert_eq!(updated["time_format"], "h24");
}

#[actix_web::test]
async fn user_settings_unknown_key_returns_404() {
    let pool = setup_pool().await;
    let state = web::Data::new(AppState::new(pool, true, None, None));
    let app = build_app!(state);

    let req = test::TestRequest::get()
        .uri("/api/v1/me/settings/unknown_widget")
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 404);
}

#[actix_web::test]
async fn user_settings_display_returns_json_not_spa() {
    let pool = setup_pool().await;
    let state = web::Data::new(AppState::new(pool, true, None, None));
    let app = build_app!(state);

    let req = test::TestRequest::get()
        .uri("/api/v1/me/settings/display")
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(
        resp.status(),
        200,
        "GET /api/v1/me/settings/display must return 200"
    );
    let ct = resp
        .headers()
        .get("content-type")
        .unwrap()
        .to_str()
        .unwrap();
    assert!(
        ct.contains("application/json"),
        "me/settings/display must return JSON, got: {ct}"
    );
}

#[actix_web::test]
async fn user_settings_are_shared_across_api_tokens_for_the_same_owner() {
    let pool = setup_pool().await;
    let owner = "google-oauth2|alice";
    let raw_a = "pm_api_settings_a_000000000000000000000000000000000000000000000";
    let raw_b = "pm_api_settings_b_000000000000000000000000000000000000000000000";
    seed_token_for_owner(&pool, raw_a, "all", owner).await;
    seed_token_for_owner(&pool, raw_b, "all", owner).await;
    let state = web::Data::new(AppState::new(pool.clone(), false, None, None));
    let app = build_app!(state);

    let post_resp = test::call_service(
        &app,
        test::TestRequest::post()
            .uri("/api/v1/me/settings/display")
            .insert_header(("Authorization", format!("Bearer {raw_a}")))
            .set_json(serde_json::json!({ "time_format": "h12" }))
            .to_request(),
    )
    .await;
    assert_eq!(post_resp.status(), 200);

    let get_resp = test::call_service(
        &app,
        test::TestRequest::get()
            .uri("/api/v1/me/settings/display")
            .insert_header(("Authorization", format!("Bearer {raw_b}")))
            .to_request(),
    )
    .await;
    assert_eq!(get_resp.status(), 200);
    let body: serde_json::Value = test::read_body_json(get_resp).await;
    assert_eq!(body["time_format"].as_str(), Some("h12"));

    let keys: Vec<String> = sqlx::query_scalar("SELECT DISTINCT reader_key FROM user_settings")
        .fetch_all(&pool)
        .await
        .unwrap();
    assert_eq!(keys, vec![owner.to_string()]);
}

#[actix_web::test]
async fn push_subscribe_stores_owner_subject_as_reader_key() {
    let pool = setup_pool().await;
    let owner = "google-oauth2|alice";
    let raw = "pm_api_push_owner_0000000000000000000000000000000000000000000000";
    seed_token_for_owner(&pool, raw, "all", owner).await;
    let state = web::Data::new(AppState::new(pool.clone(), false, None, None));
    let app = build_app!(state);

    let resp = test::call_service(
        &app,
        test::TestRequest::post()
            .uri("/api/v1/push/subscribe")
            .insert_header(("Authorization", format!("Bearer {raw}")))
            .set_json(serde_json::json!({
                "endpoint": "https://push.example.test/device/owned",
                "keys": { "p256dh": "k", "auth": "a" }
            }))
            .to_request(),
    )
    .await;
    assert_eq!(resp.status(), 204);

    let reader_key: String =
        sqlx::query_scalar("SELECT reader_key FROM push_subscriptions WHERE endpoint = ?")
            .bind("https://push.example.test/device/owned")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(reader_key, owner);
}

#[tokio::test]
async fn migration_016_remaps_api_token_reader_keys_then_deletes_leftovers() {
    let pool = setup_pool().await;
    let owned_id = "tok-owned";
    let orphan_id = "tok-orphan";
    sqlx::query(
        "INSERT INTO api_tokens (id, token_hash, alias, scopes, owner_subject, created_at, last_used_at, active) \
         VALUES (?, 'h1', 'owned', 'all', 'google-oauth2|alice', datetime('now'), NULL, 1)",
    )
    .bind(owned_id)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO api_tokens (id, token_hash, alias, scopes, created_at, last_used_at, active) \
         VALUES (?, 'h2', 'orphan', 'all', datetime('now'), NULL, 1)",
    )
    .bind(orphan_id)
    .execute(&pool)
    .await
    .unwrap();

    sqlx::query(
        "INSERT INTO user_settings (reader_key, key, value_json, updated_at) \
         VALUES (?, 'display', '{\"time_format\":\"h12\"}', '2026-01-02T00:00:00Z')",
    )
    .bind(format!("api_token:{owned_id}"))
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO user_settings (reader_key, key, value_json, updated_at) \
         VALUES ('google-oauth2|alice', 'display', '{\"time_format\":\"h24\"}', '2026-01-01T00:00:00Z')",
    )
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO user_settings (reader_key, key, value_json, updated_at) \
         VALUES (?, 'display', '{}', '2026-01-01T00:00:00Z')",
    )
    .bind(format!("api_token:{orphan_id}"))
    .execute(&pool)
    .await
    .unwrap();

    sqlx::query(
        "INSERT INTO notifications (id, kind, title, link_path, created_at) \
         VALUES ('n1', 'info', 't', '/x', datetime('now'))",
    )
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO notification_reads (notification_id, reader_key, read_at) \
         VALUES ('n1', ?, '2026-01-02T00:00:00Z')",
    )
    .bind(format!("api_token:{owned_id}"))
    .execute(&pool)
    .await
    .unwrap();

    sqlx::query(
        "INSERT INTO push_subscriptions (id, endpoint, p256dh, auth, reader_key, created_at) \
         VALUES ('p1', 'https://push.example.test/owned', 'k', 'a', ?, datetime('now'))",
    )
    .bind(format!("api_token:{owned_id}"))
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO push_subscriptions (id, endpoint, p256dh, auth, reader_key, created_at) \
         VALUES ('p2', 'https://push.example.test/orphan', 'k', 'a', ?, datetime('now'))",
    )
    .bind(format!("api_token:{orphan_id}"))
    .execute(&pool)
    .await
    .unwrap();

    sqlx::raw_sql(include_str!(
        "../migrations/016_reader_key_to_owner_subject.sql"
    ))
    .execute(&pool)
    .await
    .unwrap();

    let display: String = sqlx::query_scalar(
        "SELECT value_json FROM user_settings WHERE reader_key = 'google-oauth2|alice' AND key = 'display'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(
        display.contains("h12"),
        "newer token-keyed row must win: {display}"
    );

    let leftover: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM user_settings WHERE reader_key LIKE 'api_token:%'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(leftover, 0);

    let read_key: String = sqlx::query_scalar(
        "SELECT reader_key FROM notification_reads WHERE notification_id = 'n1'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(read_key, "google-oauth2|alice");

    let push_owned: String = sqlx::query_scalar(
        "SELECT reader_key FROM push_subscriptions WHERE endpoint = 'https://push.example.test/owned'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(push_owned, "google-oauth2|alice");

    let orphan_push: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM push_subscriptions WHERE endpoint = 'https://push.example.test/orphan'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(orphan_push, 0);
}

#[actix_web::test]
async fn settings_display_route_removed() {
    let pool = setup_pool().await;
    let state = web::Data::new(AppState::new(pool, true, None, None));
    let app = build_app!(state);

    let req = test::TestRequest::get()
        .uri("/api/v1/settings/display")
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(
        resp.status(),
        404,
        "GET /api/v1/settings/display must be removed (use /me/settings/display)"
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

/// Range summary must include per-type average duration fields for analytics charts.
#[actix_web::test]
async fn elimination_range_summary_includes_per_type_avg_duration() {
    let (app, _state) = build_dev_app!();
    let pet_id = api_create_pet!(&app, "EliminationAnalyticsDuration");

    let local_date = "2026-06-01";
    for (event_type, duration_seconds) in [
        ("urination", 40),
        ("urination", 60),
        ("defecation", 90),
        ("general", 120),
    ] {
        let req = test::TestRequest::post()
            .uri("/api/v1/elimination/records")
            .set_json(serde_json::json!({
                "pet_id": pet_id,
                "event_type": event_type,
                "duration_seconds": duration_seconds,
                "occurred_at": format!("{local_date}T09:00:00"),
                "local_date": local_date,
            }))
            .to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), 201, "create {event_type} failed");
    }

    let req = test::TestRequest::get()
        .uri(&format!(
            "/api/v1/elimination/analytics/range-summary?date_from={local_date}&date_to={local_date}&pet_id={pet_id}"
        ))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = test::read_body_json(resp).await;
    let summary = &body["daily_summaries"][0];
    assert_eq!(summary["local_date"].as_str(), Some(local_date));
    assert_eq!(
        summary["urination_avg_duration_seconds"].as_f64(),
        Some(50.0)
    );
    assert_eq!(
        summary["defecation_avg_duration_seconds"].as_f64(),
        Some(90.0)
    );
    assert_eq!(
        summary["general_avg_duration_seconds"].as_f64(),
        Some(120.0)
    );
}

/// no_output events are tracked separately in analytics like vomit (alarming, not a normal visit).
#[actix_web::test]
async fn elimination_no_output_tracked_in_analytics() {
    let (app, _state) = build_dev_app!();
    let pet_id = api_create_pet!(&app, "EliminationNoOutput");

    let local_date = "2026-06-02";
    for (event_type, duration_seconds) in [("urination", 40), ("no_output", 90), ("no_output", 60)]
    {
        let req = test::TestRequest::post()
            .uri("/api/v1/elimination/records")
            .set_json(serde_json::json!({
                "pet_id": pet_id,
                "event_type": event_type,
                "duration_seconds": duration_seconds,
                "occurred_at": format!("{local_date}T09:00:00"),
                "local_date": local_date,
            }))
            .to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), 201, "create {event_type} failed");
        let body: serde_json::Value = test::read_body_json(resp).await;
        assert_eq!(body["event_type"].as_str(), Some(event_type));
    }

    let req = test::TestRequest::get()
        .uri(&format!(
            "/api/v1/elimination/analytics/range-summary?date_from={local_date}&date_to={local_date}&pet_id={pet_id}"
        ))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = test::read_body_json(resp).await;
    let summary = &body["daily_summaries"][0];
    assert_eq!(summary["urination_count"].as_i64(), Some(1));
    assert_eq!(summary["no_output_count"].as_i64(), Some(2));
    assert_eq!(summary["has_no_output"].as_bool(), Some(true));
    assert_eq!(summary["total_count"].as_i64(), Some(3));
    assert_eq!(body["type_totals"]["no_output"].as_i64(), Some(2));
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

#[actix_web::test]
async fn weight_list_defaults_to_last_ten_without_date_filter() {
    let (app, _state) = build_dev_app!();
    let pet_id = api_create_pet!(&app, "WeightLimitTest");

    for hour in 0..12 {
        let req = test::TestRequest::post()
            .uri("/api/v1/health/weight")
            .set_json(serde_json::json!({
                "pet_id": pet_id,
                "measured_at": format!("2026-06-15T{:02}:00:00", hour),
                "weight_kg": 4.0 + (hour as f64 * 0.01),
            }))
            .to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), 201);
    }

    let req = test::TestRequest::get()
        .uri(&format!("/api/v1/health/weight?pet_id={pet_id}"))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 200);
    let list: serde_json::Value = test::read_body_json(resp).await;
    let records = list.as_array().expect("expected array");
    assert_eq!(records.len(), 10);
    assert_eq!(
        records[0]["measured_at"].as_str(),
        Some("2026-06-15T11:00:00")
    );
    assert_eq!(
        records[9]["measured_at"].as_str(),
        Some("2026-06-15T02:00:00")
    );

    let req = test::TestRequest::get()
        .uri(&format!(
            "/api/v1/health/weight?pet_id={pet_id}&date_from=2026-06-15&date_to=2026-06-15"
        ))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 200);
    let list: serde_json::Value = test::read_body_json(resp).await;
    assert_eq!(list.as_array().unwrap().len(), 12);
}

// ── Weight summary ────────────────────────────────────────────────────────────

#[actix_web::test]
async fn weight_summary_daily_aggregates_multiple_records_per_day() {
    let (app, _state) = build_dev_app!();
    let pet_id = api_create_pet!(&app, "SummaryDailyTest");

    for (time, kg) in [("09:00:00", 4.2_f64), ("17:30:00", 4.3_f64)] {
        let req = test::TestRequest::post()
            .uri("/api/v1/health/weight")
            .set_json(serde_json::json!({
                "pet_id": pet_id,
                "measured_at": format!("2026-06-15T{time}"),
                "weight_kg": kg,
            }))
            .to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), 201);
    }

    let req = test::TestRequest::get()
        .uri(&format!(
            "/api/v1/health/weight/summary?pet_id={pet_id}&date_from=2026-06-15&date_to=2026-06-15&granularity=daily"
        ))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = test::read_body_json(resp).await;
    let buckets = body.as_array().expect("expected array");
    assert_eq!(
        buckets.len(),
        1,
        "daily granularity must produce one bucket per day"
    );
    let b = &buckets[0];
    assert_eq!(b["bucket"].as_str(), Some("2026-06-15"));
    assert_eq!(b["count"].as_i64(), Some(2));
    let avg = b["avg_kg"].as_f64().unwrap();
    assert!((avg - 4.25).abs() < 0.001, "avg should be 4.25, got {avg}");
    assert_eq!(b["min_kg"].as_f64(), Some(4.2));
    assert_eq!(b["max_kg"].as_f64(), Some(4.3));
}

#[actix_web::test]
async fn weight_summary_raw_returns_one_bucket_per_record() {
    let (app, _state) = build_dev_app!();
    let pet_id = api_create_pet!(&app, "SummaryRawTest");

    for (time, kg) in [
        ("09:00:00", 4.1_f64),
        ("12:00:00", 4.15_f64),
        ("18:00:00", 4.2_f64),
    ] {
        let req = test::TestRequest::post()
            .uri("/api/v1/health/weight")
            .set_json(serde_json::json!({
                "pet_id": pet_id,
                "measured_at": format!("2026-06-20T{time}"),
                "weight_kg": kg,
            }))
            .to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), 201);
    }

    let req = test::TestRequest::get()
        .uri(&format!(
            "/api/v1/health/weight/summary?pet_id={pet_id}&date_from=2026-06-20&date_to=2026-06-20&granularity=raw"
        ))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = test::read_body_json(resp).await;
    let buckets = body.as_array().expect("expected array");
    assert_eq!(
        buckets.len(),
        3,
        "raw granularity must return one bucket per record"
    );
    assert_eq!(buckets[0]["count"].as_i64(), Some(1));
    assert_eq!(buckets[0]["avg_kg"].as_f64(), Some(4.1));
}

// ── Health state records ────────────────────────────────────────────────────

#[actix_web::test]
async fn health_state_records_crud() {
    let (app, _state) = build_dev_app!();
    let pet_id = api_create_pet!(&app, "HealthStateTest");

    let req = test::TestRequest::post()
        .uri("/api/v1/health/state")
        .set_json(serde_json::json!({
            "pet_id": pet_id,
            "level": "ok",
            "occurred_at": "2026-06-15T10:00:00",
            "note": "Seemed fine after breakfast"
        }))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 201);
    let created: serde_json::Value = test::read_body_json(resp).await;
    let record_id = created["id"].as_str().unwrap().to_string();
    assert_eq!(created["level"].as_str(), Some("ok"));
    assert_eq!(
        created["note"].as_str(),
        Some("Seemed fine after breakfast")
    );
    assert_eq!(created["local_date"].as_str(), Some("2026-06-15"));

    let req = test::TestRequest::get()
        .uri(&format!("/api/v1/health/state?pet_id={pet_id}"))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 200);
    let list: serde_json::Value = test::read_body_json(resp).await;
    let records = list.as_array().expect("expected array");
    assert_eq!(records.len(), 1);
    assert_eq!(records[0]["id"].as_str(), Some(record_id.as_str()));

    let req = test::TestRequest::delete()
        .uri(&format!("/api/v1/health/state/{record_id}"))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 204);

    let req = test::TestRequest::get()
        .uri(&format!("/api/v1/health/state?pet_id={pet_id}"))
        .to_request();
    let resp = test::call_service(&app, req).await;
    let list: serde_json::Value = test::read_body_json(resp).await;
    assert!(list.as_array().unwrap().is_empty());
}

#[actix_web::test]
async fn health_state_list_defaults_to_last_ten_without_date_filter() {
    let (app, _state) = build_dev_app!();
    let pet_id = api_create_pet!(&app, "HealthStateLimitTest");

    for hour in 0..12 {
        let req = test::TestRequest::post()
            .uri("/api/v1/health/state")
            .set_json(serde_json::json!({
                "pet_id": pet_id,
                "level": "ok",
                "occurred_at": format!("2026-06-15T{:02}:00:00", hour)
            }))
            .to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), 201);
    }

    let req = test::TestRequest::get()
        .uri(&format!("/api/v1/health/state?pet_id={pet_id}"))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 200);
    let list: serde_json::Value = test::read_body_json(resp).await;
    let records = list.as_array().expect("expected array");
    assert_eq!(records.len(), 10);
    assert_eq!(
        records[0]["occurred_at"].as_str(),
        Some("2026-06-15T11:00:00")
    );
    assert_eq!(
        records[9]["occurred_at"].as_str(),
        Some("2026-06-15T02:00:00")
    );

    let req = test::TestRequest::get()
        .uri(&format!(
            "/api/v1/health/state?pet_id={pet_id}&date_from=2026-06-15&date_to=2026-06-15"
        ))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 200);
    let list: serde_json::Value = test::read_body_json(resp).await;
    assert_eq!(list.as_array().unwrap().len(), 12);
}

#[actix_web::test]
async fn health_state_records_returns_json_not_spa() {
    let pool = setup_pool().await;
    let state = web::Data::new(AppState::new(pool, true, None, None));
    let app = build_app!(state);

    let req = test::TestRequest::get()
        .uri("/api/v1/health/state")
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 200);
    let ct = resp
        .headers()
        .get("content-type")
        .unwrap()
        .to_str()
        .unwrap();
    assert!(
        ct.contains("application/json"),
        "health/state must return JSON, got: {ct}"
    );
}

// ── API token scopes ──────────────────────────────────────────────────────────

#[actix_web::test]
async fn api_token_created_with_default_all_scope() {
    let (app, _state) = build_dev_app!();
    let req = test::TestRequest::post()
        .uri("/api/v1/api-tokens")
        .set_json(serde_json::json!({ "alias": "test-token" }))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 201);
    let body: serde_json::Value = test::read_body_json(resp).await;
    assert_eq!(
        body["scopes"].as_array().map(|a| a.len()),
        Some(1),
        "default scopes should be [all]"
    );
    assert_eq!(body["scopes"][0].as_str(), Some("all"));
}

#[actix_web::test]
async fn api_token_create_persists_owner_subject() {
    let (app, state) = build_dev_app!();
    let resp = test::call_service(
        &app,
        test::TestRequest::post()
            .uri("/api/v1/api-tokens")
            .set_json(serde_json::json!({ "alias": "owned" }))
            .to_request(),
    )
    .await;
    assert_eq!(resp.status(), 201);
    let body: serde_json::Value = test::read_body_json(resp).await;
    let id = body["id"].as_str().unwrap();
    let owner: Option<String> =
        sqlx::query_scalar("SELECT owner_subject FROM api_tokens WHERE id = ?")
            .bind(id)
            .fetch_one(&state.pool)
            .await
            .unwrap();
    assert_eq!(owner.as_deref(), Some("dev"));
}

#[actix_web::test]
async fn api_token_created_with_explicit_scopes() {
    let (app, _state) = build_dev_app!();
    let req = test::TestRequest::post()
        .uri("/api/v1/api-tokens")
        .set_json(serde_json::json!({
            "alias": "read-only",
            "scopes": ["api_read", "mcp"]
        }))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 201);
    let body: serde_json::Value = test::read_body_json(resp).await;
    let scopes: Vec<&str> = body["scopes"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v.as_str().unwrap())
        .collect();
    assert!(scopes.contains(&"api_read"));
    assert!(scopes.contains(&"mcp"));
    assert!(!scopes.contains(&"api_write"));
}

#[actix_web::test]
async fn api_token_scopes_update_patch() {
    let (app, _state) = build_dev_app!();

    // Create a token
    let create_resp: serde_json::Value = test::read_body_json(
        test::call_service(
            &app,
            test::TestRequest::post()
                .uri("/api/v1/api-tokens")
                .set_json(serde_json::json!({ "alias": "patch-test" }))
                .to_request(),
        )
        .await,
    )
    .await;
    let token_id = create_resp["id"].as_str().unwrap();

    // Patch scopes
    let req = test::TestRequest::patch()
        .uri(&format!("/api/v1/api-tokens/{token_id}/scopes"))
        .set_json(serde_json::json!({ "scopes": ["api_read"] }))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 200, "PATCH scopes must return 200");
    let body: serde_json::Value = test::read_body_json(resp).await;
    assert_eq!(
        body["scopes"].as_array().map(|a| a.len()),
        Some(1),
        "should have exactly one scope after patch"
    );
    assert_eq!(body["scopes"][0].as_str(), Some("api_read"));

    // Verify list reflects the change
    let list_resp: serde_json::Value = test::read_body_json(
        test::call_service(
            &app,
            test::TestRequest::get()
                .uri("/api/v1/api-tokens")
                .to_request(),
        )
        .await,
    )
    .await;
    let token = list_resp
        .as_array()
        .unwrap()
        .iter()
        .find(|t| t["id"].as_str() == Some(token_id))
        .expect("token must appear in list");
    assert_eq!(token["scopes"][0].as_str(), Some("api_read"));
}

#[actix_web::test]
async fn api_token_scopes_patch_rejects_unknown_scope() {
    let (app, _state) = build_dev_app!();
    let create_resp: serde_json::Value = test::read_body_json(
        test::call_service(
            &app,
            test::TestRequest::post()
                .uri("/api/v1/api-tokens")
                .set_json(serde_json::json!({ "alias": "bad-scope-test" }))
                .to_request(),
        )
        .await,
    )
    .await;
    let token_id = create_resp["id"].as_str().unwrap();

    let req = test::TestRequest::patch()
        .uri(&format!("/api/v1/api-tokens/{token_id}/scopes"))
        .set_json(serde_json::json!({ "scopes": ["admin"] }))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 400, "unknown scope must be rejected");
}

// ── Scope enforcement ─────────────────────────────────────────────────────────
// These tests run against a non-dev app so RequireAuth is active.
// Each test seeds a token with specific scopes and asserts HTTP 200 or 403.

fn sha256_hex(raw: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(raw.as_bytes());
    format!("{:x}", hasher.finalize())
}

/// Seeds a token with the given raw value, scopes, and owner subject.
async fn seed_token_for_owner(pool: &SqlitePool, raw: &str, scopes: &str, owner_subject: &str) {
    let hash = sha256_hex(raw);
    sqlx::query(
        "INSERT INTO api_tokens (id, token_hash, alias, scopes, owner_subject, created_at, last_used_at, active) \
         VALUES (?, ?, ?, ?, ?, datetime('now'), NULL, 1)",
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(&hash)
    .bind(raw)
    .bind(scopes)
    .bind(owner_subject)
    .execute(pool)
    .await
    .unwrap();
}

/// Seeds a token owned by `test-owner`.
async fn seed_token(pool: &SqlitePool, raw: &str, scopes: &str) {
    seed_token_for_owner(pool, raw, scopes, "test-owner").await;
}

/// GET /pets with an api_read token → 200
#[actix_web::test]
async fn scope_api_read_permits_get_pets() {
    let pool = setup_pool().await;
    let raw = "pm_api_read_test_000000000000000000000000000000000000000000000000000000";
    seed_token(&pool, raw, "api_read").await;
    let state = web::Data::new(AppState::new(pool, false, None, None));
    let app = build_app!(state);
    let resp = test::call_service(
        &app,
        test::TestRequest::get()
            .uri("/api/v1/pets")
            .insert_header(("Authorization", format!("Bearer {raw}")))
            .to_request(),
    )
    .await;
    assert_eq!(
        resp.status(),
        200,
        "api_read token must be able to GET /pets"
    );
}

/// POST /pets with an api_read token → 403
#[actix_web::test]
async fn scope_api_read_denies_post_pets() {
    let pool = setup_pool().await;
    let raw = "pm_api_read_only_000000000000000000000000000000000000000000000000000000";
    seed_token(&pool, raw, "api_read").await;
    let state = web::Data::new(AppState::new(pool, false, None, None));
    let app = build_app!(state);
    let resp = test::call_service(
        &app,
        test::TestRequest::post()
            .uri("/api/v1/pets")
            .insert_header(("Authorization", format!("Bearer {raw}")))
            .set_json(serde_json::json!({ "name": "Test", "species": "cat" }))
            .to_request(),
    )
    .await;
    assert_eq!(
        resp.status(),
        403,
        "api_read token must be denied POST /pets"
    );
}

/// POST /pets with an api_write token → 201
#[actix_web::test]
async fn scope_api_write_permits_post_pets() {
    let pool = setup_pool().await;
    let raw = "pm_api_write_test_00000000000000000000000000000000000000000000000000000";
    seed_token(&pool, raw, "api_write").await;
    let state = web::Data::new(AppState::new(pool, false, None, None));
    let app = build_app!(state);
    let resp = test::call_service(
        &app,
        test::TestRequest::post()
            .uri("/api/v1/pets")
            .insert_header(("Authorization", format!("Bearer {raw}")))
            .set_json(serde_json::json!({ "name": "Test", "species": "cat" }))
            .to_request(),
    )
    .await;
    assert_eq!(
        resp.status(),
        201,
        "api_write token must be able to POST /pets"
    );
}

/// GET /pets with an api_write token → 403 (write-only cannot read)
#[actix_web::test]
async fn scope_api_write_denies_get_pets() {
    let pool = setup_pool().await;
    let raw = "pm_api_write_only_0000000000000000000000000000000000000000000000000000";
    seed_token(&pool, raw, "api_write").await;
    let state = web::Data::new(AppState::new(pool, false, None, None));
    let app = build_app!(state);
    let resp = test::call_service(
        &app,
        test::TestRequest::get()
            .uri("/api/v1/pets")
            .insert_header(("Authorization", format!("Bearer {raw}")))
            .to_request(),
    )
    .await;
    assert_eq!(
        resp.status(),
        403,
        "api_write token must be denied GET /pets"
    );
}

/// GET /pets with an all token → 200
#[actix_web::test]
async fn scope_all_permits_get_pets() {
    let pool = setup_pool().await;
    let raw = "pm_api_all_token_000000000000000000000000000000000000000000000000000000";
    seed_token(&pool, raw, "all").await;
    let state = web::Data::new(AppState::new(pool, false, None, None));
    let app = build_app!(state);
    let resp = test::call_service(
        &app,
        test::TestRequest::get()
            .uri("/api/v1/pets")
            .insert_header(("Authorization", format!("Bearer {raw}")))
            .to_request(),
    )
    .await;
    assert_eq!(
        resp.status(),
        200,
        "all-scope token must be able to GET /pets"
    );
}

/// POST /pets with an all token → 201
#[actix_web::test]
async fn scope_all_permits_post_pets() {
    let pool = setup_pool().await;
    let raw = "pm_api_all_write_00000000000000000000000000000000000000000000000000000";
    seed_token(&pool, raw, "all").await;
    let state = web::Data::new(AppState::new(pool, false, None, None));
    let app = build_app!(state);
    let resp = test::call_service(
        &app,
        test::TestRequest::post()
            .uri("/api/v1/pets")
            .insert_header(("Authorization", format!("Bearer {raw}")))
            .set_json(serde_json::json!({ "name": "AllPet", "species": "cat" }))
            .to_request(),
    )
    .await;
    assert_eq!(
        resp.status(),
        201,
        "all-scope token must be able to POST /pets"
    );
}

/// POST /mcp with a mcp-scoped token → 200 (tool list)
#[actix_web::test]
async fn scope_mcp_permits_mcp_endpoint() {
    let pool = setup_pool().await;
    let raw = "pm_api_mcp_token_000000000000000000000000000000000000000000000000000000";
    seed_token(&pool, raw, "mcp").await;
    let state = web::Data::new(AppState::new(pool, false, None, None));
    let app = build_full_app!(state);
    let resp = test::call_service(
        &app,
        test::TestRequest::post()
            .uri("/mcp")
            .insert_header(("Authorization", format!("Bearer {raw}")))
            .set_json(serde_json::json!({ "jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": null }))
            .to_request(),
    )
    .await;
    assert_eq!(resp.status(), 200, "mcp-scoped token must reach /mcp");
}

/// POST /mcp prompts/list → recommended caregiver prompts
#[actix_web::test]
async fn mcp_prompts_list_returns_recommended_prompts() {
    let pool = setup_pool().await;
    let raw = "pm_api_mcp_prompts_000000000000000000000000000000000000000000000000000";
    seed_token(&pool, raw, "mcp").await;
    let state = web::Data::new(AppState::new(pool, false, None, None));
    let app = build_full_app!(state);
    let resp = test::call_service(
        &app,
        test::TestRequest::post()
            .uri("/mcp")
            .insert_header(("Authorization", format!("Bearer {raw}")))
            .set_json(serde_json::json!({ "jsonrpc": "2.0", "id": 1, "method": "prompts/list", "params": null }))
            .to_request(),
    )
    .await;
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = test::read_body_json(resp).await;
    let prompts = body["result"]["prompts"].as_array().expect("prompts array");
    assert_eq!(prompts.len(), 6);
    let names: Vec<_> = prompts.iter().filter_map(|p| p["name"].as_str()).collect();
    assert!(names.contains(&"daily-summary"));
    assert!(names.contains(&"health-check"));
    assert!(names.contains(&"vet-handoff"));
}

#[actix_web::test]
async fn mcp_prompts_get_renders_template() {
    let pool = setup_pool().await;
    let raw = "pm_api_mcp_prompts_get_0000000000000000000000000000000000000000000000000";
    seed_token(&pool, raw, "mcp").await;
    let state = web::Data::new(AppState::new(pool, false, None, None));
    let app = build_full_app!(state);
    let resp = test::call_service(
        &app,
        test::TestRequest::post()
            .uri("/mcp")
            .insert_header(("Authorization", format!("Bearer {raw}")))
            .set_json(serde_json::json!({
                "jsonrpc": "2.0",
                "id": 1,
                "method": "prompts/get",
                "params": {
                    "name": "health-check",
                    "arguments": { "pet_name": "Mittens" }
                }
            }))
            .to_request(),
    )
    .await;
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = test::read_body_json(resp).await;
    let text = body["result"]["messages"][0]["content"]["text"]
        .as_str()
        .expect("prompt text");
    assert!(text.contains("Mittens"));
    assert!(text.contains("pets.health-context"));
}

#[actix_web::test]
async fn mcp_prompts_get_unknown_prompt_not_found() {
    let pool = setup_pool().await;
    let raw = "pm_api_mcp_prompts_bad_00000000000000000000000000000000000000000000000000";
    seed_token(&pool, raw, "mcp").await;
    let state = web::Data::new(AppState::new(pool, false, None, None));
    let app = build_full_app!(state);
    let resp = test::call_service(
        &app,
        test::TestRequest::post()
            .uri("/mcp")
            .insert_header(("Authorization", format!("Bearer {raw}")))
            .set_json(serde_json::json!({
                "jsonrpc": "2.0",
                "id": 1,
                "method": "prompts/get",
                "params": { "name": "does-not-exist", "arguments": {} }
            }))
            .to_request(),
    )
    .await;
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = test::read_body_json(resp).await;
    assert!(body["error"]["message"]
        .as_str()
        .unwrap()
        .contains("Unknown prompt"));
}

/// POST /mcp with an api_read token → 403
#[actix_web::test]
async fn scope_api_read_denies_mcp_endpoint() {
    let pool = setup_pool().await;
    let raw = "pm_api_read_nomcp_00000000000000000000000000000000000000000000000000000";
    seed_token(&pool, raw, "api_read").await;
    let state = web::Data::new(AppState::new(pool, false, None, None));
    let app = build_full_app!(state);
    let resp = test::call_service(
        &app,
        test::TestRequest::post()
            .uri("/mcp")
            .insert_header(("Authorization", format!("Bearer {raw}")))
            .set_json(serde_json::json!({ "jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": null }))
            .to_request(),
    )
    .await;
    assert_eq!(resp.status(), 403, "api_read token must be denied /mcp");
}

#[actix_web::test]
async fn medication_system_formulations_and_intake_by_reference() {
    let (app, _state) = build_dev_app!();
    let pet_id = api_create_pet!(&app, "MedFormTest");

    let req = test::TestRequest::post()
        .uri("/api/v1/health/meds")
        .set_json(serde_json::json!({
            "pet_id": pet_id,
            "name": "Prednisolone",
            "med_type": "pill",
            "color": "#6366f1"
        }))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 201);
    let med: serde_json::Value = test::read_body_json(resp).await;
    let med_id = med["id"].as_str().unwrap().to_string();

    let req = test::TestRequest::post()
        .uri("/api/v1/health/meds/assignments")
        .set_json(serde_json::json!({
            "medication_id": med_id,
            "tablet_strength_mg": 5.0,
            "pill_shape": "oval_rounded",
            "dose_fraction": "half",
            "frequency": {
                "morning": 0,
                "midday": 0,
                "evening": 1,
                "every": 3,
                "unit": "days"
            },
            "date_from": "2026-03-01"
        }))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 201);
    let assign1: serde_json::Value = test::read_body_json(resp).await;
    let assign1_id = assign1["id"].as_str().unwrap().to_string();
    let form1_id = assign1["formulation_id"].as_str().unwrap().to_string();
    assert_eq!(assign1["effective_dose_mg"].as_f64().unwrap(), 2.5);
    assert_eq!(assign1["formulation"]["pill_shape"], "oval_rounded");

    let req = test::TestRequest::post()
        .uri(&format!(
            "/api/v1/health/meds/assignments/{assign1_id}/revise"
        ))
        .set_json(serde_json::json!({
            "formulation_id": form1_id,
            "dose_fraction": "quarter",
            "effective_from": "2026-03-10"
        }))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 201);
    let assign2: serde_json::Value = test::read_body_json(resp).await;
    assert_eq!(assign2["dose_fraction"].as_str(), Some("quarter"));
    assert_eq!(assign2["formulation_id"].as_str(), Some(form1_id.as_str()));

    let req = test::TestRequest::post()
        .uri(&format!(
            "/api/v1/health/meds/assignments/{}/revise",
            assign2["id"].as_str().unwrap()
        ))
        .set_json(serde_json::json!({
            "tablet_strength_mg": 1.0,
            "pill_shape": "round",
            "dose_fraction": "whole",
            "effective_from": "2026-03-15"
        }))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 201);
    let assign3: serde_json::Value = test::read_body_json(resp).await;
    assert_eq!(assign3["effective_dose_mg"].as_f64().unwrap(), 1.0);
    assert_ne!(assign3["formulation_id"].as_str().unwrap(), form1_id);

    let assign3_id = assign3["id"].as_str().unwrap();
    let req = test::TestRequest::post()
        .uri("/api/v1/health/meds/intake")
        .set_json(serde_json::json!({
            "pet_id": pet_id,
            "medication_id": med_id,
            "assignment_id": assign3_id,
            "taken": true,
            "local_date": "2026-03-15"
        }))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 201);
    let intake: serde_json::Value = test::read_body_json(resp).await;
    assert_eq!(intake["assignment_id"].as_str(), Some(assign3_id));
    assert!(intake["dose_label"].as_str().unwrap().contains("1mg"));
    assert!(intake.get("dosage").is_none());

    let req = test::TestRequest::get()
        .uri(&format!(
            "/api/v1/health/meds/assignments/daily?pet_id={pet_id}&date=2026-03-16"
        ))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 200);
    let not_due: serde_json::Value = test::read_body_json(resp).await;
    assert_eq!(not_due.as_array().unwrap().len(), 0);

    let req = test::TestRequest::get()
        .uri(&format!(
            "/api/v1/health/meds/assignments/daily?pet_id={pet_id}&date=2026-03-18"
        ))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 200);
    let due: serde_json::Value = test::read_body_json(resp).await;
    assert_eq!(due.as_array().unwrap().len(), 1);

    let req = test::TestRequest::post()
        .uri("/api/v1/health/meds/intake")
        .set_json(serde_json::json!({
            "pet_id": pet_id,
            "medication_id": med_id,
            "assignment_id": assign3_id,
            "taken": true,
            "local_date": "2026-03-16"
        }))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 400);

    let req = test::TestRequest::get()
        .uri(&format!(
            "/api/v1/health/meds/assignments?medication_id={med_id}"
        ))
        .to_request();
    let resp = test::call_service(&app, req).await;
    let history: serde_json::Value = test::read_body_json(resp).await;
    let ended = history
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["id"] == assign1_id)
        .unwrap();
    assert_eq!(ended["date_to"].as_str(), Some("2026-03-09"));
}
