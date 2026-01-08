# PACK 99 — Feature Flags, Remote Config & Safe Experimentation

## Implementation Status: ✅ COMPLETE

**Date**: 2025-11-26  
**Version**: 1.0  
**Status**: Production Ready

---

## Overview

PACK 99 introduces a comprehensive feature flag and remote configuration system for Avalo, enabling:

- **Gradual Rollouts**: Roll out features to subsets of users by region, platform, risk tier, etc.
- **Safe Experimentation**: Run A/B tests on UX and non-financial logic
- **Dynamic Configuration**: Adjust non-monetary parameters without deployments
- **Segment Targeting**: Target specific user segments with precision

### Non-Negotiable Rules ⚠️

This system operates under strict constraints to protect tokenomics:

1. ❌ **Cannot change token prices** via flags or config
2. ❌ **Cannot change revenue split** (always 65% creator / 35% Avalo)
3. ❌ **Cannot introduce** free tokens, discounts, promo codes, cashback, or bonuses
4. ✅ **Can control**: Feature availability, UI behavior, non-monetary thresholds, experimentation parameters

---

## Architecture

### Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                    PACK 99 Architecture                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐      ┌──────────────┐                     │
│  │   Admin UI   │─────▶│   Validation │                     │
│  │   (Web)      │      │    Layer     │                     │
│  └──────────────┘      └──────┬───────┘                     │
│                                │                              │
│                                ▼                              │
│                    ┌─────────────────────┐                   │
│                    │   Admin Functions   │                   │
│                    │  - Create/Update    │                   │
│                    │  - List/Get         │                   │
│                    └──────────┬──────────┘                   │
│                               │                               │
│                               ▼                               │
│                    ┌─────────────────────┐                   │
│                    │    Firestore DB     │                   │
│                    │  - feature_flags    │                   │
│                    │  - remote_config_   │                   │
│                    │    params           │                   │
│                    └──────────┬──────────┘                   │
│                               │                               │
│          ┌────────────────────┼────────────────────┐         │
│          │                    │                    │         │
│          ▼                    ▼                    ▼         │
│  ┌─────────────┐     ┌──────────────┐    ┌──────────────┐  │
│  │  Evaluation │     │    Client    │    │ Integration  │  │
│  │   Engine    │     │   Callable   │    │   Helpers    │  │
│  │             │     │   Function   │    │              │  │
│  └─────────────┘     └──────┬───────┘    └──────────────┘  │
│                              │                               │
│                              ▼                               │
│                    ┌─────────────────────┐                  │
│                    │   Mobile Service    │                  │
│                    │   - Cache Layer     │                  │
│                    │   - React Hooks     │                  │
│                    └─────────────────────┘                  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Implementation Files

### Backend (Cloud Functions)

| File | Purpose | Lines |
|------|---------|-------|
| [`functions/src/pack99-types.ts`](functions/src/pack99-types.ts) | TypeScript type definitions | 154 |
| [`functions/src/pack99-featureConfig.ts`](functions/src/pack99-featureConfig.ts) | Core evaluation engine | 401 |
| [`functions/src/pack99-validation.ts`](functions/src/pack99-validation.ts) | Tokenomics protection validation | 434 |
| [`functions/src/pack99-admin.ts`](functions/src/pack99-admin.ts) | Admin Cloud Functions | 461 |
| [`functions/src/pack99-client.ts`](functions/src/pack99-client.ts) | Client-facing API | 207 |
| [`functions/src/pack99-integrations.ts`](functions/src/pack99-integrations.ts) | Integration examples | 317 |

### Mobile Client

| File | Purpose | Lines |
|------|---------|-------|
| [`app-mobile/lib/featureConfigService.ts`](app-mobile/lib/featureConfigService.ts) | Mobile service with caching | 322 |

### Security

| File | Purpose |
|------|---------|
| [`firestore-rules/pack99-security.rules`](firestore-rules/pack99-security.rules) | Firestore security rules |

---

## Data Model

### Feature Flags

```typescript
interface FeatureFlag {
  id: string;                    // e.g., "discovery_v2_enabled"
  description: string;           // Human-readable description
  type: 'BOOLEAN' | 'MULTIVARIANT';
  variants: Record<string, any>; // { on: true, off: false } or multi-variant
  defaultVariant: string;        // e.g., "off"
  rules: TargetingRule[];        // Targeting rules (priority-ordered)
  safeScope: SafeScope[];        // ['UX', 'DISCOVERY_WEIGHTS', etc.]
  updatedAt: Timestamp;
  createdAt: Timestamp;
}
```

