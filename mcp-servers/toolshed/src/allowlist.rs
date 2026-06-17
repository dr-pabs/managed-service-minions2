// Allowlist Manager
//
// Enforces per-agent tool allowlists. Every tool call from a minion is checked
// against the agent's configured allowlist. Unknown or disallowed tools are
// blocked with a logged security event.

use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone)]
pub struct AllowlistManager {
    allowlists: HashMap<String, HashSet<String>>,
}

impl AllowlistManager {
    pub fn new() -> Self {
        let mut manager = Self {
            allowlists: HashMap::new(),
        };
        manager.load_defaults();
        manager
    }

    fn load_defaults(&mut self) {
        // Code Reviewer — read-only GitHub access
        self.insert("code-reviewer", &[
            "github.get_pr_diff",
            "github.create_review_comment",
            "github.get_pr_comments",
        ]);

        // Code Explorer — read-only filesystem access
        self.insert("code-explorer", &[
            "filesystem.list_directory",
            "filesystem.read_file",
        ]);

        // PR Crafter — write GitHub + filesystem access
        self.insert("pr-crafter", &[
            "github.create_branch",
            "github.commit",
            "github.create_pr",
            "filesystem.write_file",
        ]);

        // Ticket Analyst — ticketing system queries
        self.insert("ticket-analyst", &[
            "ado.query_work_items",
            "jira.search_issues",
        ]);

        // Security Auditor — read-only + security scanning
        self.insert("security-auditor", &[
            "filesystem.read_file",
            "github.get_advisories",
        ]);

        // Code Writer — write implementation code and unit tests, run them
        self.insert("code-writer", &[
            "filesystem.read_file",
            "filesystem.list_directory",
            "filesystem.write_file",
            "shell.execute",
            "github.get_file_contents",
            "github.search_code",
        ]);

        // Test Writer — write integration and E2E tests, run them
        self.insert("test-writer", &[
            "filesystem.read_file",
            "filesystem.list_directory",
            "filesystem.write_file",
            "shell.execute",
            "github.get_file_contents",
        ]);
    }

    fn insert(&mut self, agent: &str, tools: &[&str]) {
        let set: HashSet<String> = tools.iter().map(|t| t.to_string()).collect();
        self.allowlists.insert(agent.to_string(), set);
    }

    /// Check if a tool is allowed for a given agent type.
    pub fn is_allowed(&self, agent: &str, tool_name: &str) -> bool {
        self.allowlists
            .get(agent)
            .map(|allowed| allowed.contains(tool_name))
            .unwrap_or(false)
    }

    /// Get the allowlist for an agent type (for introspection/testing).
    pub fn get_allowed(&self, agent: &str) -> Vec<String> {
        self.allowlists
            .get(agent)
            .map(|set| set.iter().cloned().collect())
            .unwrap_or_default()
    }

    /// List all registered agent types.
    #[allow(dead_code)]
    pub fn agents(&self) -> Vec<String> {
        self.allowlists.keys().cloned().collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allowed_tool_passes() {
        let am = AllowlistManager::new();
        assert!(am.is_allowed("code-reviewer", "github.get_pr_diff"));
    }

    #[test]
    fn disallowed_tool_blocked() {
        let am = AllowlistManager::new();
        assert!(!am.is_allowed("code-reviewer", "shell.run"));
    }

    #[test]
    fn unknown_agent_type_returns_false() {
        let am = AllowlistManager::new();
        assert!(!am.is_allowed("nonexistent-agent", "any.tool"));
    }

    #[test]
    fn all_agents_have_at_least_one_tool() {
        let am = AllowlistManager::new();
        for agent in am.agents() {
            assert!(
                !am.get_allowed(&agent).is_empty(),
                "agent '{}' has empty allowlist",
                agent
            );
        }
    }

    #[test]
    fn pr_crafter_has_write_access() {
        let am = AllowlistManager::new();
        assert!(am.is_allowed("pr-crafter", "filesystem.write_file"));
        assert!(am.is_allowed("pr-crafter", "github.create_pr"));
    }

    #[test]
    fn code_reviewer_cannot_write() {
        let am = AllowlistManager::new();
        assert!(!am.is_allowed("code-reviewer", "filesystem.write_file"));
        assert!(!am.is_allowed("code-reviewer", "github.commit"));
    }

    #[test]
    fn code_writer_has_write_and_shell_access() {
        let am = AllowlistManager::new();
        assert!(am.is_allowed("code-writer", "filesystem.write_file"));
        assert!(am.is_allowed("code-writer", "filesystem.read_file"));
        assert!(am.is_allowed("code-writer", "shell.execute"));
        assert!(am.is_allowed("code-writer", "github.search_code"));
    }

    #[test]
    fn code_writer_cannot_create_prs() {
        let am = AllowlistManager::new();
        assert!(!am.is_allowed("code-writer", "github.create_pr"));
        assert!(!am.is_allowed("code-writer", "github.commit"));
        assert!(!am.is_allowed("code-writer", "github.create_branch"));
    }

    #[test]
    fn test_writer_has_write_and_shell_access() {
        let am = AllowlistManager::new();
        assert!(am.is_allowed("test-writer", "filesystem.write_file"));
        assert!(am.is_allowed("test-writer", "filesystem.read_file"));
        assert!(am.is_allowed("test-writer", "shell.execute"));
        assert!(am.is_allowed("test-writer", "github.get_file_contents"));
    }

    #[test]
    fn test_writer_cannot_search_code_or_create_prs() {
        let am = AllowlistManager::new();
        assert!(!am.is_allowed("test-writer", "github.search_code"));
        assert!(!am.is_allowed("test-writer", "github.create_pr"));
    }
}
