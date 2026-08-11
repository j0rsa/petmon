use chrono::{Datelike, Duration, NaiveDate, Utc};
use chrono_tz;
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::domain::elimination::{CreateEliminationRecord, EliminationEventType};
use crate::domain::nutrition_record::{CreateNutritionRecord, NutritionRecord};
use crate::domain::nutrition_schedule::CreateNutritionSchedule;
use crate::domain::pet::Pet;
use crate::domain::pet_status::PetStatus;
use crate::domain::species::PetSpecies;
use crate::domain::weight::CreateWeightRecord;
use crate::error::AppResult;
use crate::repo::{
    day_notes, elimination_records, nutrition_records, nutrition_schedules, pets, weight_records,
};

pub const MITTENS_ID: &str = "550e8400-e29b-41d4-a716-446655440000";
pub const REX_ID: &str = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
pub const PEPPER_ID: &str = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
pub const CLOVER_ID: &str = "b2c3d4e5-f6a7-8901-bcde-f12345678901";

const DEMO_DAYS: i64 = 45;

#[derive(Debug)]
pub struct SeedSummary {
    pub pets: usize,
    pub nutrition_records: usize,
    pub elimination_records: usize,
    pub weight_records: usize,
    pub day_notes: usize,
    pub schedules: usize,
}

pub async fn run(pool: &SqlitePool, fresh: bool) -> AppResult<SeedSummary> {
    if fresh {
        clear_all(pool).await?;
    }

    let demo_pets = seed_pets(pool).await?;
    let nutrition_count = seed_nutrition_records(pool, &demo_pets).await?;
    let elimination_count = seed_elimination_records(pool, &demo_pets).await?;
    let weight_count = seed_weight_records(pool, &demo_pets).await?;
    let note_count = seed_day_notes(pool, &demo_pets).await?;
    let schedule_count = seed_schedules(pool, &demo_pets).await?;

    Ok(SeedSummary {
        pets: demo_pets.len(),
        nutrition_records: nutrition_count,
        elimination_records: elimination_count,
        weight_records: weight_count,
        day_notes: note_count,
        schedules: schedule_count,
    })
}

/// True when the database has no pets yet (fresh after migrations).
pub async fn is_empty_database(pool: &SqlitePool) -> AppResult<bool> {
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM pets")
        .fetch_one(pool)
        .await?;
    Ok(count == 0)
}

async fn clear_all(pool: &SqlitePool) -> AppResult<()> {
    sqlx::query("DELETE FROM nutrition_records")
        .execute(pool)
        .await?;
    sqlx::query("DELETE FROM elimination_records")
        .execute(pool)
        .await?;
    sqlx::query("DELETE FROM weight_records")
        .execute(pool)
        .await?;
    sqlx::query("DELETE FROM health_records")
        .execute(pool)
        .await?;
    sqlx::query("DELETE FROM day_notes").execute(pool).await?;
    sqlx::query("DELETE FROM nutrition_schedules")
        .execute(pool)
        .await?;
    sqlx::query("DELETE FROM pets").execute(pool).await?;
    Ok(())
}

async fn seed_pets(pool: &SqlitePool) -> AppResult<Vec<Pet>> {
    let now = Utc::now().to_rfc3339();
    let profiles = [
        (
            MITTENS_ID,
            "Mittens",
            PetSpecies::Cat,
            Some("British Shorthair"),
            Some("2020-03-15"),
            Some("A"),
            Some("#c4a882"),
            Some(4.2),
            Some("Prefers wet food in the morning."),
        ),
        (
            REX_ID,
            "Rex",
            PetSpecies::Dog,
            Some("Golden Retriever"),
            Some("2019-07-22"),
            None,
            Some("#8b6f47"),
            Some(32.5),
            Some("Two meals plus afternoon walk treat."),
        ),
        (
            PEPPER_ID,
            "Pepper",
            PetSpecies::Parrot,
            Some("Green-cheeked conure"),
            Some("2022-01-10"),
            None,
            Some("#2d8a5e"),
            Some(0.065),
            Some("Fresh chop at breakfast; pellets in the evening."),
        ),
        (
            CLOVER_ID,
            "Clover",
            PetSpecies::Bunny,
            Some("Holland Lop"),
            Some("2023-04-08"),
            None,
            Some("#e8d5c4"),
            Some(1.8),
            Some("Unlimited hay; measured pellets."),
        ),
    ];

    let mut created = Vec::with_capacity(profiles.len());
    for (id, name, species, breed, birth_date, blood_type, color, weight_kg, feeding_notes) in
        profiles
    {
        let pet = Pet {
            id: Uuid::parse_str(id).expect("valid demo pet id"),
            name: name.to_string(),
            species,
            status: PetStatus::Active,
            breed: breed.map(str::to_string),
            birth_date: birth_date.map(str::to_string),
            blood_type: blood_type.map(str::to_string),
            color: color.map(str::to_string),
            weight_kg,
            feeding_notes: feeding_notes.map(str::to_string),
            telegram_chat_id: None,
            telegram_thread_id: None,
            elimination_auto_categorize_by_duration: false,
            created_at: now.clone(),
            updated_at: now.clone(),
        };
        created.push(pets::create_pet(pool, pet).await?);
    }
    Ok(created)
}

