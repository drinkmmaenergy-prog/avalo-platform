# PACK 67 — Remote Config Quick Reference

## 🚀 Quick Start

### Backend Setup

1. **Initialize Remote Config in Firestore:**
```bash
cd functions
npx ts-node src/scripts/initRemoteConfig.ts
```

2. **Deploy Functions:**
```bash
firebase deploy --only functions:getEffectiveConfig,functions:adminGetRemoteConfig,functions:adminGetExperimentAssignments
```

### Mobile Setup

1. **Initialize on App Start:**
```typescript
import { initRemoteConfig } from './services/remoteConfigService';
import { logExperimentExposuresFromSnapshot } from './services/analyticsService';

// In your app initialization
const snapshot = await initRemoteConfig(userId, country);
await logExperimentExposuresFromSnapshot(snapshot.experiments, userId, deviceId);
```

2. **Use Feature Flags:**
```typescript
import { getRemoteConfigSnapshot, getFeatureEnabled } from './services/remoteConfigService';

const snapshot = await getRemoteConfigSnapshot(userId);
const enabled = getFeatureEnabled(snapshot, 'dailyTasksV2', false);

if (enabled) {
  // New feature UI
} else {
  // Old feature UI
}
```

3. **Use Config Values:**
```typescript
import { getConfigValue } from './services/remoteConfigService';

const maxCards = getConfigValue(snapshot, 'discovery.maxSponsoredCardsPerPage', 3);
```

4. **Use Experiments:**
```typescript
import { getExperimentVariant } from './services/remoteConfigService';
import { logExperimentExposure } from './services/analyticsService';

const variant = getExperimentVariant(snapshot, 'onboarding_copy_test', 'control');
await logExperimentExposure('onboarding_copy_test', variant, userId, deviceId);

switch (variant) {
  case 'variantA':
    // Show variant A
    break;
  case 'variantB':
    // Show variant B
    break;
  default:
    // Show control
}
```

---

## 📋 API Endpoints

### GET `/getEffectiveConfig`
Fetch effective config for user/device.

**URL:** `https://europe-west3-avalo-f8f5a.cloudfunctions.net/getEffectiveConfig`

**Query Params:**
- `platform` (required): `android` | `ios` | `web`
- `deviceId` (required): Stable device ID
- `userId` (optional): User ID if authenticated
- `country` (optional): ISO country code
- `environment` (optional): `PROD` | `STAGE` (default: PROD)

**Example:**
```bash
curl "https://europe-west3-avalo-f8f5a.cloudfunctions.net/getEffectiveConfig?platform=android&deviceId=abc123&userId=user456"
```

**Response:**
```json
{
  "features": { "dailyTasksV2": true },
  "values": { "discovery.maxSponsoredCardsPerPage": 2 },
  "experiments": { "onboarding_copy_test": "variantA" }
}
```

---

## 🔧 Firestore Schema

### Collection: `remote_config`

**Document: `global`** (base defaults)
```json
{
  "configId": "global",
  "environment": "GLOBAL",
  "features": {
    "featureKey": {
      "enabled": true,
      "rollout": {
        "percentage": 100,
        "countries": ["US", "PL"],
        "platforms": ["android", "ios"]
      }
    }
  },
  "experiments": {
    "experiment_key": {
      "active": true,
      "description": "Test description",
      "variants": {
        "control": { "weight": 1 },
        "variant": { "weight": 1 }
      },
      "rollout": {
        "percentage": 100,
        "countries": null,
        "platforms": ["android", "ios"]
      }
    }
  },
  "values": {
    "section.parameterName": {
      "type": "number",
      "value": 42
    }
  },
  "updatedAt": "Timestamp"
}
```

**Document: `prod`** (production overrides)
**Document: `stage`** (staging overrides)

### Collection: `experiment_assignments`

**Auto-created on experiment assignment**
```json
{
  "assignmentId": "experiment_key_user123_1234567890",
  "experimentKey": "experiment_key",
  "variantKey": "variantA",
  "userId": "user123",
  "deviceId": "device456",
  "platform": "android",
  "assignedAt": "Timestamp"
}
```

---

## 📱 Mobile Service Functions

### Remote Config Service

```typescript
// Initialize
await initRemoteConfig(userId?, country?);

// Fetch (with cache)
const snapshot = await getRemoteConfigSnapshot(userId?, country?);

// Force refresh
const fresh = await refreshRemoteConfig(userId?, country?);

// Get device ID
const deviceId = await getDeviceId();

// Get platform
const platform = getPlatform(); // 'android' | 'ios'

// Check feature
const enabled = getFeatureEnabled(snapshot, 'featureKey', defaultValue);

// Get value
const value = getConfigValue(snapshot, 'section.key', defaultValue);

// Get experiment variant
const variant = getExperimentVariant(snapshot, 'experiment_key', 'control');

// Clear cache
await clearRemoteConfigCache(userIdOrDeviceId?);
```

### Analytics Service

```typescript
// Log single experiment exposure
await logExperimentExposure(experimentKey, variantKey, userId?, deviceId?);

// Log all experiments from snapshot
await logExperimentExposuresFromSnapshot(experiments, userId?, deviceId?);

// Upload pending exposures
await uploadPendingExperimentExposures();
```

---

## ✅ Common Patterns

### Pattern 1: Feature Flag with Fallback
```typescript
const snapshot = await getRemoteConfigSnapshot(userId);
const showNewUI = getFeatureEnabled(snapshot, 'newFeature', false);

// Use the flag
return showNewUI ? <NewFeatureUI /> : <OldFeatureUI />;
```

