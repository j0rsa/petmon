use actix_web::{web, HttpRequest, HttpResponse};
use mime_guess::from_path;
use rust_embed::RustEmbed;

#[derive(RustEmbed)]
#[folder = "frontend/dist"]
pub struct FrontendAssets;

pub async fn serve_frontend(req: HttpRequest) -> HttpResponse {
    let path = req.path().trim_start_matches('/');

    if let Some(content) = FrontendAssets::get(path) {
        let mime = from_path(path).first_or_octet_stream();
        return HttpResponse::Ok().content_type(mime.as_ref()).body(content.data.to_vec());
    }

    if let Some(index) = FrontendAssets::get("index.html") {
        return HttpResponse::Ok()
            .content_type("text/html; charset=utf-8")
            .body(index.data.to_vec());
    }

    HttpResponse::NotFound().body("Not found")
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.default_service(web::get().to(serve_frontend));
}
