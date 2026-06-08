use serde::{Deserialize, Serialize};

/// Monitoring pillars for petmon. Each pillar has its own `*_records` table.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MonitoringPillar {
    Nutrition,
    Elimination,
    Health,
}

impl MonitoringPillar {
    pub const ALL: [MonitoringPillar; 3] = [
        MonitoringPillar::Nutrition,
        MonitoringPillar::Elimination,
        MonitoringPillar::Health,
    ];

    pub const fn records_table(self) -> &'static str {
        match self {
            MonitoringPillar::Nutrition => "nutrition_records",
            MonitoringPillar::Elimination => "elimination_records",
            MonitoringPillar::Health => "health_records",
        }
    }
}
