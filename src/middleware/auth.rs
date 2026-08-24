use actix_web::{
    body::EitherBody,
    dev::{forward_ready, Service, ServiceRequest, ServiceResponse, Transform},
    web, Error, HttpMessage, HttpResponse,
};
use futures::future::{ready, LocalBoxFuture, Ready};
use std::rc::Rc;

use crate::auth::{identity::Identity, AppState};
use crate::repo::api_tokens;

pub struct RequireAuth;

impl<S, B> Transform<S, ServiceRequest> for RequireAuth
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    B: 'static,
{
    type Response = ServiceResponse<EitherBody<B>>;
    type Error = Error;
    type Transform = RequireAuthMiddleware<S>;
    type InitError = ();
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ready(Ok(RequireAuthMiddleware {
            service: Rc::new(service),
        }))
    }
}

pub struct RequireAuthMiddleware<S> {
    service: Rc<S>,
}

impl<S, B> Service<ServiceRequest> for RequireAuthMiddleware<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    B: 'static,
{
    type Response = ServiceResponse<EitherBody<B>>;
    type Error = Error;
    type Future = LocalBoxFuture<'static, Result<Self::Response, Self::Error>>;

    forward_ready!(service);

    fn call(&self, req: ServiceRequest) -> Self::Future {
        let service = Rc::clone(&self.service);

        Box::pin(async move {
            // Public paths that bypass auth entirely
            let public = matches!(
                req.path(),
                "/api/v1/auth/info"
                    | "/api/v1/health"
                    | "/api/v1/info"
                    | "/api/v1/shortcuts/meds/intake.shortcut"
                    | "/api/v1/shortcuts/meds/intake.flo"
            );
            if public {
                let res = service.call(req).await?;
                return Ok(res.map_into_left_body());
            }

            let state = req
                .app_data::<web::Data<AppState>>()
                .cloned()
                .expect("AppState not registered");

            // DEV_MODE: skip all auth
            if state.dev_mode {
                req.extensions_mut().insert(Identity::dev());
                let res = service.call(req).await?;
                return Ok(res.map_into_left_body());
            }

            // No auth method configured → refuse to serve
            let has_active_tokens = api_tokens::has_active_tokens(&state.pool).await;
            let oidc_enabled = state.oidc.is_some();

            if !oidc_enabled && !has_active_tokens {
                let resp = HttpResponse::ServiceUnavailable().json(serde_json::json!({
                    "error": "AUTH_NOT_CONFIGURED",
                    "message": "No authentication is configured. Set DEV_MODE=true, configure OIDC, or create an API token."
                }));
                let res = req.into_response(resp).map_into_right_body();
                return Ok(res);
            }

            // Extract bearer token
            let bearer = req
                .headers()
                .get("Authorization")
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.strip_prefix("Bearer "))
                .map(str::to_owned);

            let Some(token) = bearer else {
                let resp = HttpResponse::Unauthorized().json(serde_json::json!({
                    "error": "UNAUTHORIZED",
                    "message": "Missing Authorization: Bearer <token> header."
                }));
                return Ok(req.into_response(resp).map_into_right_body());
            };

            // Route by prefix — no DB round-trip needed to decide which path to take
            if token.starts_with("pm_api_") {
                match api_tokens::find_by_hash(&state.pool, &token).await {
                    Ok(Some(api_token)) => {
                        let Some(owner_subject) =
                            api_token.owner_subject.clone().filter(|s| !s.is_empty())
                        else {
                            let resp = HttpResponse::Unauthorized().json(serde_json::json!({
                                "error": "UNAUTHORIZED",
                                "message": "API token has no owner. Sign in with OIDC and mint a new token."
                            }));
                            return Ok(req.into_response(resp).map_into_right_body());
                        };
                        let display = api_token
                            .alias
                            .clone()
                            .or_else(|| api_token.created_by.clone())
                            .unwrap_or_else(|| api_token.id.clone());
                        let scopes = api_token.scopes_vec().into_iter().collect();
                        let identity = Identity {
                            subject: owner_subject.clone(),
                            email: None,
                            name: Some(display),
                            kind: crate::auth::identity::IdentityKind::ApiToken {
                                token_id: api_token.id,
                            },
                            scopes,
                            token_created_by: api_token.created_by.clone(),
                            owner_subject: Some(owner_subject),
                        };
                        req.extensions_mut().insert(identity);
                        let res = service.call(req).await?;
                        return Ok(res.map_into_left_body());
                    }
                    _ => {
                        let resp = HttpResponse::Unauthorized().json(serde_json::json!({
                            "error": "UNAUTHORIZED",
                            "message": "Invalid or inactive API token."
                        }));
                        return Ok(req.into_response(resp).map_into_right_body());
                    }
                }
            }

            // Try OIDC JWT
            if let Some(oidc) = &state.oidc {
                match oidc.verify(&token).await {
                    Ok(identity) => {
                        req.extensions_mut().insert(identity);
                        let res = service.call(req).await?;
                        return Ok(res.map_into_left_body());
                    }
                    Err(e) => {
                        tracing::debug!(error = %e, "OIDC verification failed");
                    }
                }
            }

            let resp = HttpResponse::Unauthorized().json(serde_json::json!({
                "error": "UNAUTHORIZED",
                "message": "Invalid or expired token."
            }));
            Ok(req.into_response(resp).map_into_right_body())
        })
    }
}
