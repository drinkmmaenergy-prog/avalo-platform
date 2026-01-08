# Avalo Infrastructure Automation Guide
## Terraform IaC & Monitoring Setup

**Version**: 2.1.0
**Last Updated**: 2025-10-29
**Infrastructure-as-Code**: Terraform v1.6+
**Cloud Provider**: Google Cloud Platform (GCP)
**Region**: europe-west3 (primary)

---

## Overview

This guide provides complete instructions for deploying, managing, and monitoring Avalo's infrastructure using Terraform and modern DevOps practices. The infrastructure is designed for **zero-downtime deployments**, **auto-scaling**, and **disaster recovery** with RPO 1h / RTO 4h.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                    Avalo Infrastructure                       │
└──────────────────────────────────────────────────────────────┘

┌─────────────────┐
│  Load Balancer  │  (Cloud Load Balancing)
└────────┬────────┘
         │
    ┌────┴─────┬──────────┬──────────┬──────────┐
    │          │          │          │          │
┌───▼────┐ ┌──▼─────┐ ┌──▼─────┐ ┌──▼─────┐ ┌──▼─────┐
│ Web    │ │ API    │ │ Chat   │ │ Pay    │ │ Admin  │
│ (CDN)  │ │ (Run)  │ │ (Fns)  │ │ (Fns)  │ │ (Run)  │
└────────┘ └────────┘ └────────┘ └────────┘ └────────┘
                            │
              ┌─────────────┼─────────────┐
              │             │             │
        ┌─────▼────┐  ┌────▼────┐  ┌────▼────┐
        │Firestore │  │ Storage │  │ Pub/Sub │
        │ (eur3)   │  │ (Multi) │  │  Lite   │
        └──────────┘  └─────────┘  └─────────┘
              │             │
        ┌─────▼─────────────▼─────┐
        │   Backup & Archive      │
        │  (Cold Storage - 7yr)   │
        └─────────────────────────┘
                     │
        ┌────────────▼────────────┐
        │  Monitoring & Logging   │
        │ (Datadog + Cloud Logs)  │
        └─────────────────────────┘
```

---

## Prerequisites

### Required Tools

```bash
# Install Terraform
brew install terraform  # macOS
# or
choco install terraform  # Windows
# or
apt-get install terraform  # Linux

# Verify version
terraform version  # Should be ≥1.5.0

# Install Google Cloud SDK
brew install google-cloud-sdk

# Install Firebase CLI
npm install -g firebase-tools

# Install Node.js 20
nvm install 20
nvm use 20
```

### Required Access

1. **GCP Project**: `avalo-c8c46`
2. **IAM Roles**:
   - `roles/editor` (deployment)
   - `roles/iam.serviceAccountAdmin`
   - `roles/resourcemanager.projectIamAdmin`
3. **Firebase Project**: Owner access
4. **Terraform Cloud** (optional): Workspace access

### Environment Variables

```bash
# .env.terraform
export GCP_PROJECT=avalo-c8c46
export GCP_REGION=europe-west3
export TF_VAR_project_id=avalo-c8c46
export TF_VAR_region=europe-west3
export TF_VAR_environment=production

# Datadog (optional)
export DATADOG_API_KEY=your_api_key
export DATADOG_APP_KEY=your_app_key

# Stripe
export STRIPE_SECRET_KEY=sk_live_...
export STRIPE_WEBHOOK_SECRET=whsec_...

# Firebase Service Account
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

---

## Quick Start

### 1. Initial Setup

```bash
# Clone repository
git clone https://github.com/avalo/avaloapp.git
cd avaloapp

# Load environment
source .env.terraform

# Authenticate with GCP
gcloud auth login
gcloud config set project avalo-c8c46

# Authenticate Firebase
firebase login
```

### 2. Initialize Terraform

```bash
cd infra

# Initialize Terraform
terraform init

# Create workspace (optional)
terraform workspace new production
terraform workspace select production

# Validate configuration
terraform validate

# Preview changes
terraform plan -out=tfplan
```

### 3. Deploy Infrastructure

```bash
# Apply changes
terraform apply tfplan

# Or interactive apply
terraform apply

# Confirm with: yes
```

