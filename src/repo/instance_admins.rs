use sqlx::SqlitePool;

use crate::error::{AppError, AppResult};

pub async fn contains(pool: &SqlitePool, subject: &str) -> AppResult<bool> {
    Ok(sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM instance_admins WHERE subject = ? AND revoked_at IS NULL)",
    )
    .bind(subject)
    .fetch_one(pool)
    .await?)
}

pub async fn list(pool: &SqlitePool) -> AppResult<Vec<String>> {
    Ok(sqlx::query_scalar(
        "SELECT subject FROM instance_admins WHERE revoked_at IS NULL ORDER BY subject",
    )
    .fetch_all(pool)
    .await?)
}

fn validate_subject(subject: &str) -> AppResult<()> {
    if subject.trim().is_empty() {
        return Err(AppError::BadRequest(
            "administrator subject must not be empty".into(),
        ));
    }
    Ok(())
}

/// Offline operator authority: also consumes environment bootstrap permanently.
pub async fn grant(pool: &SqlitePool, subject: &str) -> AppResult<()> {
    validate_subject(subject)?;
    let mut tx = pool.begin().await?;
    sqlx::query("INSERT OR IGNORE INTO instance_admin_bootstrap VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))")
        .execute(&mut *tx).await?;
    sqlx::query("INSERT INTO instance_admins (subject, granted_at) VALUES (?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(subject) DO UPDATE SET granted_at = excluded.granted_at, revoked_at = NULL")
        .bind(subject).execute(&mut *tx).await?;
    tx.commit().await?;
    tracing::info!(
        actor = "operator",
        target_subject = subject,
        action = "instance_admin.grant",
        "administrator role changed"
    );
    Ok(())
}

pub async fn revoke(pool: &SqlitePool, subject: &str) -> AppResult<()> {
    // Single write statement serializes concurrent revocations in SQLite.
    let result = sqlx::query("UPDATE instance_admins SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE subject = ? AND revoked_at IS NULL AND (SELECT COUNT(*) FROM instance_admins WHERE revoked_at IS NULL) > 1")
        .bind(subject).execute(pool).await?;
    if result.rows_affected() == 0 {
        return Err(AppError::BadRequest(
            "administrator not active, or is the last administrator; grant a replacement first"
                .into(),
        ));
    }
    tracing::info!(
        actor = "operator",
        target_subject = subject,
        action = "instance_admin.revoke",
        "administrator role changed"
    );
    Ok(())
}

pub async fn bootstrap(pool: &SqlitePool, subjects: &[String]) -> AppResult<bool> {
    if subjects.is_empty() {
        return Ok(false);
    }
    for subject in subjects {
        validate_subject(subject)?;
    }
    let mut tx = pool.begin().await?;
    let inserted = sqlx::query("INSERT OR IGNORE INTO instance_admin_bootstrap VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))")
        .execute(&mut *tx).await?.rows_affected();
    if inserted == 0 {
        tx.rollback().await?;
        return Ok(false);
    }
    for subject in subjects {
        sqlx::query("INSERT OR IGNORE INTO instance_admins (subject, granted_at) VALUES (?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))")
            .bind(subject).execute(&mut *tx).await?;
    }
    tx.commit().await?;
    tracing::info!(
        action = "instance_admin.bootstrap",
        count = subjects.len(),
        "administrator bootstrap completed"
    );
    Ok(true)
}
