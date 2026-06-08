use actix_web::{get, web, HttpResponse};
use serde_json::json;

#[get("/health")]
pub async fn health() -> HttpResponse {
    HttpResponse::Ok().json(json!({ "status": "ok" }))
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(health);
}