**Expected Duration**: 8-12 minutes

### 4. Deploy Application

```bash
# Build functions
cd ../functions
npm install
npm run build

# Deploy functions
firebase deploy --only functions --project avalo-c8c46

# Deploy web app
cd ../web
npm install
npm run build
firebase deploy --only hosting --project avalo-c8c46

# Deploy Firestore rules & indexes
firebase deploy --only firestore --project avalo-c8c46
```

**Expected Duration**: 5-8 minutes

---

## Terraform Configuration

### Directory Structure

```
infra/
├── main.tf                 # Main configuration
├── firestore.tf           # Firestore resources
├── functions.tf           # Cloud Functions
├── storage.tf             # Cloud Storage buckets
├── iam.tf                 # IAM roles & service accounts
├── monitoring.tf          # Monitoring & alerting
├── networking.tf          # VPC, firewall rules
├── pubsub.tf             # Pub/Sub topics & subscriptions
├── scheduler.tf          # Cloud Scheduler jobs
├── variables.tf          # Input variables
├── outputs.tf            # Output values
├── terraform.tfvars      # Variable values (gitignored)
├── backend.tf            # Remote state configuration
└── README.md             # This file
```

### Core Resources (`main.tf`)

```hcl
terraform {
  required_version = ">= 1.5"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 5.0"
    }
  }

  backend "gcs" {
    bucket = "avalo-terraform-state"
    prefix = "production"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

# Enable required APIs
resource "google_project_service" "required_apis" {
  for_each = toset([
    "cloudfunctions.googleapis.com",
    "firestore.googleapis.com",
    "storage.googleapis.com",
    "pubsub.googleapis.com",
    "cloudscheduler.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "monitoring.googleapis.com",
    "logging.googleapis.com",
  ])

  service = each.key
  disable_on_destroy = false
}
```

### Firestore Configuration (`firestore.tf`)

```hcl
resource "google_firestore_database" "avalo_db" {
  project     = var.project_id
  name        = "(default)"
  location_id = "eur3"
  type        = "FIRESTORE_NATIVE"

  # Deletion protection
  deletion_policy = "DELETE"
}

# Indexes
resource "google_firestore_index" "user_reputation" {
  project    = var.project_id
  database   = google_firestore_database.avalo_db.name
  collection = "reputationProfiles"

  fields {
    field_path = "trustLevel"
    order      = "ASCENDING"
  }

  fields {
    field_path = "trustScore"
    order      = "DESCENDING"
  }
}

resource "google_firestore_index" "reviews" {
  project    = var.project_id
  database   = google_firestore_database.avalo_db.name
  collection = "reviews"

  fields {
    field_path = "reviewedUserId"
    order      = "ASCENDING"
  }

  fields {
    field_path = "moderationStatus"
    order      = "ASCENDING"
  }

  fields {
    field_path = "createdAt"
    order      = "DESCENDING"
  }
}

# Add more indexes as needed...
```

### Cloud Functions (`functions.tf`)

```hcl
# Service account for functions
resource "google_service_account" "functions_sa" {
  account_id   = "cloud-functions-sa"
  display_name = "Cloud Functions Service Account"
  project      = var.project_id
}

# IAM bindings
resource "google_project_iam_member" "functions_datastore" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.functions_sa.email}"
}

resource "google_project_iam_member" "functions_storage" {
  project = var.project_id
  role    = "roles/storage.objectAdmin"
  member  = "serviceAccount:${google_service_account.functions_sa.email}"
}

# Note: Actual function deployment via Firebase CLI
# Terraform manages infrastructure, Firebase CLI manages code deployment
```

### Cloud Storage (`storage.tf`)

