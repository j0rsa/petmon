use actix_web::{test, web, App};
use petmon::auth::AppState;
use petmon::{api, assets, mcp, middleware};
use sqlx::SqlitePool;

async fn setup_pool() -> SqlitePool {
    let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
    sqlx::migrate!("./migrations").run(&pool).await.unwrap();
    pool
}

/// Builds the /api/v1 slice only (used by existing CRUD tests).
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
                    .configure(api::days::configure)
                    .configure(api::notes::configure)
                    .configure(api::settings::configure),
            ),
        )
        .await
    };
}

/// Builds the full app routing exactly as main.rs does, including MCP and assets.
macro_rules! build_full_app {
    ($state:expr) => {
        test::init_service(
            App::new()
                .app_data($state.clone())
                .service(
                    web::scope("/api/v1")
                        .wrap(middleware::auth::RequireAuth)
                        .configure(api::auth::configure_public)
                        .configure(api::auth::configure_protected)
                        .configure(api::health::configure)
                        .configure(api::pets::configure)
                        .configure(api::nutrition::configure)
                        .configure(api::days::configure)
                        .configure(api::notes::configure)
                        .configure(api::settings::configure),
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
    assert_eq!(resp.status(), 200, "health endpoint must be publicly accessible");
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

    let req = test::TestRequest::get().uri("/nutrition/2025-01-01").to_request();
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

    let req = test::TestRequest::get().uri("/api/v1/auth/info").to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(
        resp.status(),
        200,
        "GET /api/v1/auth/info must be publicly accessible"
    );
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
