# Avalo Web Infrastructure Deployment Guide

## Overview

This document outlines the complete infrastructure setup for Avalo's public web release, including domain configuration, DNS records, SSL/TLS certificates, CDN setup, and security headers.

---

## 1. Domain Architecture

### Primary Domains

| Domain | Purpose | Hosting Platform |
|--------|---------|------------------|
| `avalo.app` | Main landing page & marketing | Firebase Hosting (landing target) |
| `app.avalo.app` | Web application | Firebase Hosting (web target) |
| `api.avalo.app` | Backend API & Cloud Functions | Firebase Cloud Functions |
| `sos.avalo.app` | Emergency/Panic SOS landing page | Firebase Hosting (separate target) |

### Domain Registration

- **Registrar**: (Your domain registrar, e.g., Google Domains, Namecheap, GoDaddy)
- **Primary Domain**: `avalo.app`
- **Nameservers**: Configure to point to your DNS provider

---

## 2. DNS Configuration

### Required DNS Records

#### Root Domain (`avalo.app`)

```
Type: A
Name: @
Value: (Firebase Hosting IP - obtained from Firebase Console)
TTL: 3600

Type: AAAA (IPv6)
Name: @
Value: (Firebase Hosting IPv6 - obtained from Firebase Console)
TTL: 3600

Type: TXT (Domain verification)
Name: @
Value: "firebase-domain-verification=..." (from Firebase Console)
TTL: 3600
```

#### Web App Subdomain (`app.avalo.app`)

```
Type: CNAME
Name: app
Value: (project-id).web.app
TTL: 3600

Type: TXT (Optional verification)
Name: _firebase.app
Value: "firebase-domain-verification=..." (from Firebase Console)
TTL: 3600
```

#### API Subdomain (`api.avalo.app`)

```
Type: CNAME
Name: api
Value: europe-west3-(project-id).cloudfunctions.net
TTL: 3600

Alternative (if using Cloud Run):
Type: CNAME
Name: api
Value: ghs.googlehosted.com
TTL: 3600
```

#### SOS Subdomain (`sos.avalo.app`)

```
Type: CNAME
Name: sos
Value: (project-id).web.app
TTL: 3600
```

### Additional Recommended Records

```
Type: CAA
Name: @
Value: 0 issue "letsencrypt.org"
TTL: 3600

Type: CAA
Name: @
Value: 0 issue "pki.goog"
TTL: 3600

Type: TXT (SPF for email)
Name: @
Value: "v=spf1 include:_spf.google.com ~all"
TTL: 3600
```

---

## 3. SSL/TLS Certificate Setup

### Automatic Certificate Management

Firebase Hosting automatically provisions and manages SSL/TLS certificates via **Let's Encrypt** for all custom domains.

#### Setup Steps

1. **Add Custom Domain in Firebase Console**
   ```bash
   firebase hosting:channel:deploy production \
     --project production-project-id
   ```

2. **Verify Domain Ownership**
   - Add TXT record provided by Firebase
   - Wait for DNS propagation (up to 48 hours)

3. **Certificate Provisioning**
   - Automatic after domain verification
   - Certificates auto-renew before expiration
   - Supports both RSA and ECDSA certificates

### Certificate Specifications

- **Certificate Authority**: Let's Encrypt / Google Trust Services
- **Key Type**: RSA 2048-bit or ECDSA P-256
- **Validity Period**: 90 days (auto-renews at 60 days)
- **Protocol Support**: TLS 1.2, TLS 1.3
- **Cipher Suites**: Modern, secure ciphers only

---

## 4. Security Headers Configuration

### Implemented Headers (in `firebase.json`)

```json
{
  "headers": [
    {
      "source": "**",
      "headers": [
        {
          "key": "Strict-Transport-Security",
          "value": "max-age=63072000; includeSubDomains; preload"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "Referrer-Policy",
          "value": "strict-origin-when-cross-origin"
        },
        {
          "key": "Permissions-Policy",
          "value": "camera=(), microphone=(), geolocation=(self), payment=()"
        }
      ]
    }
  ]
}
```

### HSTS Preload Submission

After SSL is active and HSTS header is configured:

1. Visit: https://hstspreload.org/
2. Submit `avalo.app` for HSTS preload list
3. Monitor submission status
4. Inclusion takes 2-3 months

---

## 5. HTTP to HTTPS Redirect

