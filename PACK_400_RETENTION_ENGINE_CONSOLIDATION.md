# PACK 400 — Retention Engine Consolidation

**Status**: ✅ IMPLEMENTED  
**Type**: INTEGRATION LAYER (SAFE FIX PACK)  
**Dependencies**: PACK 301, PACK 301A, PACK 301B  

---

## Overview

PACK 400 provides a **unified integration layer** for the Avalo Retention Engine, consolidating the functionality of:

- **PACK 301**: Core retention profile management + user segmentation
- **PACK 301A**: Onboarding funnel tracking + automated events
- **PACK 301B**: Retention nudges + win-back sequences

This pack creates a single, canonical interface (`RetentionEngine`) so that any code that "depends on PACK 301" automatically gets access to all retention functionality without needing to import from multiple locations.

---

## 🚨 Safety Constraints

This is a **SAFE FIX PACK** with the following guarantees:

✅ **NO** new business logic  
✅ **NO** new tokenomics or pricing rules  
✅ **NO** new refund policies  
✅ **NO** Firestore schema changes  
✅ **NO** new collections  
✅ **NO** new cron jobs  
✅ **NO** deletion of existing PACK 301/301A/301B files  

This pack **ONLY**:
- Re-exports existing functions from PACK 301/301A/301B
- Provides type consolidation
- Offers improved developer experience

---

## Architecture

### File Structure

```
functions/src/pack301/
├── retentionEngine.ts         # Unified interface (main export)
└── retentionEngineTypes.ts    # Consolidated type exports
```

### Existing PACK 301/301A/301B Files (UNCHANGED)

```
functions/src/
├── pack301-retention-types.ts        # Core types
├── pack301-retention-service.ts      # Core service functions
├── pack301-onboarding.ts             # Onboarding funnel (301A)
├── pack301-nudges.ts                 # Nudges engine (301B)
├── pack301-winback.ts                # Win-back sequences (301B)
├── pack301-daily-churn.ts            # Daily churn recalc (301B)
├── pack301-activity-hook.ts          # Activity tracking (301B)
├── pack301-analytics.ts              # Retention analytics
└── pack301-retention-functions.ts    # Automation functions (301A)
```

---

## Usage

### Before (Multi-pack imports)

```typescript
// Old way - importing from multiple files
import { getUserRetentionProfile } from './pack301-retention-service';
import { trackOnboardingStage } from './pack301-onboarding';
import { startWinBackSequence } from './pack301-retention-service';
import { OnboardingStage, UserSegment } from './pack301-retention-types';
```

### After (Unified import)

```typescript
// New way - single import point
import { RetentionEngine } from './pack301/retentionEngine';
import { OnboardingStage, UserSegment } from './pack301/retentionEngineTypes';

// All functionality available through RetentionEngine
const profile = await RetentionEngine.getUserRetentionProfile(userId);
await RetentionEngine.updateUserActivity(userId, 'swipe');
await RetentionEngine.startWinBackSequence(userId);
```

---

## RetentionEngine API

The [`RetentionEngine`](functions/src/pack301/retentionEngine.ts) object provides the following functions:

### Core Profile Management

| Function | Description |
|----------|-------------|
| [`getUserRetentionProfile(userId)`](functions/src/pack301-retention-service.ts:27) | Get or create user retention profile |
| [`updateUserActivity(userId, activityType?)`](functions/src/pack301-retention-service.ts:72) | Update last active timestamp |
| [`updateOnboardingStage(userId, stage)`](functions/src/pack301-retention-service.ts:102) | Update onboarding progress |

### Churn Prediction & Scoring

| Function | Description |
|----------|-------------|
| [`calculateChurnRiskFactors(userId)`](functions/src/pack301-retention-service.ts:137) | Calculate churn risk factors |
| [`calculateChurnScore(factors)`](functions/src/pack301-retention-service.ts:173) | Calculate 0-1 churn score |
| [`calculateUserSegment(lastActiveAt, winBackStarted)`](functions/src/pack301-retention-service.ts:190) | Determine user segment |
| [`updateUserSegmentAndChurnScore(userId)`](functions/src/pack301-retention-service.ts:214) | Update segment and score |
| [`recalculateChurnScore(userId)`](functions/src/pack301-retention-service.ts:521) | Recalculate churn score |
| [`recalculateSegment(userId)`](functions/src/pack301-retention-service.ts:537) | Recalculate user segment |

### Activity Tracking

| Function | Description |
|----------|-------------|
| [`calculateActiveDays(userId, days)`](functions/src/pack301-retention-service.ts:265) | Calculate active days in N-day window |
| [`updateActiveDaysMetrics(userId)`](functions/src/pack301-retention-service.ts:291) | Update 7-day and 30-day metrics |
| [`recordActivity(userId, activityType, metadata?)`](functions/src/pack301-retention-service.ts:480) | Record activity and update profile |

