use chrono::{Datelike, Duration, NaiveDate};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub const MANUAL_TAG: &str = "manual";

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct WeightRecord {
    pub id: String,
    pub pet_id: Uuid,
    pub measured_at: String,
    pub local_date: String,
    pub weight_kg: f64,
    pub note: Option<String>,
    pub source_type: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateWeightRecord {
    pub pet_id: String,
    /// Naive local datetime YYYY-MM-DDTHH:MM:SS. Defaults to now in configured timezone.
    pub measured_at: Option<String>,
    pub local_date: Option<String>,
    pub weight_kg: f64,
    pub note: Option<String>,
    pub source_type: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateWeightRecord {
    /// `None` = key absent (leave unchanged); `Some(None)` = key present as
    /// JSON `null` (treat as empty, which normalizes to `#manual`);
    /// `Some(Some(s))` = set the note to `s` (tags are normalized on save).
    #[serde(default, deserialize_with = "crate::domain::double_option")]
    pub note: Option<Option<String>>,
}

#[derive(Debug, Serialize)]
pub struct WeightStats {
    pub latest_kg: Option<f64>,
    pub latest_date: Option<String>,
    pub avg_kg: Option<f64>,
    pub count: i64,
}

#[derive(Debug, Deserialize, Clone)]
pub struct WeightRecordFilters {
    pub pet_id: Option<String>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    /// Comma-separated hashtags to keep (`Petkit,manual`). When empty, all
    /// records are returned. Matching is case-insensitive and looks at every
    /// tag in the note.
    #[serde(default)]
    pub tags: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WeightTagCount {
    pub tag: String,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum WeightGranularity {
    Raw,
    #[default]
    Daily,
    Weekly,
    Monthly,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum WeightGroupBy {
    #[default]
    None,
    Tag,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct WeightSummaryBucket {
    pub bucket: String,
    pub tag: Option<String>,
    pub avg_kg: f64,
    pub min_kg: f64,
    pub max_kg: f64,
    pub count: i64,
}

/// Hashtag tokens in a note (`#Petkit`, `#manual`). The leading `#` is omitted.
pub fn extract_tags(note: &str) -> Vec<String> {
    let bytes = note.as_bytes();
    let mut tags = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'#' && is_tag_boundary(bytes, i) {
            let start = i + 1;
            let mut end = start;
            if end < bytes.len() && is_tag_start(bytes[end]) {
                end += 1;
                while end < bytes.len() && is_tag_char(bytes[end]) {
                    end += 1;
                }
                tags.push(note[start..end].to_string());
                i = end;
                continue;
            }
        }
        i += 1;
    }
    tags
}

/// First hashtag in the note, or `manual` when none are present.
pub fn primary_tag(note: Option<&str>) -> String {
    note.and_then(|text| extract_tags(text).into_iter().next())
        .unwrap_or_else(|| MANUAL_TAG.to_string())
}

/// Tags present on a note. Notes with no hashtag count as `manual`.
pub fn tags_for_note(note: Option<&str>) -> Vec<String> {
    let tags = extract_tags(note.unwrap_or(""));
    if tags.is_empty() {
        vec![MANUAL_TAG.to_string()]
    } else {
        tags
    }
}

/// Parse a comma-separated tag filter, dropping empty fragments.
pub fn parse_tag_filter(raw: Option<&str>) -> Vec<String> {
    raw.unwrap_or("")
        .split(',')
        .map(str::trim)
        .filter(|tag| !tag.is_empty())
        .map(str::to_string)
        .collect()
}

/// True when the note carries any of `tags` (case-insensitive).
pub fn note_has_any_tag(note: Option<&str>, tags: &[String]) -> bool {
    if tags.is_empty() {
        return false;
    }
    let want: std::collections::HashSet<String> =
        tags.iter().map(|tag| tag.to_ascii_lowercase()).collect();
    tags_for_note(note)
        .iter()
        .any(|tag| want.contains(&tag.to_ascii_lowercase()))
}

/// Distinct tags across notes, with per-note uniqueness and count order.
pub fn collect_tag_counts<I, S>(notes: I) -> Vec<WeightTagCount>
where
    I: IntoIterator<Item = Option<S>>,
    S: AsRef<str>,
{
    use std::collections::{BTreeMap, HashSet};

    struct Acc {
        tag: String,
        count: i64,
    }

    let mut map: BTreeMap<String, Acc> = BTreeMap::new();
    for note in notes {
        let tags = tags_for_note(note.as_ref().map(|s| s.as_ref()));
        let mut seen = HashSet::new();
        for tag in tags {
            let key = tag.to_ascii_lowercase();
            if !seen.insert(key.clone()) {
                continue;
            }
            map.entry(key)
                .and_modify(|acc| acc.count += 1)
                .or_insert(Acc { tag, count: 1 });
        }
    }

    let mut out: Vec<WeightTagCount> = map
        .into_values()
        .map(|acc| WeightTagCount {
            tag: acc.tag,
            count: acc.count,
        })
        .collect();
    out.sort_by(|a, b| {
        b.count
            .cmp(&a.count)
            .then_with(|| a.tag.to_ascii_lowercase().cmp(&b.tag.to_ascii_lowercase()))
    });
    out
}

/// Ensure every weight note has at least one hashtag.
///
/// Unhashed `Petkit` (any ASCII case) becomes `#Petkit`. Notes with no tags
/// get `#manual` prepended. Empty / missing notes become `#manual`.
pub fn normalize_weight_note(note: Option<&str>) -> String {
    let trimmed = note.map(str::trim).unwrap_or("");
    let with_petkit = hash_unhashed_petkit(trimmed);
    if extract_tags(&with_petkit).is_empty() {
        if with_petkit.is_empty() {
            format!("#{MANUAL_TAG}")
        } else {
            format!("#{MANUAL_TAG} {with_petkit}")
        }
    } else {
        with_petkit
    }
}

pub fn summarize_by_tag(
    records: &[WeightRecord],
    granularity: &WeightGranularity,
) -> Vec<WeightSummaryBucket> {
    use std::collections::BTreeMap;

    struct Acc {
        sum: f64,
        min: f64,
        max: f64,
        count: i64,
        tag: String,
    }

    let mut groups: BTreeMap<(String, String), Acc> = BTreeMap::new();
    for record in records {
        let bucket = match granularity {
            WeightGranularity::Raw => record.measured_at.clone(),
            WeightGranularity::Daily => record.local_date.clone(),
            WeightGranularity::Weekly => monday_week_start(&record.local_date),
            WeightGranularity::Monthly => month_start(&record.local_date),
        };
        let tag = primary_tag(record.note.as_deref());
        let key = (bucket, tag.to_ascii_lowercase());
        groups
            .entry(key)
            .and_modify(|acc| {
                acc.sum += record.weight_kg;
                acc.min = acc.min.min(record.weight_kg);
                acc.max = acc.max.max(record.weight_kg);
                acc.count += 1;
            })
            .or_insert(Acc {
                sum: record.weight_kg,
                min: record.weight_kg,
                max: record.weight_kg,
                count: 1,
                tag,
            });
    }

    groups
        .into_iter()
        .map(|((bucket, _), acc)| WeightSummaryBucket {
            bucket,
            tag: Some(acc.tag),
            avg_kg: acc.sum / acc.count as f64,
            min_kg: acc.min,
            max_kg: acc.max,
            count: acc.count,
        })
        .collect()
}

fn monday_week_start(local_date: &str) -> String {
    let date = NaiveDate::parse_from_str(local_date, "%Y-%m-%d")
        .unwrap_or_else(|_| NaiveDate::from_ymd_opt(1970, 1, 1).expect("epoch"));
    let offset = date.weekday().num_days_from_monday();
    (date - Duration::days(offset as i64))
        .format("%Y-%m-%d")
        .to_string()
}

fn month_start(local_date: &str) -> String {
    let date = NaiveDate::parse_from_str(local_date, "%Y-%m-%d")
        .unwrap_or_else(|_| NaiveDate::from_ymd_opt(1970, 1, 1).expect("epoch"));
    NaiveDate::from_ymd_opt(date.year(), date.month(), 1)
        .expect("valid month start")
        .format("%Y-%m-%d")
        .to_string()
}

fn hash_unhashed_petkit(input: &str) -> String {
    const NEEDLE: &[u8] = b"petkit";
    let lower = input.to_ascii_lowercase();
    let low = lower.as_bytes();
    let mut out = String::new();
    let mut i = 0;
    while i < low.len() {
        if low[i..].starts_with(NEEDLE) {
            let preceded_by_hash = i > 0 && input.as_bytes()[i - 1] == b'#';
            if preceded_by_hash {
                out.push_str(&input[i..i + NEEDLE.len()]);
            } else {
                out.push_str("#Petkit");
            }
            i += NEEDLE.len();
        } else {
            let ch = input[i..].chars().next().unwrap();
            out.push(ch);
            i += ch.len_utf8();
        }
    }
    out
}

fn is_tag_boundary(bytes: &[u8], hash_index: usize) -> bool {
    hash_index == 0 || !is_tag_char(bytes[hash_index - 1])
}

fn is_tag_start(b: u8) -> bool {
    b.is_ascii_alphabetic()
}

fn is_tag_char(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_' || b == b'-'
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_note_becomes_manual() {
        assert_eq!(normalize_weight_note(None), "#manual");
        assert_eq!(normalize_weight_note(Some("")), "#manual");
        assert_eq!(normalize_weight_note(Some("   ")), "#manual");
    }

    #[test]
    fn untagged_note_gets_manual_prefix() {
        assert_eq!(
            normalize_weight_note(Some("Morning weigh-in")),
            "#manual Morning weigh-in"
        );
    }

    #[test]
    fn existing_tag_is_kept() {
        assert_eq!(
            normalize_weight_note(Some("#vet after meal")),
            "#vet after meal"
        );
        assert_eq!(normalize_weight_note(Some("#manual")), "#manual");
    }

    #[test]
    fn petkit_word_becomes_tag() {
        assert_eq!(
            normalize_weight_note(Some("Petkit toileting")),
            "#Petkit toileting"
        );
        assert_eq!(
            normalize_weight_note(Some("after petkit visit")),
            "after #Petkit visit"
        );
        assert_eq!(
            normalize_weight_note(Some("#Petkit toileting")),
            "#Petkit toileting"
        );
    }

    #[test]
    fn extract_tags_finds_all_hashtags() {
        assert_eq!(
            extract_tags("#Petkit #home toileting"),
            vec!["Petkit".to_string(), "home".to_string()]
        );
        assert_eq!(extract_tags("no tags here"), Vec::<String>::new());
        assert_eq!(primary_tag(Some("Petkit toileting")), "manual");
        assert_eq!(primary_tag(Some("#Petkit toileting")), "Petkit");
        assert_eq!(primary_tag(None), "manual");
    }

    #[test]
    fn collect_tag_counts_is_distinct_and_counted() {
        let notes = [
            Some("#Petkit toileting"),
            Some("#Petkit #home"),
            Some("#manual"),
            Some("#Petkit toileting"),
            None,
        ];
        let tags = collect_tag_counts(notes);
        assert_eq!(
            tags,
            vec![
                WeightTagCount {
                    tag: "Petkit".into(),
                    count: 3
                },
                WeightTagCount {
                    tag: "manual".into(),
                    count: 2
                },
                WeightTagCount {
                    tag: "home".into(),
                    count: 1
                },
            ]
        );
    }

    #[test]
    fn note_has_any_tag_is_case_insensitive() {
        assert!(note_has_any_tag(
            Some("#Petkit toileting"),
            &["petkit".into()]
        ));
        assert!(!note_has_any_tag(
            Some("#Petkit toileting"),
            &["manual".into()]
        ));
        assert!(note_has_any_tag(None, &["manual".into()]));
        assert_eq!(
            parse_tag_filter(Some(" Petkit, manual ,")),
            vec!["Petkit".to_string(), "manual".to_string()]
        );
    }

    #[test]
    fn summarize_by_tag_splits_daily_series() {
        let pet_id = Uuid::nil();
        let records = vec![
            WeightRecord {
                id: "1".into(),
                pet_id,
                measured_at: "2026-06-15T09:00:00".into(),
                local_date: "2026-06-15".into(),
                weight_kg: 4.2,
                note: Some("#Petkit morning".into()),
                source_type: "manual".into(),
                created_at: "".into(),
            },
            WeightRecord {
                id: "2".into(),
                pet_id,
                measured_at: "2026-06-15T18:00:00".into(),
                local_date: "2026-06-15".into(),
                weight_kg: 4.4,
                note: Some("#Petkit evening".into()),
                source_type: "manual".into(),
                created_at: "".into(),
            },
            WeightRecord {
                id: "3".into(),
                pet_id,
                measured_at: "2026-06-15T12:00:00".into(),
                local_date: "2026-06-15".into(),
                weight_kg: 4.3,
                note: Some("#manual hand scale".into()),
                source_type: "manual".into(),
                created_at: "".into(),
            },
        ];
        let buckets = summarize_by_tag(&records, &WeightGranularity::Daily);
        assert_eq!(buckets.len(), 2);
        let petkit = buckets
            .iter()
            .find(|b| b.tag.as_deref() == Some("Petkit"))
            .unwrap();
        let manual = buckets
            .iter()
            .find(|b| b.tag.as_deref() == Some("manual"))
            .unwrap();
        assert_eq!(petkit.count, 2);
        assert!((petkit.avg_kg - 4.3).abs() < 1e-9);
        assert_eq!(petkit.min_kg, 4.2);
        assert_eq!(petkit.max_kg, 4.4);
        assert_eq!(manual.count, 1);
        assert_eq!(manual.avg_kg, 4.3);
    }

    #[test]
    fn summarize_by_tag_groups_monthly_buckets() {
        let pet_id = Uuid::nil();
        let records = vec![
            WeightRecord {
                id: "1".into(),
                pet_id,
                measured_at: "2026-06-02T09:00:00".into(),
                local_date: "2026-06-02".into(),
                weight_kg: 4.2,
                note: Some("#Petkit morning".into()),
                source_type: "manual".into(),
                created_at: "".into(),
            },
            WeightRecord {
                id: "2".into(),
                pet_id,
                measured_at: "2026-06-28T18:00:00".into(),
                local_date: "2026-06-28".into(),
                weight_kg: 4.4,
                note: Some("#Petkit evening".into()),
                source_type: "manual".into(),
                created_at: "".into(),
            },
            WeightRecord {
                id: "3".into(),
                pet_id,
                measured_at: "2026-07-03T12:00:00".into(),
                local_date: "2026-07-03".into(),
                weight_kg: 4.5,
                note: Some("#Petkit".into()),
                source_type: "manual".into(),
                created_at: "".into(),
            },
        ];
        let buckets = summarize_by_tag(&records, &WeightGranularity::Monthly);
        assert_eq!(buckets.len(), 2);
        let june = buckets.iter().find(|b| b.bucket == "2026-06-01").unwrap();
        let july = buckets.iter().find(|b| b.bucket == "2026-07-01").unwrap();
        assert_eq!(june.count, 2);
        assert!((june.avg_kg - 4.3).abs() < 1e-9);
        assert_eq!(july.count, 1);
        assert_eq!(july.avg_kg, 4.5);
    }
}
