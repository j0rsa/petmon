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
        }
    }

    /// Best human-readable name: name → email → sub
    pub fn display_name(&self) -> &str {
        self.name
            .as_deref()
            .or(self.email.as_deref())
            .unwrap_or(&self.subject)
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
