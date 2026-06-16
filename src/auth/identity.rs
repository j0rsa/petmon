/// Authenticated caller, injected into request extensions by the auth middleware.
#[derive(Debug, Clone)]
pub struct Identity {
    pub subject: String,
    pub email: Option<String>,
    /// `name` claim from the OIDC JWT, if present.
    pub name: Option<String>,
    pub kind: IdentityKind,
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
        }
    }

    /// Best human-readable name: name → email → sub
    pub fn display_name(&self) -> &str {
        self.name
            .as_deref()
            .or(self.email.as_deref())
            .unwrap_or(&self.subject)
    }
}
