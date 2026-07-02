pub mod auth;
pub mod days;
pub mod elimination;
pub mod health;
pub mod health_state;
pub mod info;
pub mod notes;
pub mod nutrition;
pub mod pets;
pub mod settings;
pub mod weight;

use actix_web::web;

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/api/v1")
            .configure(auth::configure_public)
            .configure(auth::configure_protected)
            .configure(health::configure)
            .configure(pets::configure)
            .configure(nutrition::configure)
            .configure(elimination::configure)
            .configure(weight::configure)
            .configure(health_state::configure)
            .configure(days::configure)
            .configure(notes::configure)
            .configure(settings::configure),
    );
}
