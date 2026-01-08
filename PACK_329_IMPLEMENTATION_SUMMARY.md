# PACK 329 — Regional Regulation Toggles & Content Policy Matrix

**Status:** ✅ COMPLETE  
**Compliance Layer:** Mobile + Web  
**Zero Tokenomics Changes:** No pricing, splits, or revenue changes

---

## 🎯 Goal

Introduce a single, central policy engine that:

- ✅ Complies with App Store, Google Play, EU, USA, and RoW regulations
- ✅ Enforces different levels of allowed content (especially erotic) depending on:
  - Region (country/store)
  - Platform (mobile vs web)
  - Context (feed, chat, calls, AI, events)
- ✅ Consistent with Avalo principles:
  - 18+ only platform
  - Dating + flirting + romance + adult sexuality allowed
  - Zero politics / religious flame wars
  - Hard NO: minors, child sexual content, violence, hate speech

---

## 📋 Implementation Summary

### 1. Firestore Collections

#### `contentPolicies`
- **Document:** `GLOBAL_POLICY_MATRIX`
- Central policy configuration with regional and platform-specific rules
- Public read access for all users/systems
- Admin-only write access

#### `policyViolations`
- Tracks content that violated policies
- Records violation type, surface, region, platform, severity
- Used for moderation and trust scoring

#### `contentWarnings`
- Tracks warnings issued to users
- Three levels: SOFT_WARNING, HARD_WARNING, FINAL_WARNING
- Escalating enforcement based on repeat violations

#### `userPolicySettings`
- User-specific policy preferences within allowed bounds
- Stores user's region preference

#### `regionalContentReports`
- User-submitted reports of policy violations
- Creates moderation queue entries for review

### 2. Policy Configuration

Current baseline (ALL regions):
```typescript
{
  mobileProfileNudity: "SOFT_EROTIC_ONLY",  // bikini, lingerie, buttocks
  webProfileNudity: "SOFT_EROTIC_ONLY",      // same as mobile for now
  chatAllowedErotic: true,                    // sexting allowed between adults
  explicitPornMediaAllowed: false,            // no hardcore porn anywhere
}
```

Common restrictions (ALL regions):
```typescript
{
  minAge: 18,
  politicalContentAllowed: false,
  religiousDebatesAllowed: false,
  hateSpeechAllowed: false,
  selfHarmContentAllowed: false,
  childSexualContentAllowed: false,
  bestialityAllowed: false,
  violenceGlorificationAllowed: false,
}
```

Platform flags:
```typescript
mobile: {
  allowExplicitPorn: false,              // App Store compliant
  allowEroticRoleplayInChat: true,       // Private adult content OK
  allowNudityInFeed: false,              // Public feed stays clean
  allowNudityInPrivateChat: true,        // Private = adult OK
}
web: {
  allowExplicitPorn: false,              // Current safe baseline
  allowEroticRoleplayInChat: true,
  allowNudityInFeed: false,
  allowNudityInPrivateChat: true,
}
```

### 3. Core Libraries

#### `app-mobile/lib/policy/contentPolicy.ts`
**Central policy resolver** (626 lines)

Key functions:
- `getRegionFromCountryCode()` - Determine EU/US/RoW
- `getUserRegion()` - Get user's region from profile
- `loadContentPolicy()` - Load policy matrix with caching
- `isEroticMediaAllowedInContext()` - Check if erotic content allowed
- `isExplicitPornAllowedInContext()` - Check if porn allowed
- `isPoliticalContentAllowed()` - Check political content
- `recordPolicyViolation()` - Record violations
- `issueContentWarning()` - Issue warnings
- `validateContent()` - Validate before upload

#### `app-mobile/lib/policy/policyEnforcement.ts`
**Surface-specific enforcement** (622 lines)

Enforcement functions:
- `validateProfileMedia()` - Profile/gallery upload validation
- `validateFeedContent()` - Feed post validation (more restrictive)
- `validateChatContent()` - Chat message validation (permissive for adults)
- `validateAIContent()` - AI companion prompt validation
- `validateEventContent()` - Event description validation
- `recordAndEnforceViolation()` - Record + auto-actions

### 4. Cloud Functions

#### `functions/src/pack329-policy-endpoints.ts`
**Backend enforcement layer** (471 lines)

Endpoints:
- `pack329_validateContent` - Pre-upload validation
- `pack329_getPolicy` - Get effective policy for user
- `pack329_reportViolation` - Report policy violations
- `pack329_getViolations` - Get violation history
- `pack329_admin_updatePolicy` - Update policy (admin only)
- `pack329_admin_seedPolicy` - Initialize policy (admin only, run once)

#### `functions/src/pack329-seed-policy.ts`
**Policy initialization** (147 lines)

Functions:
- `seedContentPolicy()` - Seed initial policy
- `updateRegionalPolicy()` - Update specific region
- `updatePlatformFlags()` - Update platform settings
- `getCurrentPolicy()` - Get current policy

### 5. Firestore Rules & Indexes

