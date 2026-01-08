# Avalo Monitoring - Quick Start Guide

Get up and running with the Avalo Monitoring & Auto-Rollback system in 5 minutes.

## 🚀 Step 1: Install Dependencies

```bash
cd monitoring
npm install
```

This will install:
- TypeScript and ts-node for execution
- Required type definitions
- Node.js dependencies

## 🔐 Step 2: Configure Environment

### Local Development

1. Copy the environment template:
```bash
cp .env.example .env
```

2. Edit `.env` and add your credentials:
```bash
# Required for Discord alerts
MONITORING_DISCORD_WEBHOOK=https://discord.com/api/webhooks/...

# Required for Email alerts
SENDGRID_API_KEY=SG.xxxxxxxxxxxxx
ALERT_FROM_EMAIL=monitoring@avaloapp.com
ALERT_TO_EMAILS=ops@avaloapp.com

# Required for rollback functionality
FIREBASE_TOKEN=your_firebase_token
```

### Get Firebase Token

```bash
firebase login:ci
```

Copy the token and add it to your `.env` file.

### GitHub Actions (Production)

Add these secrets to your GitHub repository:

1. Go to **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Add each of these:
   - `MONITORING_DISCORD_WEBHOOK`
   - `SENDGRID_API_KEY`
   - `ALERT_FROM_EMAIL`
   - `ALERT_TO_EMAILS`
   - `FIREBASE_TOKEN`

## 🧪 Step 3: Test Locally

### Run a Single Check

```bash
npm run monitor
```

Expected output:
```
🎯 AVALO MONITORING & AUTO-ROLLBACK SYSTEM
============================================================
Project: avalo-c8c46
Check Interval: 5 minutes
Auto-Rollback: Enabled
============================================================

🚀 AVALO MONITORING CHECK
============================================================
Time: 2024-01-15T10:30:00.000Z
Endpoints: 5

🔍 Checking: Production Website
   URL: https://avalo-c8c46.web.app
   Status: 200 ✅
   Response Time: 523ms ✅
   Payload: ✅

...

📊 ANALYSIS
============================================================
Total Endpoints: 5
Successful: 5 ✅
Failed: 0 ❌
Critical Failed: 0 🚨
Overall Uptime: 100.00%
Avg Response Time: 542ms

✅ MONITORING CYCLE COMPLETE
============================================================
```

### Test with Rollback Disabled

```bash
export DISABLE_ROLLBACK=true
npm run monitor
```

This will run checks but skip rollback even if conditions are met.

## 🔄 Step 4: Test Rollback (Optional)

### Test Manual Rollback

```bash
npm run monitor:force "Testing rollback functionality"
```

This will:
1. Trigger immediate rollback
2. Send alerts
3. Validate rollback success
4. Generate reports

**⚠️ WARNING:** This will actually rollback your production deployment!

### Dry-Run Mode

To test without actual rollback, edit `config.ts`:

```typescript
export const ROLLBACK_CONFIG = {
  enabled: true,
  requireManualApproval: true,  // Set to true
  firebaseProject: 'avalo-c8c46',
  backupBeforeRollback: true
};
```

Now rollbacks will be logged but not executed.

## 📊 Step 5: View Reports

After running monitoring, check the reports:

### JSON Report
```bash
cat ../reports/monitoring_report.json
```

### Markdown Report
```bash
cat ../reports/monitoring_report.md
```

### Pretty Print JSON
```bash
npm install -g json
json -f ../reports/monitoring_report.json
```

## 🤖 Step 6: Enable GitHub Actions

The monitoring workflow is already configured in `.github/workflows/monitor.yml`.

It will automatically run every 5 minutes once your secrets are configured.

### Manual Trigger

1. Go to **Actions** tab in GitHub
2. Select **Avalo Production Monitoring**
3. Click **Run workflow**
4. (Optional) Enable force rollback if needed
5. Click **Run workflow**

### View Results

