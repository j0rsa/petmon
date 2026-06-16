use petmon::config::Config;
use petmon::db;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Default: wipe and reseed. Pass --append to keep existing rows (fails if demo pets already exist).
    let fresh = !std::env::args().any(|arg| arg == "--append");
    let config = Config::from_env();

    let pool = db::create_pool(&config).await?;
    db::run_migrations(&pool).await?;

    let summary = petmon::demo_seed::run(&pool, fresh).await?;

    println!("Demo data loaded into {}", config.database_url);
    if fresh {
        println!("(existing rows were cleared first)");
    }
    println!();
    println!("  Pets:              {}", summary.pets);
    println!("  Nutrition records: {}", summary.nutrition_records);
    println!("  Day notes:         {}", summary.day_notes);
    println!("  Schedules:         {}", summary.schedules);
    println!();
    println!("Demo pet IDs (match frontend Storybook fixtures):");
    println!("  Mittens: {}", petmon::demo_seed::MITTENS_ID);
    println!("  Rex:     {}", petmon::demo_seed::REX_ID);
    println!();
    println!("Start the app with: make run-be");

    Ok(())
}
