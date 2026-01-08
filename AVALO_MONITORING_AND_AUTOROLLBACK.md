# Avalo Monitoring & Auto-Rollback System

## 🎯 Overview

The Avalo Monitoring & Auto-Rollback System provides **real-time production monitoring**, **automatic failure detection**, and **instant rollback capabilities** to ensure maximum uptime and reliability for the Avalo platform.

## 📊 System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  GitHub Actions (Every 5 min)               │
│                     Cron: */5 * * * *                       │
└────────────────────────┬────────────────────────────────────┘
                         │
                         v
┌─────────────────────────────────────────────────────────────┐
│              Monitoring Service (index.ts)                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  1. Check All Endpoints                               │  │
│  │  2. Measure Response Times                            │  │
│  │  3. Validate Payloads                                 │  │
│  │  4. Track Consecutive Failures                        │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │
                         v
┌─────────────────────────────────────────────────────────────┐
│              Decision Engine (rollback.ts)                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Evaluate Rollback Conditions:                        │  │
│  │  • ≥3 endpoints fail consecutively                    │  │
│  │  • Response time >3s for 3 checks                     │  │
│  │  • 5xx server errors detected                         │  │
│  └──────────────────────────────────────────────────────┘  │
└────────┬───────────────────────────────────┬────────────────┘
         │                                   │
    NO ISSUES                          ISSUES DETECTED
         │                                   │
         v                                   v
┌─────────────────┐              ┌──────────────────────────┐
│   Send Success  │              │  Trigger Auto-Rollback   │
│   Report Only   │              │  firebase hosting:rollback│
└─────────────────┘              └──────────┬───────────────┘
                                            │
                                            v
                              ┌──────────────────────────────┐
                              │   Alert System (alerts.ts)   │
                              │  • Discord Webhook           │
                              │  • SendGrid Email            │
                              │  • GitHub Issue Comment      │
                              └──────────────────────────────┘
```

## 🔍 Monitored Endpoints

The system monitors **5 critical production endpoints** every 5 minutes:

| Endpoint | URL | Expected Status | Max Response Time | Critical |
|----------|-----|-----------------|-------------------|----------|
| **Production Website** | `https://avalo-c8c46.web.app` | 200 | 1500ms | ✅ |
| **Health Check** | `.../ping` | 200 | 1000ms | ✅ |
| **System Info API** | `.../getSystemInfo` | 200 | 1500ms | ✅ |
| **Exchange Rates API** | `.../getExchangeRatesV1` | 200 | 1500ms | ✅ |
| **Purchase Tokens API** | `.../purchaseTokensV2` | 400 | 1500ms | ✅ |

### Endpoint Validation

Each endpoint is validated for:
- ✅ **HTTP Status Code** - Must match expected status
- ⚡ **Response Time** - Must be under threshold
- 📦 **Payload Integrity** - JSON structure validation
- 🔄 **Retry Logic** - 2 automatic retries with 5s delay

## ⚠️ Rollback Trigger Conditions

Automatic rollback is triggered when **ANY** of these conditions are met:

### 1. Consecutive Endpoint Failures
```typescript
IF 3+ critical endpoints fail consecutively
THEN trigger rollback
```
**Why:** Multiple simultaneous failures indicate a systemic issue with the deployment.

### 2. Severe Performance Degradation
```typescript
IF response time > 3000ms for 3 consecutive checks
THEN trigger rollback
```
**Why:** Severe slowdowns render the service unusable for users.

### 3. Server Errors (5xx)
```typescript
IF any endpoint returns 5xx status code
THEN trigger rollback
```
**Why:** 5xx errors indicate server-side failures that require immediate attention.

## 📈 Metrics Tracked

### Real-Time Metrics
- **Total Checks** - Cumulative endpoint checks performed
- **Successful Checks** - Endpoints that passed all validations
- **Failed Checks** - Endpoints that failed any validation
- **Uptime Percentage** - `(Successful / Total) × 100`
- **Average Response Time** - Rolling average across all endpoints
- **Consecutive Failures** - Current streak of failed checks
- **Consecutive Slow Responses** - Current streak of >3s responses

### System Health
- **Memory Usage** - Heap used/total, RSS
- **5xx Error Detection** - Active monitoring for server errors
- **Rollback History** - Timestamp and reasons for past rollbacks

## 🔄 Rollback Process

When rollback conditions are met:

```
1. ⚠️  CONDITIONS MET
   └─> Evaluate if rollback already performed (30-min cooldown)

2. 📦 BACKUP CURRENT STATE
   └─> Record current deployment version and info

3. 🚀 EXECUTE ROLLBACK
   └─> Run: firebase hosting:rollback --project avalo-c8c46

4. ⏳ WAIT FOR PROPAGATION
   └─> 30-second delay for changes to take effect

5. ✅ VALIDATE ROLLBACK
   └─> Re-check all endpoints
   └─> Ensure ≥70% are healthy

6. 📢 SEND ALERTS
   └─> Discord webhook notification
   └─> Email to operations team
   └─> GitHub issue comment

7. 📊 GENERATE REPORT
   └─> Save JSON and Markdown reports
   └─> Upload as GitHub artifacts
```

