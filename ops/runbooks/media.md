# Media Operations Runbook

## Overview

Media upload, storage, and CDN delivery issues for images, videos, and other content.

## Common Issues

### 1. Upload Failures

**Diagnosis:**
```bash
# Check recent upload errors
gcloud logging read "resource.type=cloud_function AND textPayload=~'upload.*failed'" --limit=50

# Check Cloud Storage status
gsutil ls gs://avalo-media/uploads/$(date +%Y/%m/%d)/ | wc -l

# Verify upload quotas
gcloud storage buckets describe gs://avalo-media
```

**Resolution:**
```bash
# Retry failed upload
node scripts/retry-upload.js --uploadId={uploadId}

# Check storage permissions
gsutil iam get gs://avalo-media

# Increase upload size limit
firebase functions:config:set media.max_size=104857600
```

### 2. CDN Performance Issues

**Diagnosis:**
```bash
# Check CDN hit rate
gcloud monitoring time-series list \
  --filter='metric.type="storage.googleapis.com/network/sent_bytes_count"'

# Test CDN latency
curl -w "@curl-format.txt" -o /dev/null -s https://cdn.avalo.app/test.jpg
```

**Resolution:**
```bash
# Purge CDN cache
gcloud compute url-maps invalidate-cdn-cache avalo-cdn \
  --path "/*"

# Update cache rules
gcloud compute backend-buckets update avalo-media \
  --cache-mode=CACHE_ALL_STATIC
```

### 3. Image Processing Delays

**Diagnosis:**
```bash
# Check processing queue
firebase firestore:query mediaProcessing \
  --where status==pending \
  --limit=100
```

**Resolution:**
```bash
# Scale processing workers
gcloud run services update avalo-media-processor \
  --min-instances=3 --max-instances=10

# Reprocess failed items
node scripts/reprocess-media.js --status=failed --since=24h
```

## Monitoring
- Upload success rate: >99%
- CDN hit rate: >90%
- Processing time p95: <10s