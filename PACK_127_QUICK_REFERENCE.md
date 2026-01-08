# PACK 127 — Quick Reference Guide

## 🚀 Quick Start

### Backend: Auto-Register Fingerprint on Upload

```typescript
import { registerFingerprint, matchFingerprint } from './pack127-fingerprint-engine';

// On every media upload
const fingerprint = await registerFingerprint({
  userId,
  assetId,
  assetType: 'IMAGE', // or VIDEO, AUDIO, DOCUMENT, etc.
  assetUrl,
  metadata: { originalFilename, mimeType, fileSize },
});

// Check for duplicates
const matchResult = await matchFingerprint(fingerprint.fingerprintId);

if (matchResult.action === 'BLOCKED') {
  throw new Error('Content matches existing copyrighted material');
}
```

### Mobile: Add Copyright Center

```typescript
import { router } from 'expo-router';

// Add to profile/settings
<TouchableOpacity onPress={() => router.push('/copyright')}>
  <Text>Copyright Center 🛡️</Text>
</TouchableOpacity>
```

---

## 📋 Asset Types

| Type | Fingerprint Method | Match Threshold |
|------|-------------------|-----------------|
| IMAGE | Perceptual Hash | 85% |
| VIDEO | Perceptual Hash | 85% |
| AUDIO | Waveform Signature | 85% |
| DOCUMENT | File Checksum | 100% |
| TEXT | Content Hash | 100% |
| DIGITAL_PRODUCT | File Checksum | 100% |

---

## 🛡️ Match Actions

| Confidence | Same User | Different User | Action |
|------------|-----------|----------------|--------|
| 95-100% | ALLOWED | BLOCKED | Exact match |
| 85-94% | ALLOWED | FLAGGED | Perceptual match |
| 70-84% | ALLOWED | FLAGGED | Derivative work |
| < 70% | ALLOWED | ALLOWED | No match |

---

## ⚖️ Claim Status Flow

```
OPEN → AUTO_RESOLVED → (success)
     → UNDER_REVIEW → CONFIRMED → (resolution)
                    → DISMISSED → (no action)
```

**Claim Resolutions**:
- `TAKEDOWN` - Content removed
- `CONTENT_RESTORED` - Content reinstated
- `ATTRIBUTION_ADDED` - Credit added
- `LICENSE_GRANTED` - License issued
- `DISMISSED` - No infringement
- `CLAIMANT_PENALIZED` - False claim

---

## 🚨 Strike System

| Severity | Duration | Claims Blocked |
|----------|----------|----------------|
| WARNING | 7 days | No |
| MINOR | 30 days | No |
| MAJOR | 90 days | Yes |
| CRITICAL | 365 days | Yes |

**Note**: Strikes restrict filing claims, NOT receiving claims. Victims always protected.

---

## 📞 Cloud Functions

### Fingerprinting
```typescript
// Register content
pack127_registerFingerprint({ assetId, assetType, assetUrl, metadata })

// Check for matches
pack127_matchFingerprint({ fingerprintId })

// Get user's protected content
pack127_getUserFingerprints({})

// Check for derivative works
pack127_detectDerivative({ fingerprintId })
```

### Copyright Claims
```typescript
// File claim
pack127_submitClaim({
  accusedUserId,
  accusedAssetId,
  claimType: 'EXACT_COPY',
  description,
  evidenceUrls,
})

// Get claims filed by you
pack127_getUserClaims({})

// Get claims against you
pack127_getClaimsAgainstUser({})

// Get specific claim
pack127_getClaim({ claimId })
```

### Anti-Piracy
```typescript
// Embed watermark (on content view/download)
pack127_embedWatermark({
  contentId,
  fingerprintId,
  deviceFingerprint,
  sessionId,
})

// Report piracy
pack127_reportPiracy({
  originalContentId,
  piratedUrl,
  platformName,
  description,
})

// Get piracy detections
pack127_getPiracyDetections({})
```

### Licensing
```typescript
// Create license
pack127_createLicense({
  licenseeId,
  licenseeType: 'BRAND', // or USER, AGENCY
  assetRefs: ['fp1', 'fp2'],
  licenseType: 'COMMERCIAL_USE',
  scope: 'Brand campaign usage',
  restrictions: ['Platform-only'],
  durationDays: 365,
})

// Revoke license
pack127_revokeLicense({ licenseId, reason })

// Renew license
pack127_renewLicense({ licenseId, additionalDays })

// Verify license
pack127_verifyLicense({ assetRef })

// Get licenses
pack127_getMyLicenses({ type: 'owned' }) // or 'held'
```

### Dashboard
```typescript
// Get comprehensive IP dashboard
pack127_getIPDashboard({})
```

---

## 🗄️ Firestore Collections

