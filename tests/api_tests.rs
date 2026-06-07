use actix_web::{test, web, App};
use sqlx::SqlitePool;

async fn setup_test_pool() -> SqlitePool {
    let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
    sqlx::migrate!("./migrations").run(&pool).await.unwrap();
    pool
}

#[actix_web::test]
async fn test_health_endpoint() {
    let app = test::init_service(App::new().configure(catmon::api::configure)).await;
    let req = test::TestRequest::get().uri("/api/v1/health").to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 200);
}

#[actix_web::test]
async fn test_cats_crud() {
    let pool = setup_test_pool().await;
    let pool_data = web::Data::new(pool);
    let app = test::init_service(
        App::new()
            .app_data(pool_data.clone())
            .configure(catmon::api::configure),
    )
    .await;

    let req = test::TestRequest::post()
        .uri("/api/v1/cats")
        .set_json(serde_json::json!({ "name": "Whiskers" }))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 201);
    let body: serde_json::Value = test::read_body_json(resp).await;
    let cat_id = body["id"].as_str().unwrap().to_string();

    let req = test::TestRequest::get()
        .uri(&format!("/api/v1/cats/{cat_id}"))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 200);

    let req = test::TestRequest::delete()
        .uri(&format!("/api/v1/cats/{cat_id}"))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 204);
}
