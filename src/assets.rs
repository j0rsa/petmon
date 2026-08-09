use actix_web::{get, http::header, web, HttpRequest, HttpResponse};
use mime_guess::from_path;
use rust_embed::RustEmbed;
use std::path::PathBuf;

use crate::auth::AppState;

#[derive(RustEmbed)]
#[folder = "docs"]
#[include = "openapi.yaml"]
pub struct DocsAssets;

/// Cache policy for frontend static files (Vite build output).
fn cache_control_for_path(path: &str) -> Option<&'static str> {
    let path = path.trim_start_matches('/');
    if path == "index.html"
        || path == "sw.js"
        || path.ends_with(".webmanifest")
        || path == "manifest.webmanifest"
    {
        return Some("no-cache");
    }
    if path.starts_with("assets/") {
        return Some("public, max-age=31536000, immutable");
    }
    None
}

fn static_file_response(path: &str, bytes: Vec<u8>, mime: mime_guess::Mime) -> HttpResponse {
    let mut builder = HttpResponse::Ok();
    builder.content_type(mime.as_ref());
    if let Some(value) = cache_control_for_path(path) {
        builder.insert_header((header::CACHE_CONTROL, value));
    }
    builder.body(bytes)
}

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
                static_file_response(path, bytes, mime)
            }
            Err(_) => HttpResponse::InternalServerError().body("Failed to read file"),
        };
    }

    // SPA fallback
    let index = base.join("index.html");
    match std::fs::read(&index) {
        Ok(bytes) => {
            let mut builder = HttpResponse::Ok();
            builder.content_type("text/html; charset=utf-8");
            if let Some(value) = cache_control_for_path("index.html") {
                builder.insert_header((header::CACHE_CONTROL, value));
            }
            builder.body(bytes)
        }
        Err(_) => HttpResponse::NotFound().body("index.html not found in STATIC_DIR"),
    }
}

#[get("/api/docs")]
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
      url: "/api/docs/openapi.yaml",
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

#[get("/api/docs/openapi.yaml")]
pub async fn serve_openapi_yaml() -> HttpResponse {
    match DocsAssets::get("openapi.yaml") {
        Some(content) => HttpResponse::Ok()
            .content_type("application/yaml")
            .body(content.data.to_vec()),
        None => HttpResponse::NotFound().body("openapi.yaml not found"),
    }
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(serve_api_docs)
        .service(serve_openapi_yaml)
        .default_service(web::get().to(serve_frontend));
}

#[cfg(test)]
mod tests {
    use super::cache_control_for_path;

    #[test]
    fn shell_and_sw_are_not_cached() {
        assert_eq!(cache_control_for_path("index.html"), Some("no-cache"));
        assert_eq!(cache_control_for_path("sw.js"), Some("no-cache"));
        assert_eq!(
            cache_control_for_path("manifest.webmanifest"),
            Some("no-cache")
        );
    }

    #[test]
    fn hashed_assets_are_immutable() {
        assert_eq!(
            cache_control_for_path("assets/index-abc123.js"),
            Some("public, max-age=31536000, immutable")
        );
    }

    #[test]
    fn unversioned_icons_have_no_special_policy() {
        assert_eq!(cache_control_for_path("icons/192x192.png"), None);
    }
}
