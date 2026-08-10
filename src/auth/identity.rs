use std::collections::HashSet;

/// Authenticated caller, injected into request extensions by the auth middleware.
#[derive(Debug, Clone)]
pub struct Identity {
    pub subject: String,
    pub email: Option<String>,
    /// `name` claim from the OIDC JWT, if present.
    pub name: Option<String>,
    pub kind: IdentityKind,
    /// Granted scopes. Empty means full access (no restriction). HashSet for O(1) lookup.
    pub scopes: HashSet<String>,
    /// Creator display name snapshot for the current API token session, if any.
    pub token_created_by: Option<String>,
    /// OIDC subject (or `dev`) when authenticated via an API token that recorded its owner.
    pub owner_subject: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum IdentityKind {
    /// Authenticated via OIDC JWT
    Oidc,
    /// Authenticated via a stored API token
    ApiToken { token_id: String },
    /// DEV_MODE — no real auth
    Dev,
}

impl Identity {
    pub fn dev() -> Self {
        Identity {
            subject: "dev".to_string(),
            email: Some("dev@localhost".to_string()),
            name: Some("Dev".to_string()),
            kind: IdentityKind::Dev,
            scopes: HashSet::new(),
            token_created_by: None,
            owner_subject: None,
        }
    }

    /// Best human-readable name: name → email → sub
    pub fn display_name(&self) -> &str {
        self.name
            .as_deref()
            .or(self.email.as_deref())
            .unwrap_or(&self.subject)
    }

    /// Stable key for per-user state (settings, notification reads, push ownership).
    ///
    /// - OIDC: JWT `sub` — same user on web and mobile shares one key.
    /// - API token: owner's `sub` when the token was minted by an OIDC/dev session;
    ///   legacy tokens without `owner_subject` fall back to `api_token:{id}`.
    /// - DEV_MODE: `"dev"`.
    pub fn reader_key(&self) -> String {
        match &self.kind {
            IdentityKind::Dev => "dev".to_string(),
            IdentityKind::Oidc => self.subject.clone(),
            IdentityKind::ApiToken { token_id } => self
                .owner_subject
                .clone()
                .unwrap_or_else(|| format!("api_token:{token_id}")),
        }
    }

    /// Returns true if this identity is permitted to use `required_scope`.
    ///
    /// - Dev identities always pass.
    /// - OIDC and API token identities with an empty scopes set have full access.
    /// - Otherwise scopes must contain `"all"` or `required_scope`.
    pub fn has_scope(&self, required_scope: &str) -> bool {
        match self.kind {
            IdentityKind::Dev => true,
            IdentityKind::Oidc | IdentityKind::ApiToken { .. } => {
                self.scopes.is_empty()
                    || self.scopes.contains("all")
                    || self.scopes.contains(required_scope)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn reader_key_oidc_uses_subject() {
        let identity = Identity {
            subject: "google-oauth2|123".into(),
            email: None,
            name: None,
            kind: IdentityKind::Oidc,
            scopes: HashSet::new(),
            token_created_by: None,
            owner_subject: None,
        };
        assert_eq!(identity.reader_key(), "google-oauth2|123");
    }

    #[test]
    fn reader_key_api_token_prefers_owner_subject() {
        let identity = Identity {
            subject: "My Device".into(),
            email: None,
            name: Some("My Device".into()),
            kind: IdentityKind::ApiToken {
                token_id: "tok-1".into(),
            },
            scopes: HashSet::new(),
            token_created_by: Some("Alice".into()),
            owner_subject: Some("google-oauth2|123".into()),
        };
        assert_eq!(identity.reader_key(), "google-oauth2|123");
    }

    #[test]
    fn reader_key_api_token_falls_back_without_owner_subject() {
        let identity = Identity {
            subject: "legacy".into(),
            email: None,
            name: None,
            kind: IdentityKind::ApiToken {
                token_id: "tok-legacy".into(),
            },
            scopes: HashSet::new(),
            token_created_by: None,
            owner_subject: None,
        };
        assert_eq!(identity.reader_key(), "api_token:tok-legacy");
    }
}