async fn seed_nutrition_records(pool: &SqlitePool, demo_pets: &[Pet]) -> AppResult<usize> {
    let today = Utc::now().date_naive();
    let mut count = 0usize;

    for pet in demo_pets {
        for day_offset in 0..DEMO_DAYS {
            let date = today - Duration::days(day_offset);
            if day_offset % 11 == 7 {
                continue;
            }

            let records = daily_records_for_pet(pet, date, day_offset);
            for req in records {
                nutrition_records::create_record(pool, NutritionRecord::new(req, chrono_tz::UTC))
                    .await?;
                count += 1;
            }
        }
    }

    Ok(count)
}

fn daily_records_for_pet(
    pet: &Pet,
    date: NaiveDate,
    day_offset: i64,
) -> Vec<CreateNutritionRecord> {
    let local_date = date.format("%Y-%m-%d").to_string();
    let weekend = matches!(date.weekday(), chrono::Weekday::Sat | chrono::Weekday::Sun);
    let variant = (day_offset % 5) as f64;

    let mut records = Vec::new();

    match pet.species {
        PetSpecies::Cat => {
            records.push(record(
                pet.id,
                &local_date,
                8,
                30,
                "wet_food",
                75.0 + variant * 5.0,
                Some("g"),
                day_offset % 3 == 0,
            ));
            records.push(record(
                pet.id,
                &local_date,
                12,
                0,
                "water",
                45.0 + variant * 4.0,
                Some("ml"),
                day_offset % 4 == 1,
            ));
            records.push(record(
                pet.id,
                &local_date,
                19,
                0,
                "dry_food",
                12.0 + variant * 2.0,
                Some("g"),
                false,
            ));
            if weekend {
                records.push(record(
                    pet.id,
                    &local_date,
                    21,
                    0,
                    "dry_food",
                    3.0 + variant,
                    Some("g"),
                    false,
                ));
            }
        }
        PetSpecies::Dog => {
            records.push(record(
                pet.id,
                &local_date,
                7,
                30,
                "wet_food",
                280.0 + variant * 20.0,
                Some("g"),
                false,
            ));
            records.push(record(
                pet.id,
                &local_date,
                12,
                30,
                "water",
                350.0 + variant * 25.0,
                Some("ml"),
                day_offset % 5 == 2,
            ));
            records.push(record(
                pet.id,
                &local_date,
                18,
                0,
                "dry_food",
                90.0 + variant * 8.0,
                Some("g"),
                false,
            ));
            if weekend || day_offset % 9 == 0 {
                records.push(record(
                    pet.id,
                    &local_date,
                    16,
                    0,
                    "dry_food",
                    15.0 + variant * 2.0,
                    Some("g"),
                    false,
                ));
            }
        }
        PetSpecies::Parrot => {
            records.push(record(
                pet.id,
                &local_date,
                8,
                0,
                "wet_food",
                35.0 + variant * 3.0,
                Some("g"),
                false,
            ));
            records.push(record(
                pet.id,
                &local_date,
                13,
                0,
                "water",
                25.0 + variant * 2.0,
                Some("ml"),
                false,
            ));
            records.push(record(
                pet.id,
                &local_date,
                19,
                30,
                "dry_food",
                8.0 + variant,
                Some("g"),
                false,
            ));
            if weekend {
                records.push(record(
                    pet.id,
                    &local_date,
                    15,
                    0,
                    "dry_food",
                    2.0,
                    Some("g"),
                    false,
                ));
            }
        }
        PetSpecies::Bunny => {
            records.push(record(
                pet.id,
                &local_date,
                8,
                0,
                "dry_food",
                40.0 + variant * 4.0,
                Some("g"),
                false,
            ));
            records.push(record(
                pet.id,
                &local_date,
                11,
                0,
                "water",
                120.0 + variant * 10.0,
                Some("ml"),
                false,
            ));
            records.push(record(
                pet.id,
                &local_date,
                18,
                0,
                "wet_food",
                50.0 + variant * 5.0,
                Some("g"),
                false,
            ));
        }
        PetSpecies::Other => {}
    }

    if day_offset % 13 == 0 && pet.species != PetSpecies::Other {
        records.push(record(
            pet.id,
            &local_date,
            9,
            0,
            "liquids",
            5.0,
            Some("ml"),
            false,
        ));
    }

    records
}

