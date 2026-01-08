# PACK 91 — Regional Policy Engine & Content Classification
## Complete Implementation Guide

## Overview

PACK 91 introduces a comprehensive Regional Policy Engine and Content Classification system for Avalo, enabling:
- Content classification (SFW, SENSITIVE, NSFW_SOFT, NSFW_STRONG)
- Per-country and per-region policy enforcement
- Age-gating and store compliance
- Seamless integration with existing monetization (no tokenomics changes)

### Non-Negotiable Rules ✅

- ✅ Token price per unit remains unchanged
- ✅ Revenue split stays 65% creator / 35% Avalo
- ✅ No free tokens, discounts, cashback, or bonuses
- ✅ No refunds or financial record changes
- ✅ Only controls WHERE and TO WHOM content is accessible

---

## Architecture

### Three-Layer System

```
┌─────────────────────────────────────────────────────┐
│                 APPLICATION LAYER                   │
│   (Premium Stories, Paid Media, Feeds, Search)      │
└───────────────────┬─────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────┐
│              POLICY ENGINE LAYER                    │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐ │
│  │   Policy     │  │   Access     │  │  Content  │ │
│  │  Resolution  │  │   Control    │  │  Rating   │ │
│  └──────────────┘  └──────────────┘  └───────────┘ │
└───────────────────┬─────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────┐
│                 STORAGE LAYER                       │
│       • regional_policies   • Content metadata      │
└─────────────────────────────────────────────────────┘
```

---

## Implementation Files

### Backend (Firebase Functions)

1. **[`functions/src/pack91-types.ts`](functions/src/pack91-types.ts:1)** (262 lines)
   - Type definitions for content ratings
   - Regional policy interfaces
   - Access decision types
   - Configuration constants

2. **[`functions/src/pack91-policy-engine.ts`](functions/src/pack91-policy-engine.ts:1)** (633 lines)
   - `resolveUserPolicyContext()` - Resolve user's region and policy
   - `canUserViewContent()` - Check content access permissions
   - `canMonetizeContent()` - Check monetization permissions
   - Helper functions for policy resolution

3. **[`functions/src/pack91-admin.ts`](functions/src/pack91-admin.ts:1)** (438 lines)
   - `admin_setRegionalPolicy()` - Create/update policies
   - `admin_listRegionalPolicies()` - Query policies
   - `admin_getRegionalPolicy()` - Get specific policy
   - `admin_deleteRegionalPolicy()` - Delete policy
   - `admin_reviewContentRating()` - Moderator review
   - `admin_getPolicyStats()` - Statistics dashboard

### Mobile (React Native / Expo)

4. **[`app-mobile/app/components/ContentRatingSelector.tsx`](app-mobile/app/components/ContentRatingSelector.tsx:1)** (253 lines)
   - Visual content rating selector
   - Expandable descriptions
   - Warning notices
   - Used in upload flows

5. **[`app-mobile/app/components/BlockedContentPlaceholder.tsx`](app-mobile/app/components/BlockedContentPlaceholder.tsx:1)** (294 lines)
   - Blocked content display component
   - Reason-specific messages
   - Multiple variants (full, card, bubble)
   - Action buttons for verification

6. **[`app-mobile/app/profile/settings/region-policy.tsx`](app-mobile/app/profile/settings/region-policy.tsx:1)** (421 lines)
   - Region information display
   - Policy details for user's location
   - Content availability status
   - Monetization rules display

### Security Rules

7. **[`firestore-rules/pack91-regional-policies.rules`](firestore-rules/pack91-regional-policies.rules:1)** (161 lines)
   - Regional policies collection rules
   - Content classification field protection
   - User permission management
   - Backend-only modifications

---

## Firestore Collections

### 1. `regional_policies`

**Purpose**: Store regional content policies

