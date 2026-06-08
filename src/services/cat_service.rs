use crate::domain::cat::{Cat, CreateCat, UpdateCat};
use crate::error::{AppError, AppResult};
use crate::repo::cats;
use sqlx::SqlitePool;

#[tracing::instrument(skip(pool))]
pub async fn list(pool: &SqlitePool) -> AppResult<Vec<Cat>> {
    cats::list_cats(pool).await
}

#[tracing::instrument(skip(pool))]
pub async fn get(pool: &SqlitePool, id: &str) -> AppResult<Cat> {
    cats::get_cat(pool, id).await
}

#[tracing::instrument(skip(pool))]
pub async fn create(pool: &SqlitePool, req: CreateCat) -> AppResult<Cat> {
    if req.name.trim().is_empty() {
        return Err(AppError::Validation {
            field: "name".to_string(),
            message: "Name cannot be empty".to_string(),
        });
    }
    let cat = Cat::new(req);
    cats::create_cat(pool, cat).await
}

#[tracing::instrument(skip(pool))]
pub async fn update(pool: &SqlitePool, id: &str, req: UpdateCat) -> AppResult<Cat> {
    if let Some(name) = &req.name {
        if name.trim().is_empty() {
            return Err(AppError::Validation {
                field: "name".to_string(),
                message: "Name cannot be empty".to_string(),
            });
        }
    }
    cats::update_cat(pool, id, req).await
}

#[tracing::instrument(skip(pool))]
pub async fn delete(pool: &SqlitePool, id: &str) -> AppResult<()> {
    cats::delete_cat(pool, id).await
}
