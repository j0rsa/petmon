use serde::{Deserialize, Serialize};
use std::{fmt, str::FromStr};

/// Credential permissions shared by REST, MCP, token management and session identity.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Scope {
    All,
    ApiRead,
    ApiWrite,
    Mcp,
}

impl Scope {
    pub const ALL: [Self; 4] = [Self::All, Self::ApiRead, Self::ApiWrite, Self::Mcp];
    pub const ORDINARY: [Self; 3] = [Self::ApiRead, Self::ApiWrite, Self::Mcp];

    pub const fn as_str(self) -> &'static str {
        match self {
            Self::All => "all",
            Self::ApiRead => "api_read",
            Self::ApiWrite => "api_write",
            Self::Mcp => "mcp",
        }
    }
}

impl fmt::Display for Scope {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

impl FromStr for Scope {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        Self::ALL
            .into_iter()
            .find(|scope| scope.as_str() == value)
            .ok_or_else(|| format!("unknown scope '{value}'"))
    }
}

/// Server-side grants, deliberately separate from credential scopes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Role {
    InstanceAdmin,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn enums_preserve_wire_values_and_reject_unknown_values() {
        for scope in Scope::ALL {
            let json = serde_json::to_value(scope).unwrap();
            assert_eq!(json, scope.as_str());
            assert_eq!(serde_json::from_value::<Scope>(json).unwrap(), scope);
            assert_eq!(scope.as_str().parse::<Scope>().unwrap(), scope);
        }
        assert_eq!(
            serde_json::to_value(Role::InstanceAdmin).unwrap(),
            "instance_admin"
        );
        assert_eq!(
            serde_json::from_str::<Role>("\"instance_admin\"").unwrap(),
            Role::InstanceAdmin
        );
        for value in ["instance_admin", "unknown", "ALL", ""] {
            assert!(value.parse::<Scope>().is_err());
            assert!(serde_json::from_value::<Scope>(serde_json::json!(value)).is_err());
        }
        assert!(serde_json::from_str::<Role>("\"all\"").is_err());
        assert!(serde_json::from_str::<Role>("\"owner\"").is_err());
    }

    #[test]
    fn stored_scopes_are_validated_without_widening_invalid_credentials() {
        use crate::domain::settings::{parse_scopes, scopes_csv};
        assert_eq!(
            parse_scopes(" all, api_read,api_write,mcp ").unwrap(),
            Scope::ALL
        );
        assert_eq!(scopes_csv(&Scope::ALL), "all,api_read,api_write,mcp");
        assert!(parse_scopes("").unwrap().is_empty());
        for invalid in [
            "unknown",
            "instance_admin",
            "all,unknown",
            "api_read,instance_admin",
        ] {
            assert!(parse_scopes(invalid).is_err());
        }
    }
}
