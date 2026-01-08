# PACK 331 — AI Avatar Template Marketplace Implementation Guide

**Status:** ✅ Complete  
**Date:** 2025-12-12  
**Version:** 1.0

---

## 🎯 Overview

PACK 331 adds a marketplace for AI avatar templates, enabling creators to design and sell AI character visuals that other users can purchase and use for their AI companions.

### Key Features

✅ **Creator Templates** - Users can design and sell avatar visuals  
✅ **Official Avalo Templates** - Platform-owned templates with 100% revenue  
✅ **Revenue Split** - 65/35 split for creator templates, 100% Avalo for official  
✅ **Moderation Queue** - All templates reviewed before activation  
✅ **Purchase Once, Use Forever** - One-time unlock, no recurring fees  
✅ **Usage Analytics** - Track template popularity and sessions  
✅ **Zero Token Drift** - Uses existing 0.20 PLN token price

---

## 📊 Data Models

### 1. aiAvatarTemplates Collection

```typescript
{
  id: string;
  ownerUserId: string | null;   // null = Avalo official
  name: string;
  description: string;
  
  imageUrl: string;              // final avatar preview
  style: "REALISTIC" | "ANIME" | "ILLUSTRATION" | "OTHER";
  genderPresentation: "FEMININE" | "MASCULINE" | "ANDROGYNOUS" | "OTHER";
  
  priceTokens: number;           // 200-2000 range
  isActive: boolean;             // moderation controlled
  
  isOfficialAvalo: boolean;      // true => 100% Avalo revenue
  tags: string[];                // ["gamer", "elegant", "tattoos"]
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
  
  stats: {
    totalPurchases: number;
    totalEarningsTokens: number;
    totalUsageSessions: number;
  };
  
  moderationStatus: "PENDING_REVIEW" | "ACTIVE" | "REJECTED" | "DEACTIVATED";
  moderatedBy?: string;
  moderatedAt?: Timestamp;
  rejectionReason?: string;
}
```

### 2. aiAvatarTemplatePurchases Collection

```typescript
{
  id: string;
  buyerUserId: string;
  templateId: string;
  
  purchasedAt: Timestamp;
  
  priceTokens: number;
  ownerUserId: string | null;    // null = Avalo official
  isOfficialAvalo: boolean;
}
```

### 3. Extended AICompanion Model

```typescript
{
  // ... existing fields
  avatarTemplateId?: string;     // Reference to purchased template
  avatarImageUrl?: string;       // URL from template or custom
}
```

---

## 🔐 Security Rules

**File:** [`firestore-pack331-ai-avatar-marketplace.rules`](firestore-pack331-ai-avatar-marketplace.rules:1)

### Key Access Controls

- **Read Templates** - All authenticated users (marketplace browsing)
- **Create Templates** - Verified 18+ users only
- **Purchase** - System service only (via Cloud Function)
- **Moderation** - Moderators/admins can approve/reject
- **Owner Updates** - Creators can edit name, description, price, tags
- **Protected Fields** - ownerUserId, isOfficialAvalo, stats cannot be changed by owner

---

## 🗄️ Firestore Indexes

**File:** [`firestore-pack331-ai-avatar-marketplace.indexes.json`](firestore-pack331-ai-avatar-marketplace.indexes.json:1)

### Composite Indexes (13 total)

1. `isActive + createdAt` (new templates)
2. `isActive + stats.totalPurchases` (popular)
3. `isActive + stats.totalEarningsTokens` (top earning)
4. `isActive + priceTokens` (price sort)
5. `isActive + style + createdAt` (style filter)
6. `isActive + genderPresentation + createdAt` (gender filter)
7. `isActive + isOfficialAvalo + createdAt` (official/creator filter)
8. `ownerUserId + createdAt` (creator dashboard)
9. `tags (array-contains) + isActive + createdAt` (tag search)
10. `buyerUserId + purchasedAt` (user purchases)
11. `buyerUserId + templateId` (ownership check)
12. `ownerUserId + purchasedAt` (creator sales)
13. `templateId + purchasedAt` (template sales)

---

## 🚀 Cloud Functions

**File:** [`functions/src/pack331-ai-avatar-marketplace.ts`](functions/src/pack331-ai-avatar-marketplace.ts:1)

### 1. pack331_createAiAvatarTemplate

**Purpose:** Create a new avatar template (pending moderation)

**Authentication:** Required (18+ verified users)

