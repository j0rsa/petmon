pub mod analytics;
pub mod records;
pub mod schedules;

use actix_web::web;

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/nutrition")
            .configure(records::configure)
            .configure(analytics::configure)
            .configure(schedules::configure),
    );
}