```hcl
resource "google_storage_bucket" "user_content" {
  name     = "${var.project_id}-user-content"
  location = var.region
  project  = var.project_id

  uniform_bucket_level_access = true

  versioning {
    enabled = true
  }

  lifecycle_rule {
    condition {
      age = 90
    }
    action {
      type          = "SetStorageClass"
      storage_class = "NEARLINE"
    }
  }

  lifecycle_rule {
    condition {
      age = 365
    }
    action {
      type          = "SetStorageClass"
      storage_class = "COLDLINE"
    }
  }

  cors {
    origin          = ["https://avalo.app", "https://*.avalo.app"]
    method          = ["GET", "HEAD", "PUT", "POST", "DELETE"]
    response_header = ["*"]
    max_age_seconds = 3600
  }
}

resource "google_storage_bucket" "backups" {
  name     = "${var.project_id}-backups"
  location = var.region
  project  = var.project_id

  uniform_bucket_level_access = true

  lifecycle_rule {
    condition {
      age = 2555  # 7 years
    }
    action {
      type = "Delete"
    }
  }
}

resource "google_storage_bucket" "terraform_state" {
  name     = "avalo-terraform-state"
  location = var.region
  project  = var.project_id

  versioning {
    enabled = true
  }

  uniform_bucket_level_access = true
}
```

### Monitoring (`monitoring.tf`)

```hcl
# Uptime check
resource "google_monitoring_uptime_check_config" "web_uptime" {
  display_name = "Avalo Web Uptime"
  timeout      = "10s"
  period       = "60s"

  http_check {
    path         = "/health"
    port         = 443
    use_ssl      = true
    validate_ssl = true
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = "avalo.app"
    }
  }
}

# Alert policy - High error rate
resource "google_monitoring_alert_policy" "high_error_rate" {
  display_name = "High Error Rate"
  combiner     = "OR"

  conditions {
    display_name = "Error rate > 5%"

    condition_threshold {
      filter          = "resource.type=\"cloud_function\" AND metric.type=\"cloudfunctions.googleapis.com/function/execution_count\" AND metric.label.status=\"error\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 0.05

      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_RATE"
      }
    }
  }

  notification_channels = [
    google_monitoring_notification_channel.email.id,
    google_monitoring_notification_channel.slack.id,
  ]

  alert_strategy {
    auto_close = "1800s"  # 30 minutes
  }
}

# Notification channels
resource "google_monitoring_notification_channel" "email" {
  display_name = "Email Notifications"
  type         = "email"

  labels = {
    email_address = "ops@avalo.app"
  }
}

resource "google_monitoring_notification_channel" "slack" {
  display_name = "Slack Notifications"
  type         = "slack"

  labels = {
    channel_name = "#ops-alerts"
  }

  sensitive_labels {
    auth_token = var.slack_webhook_url
  }
}
```

---

## CI/CD Pipeline

### GitHub Actions Workflow

`.github/workflows/deploy.yml`:

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: |
          cd functions
          npm ci

      - name: Run tests
        run: |
          cd functions
          npm test

      - name: Run linter
        run: |
          cd functions
          npm run lint

  deploy-infrastructure:
    needs: test
    runs-on: ubuntu-latest
    if: contains(github.event.head_commit.modified, 'infra/')

    steps:
      - uses: actions/checkout@v3

      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v2
        with:
          terraform_version: 1.6.0

      - name: Terraform Init
        run: |
          cd infra
          terraform init

      - name: Terraform Plan
        run: |
          cd infra
          terraform plan -out=tfplan

      - name: Terraform Apply
        if: github.ref == 'refs/heads/main'
        run: |
          cd infra
          terraform apply -auto-approve tfplan

  deploy-functions:
    needs: test
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install Firebase CLI
        run: npm install -g firebase-tools

      - name: Build functions
        run: |
          cd functions
          npm ci
          npm run build

      - name: Deploy to Firebase
        run: |
          firebase deploy --only functions --project avalo-c8c46 --token ${{ secrets.FIREBASE_TOKEN }}

  deploy-web:
    needs: test
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Build web app
        run: |
          cd web
          npm ci
          npm run build

      - name: Deploy to Firebase Hosting
        run: |
          firebase deploy --only hosting --project avalo-c8c46 --token ${{ secrets.FIREBASE_TOKEN }}
```

---

## Monitoring & Observability

### Datadog Integration

**Setup**:

```bash
# Install Datadog agent (Cloud Functions)
npm install --save @datadog/datadog-lambda-js dd-trace

# functions/src/monitoring.ts
import tracer from 'dd-trace';
tracer.init({
  hostname: 'avalo-functions',
  service: 'avalo-backend',
  env: 'production',
  version: '2.1.0',
});

