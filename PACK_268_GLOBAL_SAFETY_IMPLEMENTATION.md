# PACK 268 — Global Safety & Identity Rules Implementation

## ✅ COMPLETE - Base Engine for Safety & Identity

This pack establishes the foundational safety and identity infrastructure that **ALL** other modules must respect and integrate with.

---

## 📦 Module Structure

```
app-mobile/lib/safety/
├── index.ts                    # Main export barrel
├── age-verification.ts         # 18+ age gate
├── identity-verification.ts    # Selfie verification
├── mismatch-reporting.ts       # Global mismatch system
├── risk-trust.ts              # Risk scoring & ban management
├── safety-hooks.ts            # Panic & safety hooks interface
└── content-safety.ts          # Content moderation rules
```

---

## 🎯 Core Features Implemented

### 1. Age Gate (18+ Only)

**Hard Rule**: Avalo is 18+ ONLY. No exceptions.

```typescript
import { isAdult, enforceAgeGate } from '@/lib/safety';

// Check if user is adult
const adult = isAdult('1990-05-15'); // true

// Enforce age gate during registration
const result = enforceAgeGate(birthdate);
if (!result.allowed) {
  // User is under 18 - DO NOT create account
  console.error(result.reason);
}
```

**Key Functions**:
- [`isAdult(birthdate)`](app-mobile/lib/safety/age-verification.ts:15) - Returns true if 18+
- [`calculateAge(birthdate)`](app-mobile/lib/safety/age-verification.ts:47) - Calculate exact age
- [`validateBirthdate(birthdate)`](app-mobile/lib/safety/age-verification.ts:66) - Validate date format/range
- [`enforceAgeGate(birthdate)`](app-mobile/lib/safety/age-verification.ts:101) - Complete age gate enforcement

### 2. Identity & Selfie Verification

**Baseline Rule**: New users must complete selfie verification before accessing core features.

```typescript
import { 
  canAccessDiscovery, 
  createInitialVerification,
  VERIFICATION_REQUIREMENTS 
} from '@/lib/safety';

// Create initial verification after selfie upload
const verification = createInitialVerification(selfieUrl);

// Check if user can access features
const canSwipe = canAccessDiscovery(user.verification); // false until verified
const canBook = canBookMeetings(user.verification);    // false until verified
```

**Verification Status Flow**:
1. `unverified` → User just registered
2. `pending` → Selfie submitted, awaiting review
3. `verified` → Approved, full access
4. `rejected` → Rejected due to mismatch, limited access

**Feature Requirements**:
- Discovery/Swipe: Requires `verified`
- Calendar Bookings: Requires `verified`
- Event Attendance: Requires `verified`
- Chat: Available to all

### 3. Global Mismatch Reporting

**Unified System**: All modules (Chat, Calendar, Events) MUST use this same structure.

```typescript
import { createMismatchReport, MismatchType } from '@/lib/safety';

// Report mismatch in chat
const report = createMismatchReport({
  reporterId: currentUserId,
  targetId: otherUserId,
  type: 'appearance',
  context: 'chat',
  relatedId: chatId,
  description: 'Person does not match photos',
});

await addDoc(collection(db, 'mismatchReports'), report);
```

**Mismatch Types**:
- `appearance` - Person doesn't match photos (most common)
- `age` - Person appears different age than stated
- `fraud_behavior` - Suspected scam/fraud

**Contexts**:
- `chat` - During chat conversation
- `calendar` - During paid meeting
- `event` - At event check-in

**Impact**: Each confirmed mismatch automatically:
- Increments user's `mismatchCount`
- Increases `riskScore` by 15 points
- May trigger automatic ban if score too high

### 4. Risk & Trust System

**Progressive Enforcement**: Users accumulate risk scores based on behavior.

