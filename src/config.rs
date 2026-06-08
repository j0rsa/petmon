use std::env;

#[derive(Debug, Clone)]
pub struct Config {
    pub host: String,
    pub port: u16,
    pub database_url: String,
    pub timezone: String,
    pub import_max_bytes: usize,
    /// OTLP/HTTP endpoint for trace export (e.g. `http://localhost:4318`).
    /// When absent, tracing spans are emitted to stdout only.
    pub otlp_endpoint: Option<String>,
    pub service_name: String,
}

impl Config {
    pub fn from_env() -> Self {
        let _ = dotenvy::dotenv();
        Config {
            host: env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string()),
            port: env::var("PORT")
                .unwrap_or_else(|_| "8080".to_string())
                .parse()
                .unwrap_or(8080),
            database_url: env::var("DATABASE_URL")
                .unwrap_or_else(|_| "sqlite:petmon.db".to_string()),
            timezone: env::var("TIMEZONE").unwrap_or_else(|_| "UTC".to_string()),
            import_max_bytes: env::var("IMPORT_MAX_BYTES")
                .unwrap_or_else(|_| "1048576".to_string())
                .parse()
                .unwrap_or(1_048_576),
            otlp_endpoint: env::var("OTEL_EXPORTER_OTLP_ENDPOINT").ok(),
            service_name: env::var("OTEL_SERVICE_NAME")
                .unwrap_or_else(|_| "petmon".to_string()),
        }
    }
}
