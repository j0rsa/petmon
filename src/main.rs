use actix_web::{web, App, HttpServer};
use catmon::{api, assets, config, db, mcp, telemetry};
use tracing_actix_web::TracingLogger;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let config = config::Config::from_env();

    let env_filter = EnvFilter::from_default_env()
        .add_directive("catmon=info".parse()?);

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
        "starting catmon",
    );

    let pool = db::create_pool(&config).await?;
    db::run_migrations(&pool).await?;
    tracing::info!(database_url = %config.database_url, "database migrations applied");

    let pool = web::Data::new(pool);
    let bind_addr = format!("{}:{}", config.host, config.port);

    HttpServer::new(move || {
        App::new()
            .wrap(TracingLogger::default())
            .app_data(pool.clone())
            .app_data(web::JsonConfig::default().limit(config.import_max_bytes).error_handler(|err, _req| {
                let response = actix_web::HttpResponse::BadRequest().json(serde_json::json!({
                    "error": "BAD_REQUEST",
                    "message": format!("Invalid JSON: {err}")
                }));
                actix_web::error::InternalError::from_response(err, response).into()
            }))
            .configure(api::configure)
            .configure(mcp::transport::configure)
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
