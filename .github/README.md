# 🔧 Avalo CI/CD Configuration

This directory contains the GitHub Actions workflows and scripts that power Avalo's continuous integration and deployment pipeline.

## 📁 Directory Structure

```
.github/
├── workflows/
│   ├── ci.yml              # Main CI/CD pipeline
│   └── release.yml         # Release workflow (existing)
├── scripts/
│   ├── generate-ci-summary.js    # Auto-generate CI reports
│   └── validate-environment.js   # Environment validation
├── SECRETS_SETUP.md        # Secrets configuration guide
└── README.md              # This file
```

## 🚀 Quick Start

### For Developers

1. **First time setup:**
   ```bash
   # Validate your environment
   node .github/scripts/validate-environment.js
   ```

2. **Run tests locally:**
   ```bash
   # From project root
   npm test --prefix tests/integration
   ```

3. **Push code:**
   ```bash
   git add .
   git commit -m "feat: your changes"
   git push origin main  # Triggers CI automatically
   ```

### For Repository Admins

1. **Configure secrets:** See [SECRETS_SETUP.md](SECRETS_SETUP.md)
2. **Enable Actions:** Settings → Actions → Allow all actions
3. **Configure branch protection:** Require CI to pass before merge

## 📄 Workflows

### CI/CD Pipeline (`workflows/ci.yml`)

**Triggers:**
- Push to `main` branch
- Pull requests to `main` branch
- Manual dispatch via Actions UI

**What it does:**
1. Sets up Node.js 20.x environment
2. Installs dependencies (root, functions, integration tests)
3. Validates Firebase CLI version (≥13.0.0)
4. Builds functions (TypeScript → JavaScript)
5. Starts Firebase emulators (functions, firestore, auth, storage, hosting)
6. Runs full integration test suite
7. Generates CI summary reports
8. Uploads test artifacts (30-day retention)
9. Comments results on pull requests

**Artifacts generated:**
- `reports/avalo_full_test_report.md` - Full test results (Markdown)
- `reports/avalo_full_test_report.json` - Full test results (JSON)
- `reports/ci_run_summary.md` - CI execution summary (Markdown)
- `reports/ci_run_summary.json` - CI execution summary (JSON)

## 🔧 Scripts

### Generate CI Summary (`scripts/generate-ci-summary.js`)

Automatically creates comprehensive CI run summaries.

**Usage:**
```bash
node .github/scripts/generate-ci-summary.js
```

**Outputs:**
- `reports/ci_run_summary.md` - Human-readable summary
- `reports/ci_run_summary.json` - Machine-readable data

**Features:**
- Parses existing test reports
- Gathers environment information
- Creates emulator status badges
- Provides actionable next steps
- Calculates test statistics

### Validate Environment (`scripts/validate-environment.js`)

Checks if your environment meets CI/CD requirements.

**Usage:**
```bash
node .github/scripts/validate-environment.js
```

**Checks:**
- ✅ Node.js version (requires 20+)
- ✅ Firebase CLI version (requires 13.0.0+)
- ✅ TypeScript availability
- ✅ Required files exist
- ✅ Package scripts configured
- ✅ Environment variables in CI

**Exit codes:**
- `0` - Validation passed
- `1` - Validation failed

## 🔐 Secrets

Required secrets for CI/CD:

| Secret | Required | Purpose |
|--------|----------|---------|
| `FIREBASE_TOKEN` | ✅ Yes | Firebase CLI authentication |
| `STRIPE_SECRET_KEY` | ✅ Yes | Stripe API testing |
| `STRIPE_WEBHOOK_SECRET` | ✅ Yes | Stripe webhook validation |
| `OPENAI_API_KEY` | ⚠️ Optional | AI companion features |
| `ANTHROPIC_API_KEY` | ⚠️ Optional | Claude integration |

**Setup instructions:** See [SECRETS_SETUP.md](SECRETS_SETUP.md)

## 📊 Monitoring CI/CD

### View Workflow Runs

1. Go to **Actions** tab in GitHub
2. Select workflow: **Avalo CI/CD Pipeline**
3. Click on any run to see details

### Download Test Reports

1. Open a completed workflow run
2. Scroll to **Artifacts** section
3. Download `test-reports-{sha}.zip`
4. Extract and review markdown/JSON reports

### Check PR Status

Pull requests automatically show:
- ✅ Green checkmark if tests pass
- ❌ Red X if tests fail
- 🟡 Yellow dot if tests are running

Click **Details** to view full CI logs.

## 🐛 Troubleshooting

### Common Issues

**❌ Firebase CLI version error**
```
Solution: Ensure firebase-tools >= 13.0.0
npm install -g firebase-tools@latest
```

**❌ Emulators won't start**
```
Solution: Check firebase.json configuration
Verify all emulator ports are available
```

**❌ TypeScript compilation fails**
```
Solution: Run locally first
cd functions && npm run build
Fix any compilation errors
```

**❌ Tests fail only in CI**
```
Solution: Check environment differences
Verify all secrets are configured
Review timing-sensitive tests
```

### Get Help

1. Review workflow logs in Actions tab
2. Check [SECRETS_SETUP.md](SECRETS_SETUP.md) for configuration issues
3. Run validation script: `node .github/scripts/validate-environment.js`
4. Test locally: `npm test --prefix tests/integration`

## 🔄 Customization

### Change Workflow Triggers

Edit `workflows/ci.yml`:

```yaml
on:
  push:
    branches: [ main, develop ]  # Add branches
  schedule:
    - cron: '0 2 * * *'         # Add schedule
```

### Add Test Environments

Add matrix strategy:

```yaml
strategy:
  matrix:
    node-version: [18.x, 20.x, 22.x]
```

### Modify Report Format

Edit `scripts/generate-ci-summary.js` to customize:
- Report sections
- Badge styles
- Output format
- Summary statistics

## 📚 Related Documentation

- [CI/CD Automation Complete](../AVALO_CI_CD_AUTOMATION_COMPLETE.md)
- [Firebase Integration Test Suite](../AVALO_FIREBASE_INTEGRATION_TEST_SUITE.md)
- [Integration Tests Quick Start](../tests/integration/QUICK_START.md)
- [Test Suite Execution Summary](../AVALO_TEST_SUITE_EXECUTION_SUMMARY.md)

## 🎯 Best Practices

### For Contributors

✅ **DO:**
- Run tests locally before pushing
- Write meaningful commit messages
- Keep PRs focused and small
- Wait for CI to pass before requesting review
- Fix failing tests immediately

❌ **DON'T:**
- Push directly to main without PR
- Ignore CI failures
- Skip running tests locally
- Commit broken code
- Disable CI checks

### For Maintainers

✅ **DO:**
- Review CI logs for each PR
- Keep secrets up to date
- Monitor CI performance metrics
- Rotate credentials regularly
- Document workflow changes

❌ **DON'T:**
- Approve PRs with failing tests
- Share secrets in issues/PRs
- Skip security updates
- Ignore flaky tests
- Remove CI requirements

## 📈 Metrics to Track

Monitor these CI/CD metrics:

- **Build Time:** Target < 10 minutes
- **Success Rate:** Target > 95%
- **Flaky Tests:** Target < 2%
- **Queue Time:** Target < 30 seconds
- **Artifact Size:** Monitor growth

## 🔒 Security

- All secrets encrypted in GitHub
- No secrets in logs
- Test-only credentials in CI
- Artifacts auto-expire (30 days)
- Workflow permissions scoped

---

*Last Updated: 2025-01-05*  
*Avalo CI/CD v1.0*