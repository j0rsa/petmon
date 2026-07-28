pub mod analytics;
pub mod records;
pub mod schedules;
pub mod status;

use actix_web::web;

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/nutrition")
            .configure(records::configure)
            .configure(analytics::configure)
            .configure(schedules::configure)
            .configure(status::configure),
    );
}
