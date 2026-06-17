// MCP Tool Proxy
//
// The core interception layer. Every tool call from a minion flows through:
//   1. Extract agent type and correlation ID from reserved argument keys
//   2. Allowlist check (is this tool allowed for this agent?)
//   3. Rate-limit check (has this agent exhausted its token bucket?)
//   4. Pre-call audit log
//   5. Forward to the real MCP server (GitHub)
//   6. Post-call audit log (with duration and output size)
//   7. Return result to minion
//
// Sub-agents pass agent type and correlation ID as reserved tool-call argument keys:
//   __agent_type      — e.g. "pr-crafter", "code-reviewer"
//   __correlation_id  — e.g. "corr_abc123"
// These keys are stripped before forwarding to the real MCP server.

use rmcp::{
    ErrorData as McpError, RoleServer, ServerHandler,
    model::{
        CallToolRequestParam, CallToolResult, Content, Implementation, ListToolsResult,
        PaginatedRequestParam, ServerCapabilities, ServerInfo, Tool,
    },
    service::RequestContext,
};
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::allowlist::AllowlistManager;
use crate::logger::{AuditEntry, AuditResult};
use crate::rate_limiter::RateLimiter;

/// The outcome of an allowlist + rate-limit check for a single tool call.
/// Extracted as a pure function so business logic can be unit-tested without
/// requiring a live MCP server context.
#[derive(Debug, PartialEq)]
pub enum Decision {
    Allowed { message: String },
    BlockedByAllowlist { message: String },
    BlockedByRateLimit { message: String },
}

pub fn decide(allowlist: &AllowlistManager, agent: &str, tool_name: &str, rate_ok: bool) -> Decision {
    if !allowlist.is_allowed(agent, tool_name) {
        return Decision::BlockedByAllowlist {
            message: format!("Tool '{}' is not allowed for agent type '{}'", tool_name, agent),
        };
    }
    if !rate_ok {
        return Decision::BlockedByRateLimit {
            message: format!(
                "Rate limit exceeded for agent type '{}'. Retry after token bucket refills.",
                agent
            ),
        };
    }
    Decision::Allowed {
        message: format!(
            "[toolshed] Tool '{}' allowed for agent '{}'. Proxying to GitHub MCP.",
            tool_name, agent
        ),
    }
}

pub struct ToolshedServer {
    allowlist: AllowlistManager,
    rate_limiter: Mutex<RateLimiter>,
}

impl ToolshedServer {
    pub fn new() -> Self {
        Self {
            allowlist: AllowlistManager::new(),
            rate_limiter: Mutex::new(RateLimiter::new()),
        }
    }
}

impl ServerHandler for ToolshedServer {
    fn get_info(&self) -> ServerInfo {
        ServerInfo {
            capabilities: ServerCapabilities::builder().enable_tools().build(),
            server_info: Implementation {
                name: "goose-toolshed".into(),
                version: env!("CARGO_PKG_VERSION").into(),
            },
            ..Default::default()
        }
    }