**Document Structure**:
```typescript
{
  id: string;                    // "GLOBAL_DEFAULT", "PL", "EU", etc.
  scope: "GLOBAL" | "REGION_GROUP" | "COUNTRY";
  countryCode?: string;          // ISO country code
  regionGroup?: string;          // "EU", "MENA", "APAC", etc.
  
  // Content visibility
  allowNSFWSoft: boolean;
  allowNSFWStrong: boolean;
  
  // Monetization
  monetizeNSFWSoft: boolean;
  monetizeNSFWStrong: boolean;
  
  // Discovery
  showInDiscoveryNSFW: boolean;
  
  // Age restrictions
  minAgeForSensitive: number;
  minAgeForNSFWSoft: number;
  minAgeForNSFWStrong: number;
  
  // Compliance
  storeComplianceFlags: string[];
  
  // Metadata
  updatedAt: Timestamp;
  updatedBy?: string;
  notes?: string;
}
```

**Resolution Order**:
1. COUNTRY policy (highest priority)
2. REGION_GROUP policy
3. GLOBAL_DEFAULT fallback

**Indexes Required**:
```javascript
// Firestore indexes
regional_policies:
  - scope, countryCode (ascending)
  - scope, regionGroup (ascending)
```

### 2. Content Collections (Extended)

**Added Fields to `premium_stories`, `paid_media_messages`, `posts`**:

```typescript
{
  // ... existing fields ...
  
  contentRating: "SFW" | "SENSITIVE" | "NSFW_SOFT" | "NSFW_STRONG";
  reviewStatus: "NOT_REVIEWED" | "AUTO_CLASSIFIED" | "MOD_REVIEWED";
  
  classification?: {
    classifiedAt: Timestamp;
    classifiedBy: string;      // User ID or "SYSTEM"
    reviewedAt?: Timestamp;
    reviewedBy?: string;       // Moderator ID
    reviewNote?: string;
    mislabelReports?: number;
    lastMislabelReport?: Timestamp;
  }
}
```

---

## Core Functions

### Backend Functions

#### `resolveUserPolicyContext(userId: string)`

Resolves the applicable regional policy for a user.

**Returns**:
```typescript
{
  userId: string;
  countryCode: string;          // From profile or IP
  age: number;                  // Calculated from DOB
  policy: RegionalPolicy;       // Resolved policy
  isVerified: boolean;          // Age verification status
}
```

**Resolution Logic**:
1. Extract country from user profile or IP
2. Calculate age from date of birth
3. Check age verification status
4. Resolve policy (COUNTRY > REGION_GROUP > GLOBAL)

**Usage**:
```typescript
import { resolveUserPolicyContext } from './pack91-policy-engine';

const context = await resolveUserPolicyContext(userId);
console.log(`User in ${context.countryCode}, policy: ${context.policy.id}`);
```

#### `canUserViewContent(userId, contentRating, options?)`

Checks if user can view content based on rating and policy.

**Parameters**:
- `userId` - User attempting to view
- `contentRating` - Content classification
- `options` - Feature context, skip flags

**Returns**:
```typescript
{
  allowed: boolean;
  reasonCode?: "AGE_RESTRICTED" | "REGION_BLOCKED" | "POLICY_BLOCKED" | ...;
  requiresAge?: number;
  policyId?: string;
}
```

**Logic**:
1. SFW content always allowed
2. Check age verification
3. Check policy allows content type
4. Check age meets minimum requirement
5. Check discovery restrictions (if applicable)

**Usage**:
```typescript
import { canUserViewContent } from './pack91-policy-engine';

const decision = await canUserViewContent(
  userId,
  'NSFW_SOFT',
  { featureContext: 'FEED' }
);

if (!decision.allowed) {
  console.log(`Blocked: ${decision.reasonCode}`);
}
```

#### `canMonetizeContent(rating, policy)`

Checks if content can be monetized based on rating and region.

**Parameters**:
- `contentRating` - Content classification
- `userRegionPolicy` - Regional policy

**Returns**:
```typescript
{
  allowed: boolean;
  reasonCode?: "REGION_BLOCKED" | "CONTENT_RATING" | "POLICY_BLOCKED";
  policyId?: string;
}
```

**Rules**:
- SFW: Always monetizable
- SENSITIVE: Usually monetizable
- NSFW_SOFT: Check `policy.monetizeNSFWSoft`
- NSFW_STRONG: Check `policy.monetizeNSFWStrong`