### Win-Back Sequences

| Function | Description |
|----------|-------------|
| [`startWinBackSequence(userId)`](functions/src/pack301-retention-service.ts:311) | Start win-back sequence |
| [`markUserReturned(userId)`](functions/src/pack301-retention-service.ts:339) | Mark user as returned |
| [`markWinbackStepSent(userId, stepIndex)`](functions/src/pack301-retention-service.ts:646) | Mark win-back step sent |
| [`markWinbackCompleted(userId)`](functions/src/pack301-retention-service.ts:660) | Mark sequence completed |

### Batch Operations

| Function | Description |
|----------|-------------|
| [`getUsersForReengagement(segment, limit)`](functions/src/pack301-retention-service.ts:398) | Get users for re-engagement |
| [`getUsersForWinBack(step, limit)`](functions/src/pack301-retention-service.ts:414) | Get users for win-back |
| [`getIncompleteOnboardingUsers(limit)`](functions/src/pack301-retention-service.ts:431) | Get incomplete onboarding users |
| [`getUsersForRetentionSweep(batchSize, cursor?)`](functions/src/pack301-retention-service.ts:546) | Get users for retention sweep |
| [`getUsersForWinbackSweep(batchSize, cursor?)`](functions/src/pack301-retention-service.ts:580) | Get users for win-back sweep |
| [`getUsersForOnboardingNudges(batchSize, cursor?)`](functions/src/pack301-retention-service.ts:611) | Get users for onboarding nudges |

---

## Cloud Functions (Unchanged)

All Cloud Functions from PACK 301/301A/301B remain exported from [`index.ts`](functions/src/index.ts) with their original names:

### PACK 301A - Onboarding Functions
- `pack301_trackOnboardingStage`
- `pack301_getOnboardingProgress`
- `pack301_onPhotoUploaded`

### PACK 301A - Automation Functions
- `pack301a_logUserActivity`
- `pack301a_updateOnboardingStage`
- `pack301a_dailyRetentionSweep`
- `pack301a_dailyWinbackSweep`
- `pack301a_onboardingNudgeSweep`
- `pack301a_rebuildRetentionProfile`

### PACK 301B - Nudge Functions
- `pack301_evaluateUserNudges`
- `pack301_optOutFromNudges`
- `pack301_optInToNudges`

### PACK 301B - Win-Back Functions
- `pack301_dailyWinBackSequence`
- `pack301_markWinBackReturn`
- `pack301_getWinBackStatistics`
- `pack301_triggerWinBackMessage`

### PACK 301B - Daily Churn Functions
- `pack301_dailyChurnRecalculation`
- `pack301_triggerChurnRecalculation`
- `pack301_getChurnStatistics`

### PACK 301B - Activity Hook Functions
- `pack301_trackActivity`
- `pack301_onSwipeCreated`
- `pack301_onChatMessageCreated`
- `pack301_onTokenPurchaseCreated`
- `pack301_onCalendarBookingCreated`
- `pack301_onEventTicketCreated`
- `pack301_trackCallActivity`
- `pack301_batchUpdateActivities`
- `pack301_getActivitySummary`

### PACK 301 - Analytics Functions
- `pack301_aggregateRetentionMetrics`
- `pack301_dailyRetentionAnalytics`
- `pack301_getRetentionMetrics`
- `pack301_getSegmentDistribution`
- `pack301_getOnboardingFunnelMetrics`
- `pack301_getWinBackEffectiveness`

---

## Type Exports

All types are re-exported from [`retentionEngineTypes.ts`](functions/src/pack301/retentionEngineTypes.ts):

### Core Types (PACK 301)
- `OnboardingStage` - Enum for onboarding stages
- `UserSegment` - User segment type (`NEW`, `ACTIVE`, `DORMANT`, `CHURN_RISK`, `CHURNED`, `RETURNING`)
- `NudgeTrigger` - Nudge trigger types
- `UserRetentionProfile` - Main retention profile interface
- `RetentionNotificationType` - Notification types
- `NudgeTemplate` - Nudge template interface
- `RetentionEvent` - Retention event interface
- `RetentionMetrics` - Analytics metrics interface
- `ChurnRiskFactors` - Churn risk factors
- `WinBackMessage` - Win-back message template
- `RetentionAuditEvent` - Audit event interface
- `RETENTION_CONSTANTS` - Core constants
- `NUDGE_TEMPLATES` - Nudge templates
- `WIN_BACK_MESSAGES` - Win-back message templates

### Service Types (PACK 301A)
- `ActivityType` - Activity type enum
- `ActivityMetadata` - Activity metadata interface
- `RETENTION_THRESHOLDS` - Automation thresholds

---

## Migration Guide

### For New Code

Simply use the unified import:

```typescript
import { RetentionEngine } from './pack301/retentionEngine';
import { OnboardingStage, UserSegment } from './pack301/retentionEngineTypes';
```