### Remote Config Parameters

```typescript
interface RemoteConfigParam {
  id: string;                    // e.g., "discovery_weight_engagement"
  description: string;
  type: 'NUMBER' | 'STRING' | 'BOOLEAN' | 'JSON';
  defaultValue: any;
  rules: TargetingRule[];
  safeScope: SafeScope[];
  updatedAt: Timestamp;
  createdAt: Timestamp;
}
```

### Targeting Rules

```typescript
interface TargetingRule {
  id: string;
  priority: number;              // Lower = evaluated first
  segmentName?: string;          // Optional label
  conditions: {
    countries?: string[];        // ISO country codes
    platforms?: ('android' | 'ios' | 'web')[];
    minAppVersion?: string;
    maxAppVersion?: string;
    enforcementLevels?: ('NONE' | 'SOFT_LIMIT' | 'HARD_LIMIT' | 'SUSPENDED')[];
    trustScoreMax?: number;
    trustScoreMin?: number;
    rolloutPercent?: number;     // 0-100 (deterministic per userId)
  };
  variant: string;               // Variant key from flag/param
}
```

---

## API Reference

### Admin Functions (Callable)

#### `admin_listFeatureFlags()`
List all feature flags with metadata.

**Returns:**
```typescript
{
  success: boolean;
  flags: Array<{
    id: string;
    description: string;
    type: string;
    defaultVariant: string;
    rulesCount: number;
    safeScope: string[];
    updatedAt: Timestamp;
    createdAt: Timestamp;
  }>;
  count: number;
}
```

#### `admin_getFeatureFlag({ key })`
Get full details of a specific feature flag.

**Parameters:**
- `key` (string): Feature flag ID

**Returns:**
```typescript
{
  success: boolean;
  flag: FeatureFlag;
}
```

#### `admin_createOrUpdateFeatureFlag(payload)`
Create or update a feature flag.

**Parameters:**
```typescript
{
  id: string;
  description: string;
  type: 'BOOLEAN' | 'MULTIVARIANT';
  variants: Record<string, any>;
  defaultVariant: string;
  rules?: TargetingRule[];
  safeScope: SafeScope[];
}
```

**Validation:**
- ✅ Key format validation
- ✅ Forbidden keyword detection
- ✅ Safe scope enforcement
- ✅ Audit logging

#### `admin_listRemoteConfigParams()`
List all remote config parameters.

#### `admin_getRemoteConfigParam({ key })`
Get full details of a specific parameter.

#### `admin_createOrUpdateRemoteConfigParam(payload)`
Create or update a remote config parameter.

#### `admin_clearConfigCache()`
Clear server-side config cache (forces fresh reads).

---

### Client Functions (Callable)

#### `getClientFeatureConfigBundle({ userId?, platform, appVersion, countryCode? })`
Fetch complete config bundle for mobile client.

**Parameters:**
- `userId` (string, optional): User ID for auth flow
- `platform` (string, required): 'android' | 'ios' | 'web'
- `appVersion` (string, required): App version (semantic)
- `countryCode` (string, optional): ISO country code

**Returns:**
```typescript
{
  success: boolean;
  bundle: {
    flags: Record<string, any>;    // Evaluated flag values
    params: Record<string, any>;   // Evaluated param values
    fetchedAt: number;             // Timestamp
  };
}
```

**Whitelisted Flags:**
- `discovery_v2_enabled`
- `new_onboarding_flow`
- `contextual_help_experiment`
- `2fa_recommended_banner`
- `notifications_batching_enabled`
- `nsfw_discovery_filter_mode`
- `advanced_analytics_ui`
- `profile_verification_prompt`
- `safety_tips_variant`

**Whitelisted Params:**
- `discovery_weight_profileCompleteness`
- `discovery_weight_engagement`
- `discovery_weight_monetization`
- `discovery_weight_riskPenalty`
- `discovery_maxResultsPerPage`
- `onboarding_steps_version`
- `notifications_experiments_variant`
- `stepUpStrongAuthWindowMinutes`
- `nsfw_discovery_filter_mode`
- `help_center_entry_points`

---

## Mobile Integration

### Initialization

```typescript
import { featureConfigService } from './lib/featureConfigService';

// At app startup (e.g., in App.tsx)
await featureConfigService.initialize(userId, countryCode);
```

### Using Feature Flags