export function trackMetric(
  metric: string,
  value: number,
  tags: string[] = []
) {
  tracer.dogstatsd.gauge(metric, value, tags);
}

// Usage
trackMetric('avalo.chat.active_sessions', 142, ['region:eu']);
trackMetric('avalo.payments.revenue', 1250.50, ['currency:usd']);
```

### Custom Dashboards

**Key Metrics to Monitor**:

1. **Application Performance**
   - Request rate (requests/sec)
   - Error rate (%)
   - Response time (p50, p95, p99)
   - Function cold starts

2. **Business Metrics**
   - Active users (DAU, MAU)
   - Revenue (MRR, ARR)
   - Conversion funnel
   - Churn rate

3. **Infrastructure**
   - CPU utilization
   - Memory usage
   - Firestore reads/writes
   - Storage usage

4. **Security**
   - Failed login attempts
   - Suspicious activity
   - API rate limit hits
   - DDoS attempts

### Alert Configuration

```typescript
// functions/src/alerts.ts
export const ALERTS = {
  HIGH_ERROR_RATE: {
    metric: 'error_rate',
    threshold: 0.05,  // 5%
    duration: 300,    // 5 minutes
    severity: 'critical',
    channels: ['slack', 'pagerduty', 'email'],
  },

  SLOW_RESPONSE_TIME: {
    metric: 'response_time_p95',
    threshold: 2000,  // 2 seconds
    duration: 600,    // 10 minutes
    severity: 'warning',
    channels: ['slack'],
  },

  PAYMENT_FAILURE_SPIKE: {
    metric: 'payment_failure_rate',
    threshold: 0.10,  // 10%
    duration: 180,    // 3 minutes
    severity: 'critical',
    channels: ['slack', 'pagerduty', 'email'],
  },

  LOW_BALANCE: {
    metric: 'gcp_balance',
    threshold: 1000,  // $1000
    duration: 0,      // Immediate
    severity: 'warning',
    channels: ['email'],
  },
};
```

---

## Disaster Recovery

### Backup Strategy

**Firestore Backups**:

```bash
# Automated daily backups (via Cloud Scheduler)
gcloud firestore export gs://avalo-c8c46-backups/$(date +%Y%m%d)

# Retention: 30 days
# Storage class: COLDLINE after 90 days
```

**Restore Procedure**:

```bash
# List available backups
gsutil ls gs://avalo-c8c46-backups/

# Restore from backup
gcloud firestore import gs://avalo-c8c46-backups/20251029
```

**Recovery Time Objective (RTO)**: 4 hours
**Recovery Point Objective (RPO)**: 1 hour

### Failover Plan

**Multi-Region Setup**:

1. **Primary**: europe-west3
2. **Secondary**: europe-west1 (failover)
3. **Tertiary**: us-central1 (disaster)

**Failover Procedure**:

```bash
# 1. Verify secondary region health
firebase functions:list --region europe-west1

# 2. Update DNS to point to secondary
# (Cloudflare or Cloud DNS)

# 3. Re-deploy functions to secondary
firebase deploy --only functions --region europe-west1

# 4. Migrate Firestore data (if needed)
gcloud firestore export gs://backup-bucket
# Import to secondary region

# Expected downtime: <15 minutes
```

---

## Cost Optimization

### Current Costs (Monthly)

| Service | Usage | Cost |
|---------|-------|------|
| Cloud Functions | 15M invocations | $180 |
| Firestore | 250GB, 80M reads | $420 |
| Cloud Storage | 500GB, CDN bandwidth | $85 |
| Pub/Sub | 20M messages | $40 |
| Monitoring | Datadog 10 hosts | $150 |
| **Total** | | **$875/month** |

### Optimization Tips

1. **Function Warm-up**: Set `minInstances: 2` for high-traffic functions
2. **Firestore Indexes**: Remove unused indexes (saves 10-15%)
3. **Storage Lifecycle**: Auto-archive old content (saves 20-30%)
4. **CDN Caching**: Increase TTL for static assets (saves 15%)
5. **Compression**: Enable gzip for API responses (saves 5-10%)

### Cost Alerts

```hcl
# Terraform monitoring.tf
resource "google_billing_budget" "monthly_budget" {
  billing_account = var.billing_account
  display_name    = "Monthly Infrastructure Budget"

  amount {
    specified_amount {
      currency_code = "USD"
      units         = "1000"
    }
  }

  threshold_rules {
    threshold_percent = 0.5
  }

  threshold_rules {
    threshold_percent = 0.9
  }

  threshold_rules {
    threshold_percent = 1.0
  }
}
```

---

## Security Best Practices

### Secrets Management

```bash
# Store secrets in Secret Manager (NOT in code)
gcloud secrets create stripe-secret-key \
  --data-file=- <<< "$STRIPE_SECRET_KEY"

