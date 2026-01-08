# PACK 328 — Final Correction Implementation Guide

**For:** Avalo Production Launch  
**Created:** December 11, 2025  
**Status:** 🔴 **2 CRITICAL** | 🟡 **2 HIGH** | 🟢 **2 MEDIUM**

---

## OVERVIEW

This document provides detailed implementation specifications for the 6 missing systems identified in the Pack 328 Global Gap Audit. Each section includes:
- Technical specification
- Database schema
- Implementation files
- Integration points
- Testing requirements

---

## 🔴 CRITICAL #1: BANK-ID / DOCUMENT VERIFICATION FALLBACK

**Priority:** CRITICAL  
**Timeline:** Week 1-2 (Before Production)  
**Estimated Effort:** 40 hours  
**Legal Requirement:** YES

### Purpose

Provide backup identity verification when selfie verification fails, ensuring 100% user verification compliance.

### Implementation Specification

#### File Structure

```
functions/src/
├── identityVerificationFallback.ts    (new - 500 lines)
├── bankIdIntegration.ts                (new - 300 lines)
└── documentOcrVerification.ts          (new - 400 lines)

app-mobile/app/
├── verification/document-upload.tsx    (new)
├── verification/bank-id.tsx            (new)
└── verification/verification-status.tsx (updated)
```

#### Database Schema

```typescript
// Collection: identity_verification_requests
{
  verificationId: string;
  userId: string;
  method: 'selfie' | 'bank_id' | 'document_upload' | 'manual_review';
  status: 'pending' | 'processing' | 'approved' | 'rejected' | 'escalated';
  
  // Selfie verification (existing)
  selfie?: {
    imageUrl: string;
    faceMatchScore: number;
    livenessScore: number;
    failureReason?: string;
  };
  
  // Bank-ID verification (NEW)
  bankId?: {
    provider: 'norwegian_bankid' | 'swedish_bankid' | 'finnish_trust_network';
    referenceId: string;
    verified: boolean;
    name: string;
    dateOfBirth: string;
    nationalId: string; // hashed
  };
  
  // Document verification (NEW)
  document?: {
    type: 'passport' | 'drivers_license' | 'national_id';
    frontImageUrl: string;
    backImageUrl?: string;
    ocrData: {
      name: string;
      dateOfBirth: string;
      documentNumber: string;
      expiryDate: string;
      issuingCountry: string;
    };
    faceMatch: {
      confidence: number;
      matched: boolean;
    };
  };
  
  // Manual review (NEW)
  manualReview?: {
    assignedTo: string; // admin uid
    reviewNotes: string;
    reviewedAt: Timestamp;
    decision: 'approved' | 'rejected';
    rejectionReason?: string;
  };
  
  escalationHistory: {
    fromMethod: string;
    toMethod: string;
    reason: string;
    timestamp: Timestamp;
  }[];
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
  completedAt?: Timestamp;
}
```

#### Core Functions

```typescript
// functions/src/identityVerificationFallback.ts

/**
 * Escalate failed selfie verification to next method
 */
export async function escalateVerification(
  userId: string,
  selfieFailureReason: string,
  userCountry: string
): Promise<{
  success: boolean;
  nextMethod: 'bank_id' | 'document_upload';
  verificationId: string;
}> {
  const verificationId = generateId();
  
  // Determine next method based on country
  const nextMethod = BANK_ID_COUNTRIES.includes(userCountry) 
    ? 'bank_id' 
    : 'document_upload';
  
  // Create verification request
  await db.collection('identity_verification_requests').doc(verificationId).set({
    verificationId,
    userId,
    method: nextMethod,
    status: 'pending',
    escalationHistory: [{
      fromMethod: 'selfie',
      toMethod: nextMethod,
      reason: selfieFailureReason,
      timestamp: serverTimestamp()
    }],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  
  return { success: true, nextMethod, verificationId };
}

/**
 * Process Bank-ID verification
 */
export async function processBankIdVerification(
  verificationId: string,
  bankIdResponse: BankIdResponse
): Promise<{success: boolean; approved: boolean}> {
  // 1. Validate Bank-ID response
  // 2. Extract user data (name, DOB, national ID)
  // 3. Check age >= 18
  // 4. Update verification request
  // 5. Mark user as verified
}

/**
 * Process document OCR verification
 */
export async function processDocumentVerification(
  verificationId: string,
  frontImageUrl: string,
  backImageUrl?: string
): Promise<{success: boolean; requiresManualReview: boolean}> {
  // 1. Run OCR on document images
  // 2. Extract data (name, DOB, document number, etc.)
  // 3. Validate document authenticity (security features)
  // 4. Perform face match with profile photo
  // 5. If confidence >= 90% → auto-approve
  // 6. If confidence 70-90% → manual review queue
  // 7. If confidence < 70% → reject
}

/**
 * Manual review queue for admins
 */
export async function getManualReviewQueue(): Promise<VerificationRequest[]> {
  return await db.collection('identity_verification_requests')
    .where('status', '==', 'escalated')
    .orderBy('createdAt', 'asc')
    .limit(100)
    .get();
}
```

#### Integration Points

1. **Update existing selfie verification:**
   ```typescript
   // In existing identity verification flow
   if (selfieVerificationFailed) {
     const escalation = await escalateVerification(
       userId,
       failureReason,
       userCountry
     );
     
     // Show appropriate UI based on nextMethod
     if (escalation.nextMethod === 'bank_id') {
       navigateToScreen('BankIdVerification', {verificationId});
     } else {
       navigateToScreen('DocumentUpload', {verificationId});
     }
   }
   ```

