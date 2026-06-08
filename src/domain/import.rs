use crate::domain::entry::CreateEntry;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ImportBatch {
    pub id: String,
    pub source_name: String,
    pub raw_text: String,
    pub parse_summary_json: String,
    pub created_at: String,
    pub committed_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ImportPreviewRequest {
    pub source_name: String,
    pub raw_text: String,
    pub cat_id: String,
}

#[derive(Debug, Deserialize)]
pub struct ImportCommitRequest {
    pub source_name: String,
    pub raw_text: String,
    pub cat_id: String,
}

#[derive(Debug, Serialize)]
pub struct ParsedLine {
    pub line_number: usize,
    pub raw: String,
    pub parsed: Option<CreateEntry>,
    pub error: Option<String>,
    pub warning: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ImportPreviewResponse {
    pub total_lines: usize,
    pub parsed_count: usize,
    pub error_count: usize,
    pub warning_count: usize,
    pub lines: Vec<ParsedLine>,
}

#[derive(Debug, Serialize)]
pub struct ParseSummary {
    pub total_lines: usize,
    pub parsed_count: usize,
    pub error_count: usize,
}

impl ImportBatch {
    pub fn new(source_name: String, raw_text: String, summary: &ParseSummary) -> Self {
        let now = Utc::now().to_rfc3339();
        ImportBatch {
            id: Uuid::new_v4().to_string(),
            source_name,
            raw_text,
            parse_summary_json: serde_json::to_string(summary).unwrap_or_else(|_| "{}".to_string()),
            created_at: now,
            committed_at: None,
        }
    }
}