#[allow(clippy::too_many_arguments)]
fn record(
    pet_id: Uuid,
    local_date: &str,
    hour: u32,
    minute: u32,
    category: &str,
    amount: f64,
    unit: Option<&str>,
    telegram: bool,
) -> CreateNutritionRecord {
    let occurred_at = format!("{local_date}T{hour:02}:{minute:02}:00Z");
    CreateNutritionRecord {
        pet_id,
        occurred_at: Some(occurred_at),
        local_date: Some(local_date.to_string()),
        category: category
            .parse()
            .unwrap_or_else(|()| panic!("unknown nutrition category: {category}")),
        amount,
        unit: unit.map(str::to_string),
        note: None,
        source_type: Some(if telegram {
            "telegram".to_string()
        } else {
            "manual".to_string()
        }),
    }
}

async fn seed_elimination_records(pool: &SqlitePool, demo_pets: &[Pet]) -> AppResult<usize> {
    let today = Utc::now().date_naive();
    let mut count = 0usize;

    for pet in demo_pets {
        for day_offset in 0..DEMO_DAYS {
            let date = today - Duration::days(day_offset);
            // Skip the same gap days as nutrition for realism
            if day_offset % 11 == 7 {
                continue;
            }
            let local_date = date.format("%Y-%m-%d").to_string();
            let events = daily_elimination_for_pet(pet, &local_date, day_offset);
            for req in events {
                elimination_records::create(pool, req, chrono_tz::UTC, false, None).await?;
                count += 1;
            }
        }
    }

    Ok(count)
}

fn daily_elimination_for_pet(
    pet: &Pet,
    local_date: &str,
    day_offset: i64,
) -> Vec<CreateEliminationRecord> {
    let mut events = Vec::new();

    match pet.species {
        PetSpecies::Cat => {
            // Morning urination
            events.push(elim_event(
                pet.id,
                local_date,
                7,
                15,
                EliminationEventType::Urination,
                None,
                Some(45),
            ));
            // Morning defecation (most days)
            if day_offset % 3 != 2 {
                let subtype = match day_offset % 5 {
                    0 => "normal",
                    1 => "soft",
                    _ => "normal",
                };
                events.push(elim_event(
                    pet.id,
                    local_date,
                    9,
                    0,
                    EliminationEventType::Defecation,
                    Some(subtype),
                    Some(180),
                ));
            }
            // Afternoon urination
            events.push(elim_event(
                pet.id,
                local_date,
                15,
                30,
                EliminationEventType::Urination,
                None,
                Some(40),
            ));
            // Occasional evening urination
            if day_offset % 4 == 0 {
                events.push(elim_event(
                    pet.id,
                    local_date,
                    21,
                    0,
                    EliminationEventType::Urination,
                    None,
                    Some(35),
                ));
            }
            // Rare vomit — fur every ~10 days, food every ~15 days
            if day_offset % 10 == 3 {
                events.push(elim_event(
                    pet.id,
                    local_date,
                    11,
                    0,
                    EliminationEventType::Vomit,
                    Some("fur"),
                    None,
                ));
            } else if day_offset % 15 == 8 {
                events.push(elim_event(
                    pet.id,
                    local_date,
                    19,
                    30,
                    EliminationEventType::Vomit,
                    Some("food"),
                    None,
                ));
            }
        }
        PetSpecies::Dog => {
            // Morning walk
            events.push(elim_event(
                pet.id,
                local_date,
                7,
                0,
                EliminationEventType::Urination,
                None,
                None,
            ));
            events.push(elim_event(
                pet.id,
                local_date,
                7,
                5,
                EliminationEventType::Defecation,
                Some("normal"),
                None,
            ));
            // Midday
            events.push(elim_event(
                pet.id,
                local_date,
                12,
                0,
                EliminationEventType::Urination,
                None,
                None,
            ));
            // Evening walk
            events.push(elim_event(
                pet.id,
                local_date,
                18,
                30,
                EliminationEventType::Urination,
                None,
                None,
            ));
            if day_offset % 2 == 0 {
                events.push(elim_event(
                    pet.id,
                    local_date,
                    18,
                    35,
                    EliminationEventType::Defecation,
                    Some("normal"),
                    None,
                ));
            }
            // Occasional upset stomach
            if day_offset % 20 == 5 {
                events.push(elim_event(
                    pet.id,
                    local_date,
                    10,
                    0,
                    EliminationEventType::Vomit,
                    Some("food"),
                    None,
                ));
            }
        }
        // Parrot and Bunny: general events only (hard to classify individually)
        PetSpecies::Parrot | PetSpecies::Bunny => {
            events.push(elim_event(
                pet.id,
                local_date,
                9,
                0,
                EliminationEventType::General,
                None,
                None,
            ));
            if day_offset % 2 == 0 {
                events.push(elim_event(
                    pet.id,
                    local_date,
                    15,
                    0,
                    EliminationEventType::General,
                    None,
                    None,
                ));
            }
        }
        PetSpecies::Other => {}
    }

    events
}

