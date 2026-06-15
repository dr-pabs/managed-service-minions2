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

use serde::Serialize;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

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
    let dur = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = dur.as_secs();
    // ISO 8601 format: 2026-06-14T18:00:00.123Z
    // Simple approximation — in production use `chrono` crate
    let dt = secs_to_iso(secs);
    let millis = dur.subsec_millis();
    format!("{}.{:03}Z", dt, millis)
}

fn secs_to_iso(secs: u64) -> String {
    // Days since Unix epoch
    let days = secs / 86400;
    let time_of_day = secs % 86400;

    let hours = time_of_day / 3600;
    let minutes = (time_of_day % 3600) / 60;
    let seconds = time_of_day % 60;

    // Compute year/month/day from days since epoch
    // Simple Gregorian calendar computation
    let mut y = 1970i64;
    let mut remaining_days = days as i64;

    loop {
        let days_in_year = if is_leap(y) { 366 } else { 365 };
        if remaining_days < days_in_year {
            break;
        }
        remaining_days -= days_in_year;
        y += 1;
    }

    let month_lengths = if is_leap(y) {
        [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };

    let mut m = 0;
    for (i, &len) in month_lengths.iter().enumerate() {
        if remaining_days < len as i64 {
            m = i;
            break;
        }
        remaining_days -= len as i64;
    }

    let d = remaining_days + 1;

    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}",
        y,
        m + 1,
        d,
        hours,
        minutes,
        seconds
    )
}

fn is_leap(year: i64) -> bool {
    (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
}
