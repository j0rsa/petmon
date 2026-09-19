use actix_web::{delete, get, patch, post, web, HttpMessage, HttpRequest, HttpResponse};
use petmon_macros::require_scope;

use crate::auth::{
    identity::{Identity, IdentityKind},
    AppState,
};
use crate::domain::settings::{
    ApiTokenAdminPublic, ApiTokenPublic, CreateApiToken, OidcConfig, OidcConfigPublic,
    TelegramConfig, TelegramConfigPublic, UpdateApiTokenScopes, UpdateOidcConfig,
    UpdateTelegramConfig,
};
use crate::error::{AppError, AppResult};
use crate::repo::{api_tokens, settings};

fn identity(req: &HttpRequest) -> AppResult<Identity> {
    req.extensions()
        .get::<Identity>()
        .cloned()
        .ok_or_else(|| AppError::Internal("missing identity".into()))
}

fn public_token(t: crate::domain::settings::ApiToken, caller: &Identity) -> ApiTokenPublic {
    let current = matches!(&caller.kind, IdentityKind::ApiToken { token_id } if token_id == &t.id);
    let scopes = t.scopes_vec();
    ApiTokenPublic {
        id: t.id,
        alias: t.alias,
        active: t.active,
        current,
        scopes,
        created_by: t.created_by,
        created_at: t.created_at,
        last_used_at: t.last_used_at,
    }
}

fn audit(caller: &Identity, action: &str, target: &str) {
    tracing::info!(actor = %caller.subject, action, target, "administrative action");
}

// ── OIDC ─────────────────────────────────────────────────────────────────────

#[get("/oidc")]
#[require_scope("api_read")]
pub async fn get_oidc(req: HttpRequest, state: web::Data<AppState>) -> AppResult<HttpResponse> {
    let caller = identity(&req)?;
    crate::auth::admin::require_instance_admin(&state.pool, &caller).await?;
    let cfg: OidcConfig = settings::get(&state.pool, "oidc").await?;
    audit(&caller, "settings.inspect", "oidc");
    Ok(HttpResponse::Ok().json(OidcConfigPublic::from(cfg)))
}

#[post("/oidc")]
#[require_scope("api_write")]
pub async fn update_oidc(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<UpdateOidcConfig>,
) -> AppResult<HttpResponse> {
    let caller = identity(&req)?;
    crate::auth::admin::require_instance_admin(&state.pool, &caller).await?;
    let existing: OidcConfig = settings::get(&state.pool, "oidc").await?;
    let merged = body.into_inner().apply(existing);
    settings::upsert(&state.pool, "oidc", &merged).await?;
    audit(&caller, "settings.update", "oidc");
    // Invalidate cached JWKS so the next request re-discovers
    if let Some(oidc) = &state.oidc {
        oidc.invalidate();
    }
    Ok(HttpResponse::Ok().json(OidcConfigPublic::from(merged)))
}

// ── Telegram ──────────────────────────────────────────────────────────────────

#[get("/telegram")]
#[require_scope("api_read")]
pub async fn get_telegram(req: HttpRequest, state: web::Data<AppState>) -> AppResult<HttpResponse> {
    let caller = identity(&req)?;
    crate::auth::admin::require_instance_admin(&state.pool, &caller).await?;
    let cfg: TelegramConfig = settings::get(&state.pool, "telegram").await?;
    audit(&caller, "settings.inspect", "telegram");
    Ok(HttpResponse::Ok().json(TelegramConfigPublic::from(cfg)))
}

#[post("/telegram")]
#[require_scope("api_write")]
pub async fn update_telegram(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<UpdateTelegramConfig>,
) -> AppResult<HttpResponse> {
    let caller = identity(&req)?;
    crate::auth::admin::require_instance_admin(&state.pool, &caller).await?;
    let existing: TelegramConfig = settings::get(&state.pool, "telegram").await?;
    let merged = body.into_inner().apply(existing);
    settings::upsert(&state.pool, "telegram", &merged).await?;
    audit(&caller, "settings.update", "telegram");
    Ok(HttpResponse::Ok().json(TelegramConfigPublic::from(merged)))
}

// ── API tokens ────────────────────────────────────────────────────────────────

#[get("")]
#[require_scope("api_read")]
pub async fn list_tokens(req: HttpRequest, state: web::Data<AppState>) -> AppResult<HttpResponse> {
    let caller = identity(&req)?;
    let tokens = api_tokens::list_owned(&state.pool, &caller.subject).await?;

    let public: Vec<ApiTokenPublic> = tokens
        .into_iter()
        .map(|t| public_token(t, &caller))
        .collect();

    Ok(HttpResponse::Ok().json(public))
}

