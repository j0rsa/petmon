use crate::domain::entry::{CreateEntry, Entry};
use crate::domain::import::{
    ImportBatch, ImportCommitRequest, ImportPreviewRequest, ImportPreviewResponse, ParseSummary,
    ParsedLine,
};
use crate::error::{AppError, AppResult};
use crate::repo::{cats, entries, imports};
use chrono::Utc;
use regex::Regex;
use sqlx::SqlitePool;

/// Parse a line of Telegram-style intake log
/// Format examples:
///   "08:30 wet 85g tuna"
///   "12:00 dry 30g"
///   "18:00 water 50ml"
///   "2024-01-15 08:30 treats 5g"
pub fn parse_line(line: &str, line_number: usize, cat_id: &str, default_date: &str) -> ParsedLine {
    let raw = line.to_string();
    let line = line.trim();
    if line.is_empty() || line.starts_with('#') || line.starts_with("//") {
        return ParsedLine {
            line_number,
            raw,
            parsed: None,
            error: None,
            warning: Some("Skipped (empty or comment)".to_string()),
        };
    }

    let re_full = Regex::new(
        r"(?x)
        (?:(\d{4}-\d{2}-\d{2})\s+)?
        (\d{1,2}:\d{2})\s+
        (\w+)\s+
        (\d+(?:\.\d+)?)\s*(g|ml|kg|oz|pcs|tbsp|tsp)?
        (?:\s+(.+))?
        ",
    )
    .expect("valid import regex");

    if let Some(caps) = re_full.captures(line) {
        let date = caps
            .get(1)
            .map(|m| m.as_str().to_string())
            .unwrap_or_else(|| default_date.to_string());
        let time = caps.get(2).map(|m| m.as_str()).unwrap_or("00:00");
        let category_raw = caps
            .get(3)
            .map(|m| m.as_str())
            .unwrap_or("custom")
            .to_lowercase();
        let amount_str = caps.get(4).map(|m| m.as_str()).unwrap_or("0");
        let unit = caps.get(5).map(|m| m.as_str().to_string());
        let note = caps.get(6).map(|m| m.as_str().to_string());

        let category = match category_raw.as_str() {
            "wet" | "wetfood" | "wet_food" => "wet_food",
            "dry" | "dryfood" | "dry_food" => "dry_food",
            "water" | "liquid" | "drink" => "water",
            "treat" | "treats" => "treats",
            "med" | "meds" | "medication" => "medication",
            other => other,
        };

        let amount: f64 = match amount_str.parse() {
            Ok(v) => v,
            Err(_) => {
                return ParsedLine {
                    line_number,
                    raw,
                    parsed: None,
                    error: Some(format!("Cannot parse amount: {amount_str}")),
                    warning: None,
                }
            }
        };

        let occurred_at = format!("{date}T{time}:00Z");

        return ParsedLine {
            line_number,
            raw,
            parsed: Some(CreateEntry {
                cat_id: cat_id.to_string(),
                occurred_at,
                local_date: Some(date),
                category: category.to_string(),
                amount,
                unit,
                note,
                source_type: Some("import".to_string()),
                import_batch_id: None,
            }),
            error: None,
            warning: None,
        };
    }

    ParsedLine {
        line_number,
        raw,
        parsed: None,
        error: Some(
            "Cannot parse line: expected format '[date] HH:MM category amount[unit] [note]'"
                .to_string(),
        ),
        warning: None,
    }
}

pub fn preview_text(req: &ImportPreviewRequest) -> ImportPreviewResponse {
    let default_date = Utc::now().format("%Y-%m-%d").to_string();
    let lines: Vec<ParsedLine> = req
        .raw_text
        .lines()
        .enumerate()
        .map(|(i, line)| parse_line(line, i + 1, &req.cat_id, &default_date))
        .collect();

    let parsed_count = lines.iter().filter(|l| l.parsed.is_some()).count();
    let error_count = lines.iter().filter(|l| l.error.is_some()).count();
    let warning_count = lines.iter().filter(|l| l.warning.is_some()).count();

    ImportPreviewResponse {
        total_lines: lines.len(),
        parsed_count,
        error_count,
        warning_count,
        lines,
    }
}

