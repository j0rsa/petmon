pub mod records;

use actix_web::web;

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/health")
            .service(web::scope("/weight").configure(records::configure))
            .service(web::scope("/state").configure(super::health_state::records::configure))
            .configure(super::meds::configure),
    );
}
