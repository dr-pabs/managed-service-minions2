# Monitoring & Alerting Design

> **Status:** Phase 3 — Production Ready\
> **Date:** 2026-06-15

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Goose Agent Framework                                      │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │Orchest.  │  │Slack Bot │  │Teams Bot │  │Dashboard │   │
│  │(goose)   │  │(ACP)     │  │(ACP)     │  │(React)   │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘   │
│       │ stdout       │ stdout       │ stdout       │          │
│       │ JSON logs    │ JSON logs    │ JSON logs    │          │
│       ▼              ▼              ▼              ▼          │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Toolshed (MCP proxy)                                │    │
│  │  • Tool call logs (allowlist, rate, duration)       │    │
│  │  • Security events (denied calls)                    │    │
│  │  • Correlation ID on every log line                  │    │
│  └──────────────────────┬──────────────────────────────┘    │
│                         │ stdout JSON                        │
│                         ▼                                    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Container Insights (Log Analytics)                  │    │
│  │  • Structured log ingestion                         │    │
│  │  • KQL query engine                                 │    │
│  │  • Alert rules                                      │    │
│  └──────────────────────┬──────────────────────────────┘    │
│                         │                                    │
└─────────────────────────┼────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Azure Monitor                                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │Metrics   │  │Alerts    │  │Dashboards│  │Action    │   │
│  │(CPU/Mem) │  │(Rules)   │  │(Grafana) │  │Groups    │   │
│  └──────────┘  └────┬─────┘  └──────────┘  └────┬─────┘   │
│                     │                            │          │
│                     ▼                            ▼          │
│              ┌──────────────┐           ┌──────────────┐    │
│              │ PagerDuty    │           │ Teams Channel │    │
│              │ (P1/P2)      │           │ (P3)          │    │
│              └──────────────┘           └──────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

______________________________________________________________________

## 1. Log Schema (Toolshed)

Every log line from the toolshed follows this JSON schema:

```json
{
  "ts": "2026-06-15T18:00:00.123Z",
  "correlation_id": "corr_a1b2c3d4.1",
  "minion_type": "code-reviewer",
  "tool_name": "github.get_pr_diff",
  "params": { "pr_number": 342, "repo": "org/repo" },
  "result": "success",
  "duration_ms": 600,
  "output_size_bytes": 12450
}
```

On allowlist denial:

```json
{
  "ts": "2026-06-15T18:01:00.456Z",
  "correlation_id": "corr_a1b2c3d4.1",
  "minion_type": "code-reviewer",
  "tool_name": "shell.run",
  "params": { "command": "rm -rf /" },
  "result": "blocked",
  "reason": "allowlist_denied"
}
```

______________________________________________________________________

## 2. Alert Rules

### 2.1 P1 Alerts (15-minute response)

| Alert | Condition | Query |
|---|---|---|
| Orchestrator down | No heartbeat for 5 minutes | `ContainerAppConsoleLogs_CL \| where ContainerAppName_s == "ca-orchestrator-prod" \| where TimeGenerated > ago(5m) \| summarize Count=count() \| where Count == 0` |
| 5xx error rate > 20% | Sustained for 5 minutes | `ContainerAppConsoleLogs_CL \| where ContainerAppName_s == "ca-orchestrator-prod" \| summarize Total=count(), Errors=countif(Log_s contains "500" or Log_s contains "503") by bin(TimeGenerated, 1m) \| extend ErrorRate = Errors * 100.0 / Total \| where ErrorRate > 20` |
| AI Foundry quota exhausted | Any throttling event | `AzureMetrics \| where MetricName == "ThrottledCalls" \| where TimeGenerated > ago(5m) \| summarize Count=count() \| where Count > 10` |

### 2.2 P2 Alerts (30-minute response)

| Alert | Condition | Query |
|---|---|---|
| Minion failure rate > 10% | Sustained for 15 minutes | `toolshed_logs_CL \| where TimeGenerated > ago(15m) \| summarize Total=count(), Failures=countif(result_s == "failure") by bin(TimeGenerated, 15m) \| extend FailureRate = Failures * 100.0 / Total \| where FailureRate > 10` |
| Minion timeout rate > 5% | Sustained for 15 minutes | `toolshed_logs_CL \| where TimeGenerated > ago(15m) \| summarize Total=count(), Timeouts=countif(result_s == "timeout") by bin(TimeGenerated, 15m) \| extend TimeoutRate = Timeouts * 100.0 / Total \| where TimeoutRate > 5` |
| Service Bus dead-letter > 0 | Any dead-lettered message | `AzureMetrics \| where MetricName == "DeadletteredMessages" \| where TimeGenerated > ago(15m) \| summarize Count=count() \| where Count > 0` |
| Container App restart loop | 3+ restarts in 10 minutes | `ContainerAppSystemLogs_CL \| where EventName_s == "ContainerRestart" \| summarize Count=count() by bin(TimeGenerated, 10m) \| where Count >= 3` |

### 2.3 P3 Alerts (2-hour response)

| Alert | Condition | Query |
|---|---|---|
| Allowlist denial detected | Any blocked call | `toolshed_logs_CL \| where result_s == "blocked" \| where TimeGenerated > ago(15m) \| summarize Count=count() \| where Count > 0` |
| P95 latency exceed threshold | > 10s sustained for 15 minutes | `toolshed_logs_CL \| where result_s == "success" \| summarize P95=percentile(duration_ms_d, 95) by bin(TimeGenerated, 5m) \| where P95 > 10000` |
| Container CPU > 80% | Sustained for 10 minutes | `Perf \| where CounterName == "cpuUsageNanoCores" \| where TimeGenerated > ago(10m) \| summarize AvgCPU=avg(CounterValue) by bin(TimeGenerated, 1m) \| where AvgCPU > 80` |
| Cost anomaly detected | Daily spend > 2x rolling average | Azure Cost Management anomaly detection (built-in) |

