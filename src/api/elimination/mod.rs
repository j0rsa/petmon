pub mod analytics;
pub mod classifier;
pub mod duration_profile;
pub mod records;

use actix_web::web;

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/elimination")
            .configure(records::configure)
            .configure(analytics::configure)
            .configure(duration_profile::configure)
            .configure(classifier::configure),
    );
}
