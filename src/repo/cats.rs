use crate::domain::cat::{Cat, UpdateCat};
use crate::error::{AppError, AppResult};
use chrono::Utc;
use sqlx::SqlitePool;

pub async fn list_cats(pool: &SqlitePool) -> AppResult<Vec<Cat>> {
    let cats = sqlx::query_as::<_, Cat>(
        "SELECT id, name, status, weight_kg, feeding_notes, created_at, updated_at FROM cats ORDER BY name",
    )
    .fetch_all(pool)
    .await?;
    Ok(cats)
}

pub async fn get_cat(pool: &SqlitePool, id: &str) -> AppResult<Cat> {
    let cat = sqlx::query_as::<_, Cat>(
        "SELECT id, name, status, weight_kg, feeding_notes, created_at, updated_at FROM cats WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("Cat {id} not found")))?;
    Ok(cat)
}

pub async fn create_cat(pool: &SqlitePool, cat: Cat) -> AppResult<Cat> {
    sqlx::query(
        "INSERT INTO cats (id, name, status, weight_kg, feeding_notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&cat.id)
    .bind(&cat.name)
    .bind(&cat.status)
    .bind(cat.weight_kg)
    .bind(&cat.feeding_notes)
    .bind(&cat.created_at)
    .bind(&cat.updated_at)
    .execute(pool)
    .await?;
    get_cat(pool, &cat.id).await
}

pub async fn update_cat(pool: &SqlitePool, id: &str, req: UpdateCat) -> AppResult<Cat> {
    let mut cat = get_cat(pool, id).await?;
    let now = Utc::now().to_rfc3339();
    if let Some(name) = req.name {
        cat.name = name;
    }
    if let Some(status) = req.status {
        cat.status = status;
    }
    if req.weight_kg.is_some() {
        cat.weight_kg = req.weight_kg;
    }
    if req.feeding_notes.is_some() {
        cat.feeding_notes = req.feeding_notes;
    }
    cat.updated_at = now;
    sqlx::query("UPDATE cats SET name=?, status=?, weight_kg=?, feeding_notes=?, updated_at=? WHERE id=?")
        .bind(&cat.name)
        .bind(&cat.status)
        .bind(cat.weight_kg)
        .bind(&cat.feeding_notes)
        .bind(&cat.updated_at)
        .bind(id)
        .execute(pool)
        .await?;
    Ok(cat)
}

pub async fn delete_cat(pool: &SqlitePool, id: &str) -> AppResult<()> {
    let rows = sqlx::query("DELETE FROM cats WHERE id=?")
        .bind(id)
        .execute(pool)
        .await?
        .rows_affected();
    if rows == 0 {
        return Err(AppError::NotFound(format!("Cat {id} not found")));
    }
    Ok(())
}