2. **Modify profile access controls:**
   ```typescript
   // Users cannot enable earnMode without verification
   if (!user.verification?.approved) {
     throw new HttpsError('permission-denied', 
       'Complete identity verification to enable earning');
   }
   ```

#### Testing Requirements

- [ ] Selfie fails → Bank-ID flow (Norwegian user)
- [ ] Selfie fails → Document upload flow (USA user)
- [ ] Document OCR accuracy >95%
- [ ] Face match accuracy >90%
- [ ] Manual review queue functional
- [ ] Admin approval/rejection workflow
- [ ] Age validation (reject <18)
- [ ] Integration with earn mode activation

---

## 🔴 CRITICAL #2: REGIONAL REGULATION TOGGLES

**Priority:** CRITICAL  
**Timeline:** Week 1-2 (Before Production)  
**Estimated Effort:** 32 hours  
**App Store Requirement:** YES

### Purpose

Enable/disable features per region to comply with local laws and App Store requirements.

### Implementation Specification

#### File Structure

```
functions/src/
├── regionalCompliance.ts               (new - 600 lines)
└── config/regionalConfig.json          (new - data file)

app-mobile/
├── hooks/useRegionalFeatures.ts        (new)
└── context/RegionalContext.tsx         (new)
```

#### Database Schema

```typescript
// Collection: regional_configs
{
  countryCode: string; // ISO 3166-1 alpha-2
  region: 'EU' | 'NA' | 'ASIA' | 'MENA' | 'LATAM' | 'OTHER';
  
  features: {
    // Core Features
    calendar: boolean;           // In-person meetups
    calls: boolean;              // Voice/video calls
    videoChat: boolean;          // Video messaging
    aiCompanions: boolean;       // AI relationships
    earnMode: boolean;           // Creator earnings
    events: boolean;             // Group events
    
    // Content Features
    mediaSharing: boolean;       // Photo/video sharing in chat
    voiceNotes: boolean;         // Voice messaging
    stories: boolean;            // Story/Reel posting
    liveStreaming: boolean;      // Live video broadcasts
    
    // Monetization Features
    tips: boolean;               // Direct tipping
    subscriptions: boolean;      // Fan subscriptions
    marketplace: boolean;        // Digital products
  };
  
  ageVerification: {
    required: boolean;
    minimumAge: number;          // 18, 19, 20, or 21
    methodRequired: 'soft' | 'hard' | 'government_id' | 'bank_id';
    recheckIntervalDays: number; // Recheck every N days
  };
  
  contentRestrictions: {
    nsfwAllowed: boolean;        // Some regions ban all NSFW
    swimsuitAllowed: boolean;    // Some regions ban swimsuit photos
    romanticContentAllowed: boolean;
    aiRelationshipsAllowed: boolean;
  };
  
  payments: {
    stripe: boolean;
    applePay: boolean;
    googlePay: boolean;
    localMethods: string[];      // ['blik', 'p24', 'ideal', etc.]
    payoutsAllowed: boolean;     // Some regions ban payouts
    minimumPayoutUSD: number;    // Varies by region
  };
  
  legal: {
    termsUrl: string;            // Localized terms
    privacyUrl: string;          // Localized privacy policy
    cookieConsentRequired: boolean;
    dataResidency: 'EU' | 'US' | 'LOCAL';
    rightToForgetEnabled: boolean;
  };
  
  enforcement: {
    autoEnforced: boolean;       // Auto-disable features
    manualReviewRequired: boolean;
    gracePeriodDays: number;     // Days before enforcement
  };
  
  updatedAt: Timestamp;
}

// Collection: user_regional_state
{
  userId: string;
  detectedCountry: string;      // From IP/GPS
  declaredCountry: string;      // User-selected
  effectiveCountry: string;     // Used for enforcement
  vpnDetected: boolean;
  
  featureAccess: {
    [featureName: string]: boolean;
  };
  
  restrictions: string[];
  lastLocationCheck: Timestamp;
  updatedAt: Timestamp;
}
```

#### Core Functions

