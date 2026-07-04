use actix_web::{post, web, HttpResponse};
use petmon_macros::require_scope;
use serde::{Deserialize, Serialize};

use crate::auth::AppState;
use crate::error::AppResult;

#[derive(Debug, Deserialize)]
pub struct McpRequest {
    pub jsonrpc: String,
    pub id: Option<serde_json::Value>,
    pub method: String,
    pub params: Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
pub struct McpResponse {
    pub jsonrpc: String,
    pub id: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<McpError>,
}

#[derive(Debug, Serialize)]
pub struct McpError {
    pub code: i32,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

impl McpResponse {
    pub fn ok(id: Option<serde_json::Value>, result: serde_json::Value) -> Self {
        McpResponse {
            jsonrpc: "2.0".to_string(),
            id,
            result: Some(result),
            error: None,
        }
    }

    pub fn err(id: Option<serde_json::Value>, code: i32, message: &str) -> Self {
        McpResponse {
            jsonrpc: "2.0".to_string(),
            id,
            result: None,
            error: Some(McpError {
                code,
                message: message.to_string(),
                data: None,
            }),
        }
    }
}

#[post("")]
#[require_scope("mcp")]
#[tracing::instrument(name = "mcp_request", skip(state, body), fields(method = tracing::field::Empty))]
pub async fn mcp_handler(
    state: web::Data<AppState>,
    body: web::Json<McpRequest>,
) -> AppResult<HttpResponse> {
    let req = body.into_inner();
    let id = req.id.clone();

    tracing::Span::current().record("method", req.method.as_str());

    if req.jsonrpc != "2.0" {
        return Ok(HttpResponse::Ok().json(McpResponse::err(
            id,
            -32600,
            "Invalid JSON-RPC version",
        )));
    }

    // Resource methods are handled separately from tool dispatch
    let result = match req.method.as_str() {
        "initialize" => Ok(serde_json::json!({
            "protocolVersion": "2024-11-05",
            "capabilities": {
                "tools": {},
                "resources": {},
                "prompts": {}
            },
            "serverInfo": {
                "name": "petmon",
                "version": env!("CARGO_PKG_VERSION")
            }
        })),
        "notifications/initialized" => Ok(serde_json::json!(null)),
        "ping" => Ok(serde_json::json!({})),
        "prompts/list" => Ok(super::prompts::prompt_list()),
        "prompts/get" => {
            let params = req.params.unwrap_or_else(|| serde_json::json!({}));
            let name = params
                .get("name")
                .and_then(|v| v.as_str())
                .ok_or_else(|| crate::error::AppError::BadRequest("name required".to_string()))?;
            let arguments = params.get("arguments");
            super::prompts::get_prompt(name, arguments)
        }
        "resources/templates/list" => Ok(serde_json::json!({ "resourceTemplates": [] })),
        "tools/call" => {
            let params = req.params.unwrap_or_else(|| serde_json::json!({}));
            let name = params
                .get("name")
                .and_then(|v| v.as_str())
                .ok_or_else(|| crate::error::AppError::BadRequest("name required".to_string()));
            match name {
                Err(e) => Err(e),
                Ok(name) => {
                    let arguments = params.get("arguments").cloned().map(Some).unwrap_or(None);
                    super::tools::dispatch(&state.pool, name, arguments, state.timezone)
                        .await
                        .map(|content| {
                            serde_json::json!({
                                "content": [{ "type": "text", "text": content.to_string() }],
                                "isError": false
                            })
                        })
                }
            }
        }
        "resources/list" => Ok(super::resources::resource_list()),
        "resources/read" => {
            let uri = req
                .params
                .as_ref()
                .and_then(|p| p.get("uri"))
                .and_then(|v| v.as_str())
                .map(str::to_owned);
            match uri {
                Some(uri) => super::resources::read_resource(&state.pool, &uri).await,
                None => Err(crate::error::AppError::BadRequest(
                    "uri required".to_string(),
                )),
            }
        }
        _ => super::tools::dispatch(&state.pool, &req.method, req.params, state.timezone).await,
    };

    Ok(match result {
        Ok(result) => HttpResponse::Ok().json(McpResponse::ok(id, result)),
        Err(e) => {
            let (code, msg) = match e {
                crate::error::AppError::NotFound(m) => (-32001, m),
                crate::error::AppError::BadRequest(m) => (-32602, m),
                crate::error::AppError::Forbidden(m) => (-32603, format!("Forbidden: {m}")),
                crate::error::AppError::Validation { message, .. } => (-32602, message),
                crate::error::AppError::Database(e) => (-32603, format!("Database error: {e}")),
                crate::error::AppError::Internal(m) => (-32603, m),
            };
            HttpResponse::Ok().json(McpResponse::err(id, code, &msg))
        }
    })
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(mcp_handler);
}