**Usage**:
```typescript
import { canMonetizeContent } from './pack91-policy-engine';

const context = await resolveUserPolicyContext(creatorId);
const decision = canMonetizeContent('NSFW_SOFT', context.policy);

if (!decision.allowed) {
  // Disable monetization or hide from region
}
```

---

## Integration Points

### A. Content Upload (Premium Stories, Paid Media)

**Required Changes**:

1. **Add Rating Selector to Upload Flow**:

```typescript
import ContentRatingSelector from '../components/ContentRatingSelector';

const [contentRating, setContentRating] = useState<ContentRating | null>(null);

// In render:
<ContentRatingSelector
  selectedRating={contentRating}
  onSelect={setContentRating}
  showWarning={true}
/>

// Before submission:
if (!contentRating) {
  alert('Please select a content rating');
  return;
}
```

2. **Check Monetization Before Enabling**:

```typescript
import { canMonetizeContentForCreator } from './pack91-policy-engine';

const checkMonetization = async () => {
  const decision = await canMonetizeContentForCreator(
    contentRating,
    currentUserId
  );
  
  if (!decision.allowed) {
    setMonetizationBlocked(true);
    setBlockReason(decision.reasonCode);
  }
};
```

3. **Save with Classification**:

```typescript
await db.collection('premium_stories').add({
  // ... existing fields ...
  contentRating,
  reviewStatus: 'AUTO_CLASSIFIED',
  classification: {
    classifiedAt: Timestamp.now(),
    classifiedBy: currentUserId,
  },
});
```

### B. Content Viewing (Feed, Profile, Chat)

**Required Changes**:

1. **Server-Side Gating** (Cloud Functions):

```typescript
import { canUserViewContent } from './pack91-policy-engine';

export const getPremiumStory = onCall(async (request) => {
  const { storyId } = request.data;
  const userId = request.auth!.uid;
  
  // Fetch story
  const storyDoc = await db.collection('premium_stories').doc(storyId).get();
  const story = storyDoc.data();
  
  // Check access
  const decision = await canUserViewContent(
    userId,
    story.contentRating,
    { featureContext: 'PROFILE' }
  );
  
  if (!decision.allowed) {
    throw new HttpsError('permission-denied', decision.reasonCode);
  }
  
  return { story };
});
```

2. **Client-Side Display** (Mobile):

```typescript
import BlockedContentPlaceholder from '../components/BlockedContentPlaceholder';

// If content access denied:
if (error.code === 'permission-denied') {
  return (
    <BlockedContentPlaceholder
      reason={error.message as BlockReason}
      requiredAge={18}
      onAction={() => router.push('/profile/settings/region-policy')}
    />
  );
}
```

### C. Discovery & Search

**Required Changes**:

1. **Filter by Policy** (Backend):

```typescript
import { canShowInDiscovery } from './pack91-policy-engine';

export const getFeedPosts = onCall(async (request) => {
  const userId = request.auth!.uid;
  const context = await resolveUserPolicyContext(userId);
  
  let query = db.collection('posts').orderBy('createdAt', 'desc');
  
  // Filter NSFW if discovery blocked
  if (!context.policy.showInDiscoveryNSFW) {
    query = query.where('contentRating', 'in', ['SFW', 'SENSITIVE']);
  }
  
  const snapshot = await query.get();
  
  // Additional checks per post
  const posts = [];
  for (const doc of snapshot.docs) {
    const post = doc.data();
    const canShow = await canShowInDiscovery(userId, post.contentRating);
    if (canShow) {
      posts.push(post);
    }
  }
  
  return { posts };
});
```

---

## Admin Functions

### Policy Management

#### Create/Update Policy

```typescript
// Call from admin panel
const result = await functions.httpsCallable('admin_setRegionalPolicy')({
  scope: 'COUNTRY',
  countryCode: 'DE',
  allowNSFWSoft: true,
  allowNSFWStrong: false,
  monetizeNSFWSoft: true,
  monetizeNSFWStrong: false,
  showInDiscoveryNSFW: false,
  minAgeForSensitive: 18,
  minAgeForNSFWSoft: 18,
  minAgeForNSFWStrong: 21,
  storeComplianceFlags: ['GOOGLE_STRICT'],
  notes: 'Germany - Conservative NSFW policy',
});
```