```typescript
// functions/src/regionalCompliance.ts

const REGIONAL_CONFIGS: Record<string, RegionalConfig> = {
  // European Union (permissive)
  'EU': {
    features: {
      calendar: true,
      calls: true,
      videoChat: true,
      aiCompanions: true,
      earnMode: true,
      events: true,
      mediaSharing: true,
      voiceNotes: true,
      stories: true,
      liveStreaming: true,
      tips: true,
      subscriptions: true,
      marketplace: true
    },
    ageVerification: {
      required: true,
      minimumAge: 18,
      methodRequired: 'soft',
      recheckIntervalDays: 365
    },
    contentRestrictions: {
      nsfwAllowed: true,
      swimsuitAllowed: true,
      romanticContentAllowed: true,
      aiRelationshipsAllowed: true
    },
    payments: {
      stripe: true,
      applePay: true,
      googlePay: true,
      localMethods: ['sepa', 'ideal', 'p24', 'blik'],
      payoutsAllowed: true,
      minimumPayoutUSD: 20
    }
  },
  
  // Middle East & North Africa (restrictive)
  'SA': { // Saudi Arabia example
    features: {
      calendar: false,          // ❌ No in-person meetups
      calls: true,
      videoChat: false,         // ❌ No video chat
      aiCompanions: false,      // ❌ No AI relationships
      earnMode: false,          // ❌ No creator earnings
      events: false,            // ❌ No events
      mediaSharing: true,
      voiceNotes: true,
      stories: true,
      liveStreaming: false,     // ❌ No live streaming
      tips: false,              // ❌ No tipping
      subscriptions: false,     // ❌ No subscriptions
      marketplace: false        // ❌ No marketplace
    },
    ageVerification: {
      required: true,
      minimumAge: 21,           // Higher minimum
      methodRequired: 'government_id', // Strict
      recheckIntervalDays: 90
    },
    contentRestrictions: {
      nsfwAllowed: false,       // ❌ No NSFW
      swimsuitAllowed: false,   // ❌ No swimsuit
      romanticContentAllowed: true,
      aiRelationshipsAllowed: false
    },
    payments: {
      stripe: true,
      applePay: true,
      googlePay: true,
      localMethods: ['mada', 'stcpay'],
      payoutsAllowed: false,    // ❌ No payouts
      minimumPayoutUSD: 100
    }
  },
  
  // Add configs for: US, UK, CN, IN, BR, etc.
};

/**
 * Get regional configuration for a country
 */
export async function getRegionalConfig(
  countryCode: string
): Promise<RegionalConfig> {
  const configDoc = await db
    .collection('regional_configs')
    .doc(countryCode)
    .get();
  
  if (configDoc.exists) {
    return configDoc.data() as RegionalConfig;
  }
  
  // Fallback to default (most restrictive)
  return DEFAULT_RESTRICTIVE_CONFIG;
}

/**
 * Detect user's country and apply regional rules
 */
export async function detectAndApplyRegionalRules(
  userId: string,
  ipAddress: string,
  gpsLocation?: {lat: number; lng: number}
): Promise<{
  countryCode: string;
  config: RegionalConfig;
  featuresDisabled: string[];
}> {
  // 1. Detect country from IP
  const ipCountry = await getCountryFromIP(ipAddress);
  
  // 2. Verify with GPS if available
  const gpsCountry = gpsLocation 
    ? await getCountryFromCoordinates(gpsLocation) 
    : null;
  
  // 3. Check for VPN/proxy
  const vpnDetected = ipCountry !== gpsCountry && gpsCountry !== null;
  
  // 4. Use most restrictive if mismatch
  const effectiveCountry = vpnDetected 
    ? (COUNTRY_RESTRICTIVENESS[ipCountry] > COUNTRY_RESTRICTIVENESS[gpsCountry!] 
        ? ipCountry 
        : gpsCountry!)
    : ipCountry;
  
  // 5. Get regional config
  const config = await getRegionalConfig(effectiveCountry);
  
  // 6. Update user's regional state
  await db.collection('user_regional_state').doc(userId).set({
    userId,
    detectedCountry: ipCountry,
    declaredCountry: effectiveCountry,
    effectiveCountry,
    vpnDetected,
    featureAccess: config.features,
    restrictions: Object.entries(config.features)
      .filter(([_, enabled]) => !enabled)
      .map(([feature]) => feature),
    lastLocationCheck: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  
  // 7. Return disabled features
  const featuresDisabled = Object.entries(config.features)
    .filter(([_, enabled]) => !enabled)
    .map(([feature]) => feature);
  
  return { countryCode: effectiveCountry, config, featuresDisabled };
}

/**
 * Check if user can access a feature
 */
export async function canAccessFeature(
  userId: string,
  feature: string
): Promise<{allowed: boolean; reason?: string}> {
  const stateDoc = await db
    .collection('user_regional_state')
    .doc(userId)
    .get();
  
  if (!stateDoc.exists) {
    // First access - detect region
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    
    await detectAndApplyRegionalRules(
      userId,
      userData?.lastIpAddress || '',
      userData?.lastKnownLocation
    );
    
    return canAccessFeature(userId, feature);
  }
  
  const state = stateDoc.data();
  const allowed = state.featureAccess?.[feature] ?? false;
  
  if (!allowed) {
    return {
      allowed: false,
      reason: `Feature "${feature}" is not available in ${state.effectiveCountry}`
    };
  }
  
  return { allowed: true };
}
```

#### Integration Requirements

1. **Modify all feature entry points:**
   ```typescript
   // In calendar booking
   const access = await canAccessFeature(userId, 'calendar');
   if (!access.allowed) {
     throw new HttpsError('permission-denied', access.reason);
   }
   
   // In earn mode activation
   const access = await canAccessFeature(userId, 'earnMode');
   if (!access.allowed) {
     throw new HttpsError('permission-denied', access.reason);
   }
   ```

2. **Add to app initialization:**
   ```typescript
   // app-mobile/app/_layout.tsx
   useEffect(() => {
     detectAndApplyRegionalRules(userId, ipAddress, gpsLocation);
   }, [userId]);
   ```

3. **UI feature hiding:**
   ```typescript
   // app-mobile/hooks/useRegionalFeatures.ts
   export function useRegionalFeatures() {
     const [features, setFeatures] = useState<Record<string, boolean>>({});
     
     useEffect(() => {
       const unsubscribe = onSnapshot(
         doc(db, 'user_regional_state', userId),
         (doc) => setFeatures(doc.data()?.featureAccess || {})
       );
       return unsubscribe;
     }, [userId]);
     
     return features;
   }
   
   // Usage in components:
   const features = useRegionalFeatures();
   if (!features.calendar) return null; // Hide calendar tab
   ```

