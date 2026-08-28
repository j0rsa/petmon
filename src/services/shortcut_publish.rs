use rust_embed::RustEmbed;
use serde::Deserialize;

#[derive(RustEmbed)]
#[folder = "assets/shortcuts"]
#[include = "publish.json"]
struct MedIntakePublishAssets;

#[derive(Debug, Deserialize, Default)]
struct PublishConfig {
    #[serde(default)]
    icloud_url: Option<String>,
}

/// iCloud Shortcuts share link for med intake import on iPhone/iPad.
///
/// Priority: `MED_INTAKE_SHORTCUT_ICLOUD_URL` env, then `assets/shortcuts/publish.json`.
pub fn resolve_med_intake_icloud_url() -> Option<String> {
    if let Ok(raw) = std::env::var("MED_INTAKE_SHORTCUT_ICLOUD_URL") {
        if let Some(url) = normalize_icloud_url(&raw) {
            return Some(url);
        }
    }

    load_publish_config()?
        .icloud_url
        .and_then(|url| normalize_icloud_url(&url))
}

fn load_publish_config() -> Option<PublishConfig> {
    let embedded = MedIntakePublishAssets::get("publish.json")?;
    serde_json::from_slice(&embedded.data).ok()
}

fn normalize_icloud_url(raw: &str) -> Option<String> {
    let url = raw.trim();
    if url.is_empty() {
        return None;
    }
    if !url.starts_with("https://www.icloud.com/shortcuts/") {
        tracing::warn!(
            url,
            "med intake shortcut icloud_url must start with https://www.icloud.com/shortcuts/"
        );
        return None;
    }
    Some(url.to_string())
}