#[post("")]
#[require_scope("api_write")]
pub async fn create_token(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<CreateApiToken>,
) -> AppResult<HttpResponse> {
    // The authenticated canonical actor, never a caller-provided owner.
    let identity = req
        .extensions()
        .get::<crate::auth::identity::Identity>()
        .cloned()
        .ok_or_else(|| AppError::Internal("missing identity in request".to_string()))?;

    // Identity resolution already authenticated this actor, including trusted
    // embedding adapters that do not use the standalone OIDC configuration.
    let mut req_body = body.into_inner();
    req_body.scopes =
        Some(crate::auth::admin::attenuate_scopes(&state.pool, &identity, req_body.scopes).await?);
    req_body.created_by = Some(identity.display_name().to_string());
    req_body.owner_subject = Some(identity.subject.clone());

    let (_, created) = api_tokens::create(&state.pool, req_body).await?;
    audit(&identity, "token.create", &created.id);
    Ok(HttpResponse::Created().json(created))
}

#[post("/{id}/activate")]
#[require_scope("api_write")]
pub async fn activate_token(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<String>,
) -> AppResult<HttpResponse> {
    let caller = identity(&req)?;
    let id = path.into_inner();
    let token = api_tokens::get_owned(&state.pool, &id, &caller.subject).await?;
    let mut scopes = token.scopes_vec();
    // Legacy empty scopes confer ordinary full access, not literal `all`'s
    // eligibility for administration. Compare the actual authority, while the
    // activation CAS below still checks the original stored scopes.
    if scopes.is_empty() {
        scopes = ["api_read", "api_write", "mcp"]
            .into_iter()
            .map(str::to_owned)
            .collect();
    }
    crate::auth::admin::attenuate_scopes(&state.pool, &caller, Some(scopes)).await?;
    api_tokens::activate_owned(&state.pool, &id, &caller.subject, &token.scopes).await?;
    audit(&caller, "token.activate", &id);
    Ok(HttpResponse::NoContent().finish())
}

#[delete("/{id}")]
#[require_scope("api_write")]
pub async fn deactivate_token(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<String>,
) -> AppResult<HttpResponse> {
    let caller = identity(&req)?;
    let id = path.into_inner();
    api_tokens::set_active_owned(&state.pool, &id, &caller.subject, false).await?;
    audit(&caller, "token.revoke", &id);
    Ok(HttpResponse::NoContent().finish())
}

#[delete("/{id}/permanent")]
#[require_scope("api_write")]
pub async fn delete_token(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<String>,
) -> AppResult<HttpResponse> {
    let caller = identity(&req)?;
    let id = path.into_inner();
    api_tokens::delete_owned(&state.pool, &id, &caller.subject, true).await?;
    audit(&caller, "token.delete", &id);
    Ok(HttpResponse::NoContent().finish())
}

#[patch("/{id}/scopes")]
#[require_scope("api_write")]
pub async fn update_token_scopes(
    request: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<String>,
    body: web::Json<UpdateApiTokenScopes>,
) -> AppResult<HttpResponse> {
    let caller = identity(&request)?;
    let id = path.into_inner();
    let token = crate::auth::admin::update_owned_token_scopes(
        &state.pool,
        &caller,
        &id,
        body.into_inner().scopes,
    )
    .await?;
    Ok(HttpResponse::Ok().json(public_token(token, &caller)))
}

#[get("")]
#[require_scope("api_read")]
pub async fn admin_list_tokens(
    req: HttpRequest,
    state: web::Data<AppState>,
) -> AppResult<HttpResponse> {
    let caller = identity(&req)?;
    crate::auth::admin::require_instance_admin(&state.pool, &caller).await?;
    let tokens = api_tokens::list(&state.pool).await?;
    audit(&caller, "token.inspect_all", "api_tokens");
    Ok(HttpResponse::Ok().json(
        tokens
            .into_iter()
            .map(|t| {
                let owner_subject = t.owner_subject.clone();
                ApiTokenAdminPublic {
                    token: public_token(t, &caller),
                    owner_subject,
                }
            })
            .collect::<Vec<_>>(),
    ))
}

#[delete("/{id}")]
#[require_scope("api_write")]
pub async fn admin_revoke_token(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<String>,
) -> AppResult<HttpResponse> {
    let caller = identity(&req)?;
    crate::auth::admin::require_instance_admin(&state.pool, &caller).await?;
    let id = path.into_inner();
    api_tokens::deactivate(&state.pool, &id).await?;
    audit(&caller, "token.admin_revoke", &id);
    Ok(HttpResponse::NoContent().finish())
}

#[delete("/{id}/permanent")]
#[require_scope("api_write")]
pub async fn admin_delete_token(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<String>,
) -> AppResult<HttpResponse> {
    let caller = identity(&req)?;
    crate::auth::admin::require_instance_admin(&state.pool, &caller).await?;
    let id = path.into_inner();
    api_tokens::delete(&state.pool, &id).await?;
    audit(&caller, "token.admin_delete", &id);
    Ok(HttpResponse::NoContent().finish())
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/settings")
            .service(get_oidc)
            .service(update_oidc)
            .service(get_telegram)
            .service(update_telegram),
    );
}

pub fn configure_api_tokens(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/admin/api-tokens")
            .service(admin_list_tokens)
            .service(admin_revoke_token)
            .service(admin_delete_token),
    );
    cfg.service(
        web::scope("/api-tokens")
            .service(list_tokens)
            .service(create_token)
            .service(activate_token)
            .service(deactivate_token)
            .service(delete_token)
            .service(update_token_scopes),
    );
}