______________________________________________________________________

## 3. Grafana Dashboard

### 3.1 Dashboard Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  Goose Agent Framework — Production Dashboard                    │
├────────────────────────────┬─────────────────────────────────────┤
│  Stats Row                 │  Stats Row                          │
│  ┌─────┐ ┌─────┐ ┌─────┐ │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐   │
│  │Sess. │ │Min.  │ │Fail │ │  │P50  │ │P95  │ │Deny │ │Cost │   │
│  │/min  │ │Rate  │ │Rate  │ │  │lat   │ │lat   │ │Count│ │/day  │   │
│  └─────┘ └─────┘ └─────┘ │  └─────┘ └─────┘ └─────┘ └─────┘   │
├────────────────────────────┴─────────────────────────────────────┤
│  Minion Throughput (per minute)                                  │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │  ██ code-reviewer  ██ ticket-analyst  ██ security-auditor │   │
│  │  ████ pr-crafter   ██ code-explorer   ██ code-writer      │   │
│  │  ██ test-writer                                           │   │
│  └───────────────────────────────────────────────────────────┘   │
├──────────────────────────────────────────────────────────────────┤
│  Failure Rate by Agent (bar gauge)                               │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │  code-reviewer    ████████░░░░░░░░░░░░  2.3%              │   │
│  │  ticket-analyst   ██░░░░░░░░░░░░░░░░░░  0.5%              │   │
│  │  pr-crafter       ████████████████░░░░░  4.1%              │   │
│  │  security-auditor ██████████░░░░░░░░░░  2.8%              │   │
│  │  code-explorer    ██░░░░░░░░░░░░░░░░░░  0.3%              │   │
│  │  code-writer      ██████░░░░░░░░░░░░░░  1.8%              │   │
│  │  test-writer      ████░░░░░░░░░░░░░░░░  1.1%              │   │
│  └───────────────────────────────────────────────────────────┘   │
├────────────────────────────┬─────────────────────────────────────┤
│  Tool Call Latency         │  Allowlist Denials (24h)            │
│  (P50/P95/P99 heatmap)     │  ┌─────┐                            │
│  ┌─────────────────────┐   │  │  0  │  ← Should always be zero  │
│  │  •                   │   │  └─────┘                            │
│  │   •  •  •            │   │  >0 = security event               │
│  │    •  •  •  •        │   │                                    │
│  │  ─────────────────   │   │                                    │
│  │  P50(ms)  P95(ms)    │   │                                    │
│  └─────────────────────┘   │                                    │
├────────────────────────────┴─────────────────────────────────────┤
│  Orchestrator CPU / Memory                                       │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │  ─── cpu_usage  ─── memory_rss    (Container Apps metrics) │   │
│  └───────────────────────────────────────────────────────────┘   │
├──────────────────────────────────────────────────────────────────┤
│  Cost by Agent (daily bar chart)                                 │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │  Mon    Tue    Wed    Thu    Fri    Sat    Sun              │   │
│  │  ████   ████   ████   ████   █████  ░░░    ░░░             │   │
│  └───────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 Data Sources

| Panel | Data Source | Query Type |
|---|---|---|
| Session/min, minion rate | Log Analytics | KQL |
| Failure rate by agent | Log Analytics | KQL |
| P50/P95/P99 latency | Log Analytics | KQL + percentile |
| Allowlist denials | Log Analytics | KQL |
| CPU/Memory | Container Apps metrics | Azure Monitor |
| Cost | Cost Management | Built-in |

### 3.3 Provisioning

```bash
# Deploy Grafana via Azure Managed Grafana
az grafana create -n graf-goosefw-prod -g rg-goosefw-prod \
  --sku Standard

# Link Log Analytics as data source
az grafana data-source create -n graf-goosefw-prod \
  --definition '{
    "name": "Log Analytics",
    "type": "azuremonitor",
    "typeLogoUrl": "public/img/azure_monitor.svg",
    "access": "proxy",
    "jsonData": {
      "azureLogAnalyticsSameAs": true,
      "subscriptionId": "<subscription-id>"
    }
  }'

# Import dashboard JSON
az grafana dashboard import -n graf-goosefw-prod \
  --definition @infra/monitoring/grafana-dashboard.json
```

______________________________________________________________________

## 4. Action Groups

| Severity | Channel | Recipients |
|---|---|---|
| P1 | PagerDuty | On-call engineer (24/7) |
| P2 | PagerDuty (business hours) + Teams | Framework team |
| P3 | Microsoft Teams channel | `#goose-framework-alerts` |

______________________________________________________________________

## 5. Healthcheck Endpoints

| Endpoint | Expected Response | Checks |
|---|---|---|
| `GET /health` (orchestrator) | `200 OK` | Goose process alive, SQLite accessible, Service Bus connected |
| `GET /health` (slack-bot) | `200 OK` | ACP WebSocket connected, Slack Bolt running |
| `GET /health` (teams-bot) | `200 OK` | ACP WebSocket connected, Bot Framework running |
| `GET /health` (dashboard) | `200 OK` | Static assets serving |

Container Apps use these endpoints for liveness probes. KEDA scales based on:

- Service Bus queue depth (minion requests waiting)
- HTTP request rate (Slack/Teams message volume)
