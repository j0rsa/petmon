use actix_web::HttpResponse;
use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Not found: {0}")]
    NotFound(String),
    #[error("Bad request: {0}")]
    BadRequest(String),
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("Internal error: {0}")]
    Internal(String),
    #[error("Validation error: {field} - {message}")]
    Validation { field: String, message: String },
}

#[derive(Serialize)]
pub struct ErrorResponse {
    pub error: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub field: Option<String>,
}

impl actix_web::ResponseError for AppError {
    fn error_response(&self) -> HttpResponse {
        let (status, error_code, field) = match self {
            AppError::NotFound(_) => (actix_web::http::StatusCode::NOT_FOUND, "NOT_FOUND", None),
            AppError::BadRequest(_) => (
                actix_web::http::StatusCode::BAD_REQUEST,
                "BAD_REQUEST",
                None,
            ),
            AppError::Database(e) => {
                tracing::error!(error = %e, "database error");
                (
                    actix_web::http::StatusCode::INTERNAL_SERVER_ERROR,
                    "DATABASE_ERROR",
                    None,
                )
            }
            AppError::Internal(_) => (
                actix_web::http::StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                None,
            ),
            AppError::Validation { field, .. } => (
                actix_web::http::StatusCode::UNPROCESSABLE_ENTITY,
                "VALIDATION_ERROR",
                Some(field.clone()),
            ),
        };

        let message = match self {
            AppError::Database(_) => "An internal database error occurred".to_string(),
            _ => self.to_string(),
        };

        HttpResponse::build(status).json(ErrorResponse {
            error: error_code.to_string(),
            message,
            field,
        })
    }
}

pub type AppResult<T> = Result<T, AppError>;
