pub mod records;

use actix_web::web;

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/health")
            .service(web::scope("/state").configure(records::configure)),
    );
}
