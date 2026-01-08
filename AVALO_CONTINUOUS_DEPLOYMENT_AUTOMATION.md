# Avalo Continuous Deployment Automation

## Overview

Avalo uses an automated continuous deployment pipeline that deploys to Firebase Hosting only when all CI tests and post-deployment verification checks pass successfully.

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Avalo CI/CD Pipeline Flow                     │
└─────────────────────────────────────────────────────────────────┘

Push to main branch
       │
       ▼
┌─────────────────┐
│  CI Workflow    │  ← Runs all integration tests
│  (ci.yml)       │  ← Builds functions
└────────┬────────┘  ← Validates TypeScript
         │
         ▼ (on success)
┌─────────────────┐
│ Post-Deploy     │  ← Runs verification suite
│ Verification    │  ← Generates status report
└────────┬────────┘  ← Validates system readiness
         │
         ▼ (if status == "Ready")
┌─────────────────┐
│ Continuous      │  ← Downloads verification artifacts
│ Deployment      │  ← Validates deployment readiness
│ (deploy.yml)    │  ← Deploys to Firebase Hosting
└─────────────────┘
```

## Trigger Conditions

### Automatic Triggers

The deployment workflow automatically triggers when:

1. **CI/CD Pipeline Completes Successfully**
   - The `Avalo CI/CD Pipeline` workflow completes with `conclusion == success`
   - All integration tests must pass
   - Post-deployment verification must report status: `Ready` or `PASSED`
   - Only triggers on the `main` branch

2. **Verification Requirements**
   - Verification report must exist: `reports/avalo_post_deploy_verification.json`
   - Verification status must be: `Ready` or `PASSED`
   - All verification tests must pass (0 failed tests)

### Manual Triggers

You can manually trigger deployment using:

```bash
# Via GitHub CLI
gh workflow run deploy.yml

# Via GitHub Web UI
# Navigate to: Actions → Avalo Continuous Deployment → Run workflow
```

**Note**: Manual triggers will create a mock verification report and proceed with deployment. Use this only for emergency deployments or testing.

## Deployment Process

### Step-by-Step Execution

1. **Environment Setup**
   - Checks out repository
   - Sets up Node.js 20.x
   - Installs Firebase CLI (≥ 13.0.0)

2. **Verification Check**
   - Downloads verification artifacts from CI workflow
   - Parses `avalo_post_deploy_verification.json`
   - Validates deployment readiness status

3. **Build Phase**
   - Installs all dependencies
   - Builds Firebase Functions
   - Validates TypeScript compilation

4. **Deployment Phase**
   - Deploys to Firebase Hosting project: `avalo-c8c46`
   - Targets: `hosting` configuration

5. **Reporting Phase**
   - Generates deployment summary
   - Uploads deployment logs
   - Creates GitHub job summary

## Firebase Hosting Configuration

### Primary Hosting Targets

Avalo uses Firebase Hosting with the following configuration:

**Project ID**: `avalo-c8c46`

**Hosting URLs**:
- Primary: `https://avalo-c8c46.web.app`
- Alternative: `https://avalo-c8c46.firebaseapp.com`

**Deployment Command**:
```bash
firebase deploy --only hosting --project avalo-c8c46
```

### Hosting Targets

The project may use multiple hosting targets for different purposes:

| Target | Purpose | Configuration |
|--------|---------|---------------|
| `app` | Main application | Default site |
| `web` | Marketing/landing pages | Additional site (if configured) |

**Note**: Current deployment targets the default hosting configuration. To deploy specific targets:

```bash
# Deploy to specific target
firebase deploy --only hosting:app --project avalo-c8c46

# Deploy multiple targets
firebase deploy --only hosting:app,hosting:web --project avalo-c8c46
```

## Required Secrets

The deployment workflow requires the following GitHub Secrets:

### Essential Secrets

1. **`FIREBASE_TOKEN`** (Required)
   - Firebase authentication token for deployment
   - Generate using: `firebase login:ci`
   - Used for: Firebase Hosting deployment

2. **`STRIPE_SECRET_KEY`** (Required)
   - Stripe API secret key
   - Used for: Payment processing functions

3. **`OPENAI_API_KEY`** (Required)
   - OpenAI API key
   - Used for: AI companion features

4. **`ANTHROPIC_API_KEY`** (Required)
   - Anthropic (Claude) API key
   - Used for: Advanced AI features

### Adding Secrets

```bash
# Navigate to GitHub repository
# Settings → Secrets and variables → Actions → New repository secret

# Or use GitHub CLI
gh secret set FIREBASE_TOKEN < firebase-token.txt
gh secret set STRIPE_SECRET_KEY
gh secret set OPENAI_API_KEY
gh secret set ANTHROPIC_API_KEY
```

