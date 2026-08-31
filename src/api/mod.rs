pub mod auth;
pub mod days;
pub mod elimination;
pub mod health;
pub mod health_state;
pub mod info;
pub mod meds;
pub mod notes;
pub mod notifications;
pub mod nutrition;
pub mod pet_settings;
pub mod pets;
pub mod push;
pub mod settings;
pub mod shortcuts;
pub mod user_settings;
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
            .configure(days::configure)
            .configure(notes::configure)
            .configure(notifications::configure)
            .configure(push::configure)
            .configure(settings::configure)
            .configure(user_settings::configure),
    );
}