```typescript
import { 
  incrementMismatchCount, 
  getActionPermissions,
  isShadowBanned 
} from '@/lib/safety';

// Update risk after mismatch
const updatedRisk = incrementMismatchCount(user.risk);
await updateDoc(userRef, { risk: updatedRisk });

// Check what user can do
const permissions = getActionPermissions(user.risk.banLevel);
if (!permissions.canAppearInDiscovery) {
  // User is shadow banned
}
```

**Ban Levels**:
- `none` (0-29 risk) - No restrictions
- `soft` (30-49 risk) - Cannot initiate messages
- `shadow` (50-79 risk) - Hidden from discovery/calendar/events
- `full` (80-100 risk) - Complete ban

**Risk Score Weights**:
- Each mismatch: +15 points
- Each chargeback: +25 points
- Age violation: +100 points (instant max)
- Content violation: +40 points

### 5. Safety Hooks Interface

**Design**: Interfaces only - implementation in dedicated Safety pack (future).

```typescript
import { getSafetyHooks } from '@/lib/safety';

// Calendar module - when meeting starts
const hooks = getSafetyHooks();
await hooks.onMeetingStarted(bookingId);

// Events module - at check-in
await hooks.onEventCheckIn(eventId, ticketId);

// Panic button - anywhere
await hooks.onPanicTriggered(userId, 'calendar', {
  location: { lat: 50.0, lng: 20.0 },
  notes: 'Emergency situation',
});
```

**Hooks Available**:
- [`onMeetingStarted(bookingId)`](app-mobile/lib/safety/safety-hooks.ts:50) - Called after QR+Selfie in calendar
- [`onEventCheckIn(eventId, ticketId)`](app-mobile/lib/safety/safety-hooks.ts:63) - Called after QR+Selfie at event
- [`onPanicTriggered(userId, context, metadata)`](app-mobile/lib/safety/safety-hooks.ts:76) - Emergency alert
- [`onMismatchConfirmed(reportId)`](app-mobile/lib/safety/safety-hooks.ts:93) - After investigation

### 6. Content Safety Baseline

**Zero Tolerance**: Certain content results in immediate permanent ban.

```typescript
import { 
  ContentViolationType,
  requiresImmediateBan,
  requiresLegalReport,
  CONTENT_SAFETY_RULES 
} from '@/lib/safety';

// Check violation severity
const config = CONTENT_SAFETY_RULES[ContentViolationType.CSAM];
if (requiresImmediateBan(config.type)) {
  // Immediate permanent ban
  await banUserPermanently(userId);
}

if (requiresLegalReport(config.type)) {
  // Report to authorities
  await reportToAuthorities(userId, evidence);
}
```

**Critical Violations** (Instant permanent ban + legal reporting):
- CSAM (Child Sexual Abuse Material)
- Child exploitation
- Revenge porn
- Non-consensual explicit content

**High Violations** (Instant permanent ban):
- Violence
- Hate speech
- Threats
- Terrorism
- Self-harm promotion

---

## 🔗 Integration Guide

### For ALL Modules

1. **Import from safety module**:
```typescript
import { 
  isAdult,
  canAccessDiscovery,
  createMismatchReport,
  getSafetyHooks 
} from '@/lib/safety';
```

2. **Check verification status** before allowing features
3. **Use global mismatch types** - never create your own
4. **Call safety hooks** at appropriate times
5. **Respect ban levels** in all features

### For Registration Flow

```typescript
import { enforceAgeGate, createInitialVerification } from '@/lib/safety';

async function registerUser(data: RegistrationData) {
  // 1. Enforce age gate
  const ageCheck = enforceAgeGate(data.birthdate);
  if (!ageCheck.allowed) {
    throw new Error(ageCheck.reason);
  }
  
  // 2. Create user with verification
  const verification = createInitialVerification(data.selfieUrl);
  
  await createUser({
    ...data,
    verification,
    risk: createInitialRiskTrust(),
  });
}
```

### For Chat Module