## Manual Rollback Procedures

### Quick Rollback

If you need to rollback to a previous deployment:

#### Option 1: Firebase Console (Fastest)

1. Open [Firebase Console](https://console.firebase.google.com)
2. Select project: `avalo-c8c46`
3. Navigate to: **Hosting** → **Release History**
4. Find the previous stable release
5. Click **Roll back** next to that release
6. Confirm rollback

**Rollback Time**: ~30 seconds

#### Option 2: Firebase CLI (Automated)

```bash
# List recent releases
firebase hosting:channel:list --project avalo-c8c46

# View release history
firebase hosting:list --project avalo-c8c46

# Rollback to specific version (requires version ID from history)
firebase hosting:channel:deploy <channel-name> --project avalo-c8c46
```

#### Option 3: Deploy Previous Commit

```bash
# Checkout previous stable commit
git checkout <previous-commit-sha>

# Deploy manually
firebase deploy --only hosting --project avalo-c8c46

# Return to main branch
git checkout main
```

### Rollback Verification

After rollback, verify the deployment:

1. **Check Live Site**
   ```bash
   curl -I https://avalo-c8c46.web.app
   ```

2. **Run Post-Deployment Tests**
   ```bash
   cd tests/verification
   npm run verify
   ```

3. **Monitor Firebase Console**
   - Check for errors in Functions logs
   - Verify Hosting traffic
   - Review Performance monitoring

### Emergency Procedures

If automated rollback fails:

1. **Disable the site temporarily**:
   ```bash
   # Deploy a maintenance page
   firebase hosting:channel:deploy maintenance --project avalo-c8c46
   ```

2. **Contact Firebase Support**:
   - Email: support@firebase.google.com
   - Include: Project ID, error details, timestamp

3. **Check Deployment Logs**:
   - Navigate to: GitHub Actions → Failed deployment
   - Download: `deployment-artifacts-{sha}`
   - Review: `logs/deploy_run.log`

## Version Tagging Instructions

### Git Tag Strategy

Avalo uses semantic versioning for releases:

```
v{MAJOR}.{MINOR}.{PATCH}
```

**Examples**:
- `v1.0.0` - Initial release
- `v1.1.0` - New features (minor)
- `v1.1.1` - Bug fixes (patch)
- `v2.0.0` - Breaking changes (major)

### Creating Release Tags

#### Automatic (Recommended)

After successful deployment, create a release tag:

```bash
# Get the current version from package.json
VERSION=$(node -p "require('./package.json').version")

# Create and push tag
git tag -a "v$VERSION" -m "Release v$VERSION"
git push origin "v$VERSION"
```

#### Manual Tagging

```bash
# Create annotated tag
git tag -a v1.2.0 -m "Release v1.2.0: Add new features"

# Push tag to remote
git push origin v1.2.0

# Push all tags
git push origin --tags
```

### Creating GitHub Releases

#### Using GitHub CLI

```bash
# Create release from tag
gh release create v1.2.0 \
  --title "Avalo v1.2.0" \
  --notes "Release notes here" \
  --latest

# With release artifacts
gh release create v1.2.0 \
  --title "Avalo v1.2.0" \
  --notes-file RELEASE_NOTES.md \
  reports/deployment_summary.md \
  reports/avalo_post_deploy_verification.md
```

#### Using GitHub Web UI

1. Navigate to: **Releases** → **Draft a new release**
2. Choose or create tag: `v1.2.0`
3. Set release title: `Avalo v1.2.0`
4. Add release notes
5. Attach artifacts (optional)
6. Publish release

### Version Tagging Best Practices

1. **Tag After Successful Deployment**
   - Only tag commits that have been successfully deployed
   - Verify deployment is stable before tagging

2. **Include Change Summary**
   ```bash
   git tag -a v1.2.0 -m "v1.2.0 - Added AI companion features
   
   - New AI companion interface
   - Enhanced chat functionality
   - Performance improvements
   "
   ```

3. **Link to Deployment Artifacts**
   - Reference GitHub Actions run
   - Include deployment summary
   - Link verification reports

4. **Semantic Versioning Rules**
   - **MAJOR**: Breaking API changes, database migrations
   - **MINOR**: New features, backwards-compatible
   - **PATCH**: Bug fixes, security patches

### Pre-release Versions

For beta or release candidate versions:

```bash
# Beta release
git tag -a v1.2.0-beta.1 -m "Beta release v1.2.0-beta.1"

# Release candidate
git tag -a v1.2.0-rc.1 -m "Release candidate v1.2.0-rc.1"

# Push pre-release tag
git push origin v1.2.0-beta.1
```

## Deployment Artifacts

### Stored Artifacts

After each deployment, the following artifacts are stored:

| Artifact | Location | Retention |
|----------|----------|-----------|
| Deployment Summary | `reports/deployment_summary.md` | 90 days |
| Verification Report (MD) | `reports/avalo_post_deploy_verification.md` | 90 days |
| Verification Report (JSON) | `reports/avalo_post_deploy_verification.json` | 90 days |
| Deployment Logs | `logs/deploy_run.log` | 90 days |

### Accessing Artifacts

```bash
# List all workflow runs
gh run list --workflow=deploy.yml

# Download artifacts from specific run
gh run download <run-id> --name deployment-artifacts-{sha}

# View deployment summary
cat reports/deployment_summary.md
```

## Monitoring and Alerts

### Deployment Notifications

**Success Notification**:
```
✅ Avalo deployed successfully to Firebase Hosting
🌐 URL: https://avalo-c8c46.web.app
📄 Report: reports/avalo_post_deploy_verification.md
```

**Failure Notification**:
```
❌ Deployment blocked – verification failed
See job summary for details
```

### GitHub Actions Status

Monitor deployment status:
- **GitHub UI**: Repository → Actions → Avalo Continuous Deployment
- **GitHub CLI**: `gh run watch <run-id>`
- **Webhook**: Configure webhooks for deployment events

### Firebase Monitoring

Monitor production deployment:

1. **Firebase Console**
   - Performance: Monitor page load times
   - Hosting: Check traffic patterns
   - Functions: Review error rates

2. **Firebase CLI**
   ```bash
   # View hosting metrics
   firebase hosting:channel:list --project avalo-c8c46
   
   # Check function logs
   firebase functions:log --project avalo-c8c46
   ```

## Deployment Idempotency

The deployment workflow ensures idempotency:

1. **Prevents Double Deployment**
   - Unique artifact names: `deployment-artifacts-{sha}`
   - Skip if already deployed for commit

2. **Safe Reruns**
   - Rerunning failed deployment is safe
   - Will use same verification artifacts
   - Won't create duplicate deployments

## Troubleshooting

### Common Issues

#### 1. Verification Report Not Found

**Error**: `⚠️ Verification report not found`

**Solution**:
```bash
# Check if verification workflow completed
gh run list --workflow=ci.yml --status success

# Manually download verification artifacts
gh run download <ci-run-id> --name verification-reports-{sha}
```

#### 2. Verification Status Not "Ready"

**Error**: `❌ Deployment blocked - verification status is: FAILED`

**Solution**:
1. Review verification report: `reports/avalo_post_deploy_verification.md`
2. Fix failing tests
3. Push fixes to trigger new CI run
4. Deployment will auto-trigger after successful verification

#### 3. Firebase Token Expired

**Error**: `Authentication failed`

**Solution**:
```bash
# Generate new token
firebase login:ci

# Update GitHub secret
gh secret set FIREBASE_TOKEN
```

#### 4. Deployment Timeout

**Error**: `Deployment exceeded timeout`

**Solution**:
1. Check Firebase Status: https://status.firebase.google.com
2. Retry deployment manually
3. Contact Firebase Support if issue persists

### Debug Mode

Enable debug logging:

```bash
# In workflow file, add to env:
DEBUG: "*"
FIREBASE_DEBUG: true
```

## Best Practices

1. **Always Run Tests Locally First**
   ```bash
   npm test --prefix tests/verification
   ```

2. **Monitor Deployments**
   - Watch GitHub Actions progress
   - Check Firebase Console after deployment
   - Review deployment logs

3. **Tag Successful Deployments**
   - Create git tags for production releases
   - Document changes in release notes

4. **Keep Secrets Updated**
   - Rotate API keys regularly
   - Update GitHub Secrets when keys change

5. **Review Deployment Logs**
   - Check for warnings
   - Monitor performance metrics
   - Review error logs

## Security Considerations

1. **Secrets Management**
   - Never commit secrets to repository
   - Use GitHub Secrets for sensitive data
   - Rotate secrets regularly

2. **Access Control**
   - Limit who can trigger manual deployments
   - Use Firebase IAM roles
   - Enable branch protection rules

3. **Audit Trail**
   - All deployments are logged
   - Artifacts retained for 90 days
   - GitHub Actions provides full audit log

## Additional Resources

- [Firebase Hosting Documentation](https://firebase.google.com/docs/hosting)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Avalo CI/CD Implementation](./AVALO_CI_CD_AUTOMATION_COMPLETE.md)
- [Post-Deployment Verification](./AVALO_POST_DEPLOYMENT_VERIFICATION_COMPLETE.md)

## Support

For deployment issues:
1. Check GitHub Actions logs
2. Review deployment artifacts
3. Consult this documentation
4. Contact development team

---

**Last Updated**: 2025-11-05  
**Version**: 1.0.0  
**Maintained By**: Avalo Development Team