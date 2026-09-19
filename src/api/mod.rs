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
            .wrap(crate::middleware::auth::RequireAuth)
            .configure(configure_full),
    );
}

/// Register the complete API inside an authenticated scope. Embedders can append
/// routes to that same scope; `configure` supplies the standalone scope wrapper.
pub fn configure_full(cfg: &mut web::ServiceConfig) {
    auth::configure_public(cfg);
    auth::configure_protected(cfg);
    health::configure(cfg);
    info::configure(cfg);
    pets::configure(cfg);
    nutrition::configure(cfg);
    elimination::configure(cfg);
    weight::configure(cfg);
    days::configure(cfg);
    notes::configure(cfg);
    notifications::configure(cfg);
    push::configure(cfg);
    settings::configure(cfg);
    settings::configure_api_tokens(cfg);
    user_settings::configure(cfg);
    shortcuts::configure(cfg);
}