### Automatic Redirects

Firebase Hosting automatically redirects all HTTP traffic to HTTPS. No configuration needed.

**Verification:**
```bash
curl -I http://avalo.app
# Expected: 301 Moved Permanently
# Location: https://avalo.app
```

---

## 6. CDN Configuration

### Firebase Hosting CDN

Firebase Hosting includes a global CDN by default:

- **Network**: Google Cloud CDN
- **Edge Locations**: 100+ worldwide
- **Cache Behavior**: Configured via headers in `firebase.json`
- **Compression**: Brotli + Gzip (automatic)

### Cache Headers

```json
{
  "headers": [
    {
      "source": "**/*.@(jpg|jpeg|gif|png|svg|webp|avif)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        }
      ]
    },
    {
      "source": "**/*.@(js|css)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        }
      ]
    },
    {
      "source": "**/*.@(html|json)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=0, must-revalidate"
        }
      ]
    }
  ]
}
```

### CDN Cache Invalidation

```bash
# Clear all caches after deployment
firebase hosting:channel:deploy production --force

# Or manually via Firebase Console:
# Hosting → Release & rollback → Clear cache
```

---

## 7. Firebase Hosting Configuration

### Multiple Hosting Targets

Avalo uses multiple Firebase Hosting sites for different purposes:

```bash
# Initialize hosting targets
firebase target:apply hosting landing avalo-landing
firebase target:apply hosting web avalo-web
firebase target:apply hosting app avalo-app
firebase target:apply hosting sos avalo-sos
```

### Deploy Commands

```bash
# Deploy all targets
firebase deploy --only hosting

# Deploy specific target
firebase deploy --only hosting:web

# Deploy with custom domain
firebase hosting:channel:deploy production \
  --project production-project-id \
  --expires 30d
```

---

## 8. Performance Optimization

### Compression

- **Brotli**: Enabled automatically for modern browsers
- **Gzip**: Fallback for older browsers
- **Compression Level**: Optimal (configured in `firebase.json`)

### Asset Optimization

1. **Images**: Use WebP/AVIF formats with fallbacks
2. **JavaScript**: Minified and code-split
3. **CSS**: Minified and critical CSS inlined
4. **Fonts**: Self-hosted with font-display: swap

### Performance Monitoring

```bash
# Lighthouse CI in GitHub Actions
- name: Lighthouse CI
  uses: treosh/lighthouse-ci-action@v9
  with:
    urls: |
      https://avalo.app
      https://app.avalo.app
    budgetPath: ./lighthouse-budget.json
```

---

## 9. Monitoring & Alerts

### Firebase Performance Monitoring

```typescript
// Web app initialization
import { initializeApp } from 'firebase/app';
import { getPerformance } from 'firebase/performance';

const app = initializeApp(firebaseConfig);
const perf = getPerformance(app);
```

### Uptime Monitoring

Set up external monitoring:

- **UptimeRobot**: Monitor all domains every 5 minutes
- **Google Cloud Monitoring**: Uptime checks for Cloud Functions
- **Pingdom**: Transaction monitoring for critical user flows

### Alert Configuration

```yaml
# Example: Cloud Monitoring Alert Policy
displayName: "High Error Rate Alert"
conditions:
  - displayName: "Error rate > 5%"
    conditionThreshold:
      filter: 'resource.type="cloud_function"'
      comparison: COMPARISON_GT
      thresholdValue: 0.05
notificationChannels:
  - projects/PROJECT_ID/notificationChannels/CHANNEL_ID
```

---

## 10. Deployment Checklist

### Pre-Deployment

- [ ] Domain registered and nameservers configured
- [ ] DNS records added and propagated (verify with `dig` or `nslookup`)
- [ ] Firebase Hosting targets configured
- [ ] SSL certificates requested (will auto-provision after domain verification)
- [ ] Security headers tested in staging
- [ ] CDN cache policies configured
- [ ] Performance budgets defined

### Deployment

- [ ] Deploy to staging first
- [ ] Run smoke tests
- [ ] Verify SSL certificate provisioned
- [ ] Test all subdomains
- [ ] Verify HTTPS redirects
- [ ] Check security headers (securityheaders.com)
- [ ] Test CDN caching
- [ ] Deploy to production

### Post-Deployment

- [ ] Monitor error rates (first 24 hours)
- [ ] Submit to HSTS preload list
- [ ] Set up uptime monitoring
- [ ] Configure alerting rules
- [ ] Document any custom configurations
- [ ] Share access with team members

