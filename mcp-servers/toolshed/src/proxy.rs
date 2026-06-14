// MCP Tool Proxy
//
// The core interception layer. Every tool call from a minion flows through:
//   1. Allowlist check (is this tool allowed for this agent?)
//   2. Pre-call audit log
//   3. Forward to the real MCP server (GitHub)
//   4. Post-call audit log (with duration and output size)
//   5. Return result to minion
//
// The toolshed proxies ALL tool calls to a single upstream MCP server
// (GitHub MCP in Phase 1). The upstream is configured via environment variables:
//   GITHUB_MCP_COMMAND — command to start the GitHub MCP server
//   GITHUB_MCP_ARGS   — space-separated arguments

use rmcp::model::{
    CallToolRequest, CallToolResult, Content, Implementation, ServerCapabilities, Tool,
};
use rmcp::server::Server;
use std::process::Stdio;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

use crate::allowlist::AllowlistManager;
use crate::logger::{AuditEntry, AuditResult};

pub struct ToolshedServer {
    allowlist: AllowlistManager,
    github_process: Arc<Mutex<Option<Child>>>,
    github_handle: Arc<Mutex<Option<GitHubMcpHandle>>>,
}

struct GitHubMcpHandle {
    stdin: tokio::process::ChildStdin,
    stdout_lines: tokio::sync::mpsc::UnboundedReceiver<String>,
}

impl ToolshedServer {
    pub fn new() -> Self {
        Self {
            allowlist: AllowlistManager::new(),
            github_process: Arc::new(Mutex::new(None)),
            github_handle: Arc::new(Mutex::new(None)),
        }
    }

    /// Determine the agent type from the correlation ID or metadata.
    /// The correlation ID format is: corr_<uuid>.<N> where N is the minion index.
    /// In Phase 1, we derive agent type from the delegate parameters propagated
    /// through the correlation context.
    fn extract_agent_type(&self, _correlation_id: &str) -> String {
        // Phase 1: default to "code-reviewer" since it's the only active agent.
        // In Phase 2+, extract from correlation ID metadata or tool call headers.
        "code-reviewer".to_string()
    }
}

#[rmcp::server::tool]
impl ToolshedServer {
    /// List available tools — proxies to the GitHub MCP server's tool list,
    /// filtered by the agent's allowlist.
    #[tool(description = "List available tools for this agent type")]
    async fn list_tools(
        &self,
        #[param] correlation_id: Option<String>,
    ) -> anyhow::Result<Vec<Tool>> {
        let agent = self.extract_agent_type(&correlation_id.unwrap_or_default());
        let allowed = self.allowlist.get_allowed(&agent);

        // Return tools that match the agent's allowlist
        let tools: Vec<Tool> = allowed
            .into_iter()
            .map(|name| Tool {
                name,
                description: Some("Proxied via toolshed".to_string()),
                input_schema: serde_json::json!({
                    "type": "object",
                    "additionalProperties": true
                }),
            })
            .collect();

        Ok(tools)
    }

    /// Call a tool — the core interception point.
    #[tool(description = "Call a tool through the toolshed proxy")]
    async fn call_tool(
        &self,
        #[param] tool_name: String,
        #[param] arguments: Option<serde_json::Value>,
        #[param] correlation_id: Option<String>,
    ) -> anyhow::Result<Vec<Content>> {
        let corr_id = correlation_id.unwrap_or_else(|| "unknown".to_string());
        let agent = self.extract_agent_type(&corr_id);

        let start = std::time::Instant::now();

        // 1. Allowlist check
        if !self.allowlist.is_allowed(&agent, &tool_name) {
            let entry = AuditEntry::new(corr_id, agent, tool_name)
                .with_params(arguments.unwrap_or(serde_json::json!({})))
                .with_result(AuditResult::Blocked)
                .with_reason("allowlist_denied");
            entry.log();

            return Ok(vec![Content::text(format!(
                "Tool '{}' is not allowed for agent type '{}'",
                tool_name, agent
            ))]);
        }

        // 2. Pre-call log
        let pre_entry = AuditEntry::new(corr_id.clone(), agent.clone(), tool_name.clone())
            .with_params(arguments.clone().unwrap_or(serde_json::json!({})));
        pre_entry.log();

        // 3. Proxy to GitHub MCP (pass-through in Phase 1)
        // In Phase 1, goose routes tool calls to the GitHub MCP directly.
        // The toolshed receives the intercepted tool call from the minion,
        // verifies it, and returns approval. The actual MCP call is handled
        // by goose's MCP routing layer.
        //
        // For Phase 1 walking skeleton, we allow the call through.
        // The real proxy implementation (forwarding to GitHub MCP subprocess)
        // is added when the toolshed is the sole extension for minions.

        let output = format!(
            "[toolshed] Tool '{}' allowed for agent '{}'. Proxying to GitHub MCP.",
            tool_name, agent
        );

        // 4. Post-call log
        let duration = start.elapsed();
        let post_entry = AuditEntry::new(corr_id, agent, tool_name)
            .with_result(AuditResult::Success)
            .with_duration(duration)
            .with_output_size(output.len());
        post_entry.log();

        Ok(vec![Content::text(output)])
    }
}

#[rmcp::server::tool_object]
impl ToolshedServer {
    fn tool_info(&self) -> Implementation {
        Implementation::new(
            "goose-toolshed".to_string(),
            env!("CARGO_PKG_VERSION").to_string(),
        )
    }

    fn capabilities(&self) -> ServerCapabilities {
        ServerCapabilities::default()
    }
}
