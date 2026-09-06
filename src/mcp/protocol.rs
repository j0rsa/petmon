use serde_json::{json, Value};

use crate::error::{AppError, AppResult};

/// Protocol versions understood by handshake-era and Streamable HTTP clients (e.g. Pebble Index 01).
pub const SUPPORTED_PROTOCOL_VERSIONS: &[&str] =
    &["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

const DEFAULT_PROTOCOL_VERSION: &str = "2024-11-05";

/// Injected into client context on `initialize` (Pebble Index uses this as extra system prompt).
pub const MCP_SERVER_INSTRUCTIONS: &str = "\
You are connected to petmon, a pet care tracker. \
Call pets.list first to resolve pet names to IDs. \
Prefer pets.nutrition-context, pets.elimination-context, and pets.health-context over many individual tool calls. \
Use casual caregiver language (wee, poop, water) in replies — not clinical terms.";

pub fn negotiate_protocol_version(params: Option<&Value>) -> AppResult<String> {
    let requested = params
        .and_then(|p| p.get("protocolVersion"))
        .and_then(|v| v.as_str())
        .unwrap_or(DEFAULT_PROTOCOL_VERSION);

    if SUPPORTED_PROTOCOL_VERSIONS.contains(&requested) {
        Ok(requested.to_string())
    } else {
        Err(AppError::BadRequest(format!(
            "Unsupported protocol version: {requested}. Supported: {}",
            SUPPORTED_PROTOCOL_VERSIONS.join(", ")
        )))
    }
}

pub fn initialize_result(protocol_version: &str) -> Value {
    json!({
        "protocolVersion": protocol_version,
        "capabilities": {
            "tools": {},
            "resources": {},
            "prompts": {}
        },
        "serverInfo": {
            "name": "petmon",
            "version": env!("CARGO_PKG_VERSION")
        },
        "instructions": MCP_SERVER_INSTRUCTIONS,
    })
}

/// Wrap a successful tool result for clients that render Pebble Index `coreSchema` feed items.
pub fn tool_call_result(text: String) -> Value {
    json!({
        "content": [{ "type": "text", "text": text.clone() }],
        "isError": false,
        "_meta": { "coreSchema": 1 },
        "structuredContent": {
            "output": text.clone(),
            "semanticResult": {
                "type": "Response",
                "text": text,
            }
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn negotiate_accepts_pebble_index_protocol() {
        let params = json!({ "protocolVersion": "2025-06-18" });
        assert_eq!(
            negotiate_protocol_version(Some(&params)).unwrap(),
            "2025-06-18"
        );
    }

    #[test]
    fn negotiate_accepts_streamable_http_protocol() {
        let params = json!({ "protocolVersion": "2025-11-25" });
        assert_eq!(
            negotiate_protocol_version(Some(&params)).unwrap(),
            "2025-11-25"
        );
    }

    #[test]
    fn negotiate_rejects_unknown_protocol() {
        let params = json!({ "protocolVersion": "2026-07-28" });
        assert!(negotiate_protocol_version(Some(&params)).is_err());
    }

    #[test]
    fn tool_call_result_includes_core_schema_fields() {
        let result = tool_call_result("hello".to_string());
        assert_eq!(result["_meta"]["coreSchema"], 1);
        assert_eq!(result["structuredContent"]["output"], "hello");
        assert_eq!(
            result["structuredContent"]["semanticResult"]["type"],
            "Response"
        );
    }
}
