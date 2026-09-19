use actix_web::{http::StatusCode, test, web, App};
use petmon::{
    api,
    auth::{
        admin,
        identity::{Identity, IdentityKind},
        AppState,
    },
    domain::settings::CreateApiToken,
    middleware,
    repo::{api_tokens, instance_admins},
};
use serde_json::json;
use sqlx::SqlitePool;

async fn pool() -> SqlitePool {
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    petmon::db::run_migrations(&pool).await.unwrap();
    pool
}

async fn token(pool: &SqlitePool, owner: &str, scopes: &[&str]) -> (String, String) {
    let (_, created) = api_tokens::create(
        pool,
        CreateApiToken {
            alias: Some("device".into()),
            scopes: Some(scopes.iter().map(|s| s.to_string()).collect()),
            owner_subject: Some(owner.into()),
            created_by: Some(owner.into()),
        },
    )
    .await
    .unwrap();
    (created.id, created.token)
}

macro_rules! app {
    ($pool:expr) => {
        test::init_service(
            App::new()
                .app_data(web::Data::new(AppState::new(
                    $pool.clone(),
                    false,
                    None,
                    None,
                )))
                .service(
                    web::scope("/api/v1")
                        .wrap(middleware::auth::RequireAuth)
                        .configure(api::auth::configure_protected)
                        .configure(api::settings::configure)
                        .configure(api::settings::configure_api_tokens),
                ),
        )
        .await
    };
}

#[actix_web::test]
async fn tokens_cannot_widen_scopes_or_assume_ownership() {
    let pool = pool().await;
    let (own_id, raw) = token(&pool, "alice", &["api_write"]).await;
    let (foreign_id, _) = token(&pool, "bob", &["all"]).await;
    let app = app!(pool);
    for body in [
        json!({"scopes":["all"]}),
        json!({"scopes":["mcp"]}),
        json!({"scopes":["instance_admin"]}),
        json!({}),
    ] {
        let req = test::TestRequest::post()
            .uri("/api/v1/api-tokens")
            .insert_header(("Authorization", format!("Bearer {raw}")))
            .set_json(body)
            .to_request();
        assert_eq!(
            test::call_service(&app, req).await.status(),
            StatusCode::FORBIDDEN
        );
    }
    let req = test::TestRequest::post()
        .uri("/api/v1/api-tokens")
        .insert_header(("Authorization", format!("Bearer {raw}")))
        .set_json(json!({"scopes":[]}))
        .to_request();
    assert_eq!(
        test::call_service(&app, req).await.status(),
        StatusCode::BAD_REQUEST
    );
    for id in [&own_id, &foreign_id] {
        let req = test::TestRequest::patch()
            .uri(&format!("/api/v1/api-tokens/{id}/scopes"))
            .insert_header(("Authorization", format!("Bearer {raw}")))
            .set_json(json!({"scopes":["all"]}))
            .to_request();
        assert_eq!(
            test::call_service(&app, req).await.status(),
            StatusCode::FORBIDDEN
        );
    }
    let req = test::TestRequest::delete()
        .uri(&format!("/api/v1/api-tokens/{foreign_id}"))
        .insert_header(("Authorization", format!("Bearer {raw}")))
        .to_request();
    assert_eq!(
        test::call_service(&app, req).await.status(),
        StatusCode::NOT_FOUND
    );
    let req = test::TestRequest::post()
        .uri("/api/v1/api-tokens")
        .insert_header(("Authorization", format!("Bearer {raw}")))
        .set_json(json!({"scopes":["api_write"],"owner_subject":"bob"}))
        .to_request();
    let created: serde_json::Value = test::call_and_read_body_json(&app, req).await;
    assert!(
        api_tokens::get_owned(&pool, created["id"].as_str().unwrap(), "alice")
            .await
            .is_ok()
    );
}