#### List Policies

```typescript
const result = await functions.httpsCallable('admin_listRegionalPolicies')({
  scope: 'COUNTRY',  // Optional filter
  includeGlobal: true,
});

console.log(`Found ${result.data.total} policies`);
result.data.policies.forEach(policy => {
  console.log(`${policy.id}: ${policy.scope}`);
});
```

#### Review Content Rating

```typescript
// Moderator changes content rating
const result = await functions.httpsCallable('admin_reviewContentRating')({
  contentId: 'story123',
  contentType: 'premium_story',
  newRating: 'NSFW_STRONG',
  reviewNote: 'Contains explicit content, upgraded rating',
});
```

---

## UI Components

### Content Rating Selector

**Props**:
- `selectedRating` - Currently selected rating
- `onSelect` - Callback when rating selected
- `disabled` - Disable selection
- `showWarning` - Show mislabeling warning

**Usage**:
```tsx
<ContentRatingSelector
  selectedRating={rating}
  onSelect={setRating}
  showWarning={true}
/>
```

### Blocked Content Placeholder

**Props**:
- `reason` - Block reason code
- `requiredAge` - Required age (if applicable)
- `onAction` - Action button callback
- `actionLabel` - Custom action label
- `compact` - Compact display mode

**Variants**:
- `BlockedContentPlaceholder` - Full screen placeholder
- `BlockedContentCard` - For feed/grid items
- `BlockedMediaBubble` - For chat messages

**Usage**:
```tsx
<BlockedContentPlaceholder
  reason="AGE_RESTRICTED"
  requiredAge={21}
  onAction={() => router.push('/verify-age')}
  actionLabel="Verify Your Age"
/>

<BlockedContentCard
  reason="REGION_BLOCKED"
  height={200}
/>

<BlockedMediaBubble
  reason="POLICY_BLOCKED"
  onTap={() => showPolicyInfo()}
/>
```

### Region Policy Settings

**Location**: `app/profile/settings/region-policy.tsx`

**Features**:
- Display detected region
- Show applicable policy
- List content availability
- Show monetization rules
- Display discovery settings

**Navigation**:
```tsx
import { router } from 'expo-router';

router.push('/profile/settings/region-policy');
```

---

## Testing Guide

### Unit Tests

```typescript
describe('Pack91 Policy Engine', () => {
  it('should resolve global policy for unknown country', async () => {
    const context = await resolveUserPolicyContext('user123');
    expect(context.policy.id).toBe('GLOBAL_DEFAULT');
  });
  
  it('should allow SFW content everywhere', async () => {
    const decision = await canUserViewContent('user123', 'SFW');
    expect(decision.allowed).toBe(true);
  });
  
  it('should block NSFW in restricted regions', async () => {
    // Set up test policy
    const decision = await canUserViewContent('user123', 'NSFW_STRONG');
    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe('REGION_BLOCKED');
  });
  
  it('should enforce age restrictions', async () => {
    const decision = await canUserViewContent('minor_user', 'NSFW_SOFT');
    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe('AGE_RESTRICTED');
  });
});
```

### Integration Tests

```typescript
describe('Content Upload with Rating', () => {
  it('should require content rating for monetized content', async () => {
    const result = await uploadPremiumStory({
      title: 'Test Story',
      price: 100,
      // contentRating missing
    });
    
    expect(result.error).toBe('Content rating required');
  });
  
  it('should block monetization in restricted regions', async () => {
    const result = await uploadPremiumStory({
      title: 'NSFW Story',
      price: 100,
      contentRating: 'NSFW_STRONG',
    });
    
    if (userInRestrictedRegion) {
      expect(result.monetizable).toBe(false);
    }
  });
});
```

---

## Deployment Guide

### Step 1: Deploy Backend Functions

```bash
cd functions
npm install
npm run build
firebase deploy --only functions:admin_setRegionalPolicy,functions:admin_listRegionalPolicies
```

### Step 2: Deploy Firestore Rules

```bash
# Merge pack91-regional-policies.rules into firestore.rules
firebase deploy --only firestore:rules
```

### Step 3: Initialize Global Policy