gcloud secrets create datadog-api-key \
  --data-file=- <<< "$DATADOG_API_KEY"

# Grant access to Cloud Functions
gcloud secrets add-iam-policy-binding stripe-secret-key \
  --member="serviceAccount:cloud-functions-sa@avalo-c8c46.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### IAM Best Practices

1. **Least Privilege**: Grant minimum required permissions
2. **Service Accounts**: Use dedicated service accounts per service
3. **Key Rotation**: Rotate service account keys every 90 days
4. **Audit Logging**: Enable all admin activity logs
5. **MFA**: Require multi-factor authentication for all users

### Network Security

```hcl
# VPC with private IPs
resource "google_compute_network" "vpc" {
  name                    = "avalo-vpc"
  auto_create_subnetworks = false
}

# Firewall rules
resource "google_compute_firewall" "allow_https" {
  name    = "allow-https"
  network = google_compute_network.vpc.name

  allow {
    protocol = "tcp"
    ports    = ["443"]
  }

  source_ranges = ["0.0.0.0/0"]
}

# Cloud Armor (DDoS protection)
resource "google_compute_security_policy" "policy" {
  name = "avalo-security-policy"

  rule {
    action   = "rate_based_ban"
    priority = "1000"
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
    rate_limit_options {
      conform_action = "allow"
      exceed_action  = "deny(429)"
      enforce_on_key = "IP"

      rate_limit_threshold {
        count        = 100
        interval_sec = 60
      }
    }
  }
}
```

---

## Troubleshooting

### Common Issues

**Issue 1: Terraform state lock**

```bash
# Symptoms: "Error: Error acquiring the state lock"
# Solution: Force unlock (use with caution)
terraform force-unlock LOCK_ID
```

**Issue 2: Function deployment timeout**

```bash
# Symptoms: "Deployment timed out after 10 minutes"
# Solution: Increase timeout, check logs
firebase functions:log --only functionName

# Fix: Optimize function cold start time
```

**Issue 3: Firestore permission denied**

```bash
# Symptoms: "Missing or insufficient permissions"
# Solution: Check security rules, verify IAM roles
firebase firestore:rules --project avalo-c8c46
```

**Issue 4: High costs unexpectedly**

```bash
# Check usage breakdown
gcloud billing accounts list
gcloud billing projects list

# Identify cost spikes
# GCP Console → Billing → Reports
```

---

## Maintenance Schedule

### Daily

- Automated backups (2 AM UTC)
- Security log review
- Cost monitoring

### Weekly

- Dependency updates (Dependabot)
- Performance review
- Capacity planning

### Monthly

- Infrastructure audit
- Cost optimization review
- Disaster recovery drill
- Security patch updates

### Quarterly

- Full system audit
- Load testing
- Business continuity plan review
- Terraform state cleanup

---

## Support & Resources

**Internal Documentation**:
- Terraform Cloud: https://app.terraform.io/app/avalo
- Runbook: https://docs.avalo.app/runbook
- Architecture Diagrams: https://docs.avalo.app/architecture

**External Resources**:
- GCP Documentation: https://cloud.google.com/docs
- Terraform Registry: https://registry.terraform.io/
- Firebase Docs: https://firebase.google.com/docs

**Emergency Contacts**:
- On-Call Engineer: ops@avalo.app
- Platform Team: platform@avalo.app
- Security Team: security@avalo.app

---

**Last Updated**: 2025-10-29
**Maintained By**: Avalo Infrastructure Team
**Next Review**: Q1 2026