```typescript
import { createMismatchReport, getSafetyHooks } from '@/lib/safety';

// Report mismatch
async function reportMismatch(chatId: string, targetId: string) {
  const report = createMismatchReport({
    reporterId: currentUserId,
    targetId,
    type: 'appearance',
    context: 'chat',
    relatedId: chatId,
  });
  
  await addDoc(collection(db, 'mismatchReports'), report);
}
```

### For Calendar Module

```typescript
import { getSafetyHooks, canBookMeetings } from '@/lib/safety';

// Check verification before booking
if (!canBookMeetings(user.verification)) {
  throw new Error('Complete identity verification first');
}

// Start meeting (after QR+Selfie check)
async function startMeeting(bookingId: string) {
  const hooks = getSafetyHooks();
  await hooks.onMeetingStarted(bookingId);
  // Continue...
}
```

### For Events Module

```typescript
import { getSafetyHooks, canAttendEvents } from '@/lib/safety';

// Check verification before ticket purchase
if (!canAttendEvents(user.verification)) {
  throw new Error('Complete identity verification first');
}

// Check-in at event
async function checkIn(eventId: string, ticketId: string) {
  const hooks = getSafetyHooks();
  await hooks.onEventCheckIn(eventId, ticketId);
  // Continue...
}
```

### For Discovery/Swipe Module

```typescript
import { canAccessDiscovery, isShadowBanned } from '@/lib/safety';

// Filter users in discovery
function shouldShowInDiscovery(user: User): boolean {
  // Must be verified
  if (!canAccessDiscovery(user.verification)) {
    return false;
  }
  
  // Must not be shadow banned
  if (isShadowBanned(user.risk.banLevel)) {
    return false;
  }
  
  return true;
}
```

---

## 📊 Firestore Schema

### Users Collection Enhancement

```typescript
interface User {
  // ... existing fields
  
  // Age verification
  birthdate: string; // ISO date
  
  // Identity verification
  verification: {
    onboardingSelfieUrl: string;
    status: 'unverified' | 'pending' | 'verified' | 'rejected';
    lastReviewAt?: string;
    reviewedBy?: string;
    rejectionReason?: string;
    confidenceScore?: number;
  };
  
  // Risk & Trust
  risk: {
    score: number;              // 0-100
    mismatchCount: number;
    chargebackCount: number;
    banLevel: 'none' | 'soft' | 'shadow' | 'full';
    banLevelChangedAt?: string;
    banReason?: string;
    bannedBy?: string;
    banExpiresAt?: string;
    reportsFiledCount?: number;
    trustScore?: number;
    lastCalculatedAt: string;
  };
}
```

### Mismatch Reports Collection (NEW)

```typescript
interface MismatchReport {
  id: string;
  reporterId: string;
  targetId: string;
  type: 'appearance' | 'age' | 'fraud_behavior';
  context: 'chat' | 'calendar' | 'event';
  relatedId: string; // chatId, bookingId, eventId
  description?: string;
  evidenceUrls?: string[];
  createdAt: string;
  status: 'pending' | 'investigating' | 'confirmed' | 'dismissed';
  adminNotes?: string;
  resolvedAt?: string;
  resolvedBy?: string;
}
```

---

## 🔒 Security Rules (Firestore)

```javascript
// Mismatch reports can only be created by authenticated users
match /mismatchReports/{reportId} {
  allow create: if request.auth != null 
    && request.resource.data.reporterId == request.auth.uid;
  
  allow read: if request.auth != null 
    && (request.auth.uid == resource.data.reporterId 
        || request.auth.uid == resource.data.targetId
        || hasRole('admin'));
  
  allow update, delete: if hasRole('admin');
}

// Users can read their own risk data
match /users/{userId} {
  allow read: if request.auth.uid == userId;
  
  // Only backend/admin can update risk scores
  allow update: if false; // Use admin SDK or Cloud Functions
}
```

---

