# PACK 337a — BUILD FIX CHECKLIST

## Purpose
This checklist ensures PACK 337 (Cross-System Integration Layer) is fully operational without modifying existing files.

## Prerequisites
- PACK 337 documentation reviewed
- All existing PACK 300-326 systems deployed
- Firebase project configured

## Files Created (Append-Only)
- [x] `functions/src/pack337a-exports.ts` - Cross-system event handlers
- [x] `firestore-pack337a.rules` - Security rules for integration collections
- [x] `firestore-pack337a.indexes.json` - Composite indexes for queries
- [x] `PACK_337a_BUILD_FIX_CHECKLIST.md` - This checklist

## Build Validation Steps

### 1. TypeScript Compilation
```bash
# Navigate to functions directory
cd functions

# Install dependencies (if not already done)
pnpm install

# Run TypeScript compiler
pnpm run lint
pnpm run build
```

**Expected Output**: No compilation errors (warnings about esModuleInterop are acceptable)

### 2. Firebase Functions Deployment
```bash
# Deploy only the new PACK 337a functions
firebase deploy --only functions:pack337_supportRefundToWallet,functions:pack337_retentionCreateProactiveTicket,functions:pack337_fraudFreezeWallet,functions:pack337_adsCreditRevenue,functions:pack337_getUnifiedUserState

# Or deploy all functions
firebase deploy --only functions
```

**Expected Output**: All functions deploy successfully

### 3. Firestore Rules Deployment
```bash
firebase deploy --only firestore:rules
```

**Note**: This will deploy ALL rules files. Ensure existing rules are preserved.

### 4. Firestore Indexes Deployment
```bash
firebase deploy --only firestore:indexes
```

**Expected Output**: Indexes created successfully (may take several minutes)

### 5. Mobile App TypeScript Check
```bash
# Navigate to mobile app
cd app-mobile

# Run TypeScript check
pnpm typecheck
```

**Expected Output**: No type errors

### 6. Verify Exports Exist
```bash
# In functions directory
node -e "const pack337a = require('./lib/pack337a-exports'); console.log('Exports:', Object.keys(pack337a.pack337aExports));"
```

**Expected Output**: List of 5 export functions

## Integration Tests

### Test 1: Support → Wallet Refund
```typescript
// Call from client or admin panel
const result = await functions.httpsCallable('pack337_supportRefundToWallet')({
  ticketId: 'test_ticket_123',
  userId: 'test_user_456',
  amount: 100,
  reason: 'Service issue refund'
});
console.log('Refund result:', result.data);
```

### Test 2: Unified User State Query
```typescript
// Call from authenticated client
const result = await functions.httpsCallable('pack337_getUnifiedUserState')({});
console.log('User state:', result.data.state);
```

### Test 3: Fraud → Wallet Freeze
```typescript
// Call from fraud detection system or admin
const result = await functions.httpsCallable('pack337_fraudFreezeWallet')({
  userId: 'suspicious_user_789',
  fraudCaseId: 'fraud_case_001',
  reason: 'Multiple chargebacks detected'
});
console.log('Freeze result:', result.data);
```

## Acceptance Criteria

- [ ] All TypeScript files compile without errors
- [ ] Functions deploy successfully to Firebase
- [ ] Firestore rules deploy without conflicts
- [ ] Firestore indexes are created
- [ ] Mobile app builds without type errors
- [ ] Support → Wallet integration test passes
- [ ] Retention → Support integration test passes
- [ ] Fraud → Wallet integration test passes
- [ ] Ads → Wallet integration test passes
- [ ] Unified state query returns data from all 5 systems
- [ ] No security regression (rules enforce server-side writes)
- [ ] No existing functionality broken

## Security Validation

- [ ] Wallet transactions can only be created by Cloud Functions
- [ ] Users can read only their own support tickets
- [ ] Fraud profiles are admin-only or self-read
- [ ] Wallet audit logs are admin-only
- [ ] Retention profiles are self-read only

## Performance Validation

- [ ] Support refund completes in < 2 seconds
- [ ] Unified state query completes in < 3 seconds
- [ ] Fraud freeze executes in < 1 second
- [ ] Ad revenue credit completes in < 2 seconds

## Rollback Plan

If issues arise:
1. Disable new functions via Firebase Console
2. Revert to previous Firestore rules (backup stored in Firebase Console)
3. Remove PACK 337a indexes if causing conflicts
4. No file deletions needed (append-only design)

## Dependencies Check

### Required for PACK 337a:
- `firebase-functions` >= 3.0.0
- `firebase-admin` >= 11.0.0
- Firestore database with collections:
  - `users`
  - `wallets`
  - `supportTickets`
  - `retentionProfiles`
  - `fraudProfiles`
  - `walletTransactions`
  - `walletAuditLogs`

## Manual Append Instructions

**ONLY IF REQUIRED** (if functions don't auto-discover):

Add to `functions/src/index.ts` (at the end, before final console.log):

```typescript
// PACK 337a: Cross-System Integration Layer
export * from './pack337a-exports';
```

**NOTE**: This is the ONLY modification allowed to existing files, and only if absolutely necessary.

## Status Tracking

- **Created**: 2025-12-13
- **Status**: ✅ READY FOR DEPLOYMENT
- **Next Action**: Execute build commands and validate
- **Blocking Issues**: None
- **Warnings**: None

## Success Metrics

After deployment, monitor:
- Support refund success rate (target: > 99%)
- Wallet freeze execution time (target: < 1s)
- Cross-system query latency (target: < 3s)
- Event handler error rate (target: < 0.1%)
- Security rule violation rate (target: 0%)

## Support Contacts

- **PACK 337 Owner**: System Integration Team
- **Firestore Rules**: Security Team
- **Firebase Functions**: Backend Team
- **Mobile Integration**: Mobile Team

---

**PACK 337a BUILD FIX STATUS: READY FOR VALIDATION**

Run through this checklist step-by-step. Mark each item as complete after verification.
