# Phase 9: Account Lifecycle Implementation

**Date:** 2024-11-20  
**Status:** ✅ Implemented  
**Phase:** Account Lifecycle (Delete / Suspend / Template Restore)

---

## Overview

Phase 9 implements a complete account lifecycle system for Avalo, providing users with full control over their account status while maintaining data integrity and business safety. This phase is **fully additive** and does not modify any existing monetization logic, pricing, or Earn-to-Chat rules.

---

## 1. Data Model Changes

### 1.1 User Document Extensions

**New field added to `users/{userId}`:**

```typescript
accountStatus: {
  status: 'active' | 'suspended' | 'deleted_soft' | 'deleted_hard';
  suspendedAt?: Timestamp;
  deletedAt?: Timestamp;
  reason?: string;
  updatedBy?: string;
}
```

**Account Status States:**
- **`active`** (default): User is visible and can use all features
- **`suspended`**: User voluntarily paused their account (hidden from discovery)
- **`deleted_soft`**: Account deleted but preferences saved for return
- **`deleted_hard`**: Permanently deleted (anonymized)

### 1.2 New Collection: Profile Templates

**Collection: `profileTemplates/{userId}`**

Stores **non-personal** behavioral preferences for users who soft-delete their accounts.

```typescript
interface ProfileTemplate {
  templateId: string;
  userId: string;
  preferences: {
    // Search & Discovery
    gender?: string;
    orientation?: string[];
    seekingGender?: string[];
    ageRangeMin?: number;
    ageRangeMax?: number;
    searchRadiusKm?: number | 'country';
    language?: string;
    
    // Mode Settings
    earnOnChat?: boolean;
    incognito?: boolean;
    passport?: boolean;
    
    // Notifications
    notifications?: {
      messages?: boolean;
      likes?: boolean;
      matches?: boolean;
      calls?: boolean;
      bookings?: boolean;
    };
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastUsedAt?: Timestamp;
}
```

**What is NOT stored in templates:**
- Photos, selfies, documents
- Real name, email, phone number
- Bio text or personal descriptions
- Location data (GPS coordinates)
- Instagram account info
- Verification documents
- Any personally identifiable information

---

## 2. Backend Functions

### 2.1 New Module: `accountLifecycle.ts`

**Location:** `functions/src/accountLifecycle.ts`

#### Core Functions

**Account Suspension:**
```typescript
suspendAccount(userId: string, reason?: string)
  → { success: boolean; message: string }
```
- Sets status to `suspended`
- Hides user from discovery
- Preserves all balances and earnings
- Can be reversed anytime

**Account Reactivation:**
```typescript
reactivateAccount(userId: string)
  → { success: boolean; message: string }
```
- Restores status to `active`
- Makes user visible again

**Soft Deletion:**
```typescript
softDeleteAccount(userId: string, savePreferences: boolean)
  → { success: boolean; message: string; templateSaved: boolean }
```
- Checks deletion blockers (escrows, bookings, withdrawals)
- Saves profile template if requested
- Anonymizes personal data but keeps user document
- Sets status to `deleted_soft`

**Hard Deletion:**
```typescript
hardDeleteAccount(userId: string)
  → { success: boolean; message: string }
```
- Strict validation (no active escrows/bookings/withdrawals)
- Permanently anonymizes all personal data
- Removes profile template
- Sets status to `deleted_hard`

**Deletion Eligibility Check:**
```typescript
getDeletionEligibility(userId: string)
  → {
      canDelete: boolean;
      blockers: DeletionBlocker;
      warnings?: string[];
    }
```

**Deletion blockers include:**
- Active chat escrows
- Pending calendar bookings
- Pending withdrawal requests
- Large wallet balances (warning only)

#### Helper Functions

```typescript
checkDeletionBlockers(userId: string)
  → DeletionBlocker

isAccountActive(userId: string)
  → boolean

isUserVisibleInDiscovery(userId: string)
  → boolean

getAccountStatus(userId: string)
  → AccountStatusUpdate | null

filterActiveUsers(users: any[])
  → any[]

loadProfileTemplate(userId: string)
  → ProfileTemplate | null

applyTemplatePreferences(userId: string)
  → { applied: boolean; preferences?: ProfileTemplate['preferences'] }
```

---

## 3. Integration with Existing Systems

### 3.1 Discovery & Search Filters

**Modified:** `functions/src/discoveryFilters.ts`

**Changes:**
- Added account status check in `isUserVisibleInDiscovery()`
- Updated `getDiscoveryQueryFilters()` to include status filter
- Only `status === 'active'` users are visible

**Query Example:**
```typescript
const filters = getDiscoveryQueryFilters();
// Returns:
[
  { field: 'accountStatus.status', op: '==', value: 'active' },
  { field: 'shadowbanned', op: '!=', value: true },
  { field: 'privacy.incognito.enabled', op: '!=', value: true }
]
```

### 3.2 Chat Monetization

**Modified:** `functions/src/chatMonetization.ts`

**Changes:**
- Added account status check in `initializeChat()`
- Both participants must have `status === 'active'`
- Prevents starting chats with suspended/deleted users