**Request:**
```typescript
{
  ownerUserId: string;           // Must match auth.uid (or null for admin)
  name: string;                  // 3-100 chars
  description: string;           // 10-1000 chars
  imageUrl: string;              // Valid HTTPS URL
  style: AvatarStyle;
  genderPresentation: GenderPresentation;
  tags: string[];                // 1-10 tags
  priceTokens: number;           // 200-2000
}
```

**Response:**
```typescript
{
  success: boolean;
  templateId?: string;
  error?: string;
}
```

**Validation:**
- User must be 18+ verified
- Admin-only for official Avalo templates (ownerUserId = null)
- Image must pass content policy (PACK 329 integration)
- Price within 200-2000 token range
- Template starts as `isActive: false`, `moderationStatus: PENDING_REVIEW`

---

### 2. pack331_purchaseAiAvatarTemplate

**Purpose:** Purchase an avatar template with revenue split

**Authentication:** Required

**Request:**
```typescript
{
  templateId: string;
}
```

**Response:**
```typescript
{
  success: boolean;
  purchaseId?: string;
  split?: {
    ownerEarned: number;
    avaloEarned: number;
  };
  error?: string;
}
```

**Revenue Split Logic:**

```typescript
if (isOfficialAvalo) {
  ownerEarned = 0;
  avaloEarned = priceTokens;  // 100% Avalo
} else {
  ownerEarned = Math.floor(priceTokens * 0.65);  // 65% to creator
  avaloEarned = priceTokens - ownerEarned;        // 35% to Avalo
}
```

**Flow:**
1. Verify template is active
2. Check user hasn't already purchased
3. Prevent self-purchase (creators auto-own their templates)
4. Charge buyer using [`spendTokens()`](functions/src/pack277-wallet-service.ts:152)
5. Credit owner (if user-created)
6. Record purchase in `aiAvatarTemplatePurchases`
7. Update template stats

**Error Cases:**
- Template not found
- Template inactive
- Already purchased
- Insufficient balance
- Self-purchase attempt

---

### 3. pack331_listAvatarTemplates

**Purpose:** Browse marketplace with filters and sorting

**Authentication:** Required

**Request:**
```typescript
{
  filters?: {
    style?: AvatarStyle;
    genderPresentation?: GenderPresentation;
    tags?: string[];
    priceMin?: number;
    priceMax?: number;
    officialOnly?: boolean;
    creatorOnly?: boolean;
  };
  sort?: "popular" | "new" | "top_earning" | "price_low" | "price_high";
  limit?: number;               // Default 50
  offset?: number;
}
```

**Response:**
```typescript
{
  success: boolean;
  templates?: AIAvatarTemplate[];
  total?: number;
  error?: string;
}
```

**Sorting Options:**
- `popular` - By `stats.totalPurchases DESC`
- `new` - By `createdAt DESC` (default)
- `top_earning` - By `stats.totalEarningsTokens DESC`
- `price_low` - By `priceTokens ASC`
- `price_high` - By `priceTokens DESC`

---

### 4. pack331_getCreatorStats

**Purpose:** Get creator's template performance analytics

**Authentication:** Required (returns for auth.uid)

**Response:**
```typescript
{
  success: boolean;
  stats?: {
    totalTemplates: number;
    activeTemplates: number;
    totalSales: number;
    totalEarningsTokens: number;
    templates: Array<{
      templateId: string;
      name: string;
      sales: number;
      earnings: number;
      usageSessions: number;
    }>;
  };
  error?: string;
}
```

---

### 5. pack331_trackTemplateUsage

**Purpose:** Track when template is used in AI session (analytics only)

**Authentication:** Required

**Request:**
```typescript
{
  templateId: string;
}
```

**Response:**
```typescript
{
  success: boolean;
  error?: string;
}
```

**Note:** This only increments `stats.totalUsageSessions` - no payment involved.

---

## 💰 Revenue & Pricing

### Pricing Rules

- **Min Price:** 200 tokens (40 PLN)
- **Max Price:** 2000 tokens (400 PLN)
- **Token Value:** 0.20 PLN (unchanged)
- **No Recurring Fees:** One-time purchase

### Revenue Split

| Template Type | Creator Share | Avalo Share |
|--------------|---------------|-------------|
| **User-Created** | 65% (130-1300 tokens) | 35% (70-700 tokens) |
| **Official Avalo** | 0% | 100% |

