pub mod nutrition;
pub mod pets;
pub mod days;
pub mod health;
pub mod notes;

use actix_web::web;

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/api/v1")
            .configure(health::configure)
            .configure(pets::configure)
            .configure(nutrition::configure)
            .configure(days::configure)
            .configure(notes::configure),
    );
}