#### Testing Requirements

- [ ] EU user → all features enabled
- [ ] Saudi Arabia user → restricted features disabled
- [ ] VPN detection → apply restrictive config
- [ ] Feature access check blocks restricted actions
- [ ] UI hides disabled features
- [ ] Error messages are user-friendly
- [ ] Admin can override regional restrictions (special cases)

---

## 🟡 HIGH #1: AUTOMATIC COUNTRY TAX REPORT EXPORT

**Priority:** HIGH  
**Timeline:** Week 4-6 (Post-Launch Phase 1)  
**Estimated Effort:** 24 hours  
**Compliance Requirement:** YES (delayed acceptable)

### Purpose

Generate tax-compliant reports for creators based on their country of residence.

### Implementation Specification

#### File Structure

```
functions/src/
├── taxReportExport.ts                  (new - 700 lines)
├── config/taxRules/                    (new directory)
│   ├── poland.ts                       (PIT-11, PIT-38)
│   ├── usa.ts                          (1099-MISC, 1099-K)
│   ├── uk.ts                           (Self-Assessment)
│   ├── germany.ts                      (EÜR)
│   └── common.ts                       (shared utilities)
```

#### Database Schema

```typescript
// Collection: tax_reports
{
  reportId: string;
  userId: string;
  year: number;
  country: string;
  
  earnings: {
    totalTokens: number;
    totalPLN: number;
    totalLocalCurrency: number;
    exchangeRate: number;
  };
  
  breakdown: {
    messages: {tokens: number; pln: number};
    products: {tokens: number; pln: number};
    tips: {tokens: number; pln: number};
    calendar: {tokens: number; pln: number};
    subscriptions: {tokens: number; pln: number};
    live: {tokens: number; pln: number};
  };
  
  platformFees: {
    total: number;
    nonDeductible: number;    // Varies by country
  };
  
  taxCalculation: {
    grossIncome: number;
    deductions: number;
    taxableIncome: number;
    suggestedTaxRate: number;
    estimatedTax: number;
  };
  
  documents: {
    type: string;             // 'PIT-11', '1099-MISC', etc.
    pdfUrl: string;
    generatedAt: Timestamp;
  }[];
  
  status: 'draft' | 'generated' | 'downloaded' | 'filed';
  generatedAt: Timestamp;
  downloadedAt?: Timestamp;
}
```

#### Core Functions

```typescript
// functions/src/taxReportExport.ts

/**
 * Generate annual tax report for user
 */
export async function generateAnnualTaxReport(
  userId: string,
  year: number
): Promise<{success: boolean; reportId: string; pdfUrl: string}> {
  // 1. Get user's country
  const userDoc = await db.collection('users').doc(userId).get();
  const country = userDoc.data()?.country || 'PL';
  
  // 2. Fetch all earnings for the year
  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year, 11, 31, 23, 59, 59);
  
  const transactions = await db
    .collection('transactions')
    .where('userId', '==', userId)
    .where('type', 'in', ['chat_earning', 'call_earning', 'tip', 
                          'product_sale', 'calendar_booking', 'subscription'])
    .where('createdAt', '>=', Timestamp.fromDate(startDate))
    .where('createdAt', '<=', Timestamp.fromDate(endDate))
    .get();
  
  // 3. Calculate breakdown
  const breakdown = calculateEarningsBreakdown(transactions.docs);
  
  // 4. Apply country-specific tax rules
  const taxRules = await import(`./config/taxRules/${country.toLowerCase()}`);
  const taxCalculation = taxRules.calculateTax(breakdown);
  
  // 5. Generate appropriate tax documents
  const documents = await taxRules.generateDocuments(userId, year, breakdown, taxCalculation);
  
  // 6. Save report
  const reportId = `tax_${year}_${userId.slice(0, 8)}`;
  await db.collection('tax_reports').doc(reportId).set({
    reportId,
    userId,
    year,
    country,
    earnings: breakdown.totals,
    breakdown: breakdown.bySource,
    platformFees: breakdown.fees,
    taxCalculation,
    documents,
    status: 'generated',
    generatedAt: serverTimestamp()
  });
  
  // 7. Send notification
  await sendNotification(userId, {
    type: 'tax_report_ready',
    title: `Your ${year} tax report is ready`,
    body: `Download your tax documents for filing`,
    data: { reportId }
  });
  
  return {
    success: true,
    reportId,
    pdfUrl: documents[0].pdfUrl
  };
}

/**
 * Schedule automatic report generation (January 15th each year)
 */
export const generateAnnualTaxReportsScheduled = onSchedule(
  { schedule: '0 6 15 1 *' }, // January 15, 6am UTC
  async () => {
    const lastYear = new Date().getFullYear() - 1;
    
    // Get all users with earnings last year
    const usersWithEarnings = await db
      .collection('users')
      .where('wallet.earned', '>', 0)
      .get();
    
    for (const userDoc of usersWithEarnings.docs) {
      try {
        await generateAnnualTaxReport(userDoc.id, lastYear);
      } catch (error) {
        console.error(`Failed to generate tax report for ${userDoc.id}:`, error);
      }
    }
  }
);
```

#### Country-Specific Tax Rules

