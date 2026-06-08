pub mod analytics;
pub mod cats;
pub mod days;
pub mod entries;
pub mod health;
pub mod imports;
pub mod notes;
pub mod schedules;

use actix_web::web;

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/api/v1")
            .configure(health::configure)
            .configure(cats::configure)
            .configure(entries::configure)
            .configure(days::configure)
            .configure(analytics::configure)
            .configure(schedules::configure)
            .configure(imports::configure)
            .configure(notes::configure),
    );
}