## 🛠️ Configuration

### Environment Variables

Required secrets for GitHub Actions:

```bash
# Alert Configuration
MONITORING_DISCORD_WEBHOOK=https://discord.com/api/webhooks/...
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxx
ALERT_FROM_EMAIL=monitoring@avaloapp.com
ALERT_TO_EMAILS=ops@avaloapp.com,dev@avaloapp.com

# Firebase Configuration
FIREBASE_TOKEN=your_firebase_ci_token
FIREBASE_PROJECT=avalo-c8c46
```

### Rollback Settings

Located in [`monitoring/config.ts`](monitoring/config.ts):

```typescript
export const ROLLBACK_CONFIG = {
  enabled: true,                    // Enable/disable rollback
  requireManualApproval: false,     // Set true for manual approval
  firebaseProject: 'avalo-c8c46',  // Firebase project ID
  backupBeforeRollback: true        // Create backup before rollback
};
```

### Threshold Configuration

```typescript
export const THRESHOLDS = {
  maxResponseTime: 1500,              // Standard threshold (1.5s)
  criticalResponseTime: 3000,         // Critical threshold (3s)
  consecutiveFailuresForRollback: 3,  // Failures needed for rollback
  slowResponseChecksForRollback: 3,   // Slow checks needed for rollback
  checkInterval: 300000,              // 5 minutes
  retryAttempts: 2,                   // Retry count per endpoint
  retryDelay: 5000                    // 5 seconds between retries
};
```

## 🚨 Alert System

### Discord Alerts

Rich embedded messages with color-coded severity:

```
🚨 Endpoint Failure: Production Website
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏰ Timestamp: 2024-01-15T10:30:00Z
📊 Severity: CRITICAL
🌐 Endpoint: https://avalo-c8c46.web.app
📡 HTTP Status: 500
⚡ Response Time: 2450ms
❌ Error Details: Internal Server Error
📈 Metrics: Uptime: 98.5% | Avg Response: 890ms | Failures: 3
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Avalo Monitoring System
```

**Severity Colors:**
- 🔵 **Info** - Informational messages
- 🟠 **Warning** - Non-critical issues
- 🔴 **Critical** - Immediate attention required
- 🟢 **Success** - Successful operations

### Email Alerts

HTML-formatted emails sent via SendGrid:
- Professional styling
- Detailed metrics and error information
- Direct links to logs and dashboards
- Mobile-responsive design

### GitHub Integration

Automatically creates/updates monitoring issues:
- Creates issue with `monitoring-alert` label
- Adds timestamped comments with full reports
- Links to workflow runs for traceability

## 📝 Reports

### JSON Report (`reports/monitoring_report.json`)

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "metrics": {
    "totalChecks": 150,
    "successfulChecks": 148,
    "failedChecks": 2,
    "uptime": 98.67,
    "avgResponseTime": 845.23,
    "consecutiveFailures": 0,
    "consecutiveSlowResponses": 0,
    "has5xxErrors": false
  },
  "currentCheck": [
    {
      "endpoint": "Production Website",
      "url": "https://avalo-c8c46.web.app",
      "success": true,
      "statusCode": 200,
      "responseTime": 523,
      "timestamp": "2024-01-15T10:30:00.000Z"
    }
  ],
  "memory": {
    "heapUsed": 45.23,
    "heapTotal": 128.00,
    "rss": 156.45
  }
}
```

### Markdown Report (`reports/monitoring_report.md`)

Human-readable report with:
- Overall metrics summary table
- Per-endpoint check results
- Memory usage statistics
- Warnings for critical conditions

## 🎮 Manual Operations

### Run Manual Check

```bash
cd monitoring
npm install
npm run monitor
```

### Force Manual Rollback

```bash
cd monitoring
npm run monitor:force "Reason for manual rollback"
```

Or via GitHub Actions:
1. Go to **Actions** → **Avalo Production Monitoring**
2. Click **Run workflow**
3. Set `force_rollback` to **yes**
4. Enter rollback reason
5. Click **Run workflow**

### View Reports

```bash
# View latest JSON report
cat reports/monitoring_report.json

# View latest Markdown report
cat reports/monitoring_report.md

