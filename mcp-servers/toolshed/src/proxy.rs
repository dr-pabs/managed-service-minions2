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

use rmcp::{
    ErrorData as McpError, RoleServer, ServerHandler,
    model::{
        CallToolRequestParam, CallToolResult, Content, Implementation, ListToolsResult,
        PaginatedRequestParam, ServerCapabilities, ServerInfo, Tool,
    },
    service::RequestContext,
};
use std::sync::Arc;

use crate::allowlist::AllowlistManager;
use crate::logger::{AuditEntry, AuditResult};

pub struct ToolshedServer {
    allowlist: AllowlistManager,
}

impl ToolshedServer {
    pub fn new() -> Self {
        Self {
            allowlist: AllowlistManager::new(),
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
        let agent = self.extract_agent_type("");
        let allowed = self.allowlist.get_allowed(&agent);

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
        let agent = self.extract_agent_type("");

        let start = std::time::Instant::now();

        // 1. Allowlist check
        if !self.allowlist.is_allowed(&agent, &tool_name) {
            let entry = AuditEntry::new("unknown".to_string(), agent.clone(), tool_name.clone())
                .with_params(serde_json::json!({}))
                .with_result(AuditResult::Blocked)
                .with_reason("allowlist_denied");
            entry.log();

            return Ok(CallToolResult::success(vec![Content::text(format!(
                "Tool '{}' is not allowed for agent type '{}'",
                tool_name, agent
            ))]));
        }

        // 2. Pre-call log
        let pre_entry = AuditEntry::new("unknown".to_string(), agent.clone(), tool_name.clone())
            .with_params(serde_json::json!({}));
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
        let post_entry = AuditEntry::new("unknown".to_string(), agent, tool_name)
            .with_result(AuditResult::Success)
            .with_duration(duration)
            .with_output_size(output.len());
        post_entry.log();

        Ok(CallToolResult::success(vec![Content::text(output)]))
    }
}
