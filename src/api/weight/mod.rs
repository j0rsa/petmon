pub mod records;

use actix_web::web;

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(web::scope("/weight-records").configure(records::configure));
}