### Payment Flow

1. User clicks "Unlock Avatar" on template
2. [`pack331_purchaseAiAvatarTemplate()`](functions/src/pack331-ai-avatar-marketplace.ts:195) called
3. [`spendTokens()`](functions/src/pack277-wallet-service.ts:152) charges buyer
4. Revenue split applied automatically
5. Creator credited instantly (if applicable)
6. Purchase record created
7. Template stats updated

**No Refunds** - Purchases are final (unless manual/legal exception)

---

## 🛡️ Safety & Moderation

### Content Policy (PACK 329 Integration)

**Strictly Prohibited:**
- ❌ Child-like or underage appearances
- ❌ Extreme violence or gore
- ❌ Hardcore pornography
- ❌ Stolen celebrity/influencer faces without consent
- ❌ Hate symbols or extremist content

### Moderation Queue

All new templates enter **PENDING_REVIEW** status:

1. Creator submits template → `isActive: false`
2. Moderator reviews content
3. **Approve** → `isActive: true, moderationStatus: ACTIVE`
4. **Reject** → `moderationStatus: REJECTED, rejectionReason: "..."`

**Moderator Actions:**
```typescript
// Approve template
await db.collection('aiAvatarTemplates').doc(templateId).update({
  isActive: true,
  moderationStatus: 'ACTIVE',
  moderatedBy: moderatorId,
  moderatedAt: serverTimestamp()
});

// Reject template
await db.collection('aiAvatarTemplates').doc(templateId).update({
  moderationStatus: 'REJECTED',
  rejectionReason: 'Contains prohibited content',
  moderatedBy: moderatorId,
  moderatedAt: serverTimestamp()
});
```

### User Reporting

Users can report templates for policy violations:
- Report captured in `templateReports` collection
- Moderator reviews and takes action
- Template may be deactivated
- Creator may be temporarily/permanently banned

### Template Deactivation

When template is deactivated:
- **Existing users** keep access (already purchased)
- **New users** cannot purchase
- Template removed from marketplace
- Creator cannot reactivate (requires moderator review)

---

## 🔄 Integration with AI Companions

### Using Templates in AI Companions

When creating/editing an AI companion:

```typescript
// User can select from their purchased templates
const userPurchases = await db
  .collection('aiAvatarTemplatePurchases')
  .where('buyerUserId', '==', userId)
  .get();

const ownedTemplateIds = userPurchases.docs.map(d => d.data().templateId);

// Attach template to companion
await db.collection('aiCompanions').doc(companionId).update({
  avatarTemplateId: selectedTemplateId,
  avatarImageUrl: template.imageUrl
});
```

### Tracking Usage

When AI session starts with template:

```typescript
// Track analytics (no payment)
await pack331_trackTemplateUsage({ templateId });

// This increments stats.totalUsageSessions
// Earnings come from initial purchase, not usage
```

---

## 📱 Client Integration (Mobile/Web)

### Marketplace Screen

**Browse Templates:**
```typescript
const { data } = await httpsCallable(functions, 'pack331_listAvatarTemplates')({
  filters: {
    style: 'REALISTIC',
    priceMax: 1000
  },
  sort: 'popular',
  limit: 20
});

const templates = data.templates;
```

### Purchase Flow

```typescript
const purchaseTemplate = async (templateId: string) => {
  try {
    const result = await httpsCallable(
      functions, 
      'pack331_purchaseAiAvatarTemplate'
    )({ templateId });
    
    if (result.data.success) {
      // Show success
      // Display split: result.data.split.ownerEarned, result.data.split.avaloEarned
      // Navigate to AI companion creation with template
    } else {
      // Show error: result.data.error
    }
  } catch (error) {
    // Handle insufficient balance, etc.
  }
};
```

### Creator Dashboard

```typescript
const { data } = await httpsCallable(functions, 'pack331_getCreatorStats')({});

console.log(`Total earnings: ${data.stats.totalEarningsTokens} tokens`);
console.log(`Total sales: ${data.stats.totalSales}`);

data.stats.templates.forEach(t => {
  console.log(`${t.name}: ${t.sales} sales, ${t.earnings} tokens earned`);
});
```

### Create Template

