use actix_web::{test, web, App};
use petmon::{
    api,
    auth::AppState,
    domain::pet::{CreatePet, Pet},
    middleware,
    repo::pets,
};

#[actix_web::test]
async fn cloud_transfer_is_a_checked_care_bundle_without_credentials_or_message_references() {
    let pool = sqlx::SqlitePool::connect("sqlite::memory:").await.unwrap();
    petmon::db::run_migrations(&pool).await.unwrap();
    let pet = pets::create_pet(
        &pool,
        Pet::new(CreatePet {
            name: "Mittens".into(),
            species: Default::default(),
            status: Default::default(),
            breed: None,
            birth_date: None,
            blood_type: None,
            color: None,
            feeding_notes: None,
            telegram_nutrition_chat_id: Some("-100-secret".into()),
            telegram_nutrition_thread_id: Some("42".into()),
            telegram_meds_chat_id: Some("-100-other".into()),
            telegram_meds_thread_id: None,
            elimination_auto_categorize_by_duration: false,
        }),
    )
    .await
    .unwrap();
    let state = web::Data::new(AppState::new(pool, true, None, None));
    let app = test::init_service(
        App::new().app_data(state).service(
            web::scope("/api/v1")
                .wrap(middleware::auth::RequireAuth)
                .configure(api::configure_full),
        ),
    )
    .await;
    let response = test::call_service(
        &app,
        test::TestRequest::get()
            .uri("/api/v1/exports/transfer/oss")
            .to_request(),
    )
    .await;
    assert_eq!(response.status(), 200);
    assert_eq!(response.headers().get("cache-control").unwrap(), "no-store");
    let bundle: serde_json::Value = test::read_body_json(response).await;
    assert_eq!(bundle["format"], "petmon-transfer");
    assert_eq!(bundle["version"], 1);
    assert_eq!(
        uuid::Uuid::parse_str(bundle["data"]["pets"][0]["id"].as_str().unwrap()).unwrap(),
        pet.id
    );
    assert_eq!(
        bundle["data"]["pets"][0]["telegram_nutrition_chat_id"],
        "-100-secret"
    );
    assert_eq!(
        bundle["data"]["pets"][0]["telegram_nutrition_thread_id"],
        "42"
    );
    assert_eq!(
        bundle["data"]["pets"][0]["telegram_meds_chat_id"],
        "-100-other"
    );
    assert!(bundle["data"]["pets"][0].get("telegram_bot_id").is_none());
    assert!(bundle["data"]["nutrition_records"]
        .as_array()
        .unwrap()
        .iter()
        .all(|record| record.get("telegram_message_id").is_none()));
    assert_eq!(
        bundle["manifest"]["checksums"].as_object().unwrap().len(),
        14
    );
}