```typescript
// Before chat initialization
for (const participantId of participantIds) {
  const isActive = await isAccountActive(participantId);
  if (!isActive) {
    throw new HttpsError(
      'failed-precondition',
      'Cannot start chat: one or more participants have inactive accounts'
    );
  }
}
```

### 3.3 Call Monetization

**Modified:** `functions/src/callMonetization.ts`

**Changes:**
- Added account status check in `startCall()`
- Both users must have `status === 'active'`
- Prevents calls with suspended/deleted users

```typescript
// Before call start
const userAActive = await isAccountActive(userAId);
const userBActive = await isAccountActive(userBId);

if (!userAActive || !userBActive) {
  throw new HttpsError(
    'failed-precondition',
    'Cannot start call: one or more participants have inactive accounts'
  );
}
```

---

## 4. Mobile UI Implementation

### 4.1 New Service: Account Service

**Location:** `app-mobile/services/accountService.ts`

Provides client-side interface to account lifecycle functions:

```typescript
// Service methods
suspendAccount(userId, reason?)
reactivateAccount(userId)
softDeleteAccount(userId, savePreferences)
hardDeleteAccount(userId)
getDeletionEligibility(userId)
getAccountStatus(userId)
```

### 4.2 New Screen: Account Management

**Location:** `app-mobile/app/profile/settings/account.tsx`

**Features:**
- View current account status
- Pause/Resume account toggle
- Soft delete with preference save option
- Hard delete with double confirmation
- Display deletion blockers with details
- Show warnings (e.g., unused balance)

**UI Sections:**
1. **Account Status Card** - Shows active/suspended/deleted state
2. **Pause Account** - Toggle suspension
3. **Delete Options:**
   - Soft delete (save preferences)
   - Hard delete (permanent)
4. **Blocker Display** - Shows what prevents deletion
5. **Warning Display** - Shows wallet balance warnings

---

## 5. Edge Cases & Safety

### 5.1 Deletion Blockers

Users **CANNOT** delete if they have:

**Active Chat Escrows:**
```typescript
// Check: chats collection where:
- participants contains userId
- state in ['FREE_ACTIVE', 'PAID_ACTIVE', 'AWAITING_DEPOSIT']
- roles.payerId === userId (has escrow)
```

**Pending Bookings:**
```typescript
// Check: bookings collection where:
- status in ['pending', 'confirmed', 'in_progress']
- bookerId === userId OR creatorId === userId
```

**Pending Withdrawals:**
```typescript
// Check: withdrawals collection where:
- userId === userId
- status in ['PENDING', 'ON_HOLD']
```

### 5.2 Wallet Balance Warnings

**Non-blocking warning:**
- If balance > 0, user is warned they will lose tokens
- Recommended to withdraw first
- User can proceed with deletion anyway

### 5.3 Soft vs Hard Delete Behavior

**Soft Delete (`deleted_soft`):**
- User document preserved (for template reference)
- Personal data cleared:
  - `displayName` → "Deleted User"
  - `bio` → ""
  - `photos` → []
  - `email` → null
  - `phone` → null
- Profile template saved (if requested)
- Hidden from all discovery
- Can return and use template

**Hard Delete (`deleted_hard`):**
- Only allowed if no blockers
- All personal data anonymized
- Profile template deleted
- User document kept for audit/compliance
- Permanently hidden from discovery
- Cannot return or reactivate

---

## 6. Reactivation Flow (Return Users)

### 6.1 Template Application

When a user with a saved template returns:

**Step 1:** User registers again (same email/phone)
```typescript
// During onboarding
const template = await loadProfileTemplate(userId);
```

**Step 2:** Check for existing template
```typescript
if (template) {
  // Offer to restore preferences
  showRestorePreferencesPrompt();
}
```

**Step 3:** Apply template preferences
```typescript
await applyTemplatePreferences(userId);
// Pre-fills: gender, orientation, search settings, modes, etc.
```

**Step 4:** User completes onboarding
- Add photos (fresh upload)
- Write new bio
- Verify identity (if required)

**Step 5:** Account goes active
```typescript
await userRef.update({
  'accountStatus.status': 'active',
  updatedAt: serverTimestamp()
});
```

### 6.2 Template Persistence

- Templates are kept indefinitely
- Updated with `lastUsedAt` when applied
- Can be reused multiple times (rare edge case)
- Only deleted with hard delete

---

## 7. Token Purchase (No Changes)

**Confirmation:** Token purchases remain unchanged
- Still use web/Stripe hosted checkout
- WebView or external browser
- **NO native IAP** (avoids Apple/Google 30% fee)
- Only account lifecycle UX added
- No changes to payment flow

---

## 8. Testing Scenarios

### 8.1 Suspension Flow
1. User pauses account
2. Profile hidden from discovery
3. Cannot receive new chats/calls
4. Balances preserved
5. User reactivates
6. Profile visible again

### 8.2 Soft Delete Flow
1. User has no blockers
2. Selects "Delete & Save Preferences"
3. Template saved with settings
4. Personal data cleared
5. Account hidden
6. User returns later
7. Template applied during onboarding
8. Account reactivated with preferences

