//! Tool schema and execution are replaced together, after alias normalization.
use crate::{
    embedding::ServiceContext,
    error::{AppError, AppResult},
};
use futures::future::BoxFuture;
use serde_json::Value;
use std::{collections::BTreeMap, sync::Arc};

pub trait ToolHandler: Send + Sync {
    fn call<'a>(
        &'a self,
        context: &'a ServiceContext,
        arguments: Value,
    ) -> BoxFuture<'a, AppResult<Value>>;
}
#[derive(Clone, Default)]
pub struct ToolRegistry {
    tools: BTreeMap<String, (Value, Arc<dyn ToolHandler>)>,
}
impl ToolRegistry {
    pub fn register(&mut self, schema: Value, handler: Arc<dyn ToolHandler>) -> AppResult<()> {
        let name = schema
            .get("name")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::BadRequest("tool name required".into()))?
            .to_owned();
        if name.is_empty()
            || name.len() > 128
            || !name
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || b"_.-".contains(&c))
        {
            return Err(AppError::BadRequest("invalid tool name".into()));
        }
        if matches!(name.as_str(), "initialize" | "ping")
            || ["tools.", "resources.", "prompts.", "notifications."]
                .iter()
                .any(|prefix| name.starts_with(prefix))
        {
            return Err(AppError::BadRequest(
                "tool name conflicts with protocol method".into(),
            ));
        }
        if !schema.get("inputSchema").is_some_and(Value::is_object) {
            return Err(AppError::BadRequest(
                "tool inputSchema object required".into(),
            ));
        }
        if self.tools.contains_key(&name) {
            return Err(AppError::BadRequest(format!("duplicate tool: {name}")));
        }
        self.tools.insert(name, (schema, handler));
        Ok(())
    }
    pub fn list(&self) -> Value {
        let defaults = super::tools::tool_list();
        let mut tools: BTreeMap<String, Value> = defaults["tools"]
            .as_array()
            .expect("tool list")
            .iter()
            .map(|schema| (schema["name"].as_str().unwrap().to_owned(), schema.clone()))
            .collect();
        for (name, (schema, _)) in &self.tools {
            tools.insert(name.clone(), schema.clone());
        }
        serde_json::json!({"tools": tools.into_values().collect::<Vec<_>>()})
    }
    pub async fn dispatch(
        &self,
        context: &ServiceContext,
        name: &str,
        arguments: Option<Value>,
    ) -> AppResult<Value> {
        let name = name.replace('/', ".");
        if name == "tools.list" {
            return Ok(self.list());
        }
        if let Some((_, handler)) = self.tools.get(&name) {
            return handler
                .call(context, arguments.unwrap_or_else(|| serde_json::json!({})))
                .await;
        }
        super::tools::dispatch(context, &name, arguments, context.fallback_timezone).await
    }
}
