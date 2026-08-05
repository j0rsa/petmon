use sqlx::SqlitePool;
use std::time::Duration;
use tracing::{debug, warn};

const RETRAIN_INTERVAL: Duration = Duration::from_secs(60);
const RETRAIN_BATCH_LIMIT: i64 = 5;

/// Background worker that retrains pending elimination classifiers.
pub fn spawn(pool: SqlitePool) {
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(RETRAIN_INTERVAL).await;
            match crate::services::elimination_classifier::process_pending_retrains(
                &pool,
                RETRAIN_BATCH_LIMIT,
            )
            .await
            {
                Ok(n) if n > 0 => debug!(count = n, "elimination classifiers retrained"),
                Ok(_) => {}
                Err(e) => warn!(error = %e, "elimination classifier retrain worker failed"),
            }
        }
    });
}