```typescript
// Direct access
const isV2Enabled = featureConfigService.getFlag('discovery_v2_enabled', false);

// Shorthand for boolean flags
const isEnabled = featureConfigService.isFeatureEnabled('new_onboarding_flow');

// React hook
import { useFeatureFlag, useIsFeatureEnabled } from './lib/featureConfigService';

function MyComponent() {
  const isV2 = useIsFeatureEnabled('discovery_v2_enabled');
  const variant = useFeatureFlag('onboarding_variant', 'v1');
  
  return isV2 ? <NewDiscovery /> : <LegacyDiscovery />;
}
```

### Using Remote Config

```typescript
// Direct access
const maxResults = featureConfigService.getParam<number>(
  'discovery_maxResultsPerPage',
  20
);

// React hook
import { useRemoteConfigParam } from './lib/featureConfigService';

function DiscoveryScreen() {
  const weights = useRemoteConfigParam('discovery_ranking_weights', {
    engagement: 1.5,
    monetization: 0.8,
  });
  
  // Use weights in ranking algorithm
}
```

### Refreshing Config

```typescript
// Refresh periodically (e.g., every 4 hours)
useEffect(() => {
  const interval = setInterval(() => {
    featureConfigService.refresh(userId, countryCode);
  }, 4 * 60 * 60 * 1000);
  
  return () => clearInterval(interval);
}, [userId, countryCode]);
```

---

## Backend Integration Examples

### Discovery Engine (PACK 94)

```typescript
import { getDiscoveryRankingWeights, shouldUseDiscoveryV2 } from './pack99-integrations';

async function rankProfiles(userId: string, profiles: Profile[]) {
  const useV2 = await shouldUseDiscoveryV2(userId);
  
  if (!useV2) {
    return legacyRanking(profiles);
  }
  
  const weights = await getDiscoveryRankingWeights(userId);
  return rankWithWeights(profiles, weights);
}
```

### Onboarding (PACK 98)

```typescript
import { getOnboardingVariant, getOnboardingSteps } from './pack99-integrations';

async function getOnboardingFlow(userId: string) {
  const variant = await getOnboardingVariant(userId);
  const steps = await getOnboardingSteps(userId);
  
  return {
    variant,
    steps,
    config: getVariantConfig(variant),
  };
}
```

### Security (PACK 96)

```typescript
import { getStrongAuthWindowMinutes, shouldShow2FABanner } from './pack99-integrations';

async function check2FARequirements(userId: string) {
  const windowMinutes = await getStrongAuthWindowMinutes(userId);
  const showBanner = await shouldShow2FABanner(userId);
  
  return {
    windowMinutes,
    showBanner,
  };
}
```

---

## Validation & Security

### Tokenomics Protection

The validation layer prevents any config that could affect tokenomics:

**Forbidden Keywords:**
- `token_price`, `price_per_token`, `token_cost`
- `revenue_split`, `revenue_share`, `creator_split`, `platform_split`
- `free_tokens`, `bonus_tokens`, `token_bonus`
- `discount`, `promo_code`, `cashback`
- `token_gift`, `token_grant`
- `price_override`, `cost_override`, `split_override`
- `token_multiplier`, `price_multiplier`

**Safe Scopes:**
- ✅ `UX` - UI/UX behavior
- ✅ `DISCOVERY_WEIGHTS` - Ranking parameters
- ✅ `SAFETY_UI` - Safety feature toggles
- ✅ `ONBOARDING` - Onboarding variants
- ✅ `NOTIFICATIONS` - Notification behavior
- ✅ `HELP_CENTER` - Help system config
- ✅ `SECURITY_UI` - Security UI elements
- ✅ `ANALYTICS` - Analytics features
- ✅ `EXPERIMENTAL` - Experiments

**Firestore Rules:**
All collections are protected:
- ❌ No direct client reads
- ❌ No direct client writes
- ✅ All access via Cloud Functions with admin auth

---

## Testing Examples

### Creating a Feature Flag

```typescript
// Via Cloud Function
const result = await admin_createOrUpdateFeatureFlag({
  id: 'discovery_v2_enabled',
  description: 'Enable discovery ranking v2 algorithm',
  type: 'BOOLEAN',
  variants: {
    on: true,
    off: false,
  },
  defaultVariant: 'off',
  rules: [
    {
      id: 'rule_1',
      priority: 1,
      segmentName: 'US iOS Users',
      conditions: {
        countries: ['US'],
        platforms: ['ios'],
        rolloutPercent: 10,
      },
      variant: 'on',
    },
  ],
  safeScope: ['DISCOVERY_WEIGHTS'],
});
```

### Creating a Remote Config Parameter

