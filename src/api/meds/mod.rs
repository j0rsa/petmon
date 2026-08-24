pub mod assignments;
pub mod bundles;
pub mod formulations;
pub mod intake;
pub mod medications;

use actix_web::web;

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/meds")
            .configure(formulations::configure)
            .configure(assignments::configure)
            .configure(bundles::configure)
            .configure(intake::configure)
            .configure(medications::configure),
    );
}