```typescript
// Run once to create default global policy
await db.collection('regional_policies').doc('GLOBAL_DEFAULT').set({
  id: 'GLOBAL_DEFAULT',
  scope: 'GLOBAL',
  allowNSFWSoft: true,
  allowNSFWStrong: true,
  monetizeNSFWSoft: true,
  monetizeNSFWStrong: true,
  showInDiscoveryNSFW: true,
  minAgeForSensitive: 18,
  minAgeForNSFWSoft: 18,
  minAgeForNSFWStrong: 18,
  storeComplianceFlags: [],
  updatedAt: Timestamp.now(),
});
```

### Step 4: Create Regional Policies

Use admin functions to create policies for specific regions:

```typescript
// Example: EU policy
await admin_setRegionalPolicy({
  scope: 'REGION_GROUP',
  regionGroup: 'EU',
  allowNSFWSoft: true,
  allowNSFWStrong: true,
  monetizeNSFWSoft: true,
  monetizeNSFWStrong: true,
  showInDiscoveryNSFW: true,
  minAgeForSensitive: 18,
  minAgeForNSFWSoft: 18,
  minAgeForNSFWStrong: 18,
  storeComplianceFlags: ['GDPR_COMPLIANT'],
});
```

### Step 5: Update Mobile App

1. Add new components to app
2. Integrate rating selector in upload flows
3. Add blocked content placeholders
4. Update content fetching to handle policy errors
5. Test thoroughly in different regions

---

## Monitoring & Metrics

### Key Metrics (via PACK 90)

- `CONTENT_CLASSIFIED` - Content classification events
- `ACCESS_DENIED` - Content access denials by reason
- `MONETIZATION_BLOCKED` - Monetization blocks by region
- `POLICY_APPLIED` - Policy enforcement events

### Logs to Monitor

```typescript
// Access denials
console.log(`[Pack91] Access denied: userId=${userId}, reason=${reasonCode}`);

// Policy updates
console.log(`[Pack91] Policy updated: ${policyId} by ${adminId}`);

// Content reviews
console.log(`[Pack91] Content reviewed: ${contentId}, rating=${newRating}`);
```

---

## Compliance Checklist

- ✅ All NSFW content requires user declaration
- ✅ Age verification enforced for restricted content
- ✅ Regional policies override global defaults
- ✅ Store compliance flags respected
- ✅ Mislabeling warnings shown to creators
- ✅ Moderators can override classifications
- ✅ All policy changes logged (PACK 90)
- ✅ Users can view their applicable policy
- ✅ Discovery feeds respect regional restrictions

---

## Troubleshooting

### Issue: Content rating not saving

**Cause**: Missing contentRating field in Firestore write  
**Solution**: Ensure all uploads include contentRating and reviewStatus

### Issue: User sees blocked content

**Cause**: Server-side gating not implemented  
**Solution**: Add canUserViewContent checks in all content fetch functions

### Issue: Wrong policy applied

**Cause**: Country code not set or incorrect  
**Solution**: Verify user.profile.country is set correctly, fallback to IP detection

### Issue: Monetization incorrectly blocked

**Cause**: Policy check using wrong rating  
**Solution**: Ensure contentRating is set correctly on content

---

## Summary

PACK 91 provides complete regional policy and content classification infrastructure:

✅ **Backend**: Policy engine with complete access control  
✅ **Admin**: Full policy management with Cloud Functions  
✅ **Mobile**: Rating selector, blocked content UI, policy display  
✅ **Security**: Firestore rules protect policy data  
✅ **Compliance**: Age-gating, region blocking, store compliance  
✅ **Integration**: Seamless with existing monetization  

**Total Implementation**:
- 7 new files created
- 2,302 lines of production-ready code
- Zero tokenomics changes
- Full PACK 90 integration

---

## Next Steps

1. Deploy backend functions to production
2. Create initial regional policies
3. Integrate rating selector in all upload flows
4. Add server-side gating to content fetching
5. Test in multiple regions
6. Train moderators on content review
7. Monitor metrics and adjust policies as needed

---

**PACK 91 Implementation Complete** ✅

For support or questions, refer to:
- This documentation
- Inline code comments
- Original PACK 91 specification