```typescript
// functions/src/config/taxRules/poland.ts

export function calculateTax(breakdown: EarningsBreakdown): TaxCalculation {
  const totalPLN = breakdown.totals.totalPLN;
  
  // Poland: 12% flat tax for self-employed creators under PIT-36L
  // or 17%/32% progressive tax under PIT-36
  
  const taxableIncome = totalPLN;
  const suggestedTaxRate = totalPLN > 120000 ? 0.32 : 0.17; // Simplified
  const estimatedTax = taxableIncome * suggestedTaxRate;
  
  return {
    grossIncome: totalPLN,
    deductions: 0, // Platform fees not deductible in Poland
    taxableIncome,
    suggestedTaxRate,
    estimatedTax
  };
}

export async function generateDocuments(
  userId: string,
  year: number,
  breakdown: EarningsBreakdown,
  taxCalc: TaxCalculation
): Promise<TaxDocument[]> {
  // Generate PIT-11 (income from other sources)
  const pit11 = await generatePIT11(userId, year, breakdown, taxCalc);
  
  // Optional: Generate PIT-38 if VAT registered
  
  return [
    {
      type: 'PIT-11',
      pdfUrl: pit11.pdfUrl,
      generatedAt: serverTimestamp()
    }
  ];
}
```

#### Testing Requirements

- [ ] Poland: PIT-11 generation
- [ ] USA: 1099-MISC generation
- [ ] UK: Self-Assessment export
- [ ] Germany: EÜR format
- [ ] Automatic generation on January 15
- [ ] PDF format validation
- [ ] Multi-year report support
- [ ] Currency conversion accuracy

---

## 🟡 HIGH #2: CALENDAR SELFIE TIMEOUT ENFORCEMENT

**Priority:** HIGH  
**Timeline:** Week 4-6 (Post-Launch Phase 1)  
**Estimated Effort:** 8 hours  
**Anti-Fraud Measure:** YES

### Purpose

Prevent meetup fraud by enforcing 5-minute selfie verification deadline at meetup start.

### Implementation Specification

#### Add to Existing File

**File:** [`functions/src/calendarEngine.ts`](functions/src/calendarEngine.ts:446)

```typescript
// Add near line 446 (checkInMeeting function)

const SELFIE_VERIFICATION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const AUTO_REFUND_PERCENT = 50; // Partial refund on timeout

/**
 * Monitor for selfie verification timeout
 * Called when check-in starts
 */
async function startSelfieTimeoutMonitor(
  bookingId: string
): Promise<void> {
  // Schedule timeout check
  const timeoutAt = new Date(Date.now() + SELFIE_VERIFICATION_TIMEOUT_MS);
  
  await db.collection('selfie_timeout_monitors').doc(bookingId).set({
    bookingId,
    startedAt: serverTimestamp(),
    timeoutAt: Timestamp.fromDate(timeoutAt),
    status: 'monitoring'
  });
}

/**
 * Process selfie timeout (scheduled function)
 */
export const processSelfieTimeouts = onSchedule(
  { schedule: 'every 1 minutes' },
  async () => {
    const now = Timestamp.now();
    
    // Find monitors that have timed out
    const timeoutsSnap = await db
      .collection('selfie_timeout_monitors')
      .where('status', '==', 'monitoring')
      .where('timeoutAt', '<=', now)
      .limit(50)
      .get();
    
    for (const monitorDoc of timeoutsSnap.docs) {
      const monitor = monitorDoc.data();
      const bookingId = monitor.bookingId;
      
      // Check if selfie was submitted
      const bookingDoc = await db
        .collection('calendarBookings')
        .doc(bookingId)
        .get();
      
      if (!bookingDoc.exists) continue;
      
      const booking = bookingDoc.data();
      
      // If selfie not verified within timeout
      if (!booking.safety.checkInAt) {
        // Issue partial refund (50%)
        await processTimeoutRefund(bookingId, booking);
        
        // Flag both users
        await flagUsersForTimeoutReview(
          booking.hostId,
          booking.guestId,
          bookingId
        );
        
        // Update monitor
        await monitorDoc.ref.update({
          status: 'timeout_triggered',
          processedAt: serverTimestamp()
        });
      } else {
        // Selfie was verified - mark monitor as completed
        await monitorDoc.ref.update({
          status: 'completed',
          processedAt: serverTimestamp()
        });
      }
    }
  }
);

async function processTimeoutRefund(
  bookingId: string,
  booking: CalendarBooking
): Promise<void> {
  const refundAmount = Math.floor(
    booking.payment.totalTokensPaid * (AUTO_REFUND_PERCENT / 100)
  );
  
  await db.runTransaction(async (transaction) => {
    // Refund guest 50%
    const guestWalletRef = db
      .collection('users')
      .doc(booking.guestId)
      .collection('wallet')
      .doc('current');
    
    transaction.update(guestWalletRef, {
      balance: increment(refundAmount)
    });
    
    // Update booking
    const bookingRef = db.collection('calendarBookings').doc(bookingId);
    transaction.update(bookingRef, {
      status: 'TIMEOUT_NO_VERIFICATION',
      'payment.refundedUserTokens': refundAmount,
      'timestamps.timeoutAt': serverTimestamp()
    });
    
    // Record transaction
    const txRef = db.collection('transactions').doc(generateId());
    transaction.set(txRef, {
      userId: booking.guestId,
      type: 'timeout_refund',
      amount: refundAmount,
      metadata: {
        bookingId,
        reason: 'Selfie verification timeout (5 minutes)'
      },
      createdAt: serverTimestamp()
    });
  });
}
```

