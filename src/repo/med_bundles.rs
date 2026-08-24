use crate::domain::medication::{MedBundle, MedBundleItem, Medication};
use crate::error::{AppError, AppResult};
use chrono::Utc;
use sqlx::SqlitePool;
use uuid::Uuid;

#[derive(Debug, sqlx::FromRow)]
struct MedBundleRow {
    id: String,
    pet_id: Uuid,
    name: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, sqlx::FromRow)]
struct MedBundleItemRow {
    medication_id: String,
    #[allow(dead_code)]
    position: i64,
}

async fn load_items(pool: &SqlitePool, bundle_id: &str) -> AppResult<Vec<MedBundleItem>> {
    let rows = sqlx::query_as::<_, MedBundleItemRow>(
        "SELECT medication_id, position FROM med_bundle_items WHERE bundle_id = ? ORDER BY position",
    )
    .bind(bundle_id)
    .fetch_all(pool)
    .await?;
    let mut items = Vec::with_capacity(rows.len());
    for row in rows {
        let medication = crate::repo::medications::get(pool, &row.medication_id).await?;
        items.push(MedBundleItem {
            medication_id: row.medication_id,
            medication,
        });
    }
    Ok(items)
}

async fn hydrate(pool: &SqlitePool, row: MedBundleRow) -> AppResult<MedBundle> {
    Ok(MedBundle {
        id: row.id.clone(),
        pet_id: row.pet_id,
        name: row.name,
        items: load_items(pool, &row.id).await?,
        created_at: row.created_at,
        updated_at: row.updated_at,
    })
}

#[tracing::instrument(skip(pool))]
pub async fn list_by_pet(pool: &SqlitePool, pet_id: Uuid) -> AppResult<Vec<MedBundle>> {
    let rows = sqlx::query_as::<_, MedBundleRow>(
        "SELECT id, pet_id, name, created_at, updated_at FROM med_bundles WHERE pet_id = ? ORDER BY created_at",
    )
    .bind(pet_id)
    .fetch_all(pool)
    .await?;
    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
        let bundle = hydrate(pool, row).await?;
        if bundle.items.len() >= 2 {
            out.push(bundle);
        }
    }
    Ok(out)
}

#[tracing::instrument(skip(pool))]
pub async fn get(pool: &SqlitePool, id: &str) -> AppResult<MedBundle> {
    let row = sqlx::query_as::<_, MedBundleRow>(
        "SELECT id, pet_id, name, created_at, updated_at FROM med_bundles WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("Med bundle {id} not found")))?;
    let bundle = hydrate(pool, row).await?;
    if bundle.items.len() < 2 {
        return Err(AppError::NotFound(format!("Med bundle {id} not found")));
    }
    Ok(bundle)
}

#[tracing::instrument(skip(pool, medications, name))]
pub async fn create(
    pool: &SqlitePool,
    pet_id: Uuid,
    name: String,
    medications: &[Medication],
) -> AppResult<MedBundle> {
    if medications.len() < 2 {
        return Err(AppError::BadRequest(
            "a bundle must contain at least 2 assignments".into(),
        ));
    }
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
    let mut tx = pool.begin().await?;
    sqlx::query(
        "INSERT INTO med_bundles (id, pet_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(pet_id)
    .bind(&name)
    .bind(&now)
    .bind(&now)
    .execute(&mut *tx)
    .await?;
    for (position, medication) in medications.iter().enumerate() {
        sqlx::query(
            "INSERT INTO med_bundle_items (bundle_id, medication_id, position) VALUES (?, ?, ?)",
        )
        .bind(&id)
        .bind(&medication.id)
        .bind(position as i64)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    get(pool, &id).await
}

#[tracing::instrument(skip(pool))]
pub async fn update_name(pool: &SqlitePool, id: &str, name: &str) -> AppResult<MedBundle> {
    let now = Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
    let rows = sqlx::query("UPDATE med_bundles SET name = ?, updated_at = ? WHERE id = ?")
        .bind(name)
        .bind(&now)
        .bind(id)
        .execute(pool)
        .await?
        .rows_affected();
    if rows == 0 {
        return Err(AppError::NotFound(format!("Med bundle {id} not found")));
    }
    get(pool, id).await
}

#[tracing::instrument(skip(pool))]
pub async fn delete(pool: &SqlitePool, id: &str) -> AppResult<()> {
    let rows = sqlx::query("DELETE FROM med_bundles WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?
        .rows_affected();
    if rows == 0 {
        return Err(AppError::NotFound(format!("Med bundle {id} not found")));
    }
    Ok(())
}

#[tracing::instrument(skip(pool))]
pub async fn delete_containing_medication(pool: &SqlitePool, medication_id: &str) -> AppResult<()> {
    sqlx::query(
        "DELETE FROM med_bundles WHERE id IN (SELECT bundle_id FROM med_bundle_items WHERE medication_id = ?)",
    )
    .bind(medication_id)
    .execute(pool)
    .await?;
    Ok(())
}
