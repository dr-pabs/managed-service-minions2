// Rate Limiter — Token Bucket
//
// Per-agent rate limiting enforced by the toolshed MCP server.
// Each agent type gets its own token bucket. When a tool call arrives,
// the rate limiter checks if the agent has remaining tokens. If not,
// the call is blocked with a 429-equivalent response.
//
// Algorithm: Token bucket with refill rate.
//   - Each bucket has a capacity (max tokens) and refill rate (tokens/second).
//   - On each tool call, one token is consumed.
//   - Tokens refill continuously at the configured rate.
//   - If a bucket is empty, the call is blocked.

use std::collections::HashMap;
use std::time::Instant;

#[derive(Debug, Clone)]
pub struct RateLimiterConfig {
    pub capacity: u32,       // Max tokens in the bucket
    pub refill_rate: f64,    // Tokens per second
}

#[derive(Debug)]
struct TokenBucket {
    tokens: f64,
    capacity: u32,
    refill_rate: f64,
    last_refill: Instant,
}

impl TokenBucket {
    fn new(config: &RateLimiterConfig) -> Self {
        Self {
            tokens: config.capacity as f64,
            capacity: config.capacity,
            refill_rate: config.refill_rate,
            last_refill: Instant::now(),
        }
    }

    fn refill(&mut self) {
        let elapsed = self.last_refill.elapsed().as_secs_f64();
        self.tokens = (self.tokens + elapsed * self.refill_rate).min(self.capacity as f64);
        self.last_refill = Instant::now();
    }

    fn try_consume(&mut self) -> bool {
        self.refill();
        if self.tokens >= 1.0 {
            self.tokens -= 1.0;
            true
        } else {
            false
        }
    }
}

#[derive(Debug)]
pub struct RateLimiter {
    buckets: HashMap<String, TokenBucket>,
}

impl RateLimiter {
    pub fn new() -> Self {
        let mut limiter = Self {
            buckets: HashMap::new(),
        };
        limiter.load_defaults();
        limiter
    }

    fn load_defaults(&mut self) {
        // Code Reviewer: 10 calls/min → 0.167 tokens/sec, burst of 10
        self.insert("code-reviewer", RateLimiterConfig {
            capacity: 10,
            refill_rate: 10.0 / 60.0,
        });

        // Code Explorer: 20 calls/min → 0.333 tokens/sec, burst of 20
        self.insert("code-explorer", RateLimiterConfig {
            capacity: 20,
            refill_rate: 20.0 / 60.0,
        });

        // PR Crafter: 15 calls/min → 0.25 tokens/sec, burst of 15
        self.insert("pr-crafter", RateLimiterConfig {
            capacity: 15,
            refill_rate: 15.0 / 60.0,
        });

        // Ticket Analyst: 10 calls/min → 0.167 tokens/sec, burst of 10
        self.insert("ticket-analyst", RateLimiterConfig {
            capacity: 10,
            refill_rate: 10.0 / 60.0,
        });

        // Security Auditor: 20 calls/min → 0.333 tokens/sec, burst of 20
        self.insert("security-auditor", RateLimiterConfig {
            capacity: 20,
            refill_rate: 20.0 / 60.0,
        });
    }

    fn insert(&mut self, agent: &str, config: RateLimiterConfig) {
        self.buckets.insert(agent.to_string(), TokenBucket::new(&config));
    }

    /// Check if a tool call from the given agent type is allowed.
    /// Returns true if the call can proceed, false if rate-limited.
    pub fn allow(&mut self, agent: &str) -> bool {
        self.buckets
            .get_mut(agent)
            .map(|bucket| bucket.try_consume())
            .unwrap_or(true) // Unknown agents are not rate-limited (allowlist blocks them)
    }

    /// Get remaining tokens for an agent type (for introspection/monitoring).
    #[allow(dead_code)]
    pub fn remaining_tokens(&mut self, agent: &str) -> f64 {
        self.buckets
            .get_mut(agent)
            .map(|bucket| {
                bucket.refill();
                bucket.tokens
            })
            .unwrap_or(0.0)
    }
}

// ── Tests ──────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn token_bucket_allows_within_capacity() {
        let mut rl = RateLimiter::new();
        // 10 calls should all pass (within capacity)
        for _ in 0..10 {
            assert!(rl.allow("code-reviewer"), "Should allow within capacity");
        }
    }

    #[test]
    fn token_bucket_denies_beyond_capacity() {
        let mut rl = RateLimiter::new();
        // Exhaust capacity
        for _ in 0..10 {
            rl.allow("code-reviewer");
        }
        // 11th call should be denied
        assert!(!rl.allow("code-reviewer"), "Should deny beyond capacity");
    }

    #[test]
    fn different_agents_have_independent_buckets() {
        let mut rl = RateLimiter::new();
        // Exhaust code-reviewer
        for _ in 0..10 {
            rl.allow("code-reviewer");
        }
        // Code explorer should still have tokens
        assert!(rl.allow("code-explorer"), "Different agent should be unaffected");
    }

    #[test]
    fn unknown_agent_not_rate_limited() {
        let mut rl = RateLimiter::new();
        assert!(rl.allow("unknown-agent"), "Unknown agents should not be rate-limited");
    }

    #[test]
    fn security_auditor_has_higher_capacity() {
        let mut rl = RateLimiter::new();
        // Security auditor has 20 capacity vs code-reviewer's 10
        for _ in 0..20 {
            assert!(rl.allow("security-auditor"), "Security auditor has higher capacity");
        }
        assert!(!rl.allow("security-auditor"), "Should be exhausted after 20");
    }

    #[test]
    fn remaining_tokens_reports_correctly() {
        let mut rl = RateLimiter::new();
        assert!(rl.remaining_tokens("code-reviewer") > 0.0);
        rl.allow("code-reviewer");
        assert!(rl.remaining_tokens("code-reviewer") < 10.0);
    }
}
