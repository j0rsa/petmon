use actix_web::{http::StatusCode, test, web, App};
use petmon::{
    api,
    auth::AppState,
    domain::{push::PushSubscribeRequest, settings::CreateApiToken},
    middleware,
    repo::{api_tokens, push_subscriptions},
};
use serde_json::json;

#[actix_web::test]
async fn subscription_requires_owner_or_original_browser_keys() {
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    petmon::db::run_migrations(&pool).await.unwrap();
    let req: PushSubscribeRequest = serde_json::from_value(json!({"endpoint":"https://push.example.test/secret-endpoint","keys":{"p256dh":"original-key","auth":"original-auth"}})).unwrap();
    push_subscriptions::upsert(&pool, "alice", &req, None)
        .await
        .unwrap();
    let (_, bob_token) = api_tokens::create(
        &pool,
        CreateApiToken {
            alias: None,
            scopes: Some(vec![petmon::domain::auth::Scope::All]),
            created_by: None,
            owner_subject: Some("bob".into()),
        },
    )
    .await
    .unwrap();
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(AppState::new(
                pool.clone(),
                false,
                None,
                None,
            )))
            .service(
                web::scope("/api/v1")
                    .wrap(middleware::auth::RequireAuth)
                    .configure(api::push::configure),
            ),
    )
    .await;
    for (route, status) in [
        ("test", StatusCode::BAD_REQUEST),
        ("unsubscribe", StatusCode::NOT_FOUND),
    ] {
        let request = test::TestRequest::post()
            .uri(&format!("/api/v1/push/{route}"))
            .insert_header(("Authorization", format!("Bearer {}", bob_token.token)))
            .set_json(json!({"endpoint":req.endpoint}))
            .to_request();
        assert_eq!(test::call_service(&app, request).await.status(), status);
    }
    let mut wrong_keys = req.clone();
    wrong_keys.keys.auth = "forged".into();
    let request = test::TestRequest::post()
        .uri("/api/v1/push/subscribe")
        .insert_header(("Authorization", format!("Bearer {}", bob_token.token)))
        .set_json(&wrong_keys)
        .to_request();
    assert_eq!(
        test::call_service(&app, request).await.status(),
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        push_subscriptions::get_by_endpoint(&pool, &req.endpoint)
            .await
            .unwrap()
            .reader_key,
        "alice"
    );
    // A browser signing into a different account possesses the original keys.
    let request = test::TestRequest::post()
        .uri("/api/v1/push/subscribe")
        .insert_header(("Authorization", format!("Bearer {}", bob_token.token)))
        .set_json(&req)
        .to_request();
    assert_eq!(
        test::call_service(&app, request).await.status(),
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        push_subscriptions::get_by_endpoint(&pool, &req.endpoint)
            .await
            .unwrap()
            .reader_key,
        "bob"
    );
    assert!(
        push_subscriptions::delete_owned(&pool, &req.endpoint, "alice")
            .await
            .is_err()
    );
    let request = test::TestRequest::post()
        .uri("/api/v1/push/unsubscribe")
        .insert_header(("Authorization", format!("Bearer {}", bob_token.token)))
        .set_json(json!({"endpoint":req.endpoint}))
        .to_request();
    assert_eq!(
        test::call_service(&app, request).await.status(),
        StatusCode::NO_CONTENT
    );
}