### For Existing Code

**No migration required.** All existing imports continue to work:

```typescript
// Old imports still work
import { getUserRetentionProfile } from './pack301-retention-service';
import { OnboardingStage } from './pack301-retention-types';
```

Both approaches are valid. The unified interface is **optional** for cleaner imports in new code.

---

## Interpretation Note

**Important**: Any reference to "PACK 301" in older specifications, packs, or documentation should be interpreted as:

> **"PACK 301 + 301A + 301B via RetentionEngine"**

This consolidation ensures that dependencies on "PACK 301" automatically include:
- Core retention profile management
- Onboarding funnel tracking
- Nudges and win-back sequences

---

## Examples

### Example 1: Track User Activity

```typescript
import { RetentionEngine } from './pack301/retentionEngine';

// Update user activity after swipe
await RetentionEngine.updateUserActivity(userId, 'swipe');

// Or use the more detailed recordActivity
await RetentionEngine.recordActivity(userId, 'swipe', {
  platform: 'android',
  countryCode: 'US',
});
```

### Example 2: Onboarding Flow

```typescript
import { RetentionEngine } from './pack301/retentionEngine';
import { OnboardingStage } from './pack301/retentionEngineTypes';

// User adds their first photo
await RetentionEngine.updateOnboardingStage(userId, OnboardingStage.PHOTOS_ADDED);

// User sets preferences
await RetentionEngine.updateOnboardingStage(userId, OnboardingStage.PREFERENCES_SET);

// Get current progress
const profile = await RetentionEngine.getUserRetentionProfile(userId);
console.log(`User is at stage ${profile.onboardingStage}`);
```

### Example 3: Churn Management

```typescript
import { RetentionEngine } from './pack301/retentionEngine';

// Get user profile with churn info
const profile = await RetentionEngine.getUserRetentionProfile(userId);

if (profile.segment === 'CHURNED' && !profile.winBackSequenceStarted) {
  // Start win-back sequence
  await RetentionEngine.startWinBackSequence(userId);
}

// Later, when user returns
await RetentionEngine.markUserReturned(userId);
```

### Example 4: Batch Processing

```typescript
import { RetentionEngine } from './pack301/retentionEngine';

// Get dormant users for re-engagement campaign
const dormantUsers = await RetentionEngine.getUsersForReengagement('DORMANT', 100);

for (const user of dormantUsers) {
  // Send re-engagement message
  console.log(`User ${user.uid} has been dormant for ${user.riskOfChurn * 100}% churn risk`);
}
```

---

## Testing

No new testing is required as this pack only re-exports existing functionality. All existing tests for PACK 301/301A/301B continue to validate the underlying logic.

To verify the integration layer works:

```typescript
import { RetentionEngine } from './pack301/retentionEngine';

// Should work identically to:
// import { getUserRetentionProfile } from './pack301-retention-service';

const profile = await RetentionEngine.getUserRetentionProfile('test-user-id');
// Verify profile is returned correctly
```

---

## Deployment

### No Changes Required

- ✅ No new environment variables
- ✅ No new Firebase Functions to deploy
- ✅ No Firestore rules changes
- ✅ No database schema changes
- ✅ No cron job changes

Simply deploy the new TypeScript files:
- `functions/src/pack301/retentionEngine.ts`
- `functions/src/pack301/retentionEngineTypes.ts`

The next functions deployment will include these files automatically.

---

## Future Packs

Any future pack that needs to interact with the retention engine should use:

```typescript
/**
 * PACK XXX - Some Feature
 * Dependencies: PACK 400 (Retention Engine Consolidation)
 */

import { RetentionEngine } from './pack301/retentionEngine';
import { UserSegment, OnboardingStage } from './pack301/retentionEngineTypes';

// Use RetentionEngine for all retention operations
```

This ensures consistency across the codebase and makes dependencies explicit.

---

## Changelog

### Version 1.0 (2025-12-20)

- ✅ Created unified `RetentionEngine` interface
- ✅ Consolidated type exports in `retentionEngineTypes`
- ✅ Documented all existing functions from PACK 301/301A/301B
- ✅ Created comprehensive usage examples
- ✅ Established migration path (no breaking changes)

---

## Support

For questions or issues related to the retention engine, refer to:

- Original PACK 301 documentation (core retention logic)
- Original PACK 301A documentation (onboarding automation)
- Original PACK 301B documentation (nudges and win-back)
- This document (unified interface)

---

## Summary

PACK 400 provides a **zero-risk consolidation layer** that makes the retention engine easier to use without changing any underlying business logic. It's a pure integration pack that improves developer experience while maintaining full backward compatibility.

**Key Principle**: Any reference to "depends on PACK 301" now means "depends on PACK 301 + 301A + 301B via the unified RetentionEngine interface."
