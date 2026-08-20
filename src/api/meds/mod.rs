pub mod assignments;
pub mod intake;
pub mod medications;

use actix_web::web;

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/meds")
            .configure(assignments::configure)
            .configure(intake::configure)
            .configure(medications::configure),
    );
}
