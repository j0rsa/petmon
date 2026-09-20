use actix_web::{dev::Service, http::StatusCode, test, web, App, HttpMessage};
use petmon::domain::auth::Scope;
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
            scopes: Some(scopes.iter().map(|s| s.parse().unwrap()).collect()),
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
async fn invalid_scope_values_are_rejected_by_rest_mcp_and_stored_credentials() {
    let pool = pool().await;
    let (id, raw) = token(&pool, "alice", &["all"]).await;
    let app = app!(pool);
    let state = AppState::new(pool.clone(), false, None, None);
    let context = state.context(Identity::dev());
    for scopes in [
        json!(["instance_admin"]),
        json!(["unknown"]),
        json!(["all", "unknown"]),
        json!([1]),
    ] {
        let req = test::TestRequest::post()
            .uri("/api/v1/api-tokens")
            .insert_header(("Authorization", format!("Bearer {raw}")))
            .set_json(json!({"scopes": scopes}))
            .to_request();
        assert_eq!(
            test::call_service(&app, req).await.status(),
            StatusCode::BAD_REQUEST
        );
        let req = test::TestRequest::patch()
            .uri(&format!("/api/v1/api-tokens/{id}/scopes"))
            .insert_header(("Authorization", format!("Bearer {raw}")))
            .set_json(json!({"scopes": scopes}))
            .to_request();
        assert_eq!(
            test::call_service(&app, req).await.status(),
            StatusCode::BAD_REQUEST
        );
        for tool in ["api-tokens.scopes.update", "api-tokens/scopes/update"] {
            let result = petmon::mcp::tools::dispatch(
                &context,
                tool,
                Some(json!({"id":id,"scopes":scopes})),
                chrono_tz::UTC,
            )
            .await;
            assert!(matches!(
                result,
                Err(petmon::error::AppError::BadRequest(_))
            ));
        }
    }
    assert_eq!(
        api_tokens::get_owned(&pool, &id, "alice")
            .await
            .unwrap()
            .scopes_vec()
            .unwrap(),
        vec![Scope::All]
    );
    for invalid in ["unknown", "all,unknown", "instance_admin"] {
        sqlx::query("UPDATE api_tokens SET scopes = ? WHERE id = ?")
            .bind(invalid)
            .bind(&id)
            .execute(&pool)
            .await
            .unwrap();
        let req = test::TestRequest::get()
            .uri("/api/v1/auth/me")
            .insert_header(("Authorization", format!("Bearer {raw}")))
            .to_request();
        assert_eq!(
            test::call_service(&app, req).await.status(),
            StatusCode::UNAUTHORIZED
        );
    }
}

#[actix_web::test]
async fn role_and_literal_all_are_both_required_and_revocation_is_live() {
    let pool = pool().await;
    instance_admins::grant(&pool, "alice").await.unwrap();
    instance_admins::grant(&pool, "recovery").await.unwrap();
    let (_, ordinary) = token(&pool, "alice", &["api_read", "api_write", "mcp"]).await;
    let (_, legacy) = token(&pool, "alice", &[]).await;
    let (_, admin_token) = token(&pool, "alice", &["all"]).await;
    let (_, forged_role) = token(&pool, "bob", &["all"]).await;
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
    assert!(me.get("capabilities").is_none());
    assert_eq!(me["kind"], "api_token");
    assert_eq!(me["scopes"], json!(["api_read", "api_write", "mcp"]));
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
        scopes: [Scope::ApiRead].into_iter().collect(),
        token_created_by: None,
        owner_subject: None,
    };
    assert!(admin::require_instance_admin(&pool, &oidc).await.is_ok());
    assert!(oidc.has_scope(Scope::ApiRead));
    assert!(!oidc.has_scope(Scope::ApiWrite));
    assert!("instance_admin".parse::<Scope>().is_err());
    assert!(
        admin::attenuate_scopes(&pool, &oidc, Some(vec![Scope::All]))
            .await
            .is_err()
    );
    assert!(
        admin::attenuate_scopes(&pool, &oidc, Some(vec![Scope::ApiRead]))
            .await
            .is_ok()
    );
}

