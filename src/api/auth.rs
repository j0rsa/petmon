use actix_web::{get, post, web, HttpMessage, HttpRequest, HttpResponse};
use openidconnect::{core::CoreProviderMetadata, reqwest::async_http_client, IssuerUrl};
use serde::Serialize;

use crate::auth::{
    identity::{Identity, IdentityKind},
    AppState,
};
use crate::domain::settings::OidcConfig;
use crate::error::{AppError, AppResult};
use crate::repo::api_tokens;
use crate::repo::settings;

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AuthMode {
    Dev,
    Oidc,
    Unconfigured,
}

#[derive(Serialize)]
pub struct AuthInfo {
    pub mode: AuthMode,
    /// Authorization endpoint base URL.
    /// FE appends its own PKCE params (code_challenge, state, redirect_uri).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub authorization_endpoint: Option<String>,
    /// OAuth2 client_id the FE must include in the authorization request.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub client_id: Option<String>,
    /// Token endpoint the FE POSTs to during the PKCE code exchange.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token_endpoint: Option<String>,
}

#[get("/auth/info")]
pub async fn auth_info(state: web::Data<AppState>) -> AppResult<HttpResponse> {
    if state.dev_mode {
        return Ok(HttpResponse::Ok().json(AuthInfo {
            mode: AuthMode::Dev,
            authorization_endpoint: None,
            client_id: None,
            token_endpoint: None,
        }));
    }

    let cfg: OidcConfig = settings::get(&state.pool, "oidc").await?;

    if !cfg.enabled {
        return Ok(HttpResponse::Ok().json(AuthInfo {
            mode: AuthMode::Unconfigured,
            authorization_endpoint: None,
            client_id: None,
            token_endpoint: None,
        }));
    }

    let (issuer_url, client_id) = match (cfg.issuer_url, cfg.client_id) {
        (Some(u), Some(c)) => (u, c),
        _ => {
            return Ok(HttpResponse::Ok().json(AuthInfo {
                mode: AuthMode::Unconfigured,
                authorization_endpoint: None,
                client_id: None,
                token_endpoint: None,
            }));
        }
    };

    let issuer = IssuerUrl::new(issuer_url)
        .map_err(|e| AppError::Internal(format!("invalid issuer URL: {e}")))?;

    let metadata = CoreProviderMetadata::discover_async(issuer, async_http_client)
        .await
        .map_err(|e| AppError::Internal(format!("OIDC discovery failed: {e}")))?;

    Ok(HttpResponse::Ok().json(AuthInfo {
        mode: AuthMode::Oidc,
        authorization_endpoint: Some(metadata.authorization_endpoint().url().to_string()),
        client_id: Some(client_id),
        token_endpoint: metadata.token_endpoint().map(|u| u.url().to_string()),
    }))
}

#[derive(Serialize)]
pub struct MeResponse {
    pub subject: String,
    pub email: Option<String>,
    pub name: Option<String>,
    pub display_name: String,
    pub kind: &'static str,
    /// Granted scopes. Empty means full access (no restriction).
    pub scopes: Vec<String>,
    /// Creator display name for the API token session (api_token kind only).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token_created_by: Option<String>,
}

#[get("/auth/me")]
pub async fn me(req: HttpRequest) -> AppResult<HttpResponse> {
    let identity = req
        .extensions()
        .get::<Identity>()
        .cloned()
        .ok_or_else(|| AppError::Internal("missing identity".to_string()))?;

    let kind = match identity.kind {
        crate::auth::identity::IdentityKind::Oidc => "oidc",
        crate::auth::identity::IdentityKind::ApiToken { .. } => "api_token",
        crate::auth::identity::IdentityKind::Dev => "dev",
    };

    let mut scopes: Vec<String> = identity.scopes.clone().into_iter().collect();
    scopes.sort();

    Ok(HttpResponse::Ok().json(MeResponse {
        display_name: identity.display_name().to_string(),
        subject: identity.subject,
        email: identity.email,
        name: identity.name,
        kind,
        scopes,
        token_created_by: identity.token_created_by,
    }))
}

/// End the current session. When authenticated via a long-lived API token the
/// token is permanently deleted so it cannot be reused after sign-out.
#[post("/auth/sign-out")]
pub async fn sign_out(req: HttpRequest, state: web::Data<AppState>) -> AppResult<HttpResponse> {
    let identity = req
        .extensions()
        .get::<Identity>()
        .cloned()
        .ok_or_else(|| AppError::Internal("missing identity".to_string()))?;

    if let IdentityKind::ApiToken { token_id } = identity.kind {
        api_tokens::delete_by_id(&state.pool, &token_id).await?;
    }

    Ok(HttpResponse::NoContent().finish())
}

/// Public routes — mount outside RequireAuth
pub fn configure_public(cfg: &mut web::ServiceConfig) {
    cfg.service(auth_info);
}

/// Protected routes — mount inside RequireAuth
pub fn configure_protected(cfg: &mut web::ServiceConfig) {
    cfg.service(me).service(sign_out);
}