#[tracing::instrument(skip(pool, req), fields(cat_id = %req.cat_id, source = %req.source_name))]
pub async fn commit_import(pool: &SqlitePool, req: ImportCommitRequest) -> AppResult<ImportBatch> {
    cats::get_cat(pool, &req.cat_id).await?;

    let preview_req = ImportPreviewRequest {
        source_name: req.source_name.clone(),
        raw_text: req.raw_text.clone(),
        cat_id: req.cat_id.clone(),
    };
    let preview = preview_text(&preview_req);
    if preview.parsed_count == 0 {
        return Err(AppError::Validation {
            field: "raw_text".to_string(),
            message: "Import did not contain any parsable entries".to_string(),
        });
    }

    let summary = ParseSummary {
        total_lines: preview.total_lines,
        parsed_count: preview.parsed_count,
        error_count: preview.error_count,
    };
    let batch = ImportBatch::new(req.source_name.clone(), req.raw_text.clone(), &summary);
    let batch = imports::create_batch(pool, batch).await?;

    let batch_id = batch.id.clone();
    let entries_to_create: Vec<Entry> = preview
        .lines
        .into_iter()
        .filter_map(|l| l.parsed)
        .map(|mut ce| {
            ce.import_batch_id = Some(batch_id.clone());
            Entry::new(ce)
        })
        .collect();

    entries::create_entries_batch(pool, entries_to_create).await?;
    imports::commit_batch(pool, &batch_id).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_line_wet_food() {
        let result = parse_line("08:30 wet 85g tuna", 1, "cat1", "2024-01-15");
        assert!(result.error.is_none());
        let parsed = result.parsed.unwrap();
        assert_eq!(parsed.category, "wet_food");
        assert_eq!(parsed.amount, 85.0);
        assert_eq!(parsed.unit, Some("g".to_string()));
    }

    #[test]
    fn test_parse_line_with_date() {
        let result = parse_line("2024-01-15 12:00 dry 30g", 1, "cat1", "2024-01-01");
        assert!(result.error.is_none());
        let parsed = result.parsed.unwrap();
        assert_eq!(parsed.category, "dry_food");
        assert_eq!(parsed.amount, 30.0);
        assert_eq!(parsed.local_date, Some("2024-01-15".to_string()));
    }

    #[test]
    fn test_parse_line_water() {
        let result = parse_line("09:00 water 50ml", 1, "cat1", "2024-01-15");
        assert!(result.error.is_none());
        let parsed = result.parsed.unwrap();
        assert_eq!(parsed.category, "water");
        assert_eq!(parsed.unit, Some("ml".to_string()));
    }

    #[test]
    fn test_parse_empty_line() {
        let result = parse_line("", 1, "cat1", "2024-01-15");
        assert!(result.parsed.is_none());
        assert!(result.warning.is_some());
    }

    #[test]
    fn test_parse_comment_line() {
        let result = parse_line("# this is a comment", 1, "cat1", "2024-01-15");
        assert!(result.parsed.is_none());
        assert!(result.warning.is_some());
    }

    #[test]
    fn test_parse_invalid_line() {
        let result = parse_line("not a valid line", 1, "cat1", "2024-01-15");
        assert!(result.parsed.is_none());
        assert!(result.error.is_some());
    }

    #[test]
    fn test_preview_multiple_lines() {
        let req = ImportPreviewRequest {
            source_name: "test".to_string(),
            raw_text: "08:30 wet 85g
12:00 dry 30g
# comment
".to_string(),
            cat_id: "cat1".to_string(),
        };
        let result = preview_text(&req);
        assert_eq!(result.parsed_count, 2);
        assert_eq!(result.warning_count, 1);
    }
}
