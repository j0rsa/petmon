use actix_web::{test, web, App};
use sqlx::SqlitePool;

async fn setup_test_pool() -> SqlitePool {
    let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
    sqlx::migrate!("./migrations").run(&pool).await.unwrap();
    pool
}

#[actix_web::test]
async fn test_health_endpoint() {
    let app = test::init_service(App::new().configure(petmon::api::configure)).await;
    let req = test::TestRequest::get().uri("/api/v1/health").to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 200);
}

#[actix_web::test]
async fn test_pets_crud() {
    let pool = setup_test_pool().await;
    let pool_data = web::Data::new(pool);
    let app = test::init_service(
        App::new()
            .app_data(pool_data.clone())
            .configure(petmon::api::configure),
    )
    .await;

    let req = test::TestRequest::post()
        .uri("/api/v1/pets")
        .set_json(serde_json::json!({ "name": "Whiskers", "species": "cat" }))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 201);
    let body: serde_json::Value = test::read_body_json(resp).await;
    let pet_id = body["id"].as_str().unwrap().to_string();
    assert_eq!(body["species"].as_str(), Some("cat"));
    assert_eq!(body["status"].as_str(), Some("alive"));

    let req = test::TestRequest::get()
        .uri(&format!("/api/v1/pets/{pet_id}"))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 200);

    let req = test::TestRequest::delete()
        .uri(&format!("/api/v1/pets/{pet_id}"))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 204);
}