#### Rules (`firestore-pack329-content-policy.rules`)
- Public read access to policy configuration
- Authenticated users can create violation reports
- Admin-only policy updates
- User can view own violations and warnings

#### Indexes (`firestore-pack329-content-policy.indexes.json`)
- Violations by userId + timestamp
- Violations by type + region + timestamp
- Warnings by userId + timestamp
- Reports by targetUserId + timestamp

---

## 🚀 Deployment Steps

### 1. Deploy Firestore Rules
```bash
firebase deploy --only firestore:rules
```

### 2. Deploy Firestore Indexes
```bash
firebase deploy --only firestore:indexes
```

### 3. Deploy Cloud Functions
```bash
cd functions
npm run build
firebase deploy --only functions:pack329_validateContent,functions:pack329_getPolicy,functions:pack329_reportViolation,functions:pack329_getViolations,functions:pack329_admin_updatePolicy,functions:pack329_admin_seedPolicy
```

### 4. Seed Initial Policy (Admin Only, Run Once)
```typescript
// Call from admin panel or Firebase Console
const result = await functions.httpsCallable('pack329_admin_seedPolicy')();
console.log(result.data);
```

### 5. Verify Policy Configuration
```typescript
// From any authenticated client
const policy = await functions.httpsCallable('pack329_getPolicy')();
console.log('My region:', policy.data.region);
console.log('Policy:', policy.data.policy);
```

---

## 📱 Mobile Integration Examples

### Example 1: Validate Profile Photo Upload
```typescript
import { validateProfileMedia } from '@/lib/policy/policyEnforcement';

async function uploadProfilePhoto(imageUrl: string) {
  const validation = await validateProfileMedia({
    userId: currentUser.uid,
    mediaUrl: imageUrl,
    mediaType: 'IMAGE',
    platform: 'MOBILE',
    isGallery: false,
  });

  if (!validation.allowed) {
    Alert.alert('Content Policy', validation.reason);
    
    if (validation.requiresWarning) {
      // Issue warning to user
      await issueProfileMediaWarning({
        userId: currentUser.uid,
        surface: 'PROFILE',
        violationType: validation.violationType!,
        warningType: validation.warningType!,
      });
    }
    
    return;
  }

  // Upload allowed, proceed
  await uploadImage(imageUrl);
}
```

### Example 2: Validate Feed Post
```typescript
import { validateFeedContent } from '@/lib/policy/policyEnforcement';

async function createFeedPost(text: string, imageUrls: string[]) {
  const validation = await validateFeedContent({
    userId: currentUser.uid,
    contentType: imageUrls.length > 0 ? 'IMAGE' : 'TEXT',
    text,
    mediaUrls: imageUrls,
    platform: 'MOBILE',
  });

  if (!validation.allowed) {
    Alert.alert('Content Policy', validation.reason);
    
    if (validation.autoFlag) {
      // Auto-flagged for moderation
      console.warn('Content auto-flagged:', validation.violationType);
    }
    
    return;
  }

  // Post allowed, proceed
  await createPost({ text, images: imageUrls });
}
```

### Example 3: Validate Chat Message
```typescript
import { validateChatContent } from '@/lib/policy/policyEnforcement';

async function sendChatMessage(recipientId: string, text: string) {
  const validation = await validateChatContent({
    senderId: currentUser.uid,
    recipientId,
    contentType: 'TEXT',
    text,
    platform: 'MOBILE',
  });

  if (!validation.allowed) {
    Alert.alert('Content Policy', validation.reason);
    
    if (validation.autoReport) {
      // Critical violation - auto-report
      await reportViolation({
        targetUserId: currentUser.uid,
        violationType: validation.violationType!,
        surface: 'CHAT',
      });
    }
    
    return;
  }

  // Message allowed, send
  await sendMessage(recipientId, text);
}
```

### Example 4: Check User's Policy
```typescript
import { getUserRegion, loadContentPolicy } from '@/lib/policy/contentPolicy';

async function showPolicyInfo() {
  const region = await getUserRegion(currentUser.uid);
  const policy = await loadContentPolicy();
  
  const regionalPolicy = policy.regions[region];
  
  console.log('Your region:', region);
  console.log('Profile nudity allowed:', regionalPolicy.mobileProfileNudity);
  console.log('Erotic chat allowed:', regionalPolicy.chatAllowedErotic);
  console.log('Explicit porn allowed:', regionalPolicy.explicitPornMediaAllowed);
}
```

---

## 🌐 Web Integration Examples

### Example 1: Pre-Upload Validation (Web)
```typescript
import { functions } from '@/lib/firebase';

async function validateBeforeUpload(file: File, surface: 'PROFILE' | 'GALLERY' | 'FEED') {
  const validateContent = functions.httpsCallable('pack329_validateContent');
  
  const result = await validateContent({
    surface,
    platform: 'WEB',
    contentType: file.type.startsWith('image/') ? 'IMAGE' : 'VIDEO',
    isPrivate: false,
  });

  if (!result.data.allowed) {
    alert(result.data.reason);
    return false;
  }

  return true;
}
```