fn elim_event(
    pet_id: Uuid,
    local_date: &str,
    hour: u32,
    minute: u32,
    event_type: EliminationEventType,
    subtype: Option<&str>,
    duration_seconds: Option<i64>,
) -> CreateEliminationRecord {
    let occurred_at = format!("{local_date}T{hour:02}:{minute:02}:00");
    CreateEliminationRecord {
        pet_id: pet_id.to_string(),
        occurred_at: Some(occurred_at),
        local_date: Some(local_date.to_string()),
        event_type,
        subtype: subtype.map(str::to_string),
        duration_seconds,
        note: None,
        source_type: Some("manual".to_string()),
    }
}

async fn seed_weight_records(pool: &SqlitePool, _demo_pets: &[Pet]) -> AppResult<usize> {
    let today = Utc::now().date_naive();
    let mut count = 0usize;

    // Base weights and typical variation per species
    let baselines: &[(Uuid, f64, f64)] = &[
        (Uuid::parse_str(MITTENS_ID).unwrap(), 4.20, 0.08),
        (Uuid::parse_str(REX_ID).unwrap(), 32.50, 0.30),
        (Uuid::parse_str(PEPPER_ID).unwrap(), 0.065, 0.003),
        (Uuid::parse_str(CLOVER_ID).unwrap(), 1.80, 0.05),
    ];

    for (pet_id, base, variation) in baselines {
        // One measurement every ~7 days over the last 90 days
        for week in 0..13i64 {
            let days_ago = week * 7;
            let date = today - Duration::days(days_ago);
            let local_date = date.format("%Y-%m-%d").to_string();
            // Gentle trend: slight increase over time (reversed since we go back in time)
            let trend = (week as f64) * variation * 0.15;
            let weight = (base - trend + (week % 3) as f64 * variation * 0.1 - variation * 0.05)
                .max(base * 0.9);
            let weight = (weight * 100.0).round() / 100.0;

            weight_records::create(
                pool,
                CreateWeightRecord {
                    pet_id: pet_id.to_string(),
                    measured_at: Some(format!("{local_date}T09:00:00")),
                    local_date: Some(local_date.clone()),
                    weight_kg: weight,
                    note: if days_ago == 0 {
                        Some("Regular weigh-in".to_string())
                    } else {
                        None
                    },
                    source_type: Some("manual".to_string()),
                },
                chrono_tz::UTC,
            )
            .await?;
            count += 1;
        }
    }

    Ok(count)
}

async fn seed_day_notes(pool: &SqlitePool, demo_pets: &[Pet]) -> AppResult<usize> {
    let mittens = demo_pets
        .iter()
        .find(|pet| pet.id.to_string() == MITTENS_ID)
        .expect("mittens seeded");
    let today = Utc::now().date_naive();

    let notes = [
        (0, "Ate well today — finished both wet and dry portions."),
        (
            1,
            "Skipped evening dry food; seemed sleepy after a long play session.",
        ),
        (3, "Tried a new wet food brand. Mixed reaction."),
        (7, "Vet check-up went fine. Normal appetite."),
    ];

    for (offset, text) in notes {
        let date = (today - Duration::days(offset))
            .format("%Y-%m-%d")
            .to_string();
        day_notes::upsert_day_note(pool, &date, Some(mittens.id), text).await?;
    }

    Ok(notes.len())
}

