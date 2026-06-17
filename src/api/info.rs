use actix_web::{get, HttpResponse};
use serde::Serialize;

include!(concat!(env!("OUT_DIR"), "/version_info.rs"));

#[derive(Serialize)]
pub struct AppInfo {
    pub version: &'static str,
    pub git_sha: &'static str,
}

#[get("/info")]
pub async fn info() -> HttpResponse {
    HttpResponse::Ok().json(AppInfo {
        version: VERSION,
        git_sha: GIT_SHA,
    })
}

pub fn configure(cfg: &mut actix_web::web::ServiceConfig) {
    cfg.service(info);
}