#### Integration Points

1. Update [`checkInMeeting()`](functions/src/calendarEngine.ts:446):
   ```typescript
   // After QR validation, start timeout monitor
   await startSelfieTimeoutMonitor(bookingId);
   ```

2. Add UI countdown timer:
   ```typescript
   // app-mobile/app/calendar/selfie-verification.tsx
   <CountdownTimer 
     seconds={300}
     onTimeout={() => {
       alert('Verification timed out. Partial refund issued.');
       navigation.goBack();
     }}
   />
   ```

---

## 🟢 MEDIUM #1: AI AVATAR TEMPLATE MARKETPLACE

**Priority:** MEDIUM  
**Timeline:** Month 2-3 (Post-Launch Phase 2)  
**Estimated Effort:** 60 hours  
**Monetization Expansion:** YES

### Purpose

Allow users to buy/sell pre-configured AI companion templates, creating a new revenue stream.

### Implementation Specification

#### File Structure

```
functions/src/
├── aiAvatarMarketplace.ts              (new - 800 lines)
└── aiTemplateQuality.ts                (new - 300 lines)

app-mobile/app/
├── ai/marketplace/browse.tsx           (new)
├── ai/marketplace/template-detail.tsx  (new)
├── ai/marketplace/my-templates.tsx     (new)
└── ai/marketplace/create-template.tsx  (new)
```

#### Database Schema

```typescript
// Collection: ai_avatar_templates
{
  templateId: string;
  creatorId: string;
  
  // Template Details
  name: string;
  description: string;
  category: 'companion' | 'mentor' | 'entertainer' | 'professional';
  tags: string[];
  
  // AI Configuration
  personality: {
    traits: string[];
    communicationStyle: string;
    interests: string[];
    backstory: string;
  };
  
  appearance: {
    avatarImageUrl: string;
    avatarStyle: 'realistic' | 'anime' | 'artistic';
  };
  
  voiceProfile?: {
    voiceId: string;
    style: string;
  };
  
  // Pricing
  priceTokens: number;
  sales: number;
  ratingAvg: number;
  reviewCount: number;
  
  // Quality scoring
  qualityScore: number;        // 0-100
  moderationStatus: 'approved' | 'pending' | 'rejected';
  
  // Revenue
  totalEarned: number;
  
  // Status
  status: 'available' | 'unlisted' | 'removed';
  featured: boolean;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Collection: ai_template_purchases
{
  purchaseId: string;
  templateId: string;
  buyerId: string;
  sellerId: string;
  
  priceTokens: number;
  sellerEarned: number;        // 80%
  avaloEarned: number;         // 20%
  
  aiInstanceId: string;        // Created AI companion
  
  purchasedAt: Timestamp;
}
```

#### Core Functions

```typescript
// functions/src/aiAvatarMarketplace.ts

/**
 * List AI template for sale
 */
export async function listAITemplate(
  creatorId: string,
  templateData: AITemplateData,
  priceTokens: number
): Promise<{success: boolean; templateId: string}> {
  // 1. Validate creator is verified
  const userDoc = await db.collection('users').doc(creatorId).get();
  if (!userDoc.data()?.verification?.approved) {
    throw new HttpsError('permission-denied', 
      'Must be verified to sell AI templates');
  }
  
  // 2. Validate template quality
  const qualityScore = await evaluateTemplateQuality(templateData);
  if (qualityScore < 60) {
    throw new HttpsError('invalid-argument', 
      'Template quality too low. Minimum score: 60');
  }
  
  // 3. Moderate content
  const moderation = await moderateTemplateContent(templateData);
  if (!moderation.passed) {
    throw new HttpsError('invalid-argument', 
      `Template rejected: ${moderation.reason}`);
  }
  
  // 4. Create template listing
  const templateId = generateId();
  await db.collection('ai_avatar_templates').doc(templateId).set({
    templateId,
    creatorId,
    ...templateData,
    priceTokens,
    sales: 0,
    ratingAvg: 0,
    reviewCount: 0,
    qualityScore,
    moderationStatus: 'approved',
    totalEarned: 0,
    status: 'available',
    featured: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  
  return { success: true, templateId };
}

/**
 * Purchase AI template
 */
export async function purchaseAITemplate(
  buyerId: string,
  templateId: string
): Promise<{success: boolean; aiInstanceId: string}> {
  return await db.runTransaction(async (transaction) => {
    // 1. Get template
    const templateRef = db.collection('ai_avatar_templates').doc(templateId);
    const templateDoc = await transaction.get(templateRef);
    
    if (!templateDoc.exists) {
      throw new HttpsError('not-found', 'Template not found');
    }
    
    const template = templateDoc.data();
    
    // 2. Check buyer balance
    const buyerWalletRef = db
      .collection('users')
      .doc(buyerId)
      .collection('wallet')
      .doc('current');
    const walletSnap = await transaction.get(buyerWalletRef);
    const balance = walletSnap.data()?.balance || 0;
    
    if (balance < template.priceTokens) {
      throw new HttpsError('failed-precondition', 'Insufficient tokens');
    }
    
    // 3. Calculate split (80% seller, 20% Avalo)
    const sellerEarned = Math.floor(template.priceTokens * 0.80);
    const avaloEarned = template.priceTokens - sellerEarned;
    
    // 4. Deduct from buyer
    transaction.update(buyerWalletRef, {
      balance: increment(-template.priceTokens)
    });
    
    // 5. Credit seller
    const sellerWalletRef = db
      .collection('users')
      .doc(template.creatorId)
      .collection('wallet')
      .doc('current');
    transaction.update(sellerWalletRef, {
      balance: increment(sellerEarned),
      earned: increment(sellerEarned)
    });
    
    // 6. Create AI instance for buyer
    const aiInstanceId = generateId();
    const aiInstanceRef = db.collection('ai_companions').doc(aiInstanceId);
    transaction.set(aiInstanceRef, {
      aiId: aiInstanceId,
      ownerId: buyerId,
      sourceTemplateId: templateId,
      ...template.personality,
      ...template.appearance,
      voiceProfile: template.voiceProfile,
      createdFromTemplate: true,
      createdAt: serverTimestamp()
    });
    
    // 7. Record purchase
    const purchaseId = generateId();
    transaction.set(
      db.collection('ai_template_purchases').doc(purchaseId),
      {
        purchaseId,
        templateId,
        buyerId,
        sellerId: template.creatorId,
        priceTokens: template.priceTokens,
        sellerEarned,
        avaloEarned,
        aiInstanceId,
        purchasedAt: serverTimestamp()
      }
    );
    
    // 8. Update template stats
    transaction.update(templateRef, {
      sales: increment(1),
      totalEarned: increment(sellerEarned)
    });
    
    return { success: true, aiInstanceId };
  });
}
```

