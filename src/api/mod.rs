pub mod auth;
pub mod days;
pub mod health;
pub mod info;
pub mod notes;
pub mod nutrition;
pub mod pets;
pub mod settings;

use actix_web::web;

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/api/v1")
            .configure(auth::configure_public)
            .configure(auth::configure_protected)
            .configure(health::configure)
            .configure(pets::configure)
            .configure(nutrition::configure)
            .configure(days::configure)
            .configure(notes::configure)
            .configure(settings::configure),
    );
}