async fn seed_schedules(pool: &SqlitePool, demo_pets: &[Pet]) -> AppResult<usize> {
    let mittens = demo_pets
        .iter()
        .find(|pet| pet.id.to_string() == MITTENS_ID)
        .expect("mittens seeded");
    let rex = demo_pets
        .iter()
        .find(|pet| pet.id.to_string() == REX_ID)
        .expect("rex seeded");

    let schedules: &[(Uuid, &str, bool, serde_json::Value)] = &[
        (
            mittens.id,
            "Daily hydration schedule",
            true,
            serde_json::json!({
                "type": "liquid",
                "windows": [
                    { "from": "06:00", "to": "07:00", "min": 12, "max": 15, "note": "First morning liquid, gentle start" },
                    { "from": "08:30", "to": "09:30", "min": 12, "max": 15, "note": "Good second portion" },
                    { "from": "11:00", "to": "12:00", "min": 10, "max": 13, "note": "Midday support" },
                    { "from": "13:30", "to": "14:30", "min": 10, "max": 13, "note": "Keep it steady" },
                    { "from": "15:30", "to": "16:30", "min": 12, "max": 15, "note": "Important afternoon portion" },
                    { "from": "17:30", "to": "18:30", "min": 10, "max": 13, "note": "Before the fasting window" },
                    { "from": "18:45", "to": "19:10", "min": 5,  "max": 10, "note": "Optional last small portion before cutoff" },
                    { "from": "19:15", "to": "22:00", "min": 0,  "max": 0,  "note": "No food/liquids during this window" },
                    { "from": "22:00", "to": "23:59", "min": 8,  "max": 15, "note": "With/after food + prednisolone, if she accepts" }
                ]
            }),
        ),
        (
            mittens.id,
            "Wet food schedule",
            true,
            serde_json::json!({
                "type": "food",
                "windows": [
                    { "from": "08:00", "to": "08:30", "min": 75, "max": 85, "note": "Morning wet portion" },
                    { "from": "19:00", "to": "19:30", "min": 75, "max": 85, "note": "Evening wet portion" }
                ]
            }),
        ),
        (
            rex.id,
            "Rex daily plan",
            true,
            serde_json::json!({
                "type": "food",
                "windows": [
                    { "from": "07:30", "to": "08:00", "min": 280, "max": 320, "note": "Morning meal" },
                    { "from": "18:00", "to": "18:30", "min": 90,  "max": 110, "note": "Evening dry food" }
                ]
            }),
        ),
    ];

    let count = schedules.len();
    for (pet_id, name, active, rules) in schedules {
        let schedule =
            crate::domain::nutrition_schedule::NutritionSchedule::new(CreateNutritionSchedule {
                pet_id: *pet_id,
                name: name.to_string(),
                active: Some(*active),
                rules: Some(rules.clone()),
            })?;
        nutrition_schedules::create_schedule(pool, schedule).await?;
    }

    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    #[tokio::test]
    async fn seed_demo_populates_data() {
        let config = crate::config::Config {
            host: "127.0.0.1".to_string(),
            port: 8080,
            database_url: "sqlite::memory:".to_string(),
            timezone: "UTC".to_string(),
            import_max_bytes: 1_048_576,
            otlp_endpoint: None,
            service_name: "petmon-test".to_string(),
            static_dir: None,
            demo_mode: false,
        };
        let pool = db::create_pool(&config).await.expect("pool");
        db::run_migrations(&pool).await.expect("migrate");

        let summary = run(&pool, true).await.expect("seed");
        assert_eq!(summary.pets, 4);
        assert!(summary.nutrition_records > 100);
        assert!(summary.elimination_records > 50);
        assert!(summary.weight_records > 0);
        assert_eq!(summary.day_notes, 4);
        assert_eq!(summary.schedules, 3);

        let pets = pets::list_pets(&pool).await.expect("pets");
        assert_eq!(pets.len(), 4);
        assert!(pets.iter().any(|pet| pet.name == "Mittens"));
    }
}