# View report with formatting
npm install -g marked-terminal
marked reports/monitoring_report.md
```

### Disable Auto-Rollback (Emergency)

**Method 1: Environment Variable**
```bash
export DISABLE_ROLLBACK=true
npm run monitor
```

**Method 2: Configuration File**
Edit [`monitoring/config.ts`](monitoring/config.ts):
```typescript
export const ROLLBACK_CONFIG = {
  enabled: false,  // Disable rollback
  // ...
};
```

## 🔐 Security Considerations

### Secrets Management
- All sensitive credentials stored as GitHub Secrets
- Never commit tokens/keys to repository
- Rotate credentials quarterly

### Rollback Authorization
- Rollback requires valid Firebase CI token
- Token scoped to hosting:rollback permissions only
- Manual approval mode available for high-stakes deployments

### Alert Privacy
- Alerts contain no sensitive user data
- URLs and metrics only
- Error messages sanitized

## 📊 Monitoring the Monitor

The monitoring system itself is monitored by:

1. **GitHub Actions Status** - Workflow run success/failure
2. **Report Artifacts** - Each run uploads reports
3. **Memory Tracking** - Self-monitors resource usage
4. **Error Logging** - Comprehensive error capture and alerts

## 🎯 Success Metrics

### Key Performance Indicators

- **Uptime Target:** ≥99.5%
- **Mean Time to Detect (MTTD):** <5 minutes
- **Mean Time to Recover (MTTR):** <2 minutes
- **False Positive Rate:** <1%

### Current Performance

Check reports for real-time metrics:
- Overall uptime percentage
- Average response times
- Incident history

## 🚀 Quick Start

### 1. Install Dependencies
```bash
cd monitoring
npm install
```

### 2. Configure Secrets
Add to `.env`:
```bash
MONITORING_DISCORD_WEBHOOK=your_webhook_url
SENDGRID_API_KEY=your_sendgrid_key
ALERT_FROM_EMAIL=monitoring@avaloapp.com
ALERT_TO_EMAILS=ops@avaloapp.com
```

### 3. Configure GitHub Secrets
Add to repository secrets:
- `MONITORING_DISCORD_WEBHOOK`
- `SENDGRID_API_KEY`
- `ALERT_FROM_EMAIL`
- `ALERT_TO_EMAILS`
- `FIREBASE_TOKEN`

### 4. Enable GitHub Actions
The workflow automatically runs every 5 minutes once configured.

### 5. Test Locally
```bash
npm run monitor
```

## 📖 Rollback Validation

After rollback, the system validates recovery:

```typescript
✅ VALIDATION CRITERIA
• ≥70% of endpoints must be healthy
• Response times under thresholds
• No 5xx errors present
• Payload validation passes

Example Validation Result:
─────────────────────────────────────
Healthy Endpoints: 5/5 (100%)
─────────────────────────────────────
✅ Production Website: 200 (523ms)
✅ Health Check: 200 (156ms)
✅ System Info API: 200 (445ms)
✅ Exchange Rates API: 200 (678ms)
✅ Purchase Tokens API: 400 (234ms)
─────────────────────────────────────
Result: ✅ VALIDATION SUCCESSFUL
```

## 🔔 Alert Format Examples

### Success Alert
```
✅ Monitoring Check Complete
All endpoints healthy
Uptime: 99.87% | Avg Response: 542ms
```

### Warning Alert
```
⚠️ Performance Degradation Detected
2 endpoints responding slowly
Response times: 2.8s (warning threshold)
Action: Monitoring for rollback trigger
```

### Critical Alert
```
🚨 AUTOMATIC ROLLBACK TRIGGERED
Reason: 3 consecutive endpoint failures
Failed: Production Website, Health Check, System Info
Rollback Status: ✅ Successful
Rolled back to: version-2024-01-14-abc123
```

## 🛡️ Disaster Recovery

### If Rollback Fails

1. **Manual Intervention Required**
   ```bash
   firebase hosting:rollback --project avalo-c8c46
   ```

2. **Check Firebase Console**
   - Review deployment history
   - Manually select previous version
   - Deploy previous version

3. **Escalation Path**
   - Alert sent to operations team
   - GitHub issue created automatically
   - Fallback to emergency procedures

### If Monitoring Fails

1. GitHub Actions will report workflow failure
2. No reports = investigate monitoring system
3. Manual endpoint checks using curl/Postman
4. Review workflow logs for errors

## 📚 Additional Resources

- [Firebase Hosting Documentation](https://firebase.google.com/docs/hosting)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Discord Webhooks Guide](https://discord.com/developers/docs/resources/webhook)
- [SendGrid API Documentation](https://docs.sendgrid.com/api-reference)

## 🎉 Summary

✅ **Real-time monitoring** every 5 minutes  
✅ **Automatic rollback** on critical failures  
✅ **Multi-channel alerts** (Discord, Email, GitHub)  
✅ **Comprehensive reports** (JSON, Markdown)  
✅ **Manual override** capabilities  
✅ **Rollback validation** and recovery checks  
✅ **30-minute rollback cooldown** to prevent loops  
✅ **Memory and performance tracking**  

**The Avalo production environment is now protected by automated monitoring and instant rollback capabilities! 🚀**

---

**Last Updated:** 2024-11-05  
**System Version:** 1.0.0  
**Maintained by:** Avalo Operations Team