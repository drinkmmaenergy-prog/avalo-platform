# Avalo Monitoring System

Real-time production monitoring with automatic rollback capabilities.

## 🚀 Quick Start

### Install Dependencies
```bash
npm install
```

### Configure Environment
Create a `.env` file:
```bash
MONITORING_DISCORD_WEBHOOK=https://discord.com/api/webhooks/...
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxx
ALERT_FROM_EMAIL=monitoring@avaloapp.com
ALERT_TO_EMAILS=ops@avaloapp.com,dev@avaloapp.com
FIREBASE_TOKEN=your_firebase_ci_token
```

### Run Monitoring
```bash
# Single check
npm run monitor

# Force manual rollback
npm run monitor:force "Reason for rollback"

# Development mode (auto-restart)
npm run dev
```

## 📁 File Structure

```
monitoring/
├── config.ts          # Endpoints, thresholds, rollback config
├── alerts.ts          # Discord and email alert system
├── rollback.ts        # Automatic rollback logic
├── index.ts           # Main monitoring orchestrator
├── package.json       # Dependencies and scripts
├── tsconfig.json      # TypeScript configuration
└── README.md          # This file
```

## 📊 Monitored Endpoints

- **Production Website** - https://avalo-c8c46.web.app
- **Health Check** - .../ping
- **System Info API** - .../getSystemInfo
- **Exchange Rates API** - .../getExchangeRatesV1
- **Purchase Tokens API** - .../purchaseTokensV2

## ⚙️ Configuration

### Modify Thresholds
Edit `config.ts`:
```typescript
export const THRESHOLDS = {
  maxResponseTime: 1500,              // ms
  criticalResponseTime: 3000,         // ms
  consecutiveFailuresForRollback: 3,
  slowResponseChecksForRollback: 3,
  checkInterval: 300000,              // 5 minutes
  retryAttempts: 2,
  retryDelay: 5000                    // ms
};
```

### Enable/Disable Rollback
Edit `config.ts`:
```typescript
export const ROLLBACK_CONFIG = {
  enabled: true,                    // Set false to disable
  requireManualApproval: false,     // Set true for manual approval
  firebaseProject: 'avalo-c8c46',
  backupBeforeRollback: true
};
```

## 🔔 Alerts

Alerts are sent when:
- Any endpoint fails validation
- Rollback is triggered
- Rollback succeeds/fails
- System errors occur

### Alert Channels
- **Discord** - Real-time webhook notifications
- **Email** - SendGrid-powered email alerts
- **GitHub** - Issue comments (via Actions)

## 📝 Reports

Reports are generated after each check:

- `../reports/monitoring_report.json` - Machine-readable metrics
- `../reports/monitoring_report.md` - Human-readable summary

## 🛠️ Commands

```bash
# Install dependencies
npm install

# Run monitoring check
npm run monitor

# Force rollback with reason
npm run monitor:force "Emergency rollback"

# Build TypeScript
npm run build

# Development mode
npm run dev
```

## 🚨 Rollback Triggers

Automatic rollback when ANY condition is met:

1. **≥3 endpoints fail consecutively**
2. **Response time >3s for 3 consecutive checks**
3. **5xx server error detected**

## 🔍 Debugging

### Enable Verbose Logging
```bash
export DEBUG=true
npm run monitor
```

### Test Single Endpoint
```typescript
// In index.ts
import { ENDPOINTS } from './config';
import { checkEndpoint } from './index';

const result = await checkEndpoint(ENDPOINTS[0]);
console.log(result);
```

### Dry Run (No Rollback)
```bash
export DISABLE_ROLLBACK=true
npm run monitor
```

## 📚 Documentation

See [AVALO_MONITORING_AND_AUTOROLLBACK.md](../AVALO_MONITORING_AND_AUTOROLLBACK.md) for complete documentation.

## 🆘 Support

- **GitHub Issues** - Bug reports and feature requests
- **Documentation** - See main documentation file
- **Logs** - Check GitHub Actions workflow logs

## 🔐 Security

- Store credentials in `.env` (never commit)
- Use GitHub Secrets for CI/CD
- Rotate tokens quarterly
- Limit Firebase token permissions

## ⚡ Performance

- Each check runs in <30 seconds
- Minimal memory footprint (~50MB)
- Automatic retry logic (2 retries per endpoint)
- 30-minute cooldown between rollbacks

---

**Avalo Monitoring System v1.0.0**