### Pattern 2: A/B Test with Analytics
```typescript
const snapshot = await getRemoteConfigSnapshot(userId);
const variant = getExperimentVariant(snapshot, 'button_color_test', 'control');

// Log exposure
await logExperimentExposure('button_color_test', variant, userId, deviceId);

// Use variant
const buttonColor = {
  control: '#007bff',
  variantA: '#28a745',
  variantB: '#dc3545',
}[variant];
```

### Pattern 3: Config-Driven Limits
```typescript
const snapshot = await getRemoteConfigSnapshot(userId);
const maxItems = getConfigValue(snapshot, 'ui.maxItemsPerPage', 10);

// Use in UI
const displayItems = allItems.slice(0, maxItems);
```

### Pattern 4: Platform-Specific Feature
```typescript
// In Firestore config
{
  "features": {
    "iosOnlyFeature": {
      "enabled": true,
      "rollout": {
        "platforms": ["ios"]
      }
    }
  }
}

// In app (automatically handled by backend)
const snapshot = await getRemoteConfigSnapshot(userId);
const enabled = getFeatureEnabled(snapshot, 'iosOnlyFeature', false);
// Will be false on Android, true on iOS
```

### Pattern 5: Gradual Rollout
```typescript
// Start: 5% rollout
{
  "features": {
    "newFeature": {
      "enabled": true,
      "rollout": { "percentage": 5 }
    }
  }
}

// Increase: 25% rollout
// (Update in Firestore)

// Full: 100% rollout
// (Update in Firestore)
```

---

## 🚫 What NOT to Do

### ❌ DO NOT use remote config for:
- Token prices
- Revenue splits (65/35)
- Boost pricing
- PPM media unlock prices
- Promotion impression costs
- Any form of discounts, free tokens, or economic benefits

### ❌ DO NOT:
- Store PII in config values
- Change pricing formulas remotely
- Override hardcoded economic constants
- Create "free trial" or "discount" flags

### ✅ DO use remote config for:
- UI/UX variations
- Copy/content tests
- Flow ordering
- Display limits (not pricing)
- Feature rollouts
- Non-economic behavior switches

---

## 🐛 Debugging

### Check Config in Console
```typescript
const snapshot = await getRemoteConfigSnapshot(userId);
console.log('Config snapshot:', JSON.stringify(snapshot, null, 2));
```

### Check Cache Age
```typescript
import { getCachedConfig } from './services/remoteConfigService';

const cached = await getCachedConfig(userIdOrDeviceId);
if (cached) {
  const ageHours = (Date.now() - cached.fetchedAt) / (1000 * 60 * 60);
  console.log(`Cache age: ${ageHours.toFixed(2)} hours`);
} else {
  console.log('No cache found');
}
```

### Force Refresh
```typescript
import { refreshRemoteConfig } from './services/remoteConfigService';

const fresh = await refreshRemoteConfig(userId);
console.log('Fresh config:', fresh);
```

### Check Experiment Assignments
```bash
# In Firestore console, query experiment_assignments collection
firebase firestore:get experiment_assignments --limit 10
```

### Verify Determinism
```typescript
// Same user should always get same result
const snapshot1 = await getRemoteConfigSnapshot('user123');
const snapshot2 = await getRemoteConfigSnapshot('user123');
console.assert(
  JSON.stringify(snapshot1) === JSON.stringify(snapshot2),
  'Same user should get identical config'
);
```

---

## 📊 Monitoring

### Key Metrics
1. **Config Fetch Success Rate**: Monitor API errors
2. **Cache Hit Rate**: Check how often cache is used
3. **Experiment Distribution**: Verify variant percentages
4. **Assignment Logs**: Count experiment_assignments docs

### Firestore Queries
```javascript
// Count assignments per variant
db.collection('experiment_assignments')
  .where('experimentKey', '==', 'onboarding_copy_test')
  .get()
  .then(snapshot => {
    const counts = {};
    snapshot.forEach(doc => {
      const variant = doc.data().variantKey;
      counts[variant] = (counts[variant] || 0) + 1;
    });
    console.log('Variant distribution:', counts);
  });
```

---

## 🔄 Update Process

### To Add a New Feature Flag:
1. Add to `remote_config/global` or `remote_config/prod` in Firestore
2. Set `enabled` and optional `rollout` rules
3. Deploy (no code changes needed)
4. Use in app with `getFeatureEnabled()`

### To Add a New Experiment:
1. Add to `experiments` in config document
2. Define variants with weights
3. Set `active: true` and rollout rules
4. Deploy (no code changes needed)
5. Use in app with `getExperimentVariant()`
6. Log exposures with `logExperimentExposure()`

### To Add a New Config Value:
1. Add to `values` in config document
2. Set type and value
3. Deploy (no code changes needed)
4. Use in app with `getConfigValue()`

---

## 📞 Support

### Common Issues

**Q: Config not updating?**
- Check cache age (max 12 hours)
- Force refresh with `refreshRemoteConfig()`
- Clear cache with `clearRemoteConfigCache()`

**Q: Wrong variant assigned?**
- Assignment is deterministic based on userId/deviceId
- Verify config has correct weights
- Check rollout percentage and targeting

**Q: Feature disabled unexpectedly?**
- Check platform targeting
- Check country targeting
- Verify rollout percentage includes user's hash

**Q: Analytics not logging?**
- Check that `logExperimentExposure()` is called
- Verify network connectivity
- Check `experiment_exposures_pending` in AsyncStorage

---

## 🎉 That's It!

You're now ready to use remote config, feature flags, and experiments in Avalo.

**Remember:**
- ✅ Safe for UX/UI changes
- ✅ Fully deterministic
- ✅ Privacy-compliant
- ✅ No pricing changes possible
- ✅ Cached for performance

For full details, see: `PACK_67_REMOTE_CONFIG_IMPLEMENTATION.md`