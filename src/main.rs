use actix_web::{web, App, HttpServer};
use petmon::{api, assets, auth, config, db, mcp, middleware, services, telemetry};
use tracing_actix_web::TracingLogger;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let config = config::Config::from_env();

    let env_filter = EnvFilter::from_default_env()
        .add_directive("petmon=info".parse()?)
        .add_directive("tracing_actix_web=info".parse()?)
        .add_directive("sqlx=info".parse()?);

    let otel_provider = telemetry::init(
        &config.service_name,
        config.otlp_endpoint.as_deref(),
        env_filter,
    )?;

    tracing::info!(
        host = %config.host,
        port = config.port,
        timezone = %config.timezone,
        otlp = ?config.otlp_endpoint,
        "starting petmon",
    );

    let pool = db::create_pool(&config).await?;
    db::run_migrations(&pool).await?;
    tracing::info!(database_url = %config.database_url, "database migrations applied");

    services::startup::sync_oidc_from_env(&pool).await;

    let dev_mode = std::env::var("DEV_MODE")
        .map(|v| matches!(v.to_lowercase().as_str(), "1" | "true" | "yes"))
        .unwrap_or(false);

    // Build OIDC validator from current DB config
    let oidc_cfg: petmon::domain::settings::OidcConfig =
        petmon::repo::settings::get(&pool, "oidc").await?;
    let oidc_validator = auth::oidc::OidcValidator::new(&oidc_cfg);

    if !dev_mode && oidc_validator.is_none() {
        tracing::error!(
            "No authentication configured and DEV_MODE is off. \
             Set DEV_MODE=true for local development, or configure OIDC via \
             OIDC_ISSUER_URL / OIDC_CLIENT_ID / OIDC_CLIENT_SECRET."
        );
        anyhow::bail!("startup aborted: no authentication configured");
    }

    if dev_mode {
        tracing::warn!(
            "DEV_MODE is enabled — all requests are unauthenticated. Do not use in production."
        );
    }

    let timezone: chrono_tz::Tz = config.timezone.parse().unwrap_or_else(|_| {
        tracing::warn!(tz = %config.timezone, "unknown TIMEZONE, falling back to UTC");
        chrono_tz::UTC
    });

    let state = web::Data::new(auth::AppState::new_with_tz(
        pool,
        dev_mode,
        oidc_validator,
        config.static_dir.clone(),
        timezone,
    ));
    let bind_addr = format!("{}:{}", config.host, config.port);

    HttpServer::new(move || {
        App::new()
            .wrap(TracingLogger::<telemetry::HealthFilteredSpanBuilder>::new())
            .wrap(actix_web::middleware::NormalizePath::trim())
            .app_data(state.clone())
            .app_data(
                web::JsonConfig::default()
                    .limit(config.import_max_bytes)
                    .error_handler(|err, _req| {
                        let response =
                            actix_web::HttpResponse::BadRequest().json(serde_json::json!({
                                "error": "BAD_REQUEST",
                                "message": format!("Invalid JSON: {err}")
                            }));
                        actix_web::error::InternalError::from_response(err, response).into()
                    }),
            )
            .service(
                web::scope("/api/v1")
                    .wrap(middleware::auth::RequireAuth)
                    .configure(api::auth::configure_public)
                    .configure(api::auth::configure_protected)
                    .configure(api::health::configure)
                    .configure(api::info::configure)
                    .configure(api::pets::configure)
                    .configure(api::nutrition::configure)
                    .configure(api::days::configure)
                    .configure(api::notes::configure)
                    .configure(api::settings::configure),
            )
            .service(
                web::scope("/mcp")
                    .wrap(middleware::auth::RequireAuth)
                    .configure(mcp::transport::configure),
            )
            .configure(assets::configure)
    })
    .bind(&bind_addr)?
    .run()
    .await?;

    if let Some(provider) = otel_provider {
        telemetry::shutdown(provider);
    }

    Ok(())
}
