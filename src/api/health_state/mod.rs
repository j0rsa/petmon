pub mod records;

use actix_web::web;

/// Routes are mounted under `/health/state` via `api::weight::configure`.
pub fn configure(_cfg: &mut web::ServiceConfig) {}