#### Testing Requirements

- [ ] Template creation with quality check
- [ ] Template moderation (reject inappropriate)
- [ ] Marketplace browsing by category
- [ ] Purchase flow (80/20 split)
- [ ] AI instance creation from template
- [ ] Seller earnings tracking
- [ ] Rating/review system
- [ ] Template customization after purchase

---

## 🟢 MEDIUM #2: CHAT INACTIVITY TIMEOUT UI

**Priority:** MEDIUM  
**Timeline:** Month 2-3 (Post-Launch Phase 2)  
**Estimated Effort:** 6 hours  
**UX Improvement:** YES

### Purpose

Show users when chat will auto-close, preventing surprise closures.

### Implementation Specification

#### File: `app-mobile/components/ChatInactivityIndicator.tsx`

```typescript
import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { formatDistanceToNow } from 'date-fns';

interface ChatInactivityIndicatorProps {
  lastActivityAt: Date;
  inactivityTimeoutHours: number; // 48
}

export function ChatInactivityIndicator({
  lastActivityAt,
  inactivityTimeoutHours
}: ChatInactivityIndicatorProps) {
  const [timeRemaining, setTimeRemaining] = useState('');
  const [warningLevel, setWarningLevel] = useState<'green' | 'yellow' | 'red'>('green');
  
  useEffect(() => {
    const calculateTimeRemaining = () => {
      const closeAt = new Date(
        lastActivityAt.getTime() + inactivityTimeoutHours * 60 * 60 * 1000
      );
      const now = new Date();
      const hoursRemaining = (closeAt.getTime() - now.getTime()) / (1000 * 60 * 60);
      
      if (hoursRemaining <= 1) {
        setWarningLevel('red');
        setTimeRemaining('Less than 1 hour');
      } else if (hoursRemaining <= 12) {
        setWarningLevel('yellow');
        setTimeRemaining(`${Math.floor(hoursRemaining)} hours`);
      } else {
        setWarningLevel('green');
        setTimeRemaining(formatDistanceToNow(closeAt));
      }
    };
    
    calculateTimeRemaining();
    const interval = setInterval(calculateTimeRemaining, 60000); // Update every minute
    
    return () => clearInterval(interval);
  }, [lastActivityAt, inactivityTimeoutHours]);
  
  if (warningLevel === 'green') return null; // Don't show when plenty of time
  
  return (
    <View style={{
      padding: 8,
      backgroundColor: warningLevel === 'red' ? '#fee' : '#ffc',
      borderRadius: 8
    }}>
      <Text style={{fontSize: 12, color: warningLevel === 'red' ? '#d00' : '#880'}}>
        ⏰ Chat auto-closes in {timeRemaining} due to inactivity
      </Text>
    </View>
  );
}
```

#### Push Notifications

```typescript
// functions/src/chatInactivityNotifications.ts

export const sendInactivityWarnings = onSchedule(
  { schedule: 'every 1 hours' },
  async () => {
    const now = Date.now();
    const twelveHoursFromNow = now + 12 * 60 * 60 * 1000;
    const oneHourFromNow = now + 1 * 60 * 60 * 1000;
    
    // Find chats closing in 12 hours
    const chatsNearing12h = await db.collection('chats')
      .where('state', 'in', ['FREE_ACTIVE', 'PAID_ACTIVE'])
      .where('lastActivityAt', '<=', new Date(now - 36 * 60 * 60 * 1000))
      .where('lastActivityAt', '>', new Date(now - 37 * 60 * 60 * 1000))
      .get();
    
    for (const chatDoc of chatsNearing12h.docs) {
      const chat = chatDoc.data();
      // Send "12 hours remaining" notifications to both participants
      for (const userId of chat.participants) {
        await sendPushNotification(userId, {
          title: 'Chat closing soon',
          body: 'Your chat will auto-close in 12 hours. Send a message to keep it active!',
          data: { chatId: chatDoc.id, action: 'chat_inactivity_warning' }
        });
      }
    }
    
    // Similar logic for 1-hour warning
  }
);
```

