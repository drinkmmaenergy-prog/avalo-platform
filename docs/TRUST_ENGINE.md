# Avalo Trust & Identity Verification Engine (Phase 21)

## Overview

The Trust Engine combines KYC identity verification and device fingerprinting to establish user trust scores and detect fraudulent behavior.

## Components

### 1. KYC Identity Verification

User identity verification using government-issued documents and facial recognition.

### 2. Device Trust & Fingerprinting

Device identification, multi-account detection, and trust scoring.

---

## KYC Identity Verification

### Verification Flow

```
1. User initiates verification
   ↓
2. System generates signed upload URLs (30 min expiry)
   ↓
3. User uploads selfie + document photos
   ↓
4. System submits to KYC provider (Onfido/Sumsub/Jumio)
   ↓
5. Provider processes:
   - Document authenticity
   - Face matching
   - Liveness detection
   - Age verification
   ↓
6. Confidence score calculated (0-100)
   ↓
7. Auto-decision or manual review
   ↓
8. User profile updated with verification status
```

### KYC Statuses

| Status | Description |
|--------|-------------|
| `NOT_STARTED` | User has not initiated verification |
| `PENDING` | Documents uploaded, awaiting processing |
| `IN_REVIEW` | Manual review required (confidence 50-89%) |
| `APPROVED` | Identity verified (confidence ≥90%) |
| `REJECTED` | Verification failed (confidence <50%) |
| `EXPIRED` | Verification older than 2 years |

### Age Verification

- **Minimum Age**: 18 years
- **Calculation**: Based on date of birth extracted from document
- **Auto-Rejection**: Users under 18 are immediately rejected

### Confidence Score

```typescript
confidence = 0
confidence += (documentQuality / 100) * 40    // 40%
confidence += (faceMatchScore / 100) * 40     // 40%
if (livenessPassed) confidence += 10          // 10%
if (!documentExpired) confidence += 10        // 10%
```

### Auto-Decision Logic

- **Confidence ≥ 90%**: Auto-approve
- **Confidence 50-89%**: Queue for manual review
- **Confidence < 50%**: Auto-reject

### Accepted Documents

- Passport
- National ID card
- Driver's license

### Verification Expiration

- **Validity Period**: 2 years
- **Re-verification**: Required after expiration
- **Status Change**: `APPROVED` → `EXPIRED`

### API Endpoints

#### Start Verification

```typescript
const result = await functions.httpsCallable('startKYCVerificationV1')({
  method: "id_document"  // or "biometric"
});

// Returns:
{
  verificationId: "kyc_abc123",
  uploadUrls: {
    selfie: "https://storage...?expires=...",
    documentFront: "https://storage...?expires=...",
    documentBack: "https://storage...?expires=..."
  }
}
```

#### Submit Verification

```typescript
await functions.httpsCallable('submitKYCVerificationV1')({
  verificationId: "kyc_abc123",
  documentType: "passport",
  documentNumber: "AB123456",
  dateOfBirth: "1990-05-15"
});
```

#### Check Status

```typescript
const status = await functions.httpsCallable('getKYCStatusV1')({});

// Returns:
{
  status: "approved",
  verifiedAt: Timestamp,
  expiresAt: Timestamp,
  confidence: 95
}
```

#### Admin Review

```typescript
await functions.httpsCallable('reviewKYCVerificationV1')({
  verificationId: "kyc_abc123",
  action: "approve",  // or "reject"
  reason: "Manual review completed"
});
```

### Webhook Integration

KYC providers send webhooks to:
```
POST /kycProviderWebhook
```

Expected payload:
```json
{
  "verificationId": "kyc_abc123",
  "status": "completed",
  "result": {
    "documentQuality": 95,
    "faceMatchScore": 92,
    "livenessPassed": true,
    "documentExpired": false,
    "dateOfBirth": "1990-05-15"
  }
}
```

---

## Device Trust & Fingerprinting

### Trust Levels

| Level | Score Range | Description |
|-------|-------------|-------------|
| `TRUSTED` | 70-100 | Established, clean device |
| `NEUTRAL` | 40-69 | Normal device, no red flags |
| `SUSPICIOUS` | 20-39 | Multiple risk indicators |
| `BLOCKED` | 0-19 | High risk, block actions |

### Trust Score Factors

```typescript
score = 50  // Neutral start

// Device age bonus
if (deviceAgeHours > 720) score += 15      // 30+ days
else if (deviceAgeHours > 168) score += 10 // 7+ days
else if (deviceAgeHours > 24) score += 5   // 1+ day
else score -= 10                            // Very new

// Login frequency
if (avgLoginsPerDay > 20) score -= 15      // Excessive
else if (avgLoginsPerDay > 10) score -= 5  // High
else if (avgLoginsPerDay 1-5) score += 10  // Normal

// Multi-account penalty
if (associatedAccounts > 5) score -= 30
else if (associatedAccounts > 3) score -= 15

// VPN/Proxy/Tor penalty
if (isVPN || isProxy || isTor) score -= 20

// Transaction history bonus
if (totalTransactions > 100) score += 10

score = clamp(score, 0, 100)
```