```
ip_fingerprints/{fingerprintId}
fingerprint_matches/{matchId}
ip_claims/{claimId}
claim_strikes/{strikeId}
ip_dispute_cases/{caseId}
piracy_detections/{detectionId}
content_access_records/{accessId}
ip_licenses/{licenseId}
external_platform_scans/{scanId}
ip_notifications/{notificationId}
```

---

## ⚙️ Configuration

### Default Thresholds

```typescript
// In functions/src/pack127-types.ts
DEFAULT_IP_CONFIG = {
  exactMatchThreshold: 0.95,        // 95%
  perceptualMatchThreshold: 0.85,   // 85%
  derivativeMatchThreshold: 0.70,   // 70%
  
  autoResolveEnabled: true,
  autoResolveConfidenceThreshold: 0.90,
  
  maxClaimsPerDay: 10,
  claimCooldownHours: 24,
  
  falseClaimStrikeThreshold: 3,
  strikeDecayDays: 180,
  
  watermarkingEnabled: true,
  watermarkStrength: 'MEDIUM',
  
  externalScanningEnabled: true,
  scanFrequencyHours: 24,
}
```

---

## 🔧 Common Integration Patterns

### Pattern 1: Upload with Protection

```typescript
async function uploadWithProtection(userId: string, file: File) {
  // 1. Upload file
  const assetUrl = await uploadToStorage(file);
  const assetId = generateId();
  
  // 2. Register fingerprint
  const fingerprint = await registerFingerprint({
    userId,
    assetId,
    assetType: 'IMAGE',
    assetUrl,
  });
  
  // 3. Check for matches
  const match = await matchFingerprint(fingerprint.fingerprintId);
  
  if (match.action === 'BLOCKED') {
    await deleteFromStorage(assetUrl);
    throw new Error('Duplicate content detected');
  }
  
  return { assetId, fingerprint };
}
```

### Pattern 2: Watermark on View

```typescript
async function serveProtectedContent(
  contentId: string,
  userId: string,
  deviceId: string
) {
  // 1. Get fingerprint
  const fingerprints = await db
    .collection('ip_fingerprints')
    .where('assetId', '==', contentId)
    .limit(1)
    .get();
  
  const fingerprintId = fingerprints.docs[0].id;
  
  // 2. Embed watermark
  const { watermarkData } = await embedWatermark(
    contentId,
    fingerprintId,
    userId,
    deviceId,
    generateSessionId()
  );
  
  // 3. Serve watermarked content
  return getWatermarkedUrl(contentId, watermarkData);
}
```

### Pattern 3: License Before Use

```typescript
async function useLicensedContent(brandId: string, assetRef: string) {
  // 1. Verify license
  const verification = await verifyLicense(brandId, assetRef);
  
  if (!verification.valid) {
    throw new Error('No valid license');
  }
  
  // 2. Use content
  return useContent(assetRef);
}
```

---

## 📊 Dashboard Quick View

```typescript
const dashboard = await getIPDashboard();

// Content Protection
dashboard.contentProtection.totalFingerprints    // Number
dashboard.contentProtection.activeFingerprints   // Number
dashboard.contentProtection.disputedContent      // Number

// Claims
dashboard.claims.filedByYou                      // Number
dashboard.claims.filedAgainstYou                 // Number
dashboard.claims.openClaims                      // Number

// Anti-Piracy
dashboard.antiPiracy.detectionsTotal             // Number
dashboard.antiPiracy.confirmedLeaks              // Number
dashboard.antiPiracy.investigating               // Number

// Licensing
dashboard.licensing.licensesOwned                // Number
dashboard.licensing.licensesHeld                 // Number
dashboard.licensing.activeLicenses               // Number
dashboard.licensing.totalLicenseRevenue          // Number
```

---

## 🚨 Emergency Actions

### User Reports Piracy

```typescript
const reportPiracy = httpsCallable(functions, 'pack127_reportPiracy');
await reportPiracy({
  originalContentId: 'my-content-id',
  piratedUrl: 'https://external-site.com/stolen',
  platformName: 'EXTERNAL_PLATFORM',
  description: 'My content was stolen and posted here',
});
```

### Creator Files Claim

```typescript
const submitClaim = httpsCallable(functions, 'pack127_submitClaim');
const result = await submitClaim({
  accusedUserId: 'user123',
  accusedAssetId: 'asset456',
  claimType: 'EXACT_COPY',
  description: 'This user copied my original work without permission...',
  evidenceUrls: ['proof1.jpg', 'proof2.jpg'],
});

if (result.data.autoResolved) {
  // Instant resolution
  console.log('Resolution:', result.data.resolution);
}
```

---

## 🔍 Debugging

### Check Protection Status