### Example 2: Report Violation (Web)
```typescript
import { functions } from '@/lib/firebase';

async function reportPolicyViolation(
  targetUserId: string,
  violationType: string,
  surface: string,
  description: string
) {
  const reportViolation = functions.httpsCallable('pack329_reportViolation');
  
  const result = await reportViolation({
    targetUserId,
    violationType,
    surface,
    description,
    platform: 'WEB',
  });

  if (result.data.success) {
    alert('Violation reported successfully');
  }
}
```

---

## 🛡️ Surface-Specific Rules

### PROFILE / GALLERY
- **Allowed:** Bikini, lingerie, buttocks covered/partially visible
- **Not Allowed:** Genitals visible, explicit sex acts, minors
- **Enforcement:** Soft warning → Hard warning → Final warning → Ban

### FEED (Public Square)
- **Allowed:** Swimwear, lingerie, soft erotic (non-pornographic)
- **Not Allowed:** Explicit nudity, genitals, sex acts, political content
- **Enforcement:** Auto-flag for moderation

### CHAT (Private)
- **Allowed:** Adult erotic content between consenting 18+ users
- **Not Allowed:** Minors, violence, illegal content, extreme violations
- **Enforcement:** Auto-report for critical violations only

### AI COMPANIONS
- **Allowed:** Flirt, erotic roleplay (text only)
- **Not Allowed:** Minors, incest, illegal content, hardcore porn media
- **Enforcement:** Prompt filtering + violation recording

### EVENTS (Public Gatherings)
- **Allowed:** Safe, appropriate social events only
- **Not Allowed:** Explicit content, romantic/escort events, political/religious events
- **Enforcement:** Pre-approval + auto-rejection

### CALLS (Video/Voice)
- **Allowed:** Private adult interactions
- **Not Allowed:** Minors, violence (reported by users)
- **Enforcement:** User reports → Safety review

---

## 🔄 Future Enhancements

### Phase 2: Relaxed Web Policies (Optional)
```typescript
web: {
  allowExplicitPorn: true,  // Web-only, not mobile
  webProfileNudity: 'FULL_NUDITY',  // More permissive for web
}
```
**Benefit:** Increase web appeal without affecting App Store compliance

### Phase 3: AI-Powered Content Scanning
- Replace keyword detection with ML models
- Real-time image/video nudity detection
- NLP-based toxicity and hate speech detection
- Integrate with existing safety systems

### Phase 4: Dynamic Policy Updates
- A/B test policy relaxations by region
- Gradual rollout of permissive rules
- Monitor impact on reports and violations

---

## ✅ Zero-Drift Confirmation

This pack:
- ✅ Does NOT change token prices
- ✅ Does NOT change revenue splits (65/35, 80/20, 90/10)
- ✅ Does NOT change refund rules
- ✅ Does NOT change message/call/calendar/event logic
- ✅ Does NOT affect wallet, payouts, or any monetization

It only:
- ✅ Centralizes content policy rules
- ✅ Wires them into upload + feed + AI + moderation
- ✅ Ensures App Store / Google Play / EU / US compliance
- ✅ Allows flirting, romance, adult sexuality within bounds

---

## 📊 Monitoring & Analytics

### Key Metrics to Track
1. **Violation Rate:** Violations per 1000 uploads
2. **Warning Rate:** Warnings issued per user
3. **Auto-Ban Rate:** Critical violations triggering bans
4. **Regional Differences:** Violation rates by EU/US/RoW
5. **Surface Breakdown:** Violations by Profile/Feed/Chat/AI/Event

### Alerts to Configure
- Spike in CRITICAL violations (minors, illegal content)
- High rejection rate on specific surface (>20%)
- Region-specific policy conflicts
- Repeated violations from same user (3+ in 24h)

---

## 🎓 Developer Notes

### Testing Policy Changes
```typescript
// Test in dev environment ONLY
const testPolicy = {
  mobileProfileNudity: 'ARTISTIC_NUDITY',
  explicitPornMediaAllowed: false,
};

await db.collection('contentPolicies').doc('GLOBAL_POLICY_MATRIX').update({
  'regions.ROW': testPolicy,
});

// Clear cache to force reload
import { clearPolicyCache } from '@/lib/policy/contentPolicy';
clearPolicyCache();
```

### Adding New Violation Types
1. Add to `ViolationType` enum in `contentPolicy.ts`
2. Add severity mapping in `getViolationSeverity()`
3. Add keyword detection in `policyEnforcement.ts`
4. Update Firestore rules to allow new type
5. Deploy and test

### Adding New Surfaces
1. Add to `Surface` type in `contentPolicy.ts`
2. Add validation function in `policyEnforcement.ts`
3. Add case in `isEroticMediaAllowedInContext()`
4. Update documentation
5. Deploy and test

---

## 📞 Support & Escalation

For policy questions or conflicts:
1. Check this documentation first
2. Review `GLOBAL_POLICY_MATRIX` in Firestore
3. Contact compliance team for clarification
4. Escalate to legal if region-specific concerns

---

**Implementation Date:** 2025-12-11  
**Version:** 1.0.0  
**Status:** ✅ Production Ready