```typescript
const result = await admin_createOrUpdateRemoteConfigParam({
  id: 'discovery_weight_engagement',
  description: 'Weight for engagement score in ranking',
  type: 'NUMBER',
  defaultValue: 1.5,
  rules: [
    {
      id: 'rule_1',
      priority: 1,
      segmentName: 'High Trust Users',
      conditions: {
        trustScoreMin: 80,
      },
      variant: 2.0, // Higher weight for high trust users
    },
  ],
  safeScope: ['DISCOVERY_WEIGHTS'],
});
```

### Testing Evaluation

```typescript
import { buildTestContext } from './pack99-integrations';
import { getFeatureFlagValue } from './pack99-featureConfig';

// Test with specific context
const context = buildTestContext({
  userId: 'test_user_123',
  countryCode: 'US',
  platform: 'ios',
  appVersion: '1.2.0',
  trustScore: 85,
});

const isEnabled = await getFeatureFlagValue('discovery_v2_enabled', context);
console.log('Feature enabled:', isEnabled);
```

---

## Best Practices

### 1. Gradual Rollouts

Start with small percentages and increase gradually:

```typescript
// Week 1: 5% rollout
rolloutPercent: 5

// Week 2: 10% rollout
rolloutPercent: 10

// Week 3: 25% rollout
rolloutPercent: 25

// Week 4: 50% rollout
rolloutPercent: 50

// Week 5: 100% rollout
rolloutPercent: 100
```

### 2. Priority-Based Rules

Lower priority = evaluated first:

```typescript
rules: [
  {
    id: 'admin_override',
    priority: 1,  // Checked first
    conditions: { /* admin criteria */ },
    variant: 'on',
  },
  {
    id: 'regional_rollout',
    priority: 10, // Checked second
    conditions: { countries: ['US'] },
    variant: 'on',
  },
  {
    id: 'general_rollout',
    priority: 100, // Checked last
    conditions: { rolloutPercent: 10 },
    variant: 'on',
  },
]
```

### 3. Safe Defaults

Always provide safe fallback values:

```typescript
// Backend
const maxResults = await getRemoteConfigValue<number>(
  'discovery_maxResultsPerPage',
  context
) || 20; // Safe default

// Mobile
const isEnabled = featureConfigService.getFlag('new_feature', false); // Default to off
```

### 4. Monitoring

Log exposure events for analytics:

```typescript
// Automatically logged by evaluation engine
await logFeatureExposure(userId, featureKey, variant, context);
```

### 5. Cache Management

Clear cache after updates:

```typescript
// After admin update
await admin_clearConfigCache();
```

---

## Performance

### Caching Strategy

1. **Server-side**: 5-minute memory cache
2. **Client-side**: 4-hour AsyncStorage cache
3. **Evaluation**: O(n) where n = number of rules (typically < 10)

### Deterministic Rollout

Uses SHA-256 hashing for consistent user assignment:
- Same user always gets same variant
- No database lookups needed
- Instant evaluation

---

## Audit Trail

All configuration changes are logged:

```typescript
{
  logId: string;
  timestamp: Timestamp;
  adminId: string;
  adminEmail: string;
  targetType: 'FEATURE_FLAG' | 'REMOTE_CONFIG';
  targetId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  severity: 'INFO';
  before: any;  // Previous state
  after: any;   // New state
  reason: string;
}
```

---

## Deployment Checklist

- [x] Backend types defined
- [x] Evaluation engine implemented
- [x] Validation layer active
- [x] Admin functions deployed
- [x] Client functions deployed
- [x] Mobile service integrated
- [x] Firestore rules deployed
- [x] Integration examples documented
- [x] Audit logging configured

---

## Future Enhancements

1. **Web Admin Dashboard**: Visual editor for flags/params
2. **Analytics Integration**: Automatic experiment analysis
3. **Scheduled Rollouts**: Auto-increase rollout percentage
4. **Dependency Management**: Flag dependencies and prerequisites
5. **Kill Switch**: Emergency flag disabling

---

## Support

For issues or questions:
- Review integration examples in [`pack99-integrations.ts`](functions/src/pack99-integrations.ts)
- Check audit logs for configuration history
- Consult PACK 88 for admin authentication details

---

## Summary

PACK 99 provides a production-ready feature flag and remote config system with strict tokenomics protection. The system enables safe experimentation and gradual rollouts while maintaining the integrity of Avalo's pricing and revenue model.

**Key Features:**
- ✅ Deterministic, consistent evaluation
- ✅ Region and segment targeting
- ✅ Tokenomics protection validation
- ✅ Complete audit trail
- ✅ Mobile-optimized caching
- ✅ React hooks for easy integration
- ✅ Comprehensive documentation

**Implementation Complete**: 2025-11-26