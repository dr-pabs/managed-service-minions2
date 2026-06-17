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

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn new_sets_defaults() {
        let e = AuditEntry::new("corr_1".into(), "code-reviewer".into(), "github.get_pr_diff".into());
        assert_eq!(e.correlation_id, "corr_1");
        assert_eq!(e.agent, "code-reviewer");
        assert_eq!(e.tool, "github.get_pr_diff");
        assert!(e.params.is_none());
        assert!(e.duration_ms.is_none());
        assert!(e.output_size_bytes.is_none());
        assert!(e.reason.is_none());
    }

    #[test]
    fn with_params_sets_value() {
        let e = AuditEntry::new("c".into(), "a".into(), "t".into())
            .with_params(serde_json::json!({"key": "val"}));
        assert!(e.params.is_some());
        assert_eq!(e.params.unwrap()["key"], "val");
    }

    #[test]
    fn with_duration_converts_to_millis() {
        let e = AuditEntry::new("c".into(), "a".into(), "t".into())
            .with_duration(Duration::from_millis(250));
        assert_eq!(e.duration_ms, Some(250));
    }

    #[test]
    fn with_output_size_sets_bytes() {
        let e = AuditEntry::new("c".into(), "a".into(), "t".into())
            .with_output_size(512);
        assert_eq!(e.output_size_bytes, Some(512));
    }

    #[test]
    fn with_reason_sets_string() {
        let e = AuditEntry::new("c".into(), "a".into(), "t".into())
            .with_reason("allowlist_denied");
        assert_eq!(e.reason, Some("allowlist_denied".into()));
    }

    #[test]
    fn with_result_blocked_round_trips_in_json() {
        let e = AuditEntry::new("c".into(), "a".into(), "t".into())
            .with_result(AuditResult::Blocked);
        let json = serde_json::to_string(&e).unwrap();
        assert!(json.contains("\"result\":\"blocked\""), "got: {json}");
    }

    #[test]
    fn audit_result_success_serializes() {
        assert_eq!(serde_json::to_string(&AuditResult::Success).unwrap(), "\"success\"");
    }

    #[test]
    fn audit_result_failure_serializes() {
        assert_eq!(serde_json::to_string(&AuditResult::Failure).unwrap(), "\"failure\"");
    }

    #[test]
    fn audit_result_blocked_serializes() {
        assert_eq!(serde_json::to_string(&AuditResult::Blocked).unwrap(), "\"blocked\"");
    }

    #[test]
    fn log_produces_parseable_json_with_correct_fields() {
        let e = AuditEntry::new("corr_x".into(), "code-explorer".into(), "filesystem.read_file".into());
        let json = serde_json::to_string(&e).unwrap();
        let v: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(v["agent"], "code-explorer");
        assert_eq!(v["tool"], "filesystem.read_file");
        assert_eq!(v["correlation_id"], "corr_x");
    }

    #[test]
    fn ts_field_is_valid_rfc3339() {
        let e = AuditEntry::new("c".into(), "a".into(), "t".into());
        assert!(
            chrono::DateTime::parse_from_rfc3339(&e.ts).is_ok(),
            "ts is not valid RFC 3339: {}",
            e.ts
        );
    }

    #[test]
    fn optional_fields_are_omitted_when_none() {
        let e = AuditEntry::new("c".into(), "a".into(), "t".into());
        let json = serde_json::to_string(&e).unwrap();
        assert!(!json.contains("params"), "params should be omitted: {json}");
        assert!(!json.contains("duration_ms"), "duration_ms should be omitted: {json}");
        assert!(!json.contains("output_size_bytes"), "output_size_bytes should be omitted: {json}");
        assert!(!json.contains("reason"), "reason should be omitted: {json}");
    }
}
