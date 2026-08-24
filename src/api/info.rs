use actix_web::{get, web, HttpResponse};
use serde::Serialize;

use crate::auth::AppState;

include!(concat!(env!("OUT_DIR"), "/version_info.rs"));

#[derive(Serialize)]
pub struct AppInfo {
    pub version: &'static str,
    pub git_sha: &'static str,
    pub demo_mode: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub med_intake_shortcut_icloud_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub med_intake_automate_community_url: Option<String>,
}

#[get("/info")]
pub async fn info(state: web::Data<AppState>) -> HttpResponse {
    HttpResponse::Ok().json(AppInfo {
        version: VERSION,
        git_sha: GIT_SHA,
        demo_mode: state.demo_mode,
        med_intake_shortcut_icloud_url: state.med_intake_shortcut_icloud_url.clone(),
        med_intake_automate_community_url: state.med_intake_automate_community_url.clone(),
    })
}

pub fn configure(cfg: &mut actix_web::web::ServiceConfig) {
    cfg.service(info);
}
