use actix_web::{delete, get, post, web, HttpMessage, HttpRequest, HttpResponse};

use crate::auth::{
    identity::{Identity, IdentityKind},
    AppState,
};
use crate::domain::settings::{
    ApiTokenPublic, CreateApiToken, DisplaySettings, OidcConfig, OidcConfigPublic, TelegramConfig,
    TelegramConfigPublic, UpdateDisplaySettings, UpdateOidcConfig, UpdateTelegramConfig,
};
use crate::error::{AppError, AppResult};
use crate::repo::{api_tokens, settings};

// ── OIDC ─────────────────────────────────────────────────────────────────────

#[get("/oidc")]
pub async fn get_oidc(state: web::Data<AppState>) -> AppResult<HttpResponse> {
    let cfg: OidcConfig = settings::get(&state.pool, "oidc").await?;
    Ok(HttpResponse::Ok().json(OidcConfigPublic::from(cfg)))
}

#[post("/oidc")]
pub async fn update_oidc(
    state: web::Data<AppState>,
    body: web::Json<UpdateOidcConfig>,
) -> AppResult<HttpResponse> {
    let existing: OidcConfig = settings::get(&state.pool, "oidc").await?;
    let merged = body.into_inner().apply(existing);
    settings::upsert(&state.pool, "oidc", &merged).await?;
    // Invalidate cached JWKS so the next request re-discovers
    if let Some(oidc) = &state.oidc {
        oidc.invalidate();
    }
    Ok(HttpResponse::Ok().json(OidcConfigPublic::from(merged)))
}

// ── Display settings ─────────────────────────────────────────────────────────

#[get("/display")]
pub async fn get_display(state: web::Data<AppState>) -> AppResult<HttpResponse> {
    let cfg: DisplaySettings = settings::get(&state.pool, "display").await?;
    Ok(HttpResponse::Ok().json(cfg))
}

#[post("/display")]
pub async fn update_display(
    state: web::Data<AppState>,
    body: web::Json<UpdateDisplaySettings>,
) -> AppResult<HttpResponse> {
    let existing: DisplaySettings = settings::get(&state.pool, "display").await?;
    let merged = body.into_inner().apply(existing);
    settings::upsert(&state.pool, "display", &merged).await?;
    Ok(HttpResponse::Ok().json(merged))
}

// ── Telegram ──────────────────────────────────────────────────────────────────

#[get("/telegram")]
pub async fn get_telegram(state: web::Data<AppState>) -> AppResult<HttpResponse> {
    let cfg: TelegramConfig = settings::get(&state.pool, "telegram").await?;
    Ok(HttpResponse::Ok().json(TelegramConfigPublic::from(cfg)))
}

#[post("/telegram")]
pub async fn update_telegram(
    state: web::Data<AppState>,
    body: web::Json<UpdateTelegramConfig>,
) -> AppResult<HttpResponse> {
    let existing: TelegramConfig = settings::get(&state.pool, "telegram").await?;
    let merged = body.into_inner().apply(existing);
    settings::upsert(&state.pool, "telegram", &merged).await?;
    Ok(HttpResponse::Ok().json(TelegramConfigPublic::from(merged)))
}

// ── API tokens ────────────────────────────────────────────────────────────────

#[get("")]
pub async fn list_tokens(req: HttpRequest, state: web::Data<AppState>) -> AppResult<HttpResponse> {
    let tokens = api_tokens::list(&state.pool).await?;

    let current_token_id: Option<String> =
        req.extensions()
            .get::<Identity>()
            .and_then(|i| match &i.kind {
                IdentityKind::ApiToken { token_id } => Some(token_id.clone()),
                _ => None,
            });

    let public: Vec<ApiTokenPublic> = tokens
        .into_iter()
        .map(|t| {
            let is_current = current_token_id.as_deref() == Some(t.id.as_str());
            ApiTokenPublic {
                id: t.id,
                alias: t.alias,
                active: t.active,
                current: is_current,
                created_by: t.created_by,
                created_at: t.created_at,
                last_used_at: t.last_used_at,
            }
        })
        .collect();

    Ok(HttpResponse::Ok().json(public))
}

#[post("")]
pub async fn create_token(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<CreateApiToken>,
) -> AppResult<HttpResponse> {
    // API tokens can only be created by OIDC-authenticated users (or in dev mode)
    let identity = req
        .extensions()
        .get::<crate::auth::identity::Identity>()
        .cloned()
        .ok_or_else(|| AppError::Internal("missing identity in request".to_string()))?;

    match &identity.kind {
        IdentityKind::ApiToken { .. } => {
            return Err(AppError::BadRequest(
                "API tokens cannot be created using another API token. Authenticate via OIDC."
                    .to_string(),
            ));
        }
        IdentityKind::Oidc | IdentityKind::Dev => {}
    }

    // If OIDC is disabled (dev mode only path) we still allow it
    if !state.dev_mode && state.oidc.is_none() {
        return Err(AppError::BadRequest(
            "OIDC must be configured before API tokens can be created.".to_string(),
        ));
    }

    let mut req_body = body.into_inner();
    req_body.created_by = Some(identity.display_name().to_string());

    let (_, created) = api_tokens::create(&state.pool, req_body).await?;
    Ok(HttpResponse::Created().json(created))
}

#[post("/{id}/activate")]
pub async fn activate_token(
    state: web::Data<AppState>,
    path: web::Path<String>,
) -> AppResult<HttpResponse> {
    api_tokens::activate(&state.pool, &path.into_inner()).await?;
    Ok(HttpResponse::NoContent().finish())
}

#[delete("/{id}")]
pub async fn deactivate_token(
    state: web::Data<AppState>,
    path: web::Path<String>,
) -> AppResult<HttpResponse> {
    api_tokens::deactivate(&state.pool, &path.into_inner()).await?;
    Ok(HttpResponse::NoContent().finish())
}

#[delete("/{id}/permanent")]
pub async fn delete_token(
    state: web::Data<AppState>,
    path: web::Path<String>,
) -> AppResult<HttpResponse> {
    api_tokens::delete(&state.pool, &path.into_inner()).await?;
    Ok(HttpResponse::NoContent().finish())
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/settings")
            .service(get_oidc)
            .service(update_oidc)
            .service(get_display)
            .service(update_display)
            .service(get_telegram)
            .service(update_telegram),
    );
}

pub fn configure_api_tokens(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/api-tokens")
            .service(list_tokens)
            .service(create_token)
            .service(activate_token)
            .service(deactivate_token)
            .service(delete_token),
    );
}
