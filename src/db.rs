use crate::config::Config;
use crate::error::AppError;
use sqlx::{sqlite::SqliteConnectOptions, sqlite::SqlitePoolOptions, ConnectOptions, SqlitePool};
use std::str::FromStr;

pub async fn create_pool(config: &Config) -> Result<SqlitePool, AppError> {
    let options = SqliteConnectOptions::from_str(&config.database_url)
        .map_err(|e| AppError::Internal(format!("Invalid database URL: {e}")))?
        .create_if_missing(true)
        .foreign_keys(true)
        .disable_statement_logging();

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to connect to database: {e}")))?;
    Ok(pool)
}

pub async fn run_migrations(pool: &SqlitePool) -> Result<(), AppError> {
    sqlx::migrate!("./migrations")
        .run(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Migration failed: {e}")))?;
    Ok(())
}