## ⚠️ Critical Rules for ALL Developers

1. **NEVER bypass age verification** - Instant legal liability
2. **NEVER create custom mismatch types** - Use global types only
3. **NEVER skip safety hooks** - They enable emergency features
4. **ALWAYS check verification status** before granting access
5. **ALWAYS respect ban levels** in all features
6. **NEVER store user age directly** - Always calculate from birthdate
7. **ALWAYS use global risk scoring** - Never custom implementations

---

## 📋 Testing Checklist

- [ ] Age verification rejects users under 18
- [ ] Unverified users cannot access discovery
- [ ] Mismatch reports correctly increment risk score
- [ ] Shadow banned users are hidden from others
- [ ] Full banned users cannot access any features
- [ ] Safety hooks are called at appropriate times
- [ ] Content violations trigger immediate bans
- [ ] Risk scores update automatically

---

## 🚀 Next Steps

1. **PACK 269+**: Implement actual Safety pack with real hooks
2. **Calendar Pack**: Integrate safety hooks for meetings
3. **Events Pack**: Integrate safety hooks for check-ins
4. **Chat Pack**: Add mismatch reporting UI
5. **Profile Pack**: Add identity verification flow
6. **Admin Pack**: Add mismatch review dashboard

---

## 📝 API Reference

### Age Verification
- [`isAdult(birthdate: string): boolean`](app-mobile/lib/safety/age-verification.ts:15)
- [`calculateAge(birthdate: string): number`](app-mobile/lib/safety/age-verification.ts:47)
- [`validateBirthdate(birthdate: string): string | null`](app-mobile/lib/safety/age-verification.ts:66)
- [`enforceAgeGate(birthdate: string): AgeGateResult`](app-mobile/lib/safety/age-verification.ts:101)

### Identity Verification
- [`canAccessDiscovery(verification): boolean`](app-mobile/lib/safety/identity-verification.ts:59)
- [`canBookMeetings(verification): boolean`](app-mobile/lib/safety/identity-verification.ts:66)
- [`canAttendEvents(verification): boolean`](app-mobile/lib/safety/identity-verification.ts:73)
- [`createInitialVerification(selfieUrl): IdentityVerification`](app-mobile/lib/safety/identity-verification.ts:85)

### Mismatch Reporting
- [`createMismatchReport(params): MismatchReport`](app-mobile/lib/safety/mismatch-reporting.ts:66)
- [`getMismatchTypeDescription(type): string`](app-mobile/lib/safety/mismatch-reporting.ts:157)
- [`getMismatchRiskImpact(type): number`](app-mobile/lib/safety/mismatch-reporting.ts:179)

### Risk & Trust
- [`calculateRiskScore(risk): number`](app-mobile/lib/safety/risk-trust.ts:78)
- [`incrementMismatchCount(risk): RiskTrust`](app-mobile/lib/safety/risk-trust.ts:122)
- [`getActionPermissions(banLevel): ActionPermissions`](app-mobile/lib/safety/risk-trust.ts:162)

### Safety Hooks
- [`getSafetyHooks(): SafetyHooks`](app-mobile/lib/safety/safety-hooks.ts:143)
- [`setSafetyHooks(hooks): void`](app-mobile/lib/safety/safety-hooks.ts:136)

### Content Safety
- [`getViolationConfig(type): ViolationConfig`](app-mobile/lib/safety/content-safety.ts:252)
- [`requiresImmediateBan(type): boolean`](app-mobile/lib/safety/content-safety.ts:259)
- [`requiresLegalReport(type): boolean`](app-mobile/lib/safety/content-safety.ts:267)

---

## 📧 Support & Questions

For questions about safety implementation:
- Review this document first
- Check individual module files for detailed comments
- See integration examples above
- Contact security team for compliance questions

---

**Status**: ✅ IMPLEMENTATION COMPLETE
**Version**: 1.0.0
**Last Updated**: 2025-12-03