---

## 11. Troubleshooting

### DNS Not Resolving

```bash
# Check DNS propagation
dig avalo.app
dig app.avalo.app

# Check from different DNS servers
dig @8.8.8.8 avalo.app
dig @1.1.1.1 avalo.app

# Wait time: Up to 48 hours for global propagation
```

### SSL Certificate Not Provisioning

1. Verify domain ownership TXT record is in place
2. Ensure DNS is fully propagated
3. Check Firebase Console for certificate status
4. Wait 24-48 hours after domain verification
5. Contact Firebase Support if issue persists

### CDN Cache Not Working

```bash
# Check response headers
curl -I https://app.avalo.app/static/image.png

# Look for:
# X-Cache: HIT
# Cache-Control: public, max-age=...
# Age: [seconds since cached]
```

### Performance Issues

1. Run Lighthouse audit: `npm run lighthouse`
2. Check Firebase Performance Monitoring
3. Review CDN cache hit ratio
4. Analyze bundle sizes
5. Profile with Chrome DevTools

---

## 12. Maintenance

### Regular Tasks

- **Weekly**: Review error logs and performance metrics
- **Monthly**: Check SSL certificate expiration (should auto-renew)
- **Quarterly**: Review and update security headers
- **Annually**: Audit DNS records and remove unused entries

### Scaling Considerations

Firebase Hosting automatically scales, but monitor:

- **Bandwidth**: Track usage in Firebase Console
- **Cloud Function Limits**: May need to increase quotas
- **Database Connections**: Firestore scales automatically
- **Storage**: Monitor Cloud Storage usage

---

## 13. Emergency Procedures

### Rollback

```bash
# View deployment history
firebase hosting:channel:list

# Rollback to previous version
firebase hosting:rollback RELEASE_ID

# Or restore specific deployment
firebase hosting:channel:deploy VERSION_ID
```

### DDoS Mitigation

Firebase Hosting includes DDoS protection, but additional layers:

1. **Cloud Armor**: WAF rules for Cloud Functions
2. **Rate Limiting**: Implemented in Cloud Functions
3. **Geographic Restrictions**: If needed, use Cloud Armor

### Incident Response

1. Check Firebase Status Page: https://status.firebase.google.com/
2. Review error logs in Cloud Logging
3. Scale Cloud Functions if needed
4. Communicate with users via status page
5. Document incident and resolution

---

## 14. Compliance & Legal

### Data Residency

- **Primary Region**: europe-west3 (Frankfurt)
- **Firebase Hosting**: Multi-region (global CDN)
- **Cloud Functions**: europe-west3
- **Firestore**: eur3 (Belgium/Netherlands)

### GDPR Compliance

- SSL/TLS encryption for all traffic
- Secure headers configured
- Cookie consent banner implemented
- Data processing agreement with Google Cloud

---

## 15. Cost Estimation

### Firebase Hosting

- **Free Tier**: 10 GB storage, 360 MB/day transfer
- **Blaze Plan**: $0.026/GB storage, $0.15/GB transfer
- **Estimated Monthly Cost**: $50-$200 (depends on traffic)

### Custom Domains

- **SSL Certificates**: Free (auto-provisioned)
- **Domain Registration**: $12-$20/year per domain
- **DNS Hosting**: Usually included with registrar

### Cloud Functions

- **Invocations**: First 2M/month free, then $0.40/million
- **Compute Time**: First 400K GB-sec/month free
- **Estimated Monthly Cost**: $100-$500 (depends on usage)

---

## 16. Support & Resources

### Documentation

- Firebase Hosting: https://firebase.google.com/docs/hosting
- Cloud Functions: https://firebase.google.com/docs/functions
- DNS Records: https://firebase.google.com/docs/hosting/custom-domain

### Support Channels

- Firebase Support: https://firebase.google.com/support
- Community Forum: https://firebase.community
- Stack Overflow: Tag `firebase-hosting`

### Team Access

Ensure team members have appropriate roles:

- **Owner**: Full project access
- **Editor**: Can deploy and modify configuration
- **Viewer**: Read-only access for monitoring

---

## Status: ✅ READY FOR DEPLOYMENT

This infrastructure is production-ready and follows industry best practices for security, performance, and reliability.

Last Updated: 2025-11-28