```typescript
const createTemplate = async () => {
  const result = await httpsCallable(
    functions,
    'pack331_createAiAvatarTemplate'
  )({
    ownerUserId: currentUserId,
    name: 'Cyberpunk Warrior',
    description: 'Futuristic warrior with neon accents',
    imageUrl: uploadedImageUrl,
    style: 'ILLUSTRATION',
    genderPresentation: 'ANDROGYNOUS',
    tags: ['cyberpunk', 'warrior', 'neon'],
    priceTokens: 500
  });
  
  if (result.data.success) {
    // Template created, pending moderation
  }
};
```

---

## 🧪 Testing Checklist

### Backend Functions

- [ ] `pack331_createAiAvatarTemplate`
  - [ ] User-created template (18+ verified)
  - [ ] Official Avalo template (admin only)
  - [ ] Validation: price range 200-2000
  - [ ] Validation: name/description length
  - [ ] Validation: image URL format
  - [ ] Starts as `isActive: false`
  - [ ] Non-18+ user blocked
  
- [ ] `pack331_purchaseAiAvatarTemplate`
  - [ ] Successful purchase (user-created)
  - [ ] Successful purchase (official Avalo)
  - [ ] Revenue split: 65/35 vs 100/0
  - [ ] Insufficient balance error
  - [ ] Already purchased error
  - [ ] Self-purchase blocked
  - [ ] Inactive template blocked
  - [ ] Stats updated correctly
  
- [ ] `pack331_listAvatarTemplates`
  - [ ] Filter by style
  - [ ] Filter by gender presentation
  - [ ] Filter by tags
  - [ ] Filter by price range
  - [ ] Sort: popular, new, top_earning
  - [ ] Official only / creator only filters
  - [ ] Pagination with limit
  
- [ ] `pack331_getCreatorStats`
  - [ ] Returns creator's templates
  - [ ] Correct total sales
  - [ ] Correct total earnings
  - [ ] Per-template breakdown
  
- [ ] `pack331_trackTemplateUsage`
  - [ ] Increments usage counter
  - [ ] No payment deduction

### Security Rules

- [ ] Authenticated users can read templates
- [ ] 18+ verified users can create templates
- [ ] Only system can create purchases
- [ ] Owners can update limited fields
- [ ] Moderators can activate/reject
- [ ] Protected fields cannot be modified by owner

### Revenue & Wallet

- [ ] Creator receives 65% instantly
- [ ] Avalo receives 35% to platform revenue
- [ ] Official templates: 100% to Avalo
- [ ] Transaction records created
- [ ] Wallet balances updated
- [ ] No double-purchase possible

### UI/UX

- [ ] Marketplace displays templates
- [ ] Filter/sort works correctly
- [ ] Purchase button shows price
- [ ] Confirmation modal before purchase
- [ ] Success/error messages
- [ ] Creator dashboard shows stats
- [ ] Template creation form validates input
- [ ] Moderation status visible to creator

---

## 🚀 Deployment

### Prerequisites

1. Firebase CLI installed: `npm install -g firebase-tools`
2. Authenticated: `firebase login`
3. Project selected: `firebase use <project-id>`

### Deploy Command

```bash
chmod +x deploy-pack331.sh
./deploy-pack331.sh
```

**Or manually:**

```bash
# 1. Deploy Firestore rules
firebase deploy --only firestore:rules

# 2. Deploy Firestore indexes
firebase deploy --only firestore:indexes

# 3. Build and deploy functions
cd functions
npm run build
cd ..
firebase deploy --only functions:pack331_createAiAvatarTemplate,functions:pack331_purchaseAiAvatarTemplate,functions:pack331_listAvatarTemplates,functions:pack331_getCreatorStats,functions:pack331_trackTemplateUsage
```

### Post-Deployment

1. **Monitor Index Build:**  
   https://console.firebase.google.com/project/YOUR_PROJECT/firestore/indexes
   
2. **Test Functions:**
   ```bash
   firebase functions:log --only pack331
   ```

3. **Verify Security Rules:**
   ```bash
   firebase firestore:rules:get
   ```

---

## ✅ Zero-Drift Compliance

### What Was NOT Changed

❌ **Token Price** - Still 0.20 PLN (unchanged)  
❌ **Core Chat Logic** - No modifications to PACK 279A/B  
❌ **Word Buckets** - No changes to chat monetization  
❌ **Existing Revenue Splits** - 65/35, 80/20, 90/10 preserved  
❌ **Wallet Service** - Only used existing [`spendTokens()`](functions/src/pack277-wallet-service.ts:152)  
❌ **Free/Paid Chat** - No impact on chat flows  
❌ **Payout Logic** - No changes to creator payouts