```typescript
// 1. Check fingerprint
const fingerprints = await getUserFingerprints(userId);
console.log('Protected content:', fingerprints.length);

// 2. Check for matches
const matches = await getFingerprintMatches(fingerprintId);
console.log('Matches found:', matches.length);

// 3. Check claims
const claims = await getUserClaims(userId);
console.log('Claims filed:', claims.length);

// 4. Check strikes
const claimantStrikeCount = claims[0]?.claimantStrikeCount || 0;
console.log('Strike count:', claimantStrikeCount);
```

### Monitor Piracy

```typescript
// Get piracy detections
const detections = await getPiracyDetectionsForCreator(userId);

detections.forEach(d => {
  console.log('Detection:', {
    status: d.status,
    leaker: d.leakerUserId,
    platform: d.platformDetectedOn,
    confirmed: d.status === 'CONFIRMED',
  });
});
```

---

## ✅ Pre-Deployment Checklist

### Backend
- [ ] Functions deployed
- [ ] Firestore rules updated
- [ ] Indexes created
- [ ] Scheduled jobs enabled:
  - `pack127_autoExpireLicenses` (daily midnight)
  - `pack127_sendExpiryReminders` (daily 9 AM)
- [ ] Environment variable set: `WATERMARK_ENCRYPTION_KEY`

### Mobile
- [ ] Copyright Center route added
- [ ] Dashboard component rendered
- [ ] Claim form working
- [ ] Tested on iOS
- [ ] Tested on Android

### Web
- [ ] Copyright panel integrated
- [ ] Routes configured
- [ ] Styles applied
- [ ] Tested in browsers

---

## 💡 Tips & Best Practices

### DO

✅ Register fingerprints on EVERY upload (automatic)  
✅ Embed watermarks on paid content views  
✅ Check for matches before allowing upload  
✅ Use auto-resolution when possible  
✅ Track all content access for leak detection  
✅ Verify licenses before commercial use  
✅ Monitor piracy detections regularly  

### DON'T

❌ Skip fingerprinting to "save time"  
❌ Bypass match checking for trusted users  
❌ Remove watermarking for "premium" users  
❌ Allow claims without evidence  
❌ Modify thresholds without testing  
❌ Grant licenses without owner approval  
❌ Ignore strike warnings  

---

## 🆘 Troubleshooting

**Issue**: Fingerprint matching too sensitive
- **Solution**: Adjust `perceptualMatchThreshold` in config

**Issue**: Watermark extraction fails
- **Solution**: Check `WATERMARK_ENCRYPTION_KEY` environment variable

**Issue**: Claims auto-resolving incorrectly
- **Solution**: Review fingerprint timestamp logic

**Issue**: License expiry not working
- **Solution**: Verify scheduled jobs running in Firebase Console

**Issue**: Piracy detection getting false positives
- **Solution**: Improve device fingerprinting, check access patterns

---

## 📈 Success Metrics

Track these in production:

```typescript
// Protection Rate
const protectionRate = (fingerprintsRegistered / totalUploads) * 100;
// Target: > 99%

// Auto-Resolution Rate
const autoResolutionRate = (autoResolvedClaims / totalClaims) * 100;
// Target: > 80%

// False Claim Rate
const falseClaimRate = (dismissedClaims / totalClaims) * 100;
// Target: < 5%

// Leak Detection Rate
const leakDetectionRate = (confirmedLeaks / detectedLeaks) * 100;
// Target: > 95%
```

---

## 🔒 Security Checklist

Before production:

- [ ] Watermark encryption key set and secure
- [ ] Admin roles verified for claim review
- [ ] Firestore rules tested
- [ ] Access logging enabled
- [ ] Strike system tested
- [ ] Rate limiting verified
- [ ] Audit trail complete

---

## 🎯 Economic Isolation Verification

**CRITICAL**: These must NEVER change:

```typescript
// Verify in production
const PROTECTED_VALUES = {
  TOKEN_PRICE: 'UNTOUCHED ✅',
  REVENUE_SPLIT: '65/35 ALWAYS ✅',
  DISCOVERY_RANKING: 'UNAFFECTED ✅',
  MONETIZATION_DURING_DISPUTES: 'UNAFFECTED ✅',
  PREMIUM_IP_FEATURES: 'NONE ✅',
  ALL_CREATORS_EQUAL: 'YES ✅',
};
```

---

## 📚 Documentation Links

- **Integration Guide**: [`PACK_127_INTEGRATION_GUIDE.md`](PACK_127_INTEGRATION_GUIDE.md:1)
- **Full Implementation**: [`PACK_127_IMPLEMENTATION_COMPLETE.md`](PACK_127_IMPLEMENTATION_COMPLETE.md:1)
- **Type Definitions**: [`functions/src/pack127-types.ts`](functions/src/pack127-types.ts:1)

---

**Quick Reference Version**: 1.0  
**Last Updated**: 2025-11-28  
**Platform**: Avalo IP Protection System

---

**Remember**: IP protection shields creators, not modifies economics. 🛡️