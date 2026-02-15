# GCP Cloud Run CPU Quota Request — avalostaging

## Context

Firebase Functions Gen2 run on Cloud Run. Each function deploy provisions a Cloud Run service
that consumes CPU allocation quota. When deploying hundreds of functions simultaneously,
the `Total CPUs` quota in the target region (`europe-west1`) can be exhausted, causing
deploy stalls and `RESOURCE_EXHAUSTED` errors.

## Current Project

| Field       | Value            |
|-------------|------------------|
| Project ID  | `avalostaging`   |
| Region      | `europe-west1`   |
| Runtime     | `nodejs20`       |
| Functions   | ~500+ Gen2       |

## Which Quota(s) Matter

| Quota Name                                  | Default | Recommended |
|---------------------------------------------|---------|-------------|
| **Cloud Run Admin API — CPU allocation**    | 1000    | 2000+       |
| Cloud Run — Total CPU allocation per region | 1000    | 2000+       |
| Cloud Run — Services per project            | 1000    | 2000+       |
| Cloud Run — Revisions per service           | 1000    | (default ok)|

The primary bottleneck is **CPU allocation per region** (`europe-west1`).
Each Cloud Run service (= each Firebase Function) requests 1 CPU by default.
With 500+ functions, the default 1000 CPU limit is reached during parallel deploys.

## How to Request Quota Increase

### Step 1 — Navigate to Cloud Run Quotas

1. Open [Google Cloud Console](https://console.cloud.google.com)
2. Select project: **avalostaging**
3. Navigate to: **IAM & Admin → Quotas & System Limits**
   - Direct URL: `https://console.cloud.google.com/iam-admin/quotas?project=avalostaging`
4. Or navigate via: **Cloud Run → Settings → Quotas**

### Step 2 — Filter for Cloud Run CPU Quotas

1. In the **Filter** box, type: `Cloud Run`
2. Look for quotas containing:
   - `Total CPUs` or `CPU allocation`
   - Filter by **Location**: `europe-west1`
3. Select the quota row(s) that show current usage near the limit

### Step 3 — Request Increase

1. Check the checkbox next to the relevant quota
2. Click **"Edit Quotas"** button at the top
3. Enter new limit: **2000** (or higher if needed)
4. In the justification field, write:

   > Firebase Functions Gen2 project with 500+ Cloud Functions deployed as Cloud Run services
   > in europe-west1. Current quota is insufficient for simultaneous deploys. Requesting increase
   > to support deterministic batch deployment and avoid RESOURCE_EXHAUSTED errors during CI/CD.

5. Submit the request

### Step 4 — Wait for Approval

- Most quota increases for Cloud Run are auto-approved within minutes to hours
- Complex requests may take 1-2 business days
- You will receive an email notification at the project owner's email

## Alternative: Batch Deploy (No Quota Increase Needed)

The batch deploy script (`deploy-staging.ps1`) works around this quota limit by:

1. Deploying functions in small batches (8-16 per batch)
2. Waiting 10 seconds between batches for Cloud Run to settle
3. Verifying each batch before proceeding

This approach **does not require** a quota increase for standard deployment.
The quota increase is a "nice to have" for faster deploys.

## Verification

After quota increase (if requested), verify with:

```bash
gcloud compute regions describe europe-west1 --project=avalostaging
gcloud run services list --region=europe-west1 --project=avalostaging --format="value(metadata.name)" | wc -l
```

## Screenshot Placeholders

> _Insert screenshot of GCP Console → Quotas page showing Cloud Run CPU quota for europe-west1_

> _Insert screenshot of quota edit dialog with requested value_

> _Insert screenshot of approval confirmation email (when received)_
