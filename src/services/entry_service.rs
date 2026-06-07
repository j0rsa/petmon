use crate::domain::entry::{CreateEntry, Entry, EntryFilters, UpdateEntry};
use crate::error::{AppError, AppResult};
use crate::repo::cats;
use crate::repo::entries;
use sqlx::SqlitePool;

pub async fn list(pool: &SqlitePool, filters: EntryFilters) -> AppResult<Vec<Entry>> {
    entries::list_entries(pool, &filters).await
}

pub async fn get(pool: &SqlitePool, id: &str) -> AppResult<Entry> {
    entries::get_entry(pool, id).await
}

pub async fn create(pool: &SqlitePool, req: CreateEntry) -> AppResult<Entry> {
    if req.amount < 0.0 {
        return Err(AppError::Validation {
            field: "amount".to_string(),
            message: "Amount must be non-negative".to_string(),
        });
    }
    if req.category.trim().is_empty() {
        return Err(AppError::Validation {
            field: "category".to_string(),
            message: "Category is required".to_string(),
        });
    }
    cats::get_cat(pool, &req.cat_id).await?;
    let entry = Entry::new(req);
    entries::create_entry(pool, entry).await
}

pub async fn update(pool: &SqlitePool, id: &str, req: UpdateEntry) -> AppResult<Entry> {
    if let Some(amount) = req.amount {
        if amount < 0.0 {
            return Err(AppError::Validation {
                field: "amount".to_string(),
                message: "Amount must be non-negative".to_string(),
            });
        }
    }
    entries::update_entry(pool, id, req).await
}

pub async fn delete(pool: &SqlitePool, id: &str) -> AppResult<()> {
    entries::delete_entry(pool, id).await
}