Each workflow run will:
- Show live logs
- Upload reports as artifacts
- Create summary in the **Summary** tab
- Comment on monitoring issues if failures detected

## 📱 Step 7: Configure Discord Alerts

### Create Discord Webhook

1. Open Discord Server Settings
2. Go to **Integrations** → **Webhooks**
3. Click **New Webhook**
4. Name it "Avalo Monitoring"
5. Select a channel (e.g., #alerts or #monitoring)
6. Copy the webhook URL
7. Add to `.env` or GitHub Secrets

### Test Discord Alert

The alert will be sent automatically when:
- Endpoints fail validation
- Rollback is triggered
- System errors occur

## 📧 Step 8: Configure Email Alerts

### Get SendGrid API Key

1. Sign up at [sendgrid.com](https://sendgrid.com)
2. Go to **Settings** → **API Keys**
3. Create a new API key with **Mail Send** permissions
4. Copy the key
5. Add to `.env` or GitHub Secrets

### Verify Sender Email

1. In SendGrid, go to **Settings** → **Sender Authentication**
2. Verify your `ALERT_FROM_EMAIL` domain
3. Add recipient emails to `ALERT_TO_EMAILS` (comma-separated)

## 🎯 Step 9: Customize Thresholds (Optional)

Edit `config.ts` to adjust monitoring behavior:

```typescript
export const THRESHOLDS = {
  maxResponseTime: 1500,              // Lower for stricter monitoring
  criticalResponseTime: 3000,         // Adjust based on requirements
  consecutiveFailuresForRollback: 3,  // Increase for more tolerance
  slowResponseChecksForRollback: 3,   // Adjust for faster/slower response
  checkInterval: 300000,              // 5 minutes (300,000ms)
  retryAttempts: 2,                   // Increase for unstable networks
  retryDelay: 5000                    // Adjust retry delay
};
```

## ✅ Step 10: Verify Everything Works

### Checklist

- [ ] Dependencies installed (`npm install`)
- [ ] `.env` file configured with credentials
- [ ] Local monitoring check runs successfully
- [ ] Reports generated in `../reports/`
- [ ] GitHub Secrets configured
- [ ] Discord webhook tested
- [ ] SendGrid API key tested
- [ ] GitHub Actions workflow enabled
- [ ] Manual trigger works

### Test Complete System

Run this command to verify all components:

```bash
npm run monitor
```

Check for:
1. ✅ All endpoints checked
2. ✅ Reports generated
3. ✅ No errors in console
4. 📧 Alerts sent (if configured)

## 🆘 Troubleshooting

### "Module not found" Error
```bash
rm -rf node_modules package-lock.json
npm install
```

### "Firebase token invalid"
```bash
firebase logout
firebase login:ci
# Update FIREBASE_TOKEN in .env
```

### "Cannot read property of undefined"
Check that all required environment variables are set:
```bash
cat .env
# Verify all required variables are present
```

### "Connection timeout"
- Check your internet connection
- Verify endpoint URLs are accessible
- Increase timeout in config.ts

### Discord/Email Not Sending
- Verify webhook URL / API key is correct
- Check that alerts are enabled in config
- Review console for error messages

## 📚 Next Steps

- Read [AVALO_MONITORING_AND_AUTOROLLBACK.md](../AVALO_MONITORING_AND_AUTOROLLBACK.md) for full documentation
- Customize thresholds in `config.ts`
- Set up monitoring dashboard
- Configure on-call rotation for alerts
- Review and test rollback procedures

## 🎉 You're All Set!

The Avalo monitoring system is now protecting your production environment with:

✅ Real-time endpoint monitoring every 5 minutes  
✅ Automatic rollback on critical failures  
✅ Multi-channel alerts (Discord, Email, GitHub)  
✅ Comprehensive reporting  
✅ Manual override capabilities  

**Your production is now safer! 🚀**

---

**Need Help?** Check the main documentation or create an issue on GitHub.