### Risk Flags

- `vpn_proxy_tor`: Using anonymization tools
- `multiple_accounts`: 3-5 accounts from device
- `many_accounts`: 5+ accounts from device
- `excessive_logins`: >20 logins per day
- `high_login_frequency`: >10 logins per day

### Device Fingerprinting

Client generates fingerprint using:
- Browser/app user agent
- Screen resolution
- Timezone
- Language
- Platform (iOS/Android/Web)
- Device model (if available)

Server hashes with user salt:
```typescript
deviceId = hash(fingerprint + ":" + userId).substring(0, 32)
```

### Multi-Account Detection

System flags devices when:
- More than 3 user accounts associated
- Automatic flag for manual review at 3+ accounts
- Score penalty increases with account count

### API Endpoints

#### Register Device

```typescript
await functions.httpsCallable('registerDeviceTrustV1')({
  deviceFingerprint: "abc123...",
  userAgent: "Mozilla/5.0...",
  platform: "web",
  deviceInfo: {
    browserName: "Chrome",
    browserVersion: "120.0",
    os: "Windows",
    osVersion: "11"
  }
});

// Returns:
{
  success: true,
  deviceId: "dev_xyz789",
  trustScore: 50
}
```

#### Get Trust Status

```typescript
const status = await functions.httpsCallable('getDeviceTrustStatusV1')({
  deviceId: "dev_xyz789"
});

// Returns:
{
  found: true,
  deviceId: "dev_xyz789",
  trustLevel: "neutral",
  trustScore: 55,
  riskFlags: ["vpn_proxy_tor"],
  lastUsedAt: Timestamp,
  firstSeenAt: Timestamp,
  totalLogins: 42
}
```

#### Block Device (Admin)

```typescript
await functions.httpsCallable('blockDeviceV1')({
  deviceId: "dev_xyz789",
  reason: "Multi-account abuse detected"
});
```

#### Get User Devices (Admin)

```typescript
const result = await functions.httpsCallable('getUserDevicesV1')({
  userId: "user123"
});

// Returns:
{
  devices: [
    {
      deviceId: "dev_xyz789",
      platform: "web",
      trustLevel: "suspicious",
      trustScore: 35,
      riskFlags: ["multiple_accounts"],
      totalLogins: 150,
      lastUsedAt: Timestamp,
      firstSeenAt: Timestamp,
      associatedUserCount: 4
    }
  ]
}
```

---

## Firestore Collections

### `kycVerifications/{verificationId}`

```typescript
{
  verificationId: string,
  userId: string,
  status: KYCStatus,
  method: "id_document" | "biometric",
  documentType?: "passport" | "id_card" | "drivers_license",
  documentNumber?: string,
  dateOfBirth?: string,
  confidence?: number,
  result?: object,
  reviewedBy?: string,
  reviewedAt?: Timestamp,
  createdAt: Timestamp,
  completedAt?: Timestamp,
}
```

### `deviceTrust/{deviceId}`

```typescript
{
  deviceId: string,
  userId: string,
  userAgent: string,
  platform: "ios" | "android" | "web",
  browserName?: string,
  ipAddress: string,
  ipCountry?: string,
  isVPN: boolean,
  isProxy: boolean,
  isTor: boolean,
  trustLevel: DeviceTrustLevel,
  trustScore: number,
  riskFlags: string[],
  totalLogins: number,
  totalTransactions: number,
  lastUsedAt: Timestamp,
  firstSeenAt: Timestamp,
  associatedUserIds: string[],
  accountSwitchCount: number,
  flaggedForReview: boolean,
  flagReason?: string,
  blockedAt?: Timestamp,
  blockedReason?: string,
}
```

---

## Feature Flags

- `kyc_required`: Enable KYC verification requirement
- `device_trust_scoring`: Enable device trust score calculation

---

## Security Rules

```javascript
// KYC verifications
match /kycVerifications/{verificationId} {
  allow read: if authed() &&
    (resource.data.userId == uid() || isModerator() || isAdmin());
  allow write: if false; // Server-side only
}

// Device trust
match /deviceTrust/{deviceId} {
  allow read: if authed() &&
    (uid() in resource.data.associatedUserIds || isModerator() || isAdmin());
  allow write: if false; // Server-side only
}
```

---

## Testing

See test files:
- `functions/src/kyc.test.ts`
- `functions/src/deviceTrust.test.ts`

---

## Monitoring

Key metrics:
- KYC approval rate
- Average verification time
- Manual review queue length
- Device trust score distribution
- Multi-account detection rate

---

## Compliance

- **GDPR**: User can request deletion of KYC data
- **Data Retention**: KYC data retained for legal requirements (6 years)
- **Anonymization**: Device IPs hashed for privacy
- **User Rights**: Access to own verification status and device list