---

## IMPLEMENTATION CHECKLIST

### Phase 1: CRITICAL (Before Production)

- [ ] **Regional Regulation Toggles**
  - [ ] Create regionalCompliance.ts module
  - [ ] Define configs for 20+ countries
  - [ ] Integrate feature access checks
  - [ ] Update UI to hide disabled features
  - [ ] Test VPN detection
  - [ ] Test feature enforcement
  - [ ] App Store review preparation

- [ ] **Bank-ID/Document Verification**
  - [ ] Create verification fallback module
  - [ ] Integrate Bank-ID APIs (Norway, Sweden, Finland)
  - [ ] Implement OCR document scanning
  - [ ] Create manual review queue UI
  - [ ] Test complete verification flow
  - [ ] Ensure GDPR compliance for document storage

### Phase 2: HIGH (Post-Launch Weeks 4-6)

- [ ] **Tax Report Export**
  - [ ] Create tax export module
  - [ ] Implement Poland PIT-11 generation
  - [ ] Implement USA 1099-MISC generation
  - [ ] Implement UK Self-Assessment export
  - [ ] Implement Germany EÜR format
  - [ ] Schedule automatic generation
  - [ ] Test PDF generation
  - [ ] Validate tax calculations with accountant

- [ ] **Calendar Selfie Timeout**
  - [ ] Add timeout monitor to checkInMeeting()
  - [ ] Create scheduled timeout processor
  - [ ] Implement partial refund logic
  - [ ] Add UI countdown timer
  - [ ] Test timeout scenarios
  - [ ] Test refund accuracy

### Phase 3: MEDIUM (Post-Launch Months 2-3)

- [ ] **AI Avatar Marketplace**
  - [ ] Create marketplace module
  - [ ] Implement quality scoring
  - [ ] Create listing/browsing UI
  - [ ] Implement purchase flow
  - [ ] Add rating/review system
  - [ ] Test 80/20 revenue split
  - [ ] Launch with featured templates

- [ ] **Chat Inactivity UI**
  - [ ] Create inactivity indicator component
  - [ ] Add push notification logic
  - [ ] Test 12h and 1h warnings
  - [ ] Ensure proper timezone handling

---

## SUCCESS CRITERIA

### Before Production Launch

✅ All CRITICAL items implemented and tested  
✅ Regional configs for top 20 markets  
✅ Identity verification has 2+ fallback methods  
✅ App Store submission includes regional compliance docs  
✅ Legal team approves updated verification flow

### Post-Launch Phase 1 (Week 4-6)

✅ Tax reports auto-generate for Poland users  
✅ Creators can download tax documents  
✅ Calendar timeout prevents fraud  
✅ <5% timeout rate (normal completion rate >95%)

### Post-Launch Phase 2 (Month 2-3)

✅ AI marketplace launches with 50+ templates  
✅ Template sales generate 10K+ tokens/month revenue  
✅ Chat inactivity warnings reduce surprise closures by 80%  
✅ User satisfaction scores improve

---

## RISK MITIGATION

### If CRITICAL Items Delayed

**Risk:** App Store rejection or legal issues  
**Mitigation:**
1. Launch in Poland only (single market)
2. Manual identity verification for edge cases
3. Disable features in restrictive regions

### If HIGH Items Delayed

**Risk:** User complaints about tax documents  
**Mitigation:**
1. Provide manual tax statement request form
2. Hire tax consultant for creator support
3. Release tax export in Jan 2026 for 2025 filings

### If MEDIUM Items Delayed

**Risk:** Missed monetization opportunity  
**Mitigation:**
1. These are enhancements, not core features
2. Can be released in any future update
3. No compliance or legal risk

---

## ESTIMATED COSTS

| Item | Development | Testing | Total |
|------|-------------|---------|-------|
| Regional Toggles | 24h | 8h | **32h** |
| Bank-ID/Docs | 32h | 8h | **40h** |
| Tax Reports | 18h | 6h | **24h** |
| Selfie Timeout | 6h | 2h | **8h** |
| AI Marketplace | 48h | 12h | **60h** |
| Inactivity UI | 4h | 2h | **6h** |
| **TOTAL** | **132h** | **38h** | **170h** |

**Estimated Calendar Time:**
- CRITICAL (Week 1-2): 72 hours
- HIGH (Week 4-6): 32 hours  
- MEDIUM (Month 2-3): 66 hours

**Team Recommendation:** 2 developers for 3-4 weeks

---

## PRIORITIZATION MATRIX

```
IMPACT vs EFFORT

High Impact │ Regional    │ Tax Reports │
           │ Toggles (C) │ (H)         │
           │─────────────┼─────────────┤
           │ Bank-ID (C) │ Selfie      │
           │             │ Timeout (H) │
           ├─────────────┼─────────────┤
Low Impact │ Inactivity  │ AI Market   │
           │ UI (M)      │ (M)         │
           └─────────────┴─────────────┘
             Low Effort    High Effort

Legend: (C) Critical, (H) High, (M) Medium
```

---

**Final Recommendation:** Focus all resources on CRITICAL items for production launch. The platform is otherwise excellent and production-ready.

---

*END OF IMPLEMENTATION GUIDE*