#[actix_web::test]
async fn administration_is_explicit_and_preserves_bot_secrets() {
    let pool = pool().await;
    instance_admins::grant(&pool, "alice").await.unwrap();
    let (_, raw) = token(&pool, "alice", &["all"]).await;
    let app = app!(pool);
    for (body, expected) in [
        (json!({}), json!(["all"])),
        (
            json!({"scopes":["api_read","api_write","mcp"]}),
            json!(["api_read", "api_write", "mcp"]),
        ),
    ] {
        let req = test::TestRequest::post()
            .uri("/api/v1/api-tokens")
            .insert_header(("Authorization", format!("Bearer {raw}")))
            .set_json(body)
            .to_request();
        let created: serde_json::Value = test::call_and_read_body_json(&app, req).await;
        assert_eq!(created["scopes"], expected);
    }
    let req = test::TestRequest::post()
        .uri("/api/v1/api-tokens")
        .insert_header(("Authorization", format!("Bearer {raw}")))
        .set_json(json!({"scopes":["all","instance_admin"]}))
        .to_request();
    assert_eq!(
        test::call_service(&app, req).await.status(),
        StatusCode::BAD_REQUEST
    );
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
    let (_, read_admin) = token(&pool, "alice", &["api_read"]).await;
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
async fn token_reactivation_and_owner_batch_revoke_require_instance_administrator() {
    let pool = pool().await;
    let (_, ordinary) = token(&pool, "alice", &["api_write"]).await;
    let (id, _) = token(&pool, "alice", &["all"]).await;
    let (second_id, _) = token(&pool, "alice", &["api_read"]).await;
    let (bob_id, _) = token(&pool, "bob", &["all"]).await;
    api_tokens::deactivate(&pool, &id).await.unwrap();
    let app = app!(pool);
    let req = test::TestRequest::post()
        .uri(&format!("/api/v1/admin/api-tokens/{id}/activate"))
        .insert_header(("Authorization", format!("Bearer {ordinary}")))
        .to_request();
    assert_eq!(
        test::call_service(&app, req).await.status(),
        StatusCode::FORBIDDEN
    );
    instance_admins::grant(&pool, "admin").await.unwrap();
    let (_, admin) = token(&pool, "admin", &["all"]).await;
    let req = test::TestRequest::post()
        .uri(&format!("/api/v1/admin/api-tokens/{id}/activate"))
        .insert_header(("Authorization", format!("Bearer {admin}")))
        .to_request();
    assert_eq!(
        test::call_service(&app, req).await.status(),
        StatusCode::NO_CONTENT
    );
    assert!(
        api_tokens::get_owned(&pool, &id, "alice")
            .await
            .unwrap()
            .active
    );

    let req = test::TestRequest::post()
        .uri("/api/v1/admin/api-tokens/revoke-owner")
        .insert_header(("Authorization", format!("Bearer {ordinary}")))
        .set_json(json!({"owner_subject":"alice"}))
        .to_request();
    assert_eq!(
        test::call_service(&app, req).await.status(),
        StatusCode::FORBIDDEN
    );
    let req = test::TestRequest::post()
        .uri("/api/v1/admin/api-tokens/revoke-owner")
        .insert_header(("Authorization", format!("Bearer {admin}")))
        .set_json(json!({"owner_subject":"alice"}))
        .to_request();
    let body: serde_json::Value = test::call_and_read_body_json(&app, req).await;
    assert_eq!(body["revoked"], 3);
    assert!(
        !api_tokens::get_owned(&pool, &id, "alice")
            .await
            .unwrap()
            .active
    );
    assert!(
        !api_tokens::get_owned(&pool, &second_id, "alice")
            .await
            .unwrap()
            .active
    );
    assert!(
        api_tokens::get_owned(&pool, &bob_id, "bob")
            .await
            .unwrap()
            .active
    );
}

#[actix_web::test]
async fn ordinary_full_tokens_cannot_acquire_all_even_before_a_future_role_grant() {
    let pool = pool().await;
    let state = AppState::new(pool.clone(), false, None, None);
    let app = app!(pool);
    for scopes in [vec!["api_read", "api_write", "mcp"], vec![]] {
        let (id, raw) = token(&pool, "alice", &scopes).await;
        for has_role in [false, true] {
            if has_role {
                instance_admins::grant(&pool, "alice").await.unwrap();
            }
            for body in [json!({"scopes":["all"]}), json!({})] {
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
            let req = test::TestRequest::patch()
                .uri(&format!("/api/v1/api-tokens/{id}/scopes"))
                .insert_header(("Authorization", format!("Bearer {raw}")))
                .set_json(json!({"scopes":["all"]}))
                .to_request();
            assert_eq!(
                test::call_service(&app, req).await.status(),
                StatusCode::FORBIDDEN
            );
            let identity = Identity {
                subject: "alice".into(),
                email: None,
                name: None,
                kind: IdentityKind::ApiToken {
                    token_id: id.clone(),
                },
                scopes: scopes.iter().map(|s| s.parse().unwrap()).collect(),
                token_created_by: None,
                owner_subject: Some("alice".into()),
            };
            for tool in ["api-tokens.scopes.update", "api-tokens/scopes/update"] {
                let result = petmon::mcp::tools::dispatch(
                    &state.context(identity.clone()),
                    tool,
                    Some(json!({"id":id,"scopes":["all"]})),
                    chrono_tz::UTC,
                )
                .await;
                assert!(matches!(result, Err(petmon::error::AppError::Forbidden(_))));
            }
        }
        instance_admins::grant(&pool, "recovery").await.unwrap();
        instance_admins::revoke(&pool, "alice").await.unwrap();
    }
}

#[actix_web::test]
async fn interactive_administration_requires_live_role_and_endpoint_scope() {
    let pool = pool().await;
    instance_admins::grant(&pool, "alice").await.unwrap();
    for (subject, scopes, expected_read, expected_write) in [
        (
            "alice",
            vec!["api_read"],
            StatusCode::OK,
            StatusCode::FORBIDDEN,
        ),
        (
            "alice",
            vec!["api_write"],
            StatusCode::FORBIDDEN,
            StatusCode::OK,
        ),
        (
            "bob",
            vec!["all"],
            StatusCode::FORBIDDEN,
            StatusCode::FORBIDDEN,
        ),
    ] {
        let identity = Identity {
            subject: subject.into(),
            email: None,
            name: None,
            kind: IdentityKind::Oidc,
            scopes: scopes.iter().map(|s| s.parse().unwrap()).collect(),
            token_created_by: None,
            owner_subject: None,
        };
        let app = test::init_service(
            App::new()
                .app_data(web::Data::new(AppState::new(
                    pool.clone(),
                    false,
                    None,
                    None,
                )))
                .wrap_fn(move |req, srv| {
                    req.extensions_mut().insert(identity.clone());
                    srv.call(req)
                })
                .service(web::scope("/api/v1").configure(api::settings::configure)),
        )
        .await;
        let req = test::TestRequest::get()
            .uri("/api/v1/settings/telegram")
            .to_request();
        assert_eq!(test::call_service(&app, req).await.status(), expected_read);
        let req = test::TestRequest::post()
            .uri("/api/v1/settings/telegram")
            .set_json(json!({"enabled":false}))
            .to_request();
        assert_eq!(test::call_service(&app, req).await.status(), expected_write);
    }
}