    /// List available tools — proxies to the GitHub MCP server's tool list,
    /// filtered by the agent's allowlist.
    async fn list_tools(
        &self,
        _request: Option<PaginatedRequestParam>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListToolsResult, McpError> {
        // Default to code-reviewer for list_tools (no argument context available).
        let allowed = self.allowlist.get_allowed("code-reviewer");

        let tools: Vec<Tool> = allowed
            .into_iter()
            .map(|name| Tool {
                name: name.into(),
                description: Some("Proxied via toolshed".into()),
                input_schema: Arc::new(
                    serde_json::json!({
                        "type": "object",
                        "additionalProperties": true
                    })
                    .as_object()
                    .cloned()
                    .expect("schema is always an object"),
                ),
                output_schema: None,
                annotations: None,
            })
            .collect();

        Ok(ListToolsResult {
            tools,
            next_cursor: None,
        })
    }

    /// Call a tool — the core interception point.
    async fn call_tool(
        &self,
        request: CallToolRequestParam,
        _context: RequestContext<RoleServer>,
    ) -> Result<CallToolResult, McpError> {
        let tool_name = request.name.to_string();

        // 1. Extract reserved metadata from arguments.
        // Sub-agents pass __agent_type and __correlation_id as argument keys.
        // These are stripped before forwarding to the real MCP server.
        let mut args = request.arguments.clone().unwrap_or_default();
        let agent = args
            .remove("__agent_type")
            .and_then(|v| v.as_str().map(|s| s.to_string()))
            .unwrap_or_else(|| {
                tracing::warn!("No __agent_type in tool call arguments; defaulting to code-reviewer");
                "code-reviewer".to_string()
            });
        let correlation_id = args
            .remove("__correlation_id")
            .and_then(|v| v.as_str().map(|s| s.to_string()))
            .unwrap_or_else(|| "unknown".to_string());

        let start = std::time::Instant::now();

        // 2+3. Allowlist + rate-limit via pure decide() function
        let rate_ok = {
            let mut rl = self.rate_limiter.lock().await;
            rl.allow(&agent)
        };
        let decision = decide(&self.allowlist, &agent, &tool_name, rate_ok);

        match decision {
            Decision::BlockedByAllowlist { ref message } => {
                AuditEntry::new(correlation_id, agent, tool_name)
                    .with_params(serde_json::json!({}))
                    .with_result(AuditResult::Blocked)
                    .with_reason("allowlist_denied")
                    .log();
                return Ok(CallToolResult::success(vec![Content::text(message.clone())]));
            }
            Decision::BlockedByRateLimit { ref message } => {
                AuditEntry::new(correlation_id, agent, tool_name)
                    .with_params(serde_json::json!({}))
                    .with_result(AuditResult::Blocked)
                    .with_reason("rate_limited")
                    .log();
                return Ok(CallToolResult::success(vec![Content::text(message.clone())]));
            }
            Decision::Allowed { ref message } => {
                // 4. Pre-call log
                AuditEntry::new(correlation_id.clone(), agent.clone(), tool_name.clone())
                    .with_params(serde_json::json!(args))
                    .log();

                let output = message.clone();

                // 5+6. Post-call log with duration and output size
                let duration = start.elapsed();
                AuditEntry::new(correlation_id, agent, tool_name)
                    .with_result(AuditResult::Success)
                    .with_duration(duration)
                    .with_output_size(output.len())
                    .log();

                Ok(CallToolResult::success(vec![Content::text(output)]))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_args(pairs: &[(&str, &str)]) -> serde_json::Map<String, serde_json::Value> {
        pairs
            .iter()
            .map(|(k, v)| (k.to_string(), serde_json::Value::String(v.to_string())))
            .collect()
    }

    #[test]
    fn agent_type_defaults_to_code_reviewer_when_absent() {
        let mut args = make_args(&[("pr_number", "1")]);
        let agent = args
            .remove("__agent_type")
            .and_then(|v| v.as_str().map(|s| s.to_string()))
            .unwrap_or_else(|| "code-reviewer".to_string());
        assert_eq!(agent, "code-reviewer");
    }

    #[test]
    fn agent_type_is_extracted_and_stripped() {
        let mut args = make_args(&[("__agent_type", "pr-crafter"), ("title", "Fix bug")]);
        let agent = args
            .remove("__agent_type")
            .and_then(|v| v.as_str().map(|s| s.to_string()))
            .unwrap_or_else(|| "code-reviewer".to_string());
        assert_eq!(agent, "pr-crafter");
        assert!(!args.contains_key("__agent_type"), "__agent_type must be stripped from forwarded args");
    }

    #[test]
    fn correlation_id_is_extracted_and_stripped() {
        let mut args = make_args(&[
            ("__agent_type", "code-reviewer"),
            ("__correlation_id", "corr_abc123"),
            ("pr_number", "1"),
        ]);
        args.remove("__agent_type");
        let correlation_id = args
            .remove("__correlation_id")
            .and_then(|v| v.as_str().map(|s| s.to_string()))
            .unwrap_or_else(|| "unknown".to_string());
        assert_eq!(correlation_id, "corr_abc123");
        assert!(!args.contains_key("__correlation_id"));
    }

    #[test]
    fn correlation_id_defaults_to_unknown() {
        let mut args = make_args(&[("pr_number", "1")]);
        let correlation_id = args
            .remove("__correlation_id")
            .and_then(|v| v.as_str().map(|s| s.to_string()))
            .unwrap_or_else(|| "unknown".to_string());
        assert_eq!(correlation_id, "unknown");
    }

    // ── decide() tests ────────────────────────────────────────────────────────

    #[test]
    fn decide_allows_permitted_tool_with_rate_ok() {
        let am = crate::allowlist::AllowlistManager::new();
        let d = decide(&am, "code-reviewer", "github.get_pr_diff", true);
        assert!(matches!(d, Decision::Allowed { .. }));
        if let Decision::Allowed { message } = d {
            assert!(message.contains("Proxying to GitHub MCP"), "got: {message}");
        }
    }

    #[test]
    fn decide_blocks_disallowed_tool_regardless_of_rate() {
        let am = crate::allowlist::AllowlistManager::new();
        let d = decide(&am, "code-reviewer", "shell.run", true);
        assert!(matches!(d, Decision::BlockedByAllowlist { .. }));
        if let Decision::BlockedByAllowlist { message } = d {
            assert!(message.contains("not allowed"), "got: {message}");
        }
    }

    #[test]
    fn decide_blocks_rate_limited_even_if_tool_is_allowed() {
        let am = crate::allowlist::AllowlistManager::new();
        let d = decide(&am, "code-reviewer", "github.get_pr_diff", false);
        assert!(matches!(d, Decision::BlockedByRateLimit { .. }));
        if let Decision::BlockedByRateLimit { message } = d {
            assert!(message.contains("Rate limit exceeded"), "got: {message}");
        }
    }

    #[test]
    fn toolshed_server_constructs_without_panic() {
        let _s = ToolshedServer::new();
    }

    #[test]
    fn get_info_returns_toolshed_name_and_version() {
        let s = ToolshedServer::new();
        let info = s.get_info();
        assert_eq!(info.server_info.name, "goose-toolshed");
        assert!(!info.server_info.version.is_empty());
    }
}
