use actix_web::{post, web, HttpResponse};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

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

#[post("/mcp")]
pub async fn mcp_handler(pool: web::Data<SqlitePool>, body: web::Json<McpRequest>) -> HttpResponse {
    let req = body.into_inner();
    let id = req.id.clone();

    if req.jsonrpc != "2.0" {
        return HttpResponse::Ok().json(McpResponse::err(id, -32600, "Invalid JSON-RPC version"));
    }

    match super::tools::dispatch(pool.get_ref(), &req.method, req.params).await {
        Ok(result) => HttpResponse::Ok().json(McpResponse::ok(id, result)),
        Err(e) => {
            let (code, msg) = match e {
                crate::error::AppError::NotFound(m) => (-32001, m),
                crate::error::AppError::BadRequest(m) => (-32602, m),
                crate::error::AppError::Validation { message, .. } => (-32602, message),
                crate::error::AppError::Database(e) => (-32603, format!("Database error: {e}")),
                crate::error::AppError::Internal(m) => (-32603, m),
            };
            HttpResponse::Ok().json(McpResponse::err(id, code, &msg))
        }
    }
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(mcp_handler);
}