#[actix_web::test]
async fn role_and_explicit_capability_are_both_required_and_revocation_is_live() {
    let pool = pool().await;
    instance_admins::grant(&pool, "alice").await.unwrap();
    instance_admins::grant(&pool, "recovery").await.unwrap();
    let (_, ordinary) = token(&pool, "alice", &["all"]).await;
    let (_, legacy) = token(&pool, "alice", &[]).await;
    let (_, admin_token) = token(&pool, "alice", &["all", "instance_admin"]).await;
    let (_, forged_role) = token(&pool, "bob", &["all", "instance_admin"]).await;
    let app = app!(pool);
    for raw in [&ordinary, &legacy, &forged_role] {
        for uri in [
            "/api/v1/settings/oidc",
            "/api/v1/settings/telegram",
            "/api/v1/admin/api-tokens",
        ] {
            let req = test::TestRequest::get()
                .uri(uri)
                .insert_header(("Authorization", format!("Bearer {raw}")))
                .to_request();
            assert_eq!(
                test::call_service(&app, req).await.status(),
                StatusCode::FORBIDDEN
            );
        }
    }
    let req = test::TestRequest::get()
        .uri("/api/v1/auth/me")
        .insert_header(("Authorization", format!("Bearer {ordinary}")))
        .to_request();
    let me: serde_json::Value = test::call_and_read_body_json(&app, req).await;
    assert_eq!(me["roles"], json!(["instance_admin"]));
    assert!(!me["capabilities"]
        .as_array()
        .unwrap()
        .contains(&json!("instance_admin")));
    let req = test::TestRequest::get()
        .uri("/api/v1/admin/api-tokens")
        .insert_header(("Authorization", format!("Bearer {admin_token}")))
        .to_request();
    assert_eq!(test::call_service(&app, req).await.status(), StatusCode::OK);
    instance_admins::revoke(&pool, "alice").await.unwrap();
    let req = test::TestRequest::get()
        .uri("/api/v1/settings/oidc")
        .insert_header(("Authorization", format!("Bearer {admin_token}")))
        .to_request();
    assert_eq!(
        test::call_service(&app, req).await.status(),
        StatusCode::FORBIDDEN
    );
}

#[actix_web::test]
async fn personal_listing_and_mcp_transport_do_not_grant_token_management() {
    let pool = pool().await;
    let (own_id, raw) = token(&pool, "alice", &["all"]).await;
    token(&pool, "bob", &["all"]).await;
    let (_, mcp) = token(&pool, "alice", &["mcp"]).await;
    let app = app!(pool);
    let req = test::TestRequest::get()
        .uri("/api/v1/api-tokens")
        .insert_header(("Authorization", format!("Bearer {raw}")))
        .to_request();
    let listed: serde_json::Value = test::call_and_read_body_json(&app, req).await;
    assert_eq!(listed.as_array().unwrap().len(), 2);
    assert!(listed
        .as_array()
        .unwrap()
        .iter()
        .any(|t| t["id"] == own_id && t["current"] == true));
    let req = test::TestRequest::post()
        .uri("/api/v1/api-tokens")
        .insert_header(("Authorization", format!("Bearer {mcp}")))
        .set_json(json!({"scopes":["mcp"]}))
        .to_request();
    assert_eq!(
        test::call_service(&app, req).await.status(),
        StatusCode::FORBIDDEN
    );
}

#[actix_web::test]
async fn bootstrap_is_once_and_last_admin_cannot_be_revoked() {
    let pool = pool().await;
    assert!(
        instance_admins::bootstrap(&pool, &["alice".into(), "bob".into()])
            .await
            .unwrap()
    );
    instance_admins::revoke(&pool, "alice").await.unwrap();
    assert!(
        !instance_admins::bootstrap(&pool, &["alice".into(), "charlie".into()])
            .await
            .unwrap()
    );
    assert!(!instance_admins::contains(&pool, "alice").await.unwrap());
    assert!(!instance_admins::contains(&pool, "charlie").await.unwrap());
    assert!(instance_admins::revoke(&pool, "bob").await.is_err());
    instance_admins::grant(&pool, "recovery").await.unwrap();
    instance_admins::revoke(&pool, "bob").await.unwrap();
}