### 8.3 Hard Delete Blocked
1. User has active chat escrow
2. Attempts hard delete
3. System shows blocker: "1 active chat(s)"
4. Shows escrow amount
5. Delete button disabled
6. User must close chat first

### 8.4 Hard Delete Success
1. User has no blockers
2. Selects permanent delete
3. Double confirmation required
4. Wallet balance warning shown
5. User confirms
6. Account permanently deleted
7. Template removed
8. User signed out

---

## 9. Monitoring & Metrics

### 9.1 Key Metrics to Track

**Account Status Distribution:**
```typescript
{
  active: number,
  suspended: number,
  deleted_soft: number,
  deleted_hard: number
}
```

**Deletion Reasons:**
- User requested soft delete
- User requested hard delete
- Retention impact

**Template Usage:**
- Templates created
- Templates used (returning users)
- Return rate after soft delete

**Blocker Frequency:**
- How often deletion is blocked
- Most common blockers
- Average resolution time

---

## 10. Rollout Plan

### Step 1: Backend Deployment
**Duration:** 30 minutes

1. Deploy `accountLifecycle.ts` functions
2. Add Firestore indexes:
   ```
   accounts.status (single field)
   chats.state + chats.participants (composite)
   bookings.status (single field)
   ```
3. Verify functions deployed successfully
4. Test via Firebase Console

### Step 2: Mobile Build
**Duration:** 45 minutes

1. Build iOS & Android with new account screen
2. Internal testing with TestFlight / Internal Testing
3. Verify all UI flows work
4. Test blocker detection
5. Test template save/restore

### Step 3: Test Scenarios
**Duration:** 2 hours

Run through all test scenarios:
- ✅ Suspend/reactivate
- ✅ Soft delete with template
- ✅ Hard delete blocked by escrow
- ✅ Hard delete success
- ✅ Template restoration
- ✅ Discovery filtering
- ✅ Chat/call prevention

### Step 4: Monitoring
**Duration:** Ongoing

1. Set up CloudWatch/Datadog alerts:
   - Deletion blocker rate > 50%
   - Template creation failures
   - Account status query latency
2. Monitor user feedback
3. Track return rate for soft deletes
4. Measure suspension usage

### Step 5: Gradual Rollout
**Week 1:** 10% of users
**Week 2:** 25% of users
**Week 3:** 50% of users
**Week 4:** 100% (full release)

---

## 11. File Summary

### New Files Created

**Backend:**
- `functions/src/accountLifecycle.ts` - Core account lifecycle functions (637 lines)

**Mobile:**
- `app-mobile/services/accountService.ts` - Client service wrapper (122 lines)
- `app-mobile/app/profile/settings/account.tsx` - Account management UI (507 lines)

**Documentation:**
- `PHASE_9_ACCOUNT_LIFECYCLE_IMPLEMENTATION.md` - This file

### Modified Files

**Backend:**
- `functions/src/discoveryFilters.ts` - Added account status filtering
- `functions/src/chatMonetization.ts` - Added account status check in chat init
- `functions/src/callMonetization.ts` - Added account status check in call start

**No Changes Required:**
- Monetization logic (rates, splits, pricing)
- Token purchase flow
- Payment processing
- Earn-to-Chat rules
- Trust engine logic
- Payout system (only integrated, not modified)

---

## 12. Business Impact

### User Experience Improvements
✅ Control over account visibility  
✅ Ability to take breaks without losing data  
✅ Easy return path for lapsed users  
✅ Clear deletion process with safeguards  
✅ Prevents accidental data loss  

### Risk Mitigation
✅ Prevents deletion with active money  
✅ Protects escrows and bookings  
✅ Ensures payout completion first  
✅ Clear warnings about consequences  

### Retention Benefits
✅ Soft delete enables easy returns  
✅ Template restoration reduces friction  
✅ Suspension for temporary breaks  
✅ Reduces permanent churns  

---

## 13. Future Enhancements

**Potential V2 Features:**
- Auto-suspend after X days inactivity
- Scheduled account deletion (30-day grace period)
- Export user data (GDPR compliance)
- Account transfer/merge
- Bulk operations for admin panel
- Automated template cleanup (>2 years old)

---

## Conclusion

Phase 9 successfully implements a complete account lifecycle system that gives users full control while maintaining business safety and data integrity. The implementation is fully additive, introduces no breaking changes, and integrates seamlessly with existing Phases 1-8.

**Key Achievements:**
- ✅ 4 account status states implemented
- ✅ Profile template system for soft deletion
- ✅ Comprehensive deletion blockers
- ✅ Discovery/chat/call integration
- ✅ Mobile UI with all flows
- ✅ Safety checks and warnings
- ✅ Return user path with template restore

**Testing Status:** Ready for QA  
**Deployment Status:** Ready for production  
**Documentation Status:** Complete  

---

**Last Updated:** 2024-11-20  
**Version:** 1.0  
**Implemented By:** Kilo Code