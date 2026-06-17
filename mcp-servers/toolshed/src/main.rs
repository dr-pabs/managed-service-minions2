// MCP Toolshed — Bootstrap
//
// Wraps the GitHub MCP server with allowlist enforcement, rate limiting,
// and audit logging. Runs as a stdio MCP server loaded by goose.
//
// Architecture:
//   Minion tool call → Toolshed (allowlist → rate limit → log → proxy → log → return)
//
// Build: cargo build --release --manifest-path mcp-servers/toolshed/Cargo.toml
// Register: goose configure --add-extension toolshed --type stdio --cmd "<path>/goose-toolshed"

use rmcp::transport::stdio;

mod allowlist;
mod logger;
mod proxy;
mod rate_limiter;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_target(false)
        .with_level(false)
        .compact()
        .init();

    tracing::info!("toolshed starting");

    let server = proxy::ToolshedServer::new();
    let service = rmcp::serve_server(server, stdio()).await?;
    service.waiting().await?;

    Ok(())
}
