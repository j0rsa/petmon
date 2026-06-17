use actix_web::{get, web, HttpRequest, HttpResponse};
use mime_guess::from_path;
use rust_embed::RustEmbed;
use std::path::PathBuf;

use crate::auth::AppState;

#[derive(RustEmbed)]
#[folder = "docs"]
#[include = "api.yaml"]
pub struct DocsAssets;

pub async fn serve_frontend(req: HttpRequest, state: web::Data<AppState>) -> HttpResponse {
    let path = req.path().trim_start_matches('/');

    let Some(ref dir) = state.static_dir else {
        return HttpResponse::ServiceUnavailable()
            .content_type("text/html; charset=utf-8")
            .body("<pre>STATIC_DIR is not set. Set it to the frontend/dist directory.</pre>");
    };

    let base = PathBuf::from(dir);
    let file_path = base.join(path);
    if file_path.is_file() {
        return match std::fs::read(&file_path) {
            Ok(bytes) => {
                let mime = from_path(&file_path).first_or_octet_stream();
                HttpResponse::Ok().content_type(mime.as_ref()).body(bytes)
            }
            Err(_) => HttpResponse::InternalServerError().body("Failed to read file"),
        };
    }

    // SPA fallback
    let index = base.join("index.html");
    match std::fs::read(&index) {
        Ok(bytes) => HttpResponse::Ok()
            .content_type("text/html; charset=utf-8")
            .body(bytes),
        Err(_) => HttpResponse::NotFound().body("index.html not found in STATIC_DIR"),
    }
}

#[get("/api-docs")]
pub async fn serve_api_docs() -> HttpResponse {
    let html = r##"<!doctype html>
<html>
<head>
  <title>petmon API</title>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: "/api-docs/openapi.yaml",
      dom_id: "#swagger-ui",
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
      layout: "BaseLayout",
      deepLinking: true,
    });
  </script>
</body>
</html>"##;
    HttpResponse::Ok()
        .content_type("text/html; charset=utf-8")
        .body(html)
}

#[get("/api-docs/openapi.yaml")]
pub async fn serve_openapi_yaml() -> HttpResponse {
    match DocsAssets::get("api.yaml") {
        Some(content) => HttpResponse::Ok()
            .content_type("application/yaml")
            .body(content.data.to_vec()),
        None => HttpResponse::NotFound().body("api.yaml not found"),
    }
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(serve_api_docs);
    cfg.service(serve_openapi_yaml);
    cfg.default_service(web::get().to(serve_frontend));
}