#[actix_web::test]
async fn oidc_roles_respect_ordinary_scopes_and_no_scope_alias_enables_admin() {
    let pool = pool().await;
    instance_admins::grant(&pool, "alice").await.unwrap();
    let oidc = Identity {
        subject: "alice".into(),
        email: None,
        name: None,
        kind: IdentityKind::Oidc,
        scopes: ["api_read".into()].into_iter().collect(),
        token_created_by: None,
        owner_subject: None,
    };
    assert_eq!(
        admin::effective_capabilities(&pool, &oidc).await.unwrap(),
        vec!["api_read", "instance_admin"]
    );
    assert!(
        admin::attenuate_scopes(&pool, &oidc, Some(vec!["all".into()]))
            .await
            .is_err()
    );
    assert!(
        admin::attenuate_scopes(&pool, &oidc, Some(vec!["api_read".into()]))
            .await
            .is_ok()
    );
}

#[actix_web::test]
async fn administration_is_explicit_and_preserves_bot_secrets() {
    let pool = pool().await;
    instance_admins::grant(&pool, "alice").await.unwrap();
    let (_, raw) = token(&pool, "alice", &["all", "instance_admin"]).await;
    let app = app!(pool);
    for (body, expected) in [
        (json!({}), false),
        (json!({"scopes":["all","instance_admin"]}), true),
    ] {
        let req = test::TestRequest::post()
            .uri("/api/v1/api-tokens")
            .insert_header(("Authorization", format!("Bearer {raw}")))
            .set_json(body)
            .to_request();
        let created: serde_json::Value = test::call_and_read_body_json(&app, req).await;
        assert_eq!(
            created["scopes"]
                .as_array()
                .unwrap()
                .contains(&json!("instance_admin")),
            expected
        );
    }
    for body in [
        json!({"enabled":true,"bot_token":"123:secret"}),
        json!({"enabled":false}),
    ] {
        let req = test::TestRequest::post()
            .uri("/api/v1/settings/telegram")
            .insert_header(("Authorization", format!("Bearer {raw}")))
            .set_json(body)
            .to_request();
        let public: serde_json::Value = test::call_and_read_body_json(&app, req).await;
        assert_eq!(public["has_bot_token"], true);
        assert!(public.get("bot_token").is_none());
    }
    let stored: petmon::domain::settings::TelegramConfig =
        petmon::repo::settings::get(&pool, "telegram")
            .await
            .unwrap();
    assert_eq!(stored.bot_token.as_deref(), Some("123:secret"));
    let (_, read_admin) = token(&pool, "alice", &["api_read", "instance_admin"]).await;
    let req = test::TestRequest::post()
        .uri("/api/v1/settings/telegram")
        .insert_header(("Authorization", format!("Bearer {read_admin}")))
        .set_json(json!({"enabled":true}))
        .to_request();
    assert_eq!(
        test::call_service(&app, req).await.status(),
        StatusCode::FORBIDDEN
    );
}

#[actix_web::test]
async fn activation_cannot_bypass_attenuation_or_a_concurrent_scope_change() {
    let pool = pool().await;
    let (_, raw) = token(&pool, "alice", &["api_write"]).await;
    let (id, _) = token(&pool, "alice", &["all"]).await;
    api_tokens::deactivate(&pool, &id).await.unwrap();
    let app = app!(pool);
    let req = test::TestRequest::post()
        .uri(&format!("/api/v1/api-tokens/{id}/activate"))
        .insert_header(("Authorization", format!("Bearer {raw}")))
        .to_request();
    assert_eq!(
        test::call_service(&app, req).await.status(),
        StatusCode::FORBIDDEN
    );
    api_tokens::update_scopes_owned(&pool, &id, "alice", &["api_write".into()])
        .await
        .unwrap();
    assert!(api_tokens::activate_owned(&pool, &id, "alice", "all")
        .await
        .is_err());
    assert!(
        !api_tokens::get_owned(&pool, &id, "alice")
            .await
            .unwrap()
            .active
    );
    let req = test::TestRequest::post()
        .uri(&format!("/api/v1/api-tokens/{id}/activate"))
        .insert_header(("Authorization", format!("Bearer {raw}")))
        .to_request();
    assert_eq!(
        test::call_service(&app, req).await.status(),
        StatusCode::NO_CONTENT
    );
}
