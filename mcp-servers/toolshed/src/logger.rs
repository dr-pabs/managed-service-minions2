// Audit Logger
//
// Writes JSON audit log lines to stdout. Each log entry records:
//   - Timestamp (ISO 8601)
//   - Correlation ID (from the session)
//   - Agent type (which minion made the call)
//   - Tool name
//   - Input parameters
//   - Result status (success/failure/blocked)
//   - Duration in milliseconds
//   - Output size in bytes
//
// In production, Container Insights collects stdout and routes to Log Analytics.

use chrono::Utc;
use serde::Serialize;
use std::time::Duration;

#[derive(Debug, Clone, Serialize)]
pub struct AuditEntry {
    pub ts: String,
    pub correlation_id: String,
    pub agent: String,
    pub tool: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<serde_json::Value>,
    pub result: AuditResult,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_size_bytes: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AuditResult {
    Success,
    #[allow(dead_code)]
    Failure,
    Blocked,
}

impl AuditEntry {
    pub fn new(correlation_id: String, agent: String, tool: String) -> Self {
        Self {
            ts: iso_now(),
            correlation_id,
            agent,
            tool,
            params: None,
            result: AuditResult::Success,
            duration_ms: None,
            output_size_bytes: None,
            reason: None,
        }
    }

    pub fn with_params(mut self, params: serde_json::Value) -> Self {
        self.params = Some(params);
        self
    }

    pub fn with_result(mut self, result: AuditResult) -> Self {
        self.result = result;
        self
    }

    pub fn with_duration(mut self, duration: Duration) -> Self {
        self.duration_ms = Some(duration.as_millis() as u64);
        self
    }

    pub fn with_output_size(mut self, size: usize) -> Self {
        self.output_size_bytes = Some(size);
        self
    }

    pub fn with_reason(mut self, reason: impl Into<String>) -> Self {
        self.reason = Some(reason.into());
        self
    }

    /// Log the entry to stdout as a single JSON line.
    pub fn log(&self) {
        if let Ok(json) = serde_json::to_string(self) {
            println!("{}", json);
        }
    }
}

fn iso_now() -> String {
    Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}