### What Was ADDED (Only)

✅ New collections: `aiAvatarTemplates`, `aiAvatarTemplatePurchases`  
✅ New functions: 5 Cloud Functions for marketplace  
✅ Extended `AICompanion` with optional fields: `avatarTemplateId`, `avatarImageUrl`  
✅ New revenue stream: Avatar template sales (clean, separate)  
✅ Creator earnings: Additional 65/35 split marketplace  
✅ Avalo revenue: 35% on user templates + 100% on official templates

**Result:** Pure additive feature with zero impact on existing monetization.

---

## 📋 Files Created/Modified

### New Files (7)

1. [`firestore-pack331-ai-avatar-marketplace.rules`](firestore-pack331-ai-avatar-marketplace.rules:1) - Security rules
2. [`firestore-pack331-ai-avatar-marketplace.indexes.json`](firestore-pack331-ai-avatar-marketplace.indexes.json:1) - Composite indexes
3. [`functions/src/types/pack331-ai-avatar-template.types.ts`](functions/src/types/pack331-ai-avatar-template.types.ts:1) - TypeScript types
4. [`functions/src/pack331-ai-avatar-marketplace.ts`](functions/src/pack331-ai-avatar-marketplace.ts:1) - Cloud Functions (582 lines)
5. [`deploy-pack331.sh`](deploy-pack331.sh:1) - Deployment script
6. `PACK_331_AI_AVATAR_MARKETPLACE_IMPLEMENTATION.md` - This document

### Modified Files (1)

1. [`functions/src/types.ts`](functions/src/types.ts:224) - Extended `AICompanion` interface with `avatarTemplateId?` and `avatarImageUrl?`

---

## 📊 Success Metrics

**For Creators:**
- Templates sold
- Tokens earned (65% split)
- Usage sessions (popularity)
- Average price point
- Active vs inactive templates

**For Avalo:**
- Total marketplace revenue (35% + 100% official)
- Number of active templates
- Purchase conversion rate
- Template quality scores
- Moderation approval rate

**For Users:**
- Templates purchased
- Templates used in AI companions
- Satisfaction ratings
- Re-purchase behavior

---

## 🔮 Future Enhancements

### Phase 2 (Optional)

1. **Template Bundles** - Buy multiple templates at discount
2. **Seasonal Sales** - Time-limited price reductions
3. **Template Preview** - Try before you buy (limited sessions)
4. **Creator Tiers** - Verified creators with higher trust
5. **Template Collections** - Curated sets by theme
6. **User Reviews** - Rate and review templates
7. **Template Requests** - Users request specific styles
8. **Revenue Analytics** - Detailed creator dashboards
9. **A/B Testing** - Price optimization suggestions
10. **Template Upgrades** - HD versions at premium price

---

## 🆘 Support & Troubleshooting

### Common Issues

**Issue:** "You must be verified 18+ to create avatar templates"  
**Solution:** Complete age verification in profile settings

**Issue:** "This template is not available for purchase"  
**Solution:** Template may be inactive or rejected by moderation

**Issue:** "Insufficient balance"  
**Solution:** Purchase more tokens to afford template

**Issue:** "You have already purchased this template"  
**Solution:** Check "My Avatars" - you already own it

**Issue:** "Firestore indexes still building"  
**Solution:** Wait 5-10 minutes, monitor Firebase Console

### Debug Mode

Enable detailed logging:

```typescript
// In functions
console.log('[pack331] Request data:', request.data);
console.log('[pack331] Split:', { ownerEarned, avaloEarned });
```

View logs:
```bash
firebase functions:log --only pack331 --limit 50
```

---

## 📞 Contact & Feedback

- **Technical Issues:** Check Firebase Console logs
- **Content Policy:** Review PACK 329 guidelines
- **Feature Requests:** Submit via product feedback
- **Creator Support:** Contact creator@avalo.app

---

## 📄 License & Compliance

- All avatar templates must comply with PACK 329 content policy
- Creators retain copyright of their designs
- Avalo has perpetual license to display and distribute purchased templates
- Users receive non-transferable, non-exclusive license to use templates
- Regional compliance follows PACK 328 framework

---

**✅ PACK 331 Implementation Complete**

**Version:** 1.0  
**Last Updated:** 2025-12-12  
**Status:** Production Ready

---