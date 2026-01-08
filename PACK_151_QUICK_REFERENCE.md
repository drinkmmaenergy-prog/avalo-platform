# PACK 151 - Sponsorship Marketplace Quick Reference

## 🚀 Quick Start

### For Brands

1. **Create Sponsorship Offer**
```typescript
import { SponsorshipSDK } from '@/lib/sponsorships/sdk';

await SponsorshipSDK.createSponsorship({
  brandId: currentUser.uid,
  title: 'Product Review Campaign',
  description: 'Looking for creators to review our product',
  dealType: 'product_placement',
  requirements: {
    deliverableCount: 3,
    deliverableTypes: ['post', 'reel'],
    timeline: '2 weeks',
    reviewRights: true
  },
  compensation: {
    amount: 500,
    currency: 'USD',
    useTokens: true
  },
  maxCreators: 5
});
```

2. **Approve Applications**
```typescript
await SponsorshipSDK.approveSponsorshipCreator({
  applicationId: 'app_123',
  approved: true
});
```

3. **Review Deliverables**
```typescript
await SponsorshipSDK.approveDeliverable({
  deliverableId: 'deliv_123',
  approved: true
});
```

### For Creators

1. **Browse Marketplace**
```typescript
// Navigate to: /sponsorships/marketplace
```

2. **Apply to Sponsorship**
```typescript
await SponsorshipSDK.applyToSponsorship({
  offerId: 'offer_123',
  creatorId: currentUser.uid,
  message: 'Why I\'m perfect for this...',
  portfolioItems: ['post_1', 'post_2']
});
```

3. **Submit Deliverable**
```typescript
await SponsorshipSDK.submitDeliverable({
  contractId: 'contract_123',
  deliverableId: 'deliv_123',
  content: {
    contentId: 'post_abc',
    contentType: 'post',
    caption: 'Product review #sponsored'
  }
});
```

4. **Check Earnings**
```typescript
// Navigate to: /sponsorships/earnings
```

## 🛡️ Safety Rules

### ❌ Prohibited Content

- **Romantic/Dating**: No dating, flirting, or emotional service references
- **NSFW**: No adult, explicit, or sexual content
- **External Links**: No PayPal, Venmo, OnlyFans, etc.
- **Manipulation**: No "buy this for attention" patterns
- **Seductive Posing**: Professional product presentation only

### ✅ Allowed Content

- Product placement and reviews
- Branded educational content
- Challenge participation
- Event promotion
- Professional tutorials

## 💰 Payment Structure

### Token Payments (65/35 Split)
- Creator receives: **65%**
- Platform fee: **35%**
- Held in escrow until approval

### Direct Payments
- Brand pays creator directly
- Still use Sponsorship Contract
- No platform fee
- Must follow all safety rules

## 📊 Deal Types

| Type | Description | Examples |
|------|-------------|----------|
| `product_placement` | Featuring products | Fashion haul, unboxing |
| `branded_content` | Brand-sponsored posts | Reviews, tutorials |
| `challenge_sponsorship` | Sponsored challenges | Fitness challenge |
| `event_sponsorship` | Event promotion | Workshop, conference |
| `curriculum_sponsorship` | Educational content | Course module |

## 🔍 Key Collections

```
sponsorship_offers/        - Active opportunities
sponsorship_applications/  - Creator applications
sponsorship_contracts/     - Active agreements
sponsorship_deliverables/  - Content submissions
sponsorship_reviews/       - Post-completion ratings
token_escrow/             - Payment escrow
sponsorship_analytics/    - Performance metrics
```

## 📱 Mobile Screens

```
/sponsorships/marketplace           - Browse opportunities
/sponsorships/[id]                 - Sponsorship details
/sponsorships/earnings             - Creator earnings
/sponsorships/analytics/[contractId] - Campaign analytics
```

## 🔐 Security Rules Summary

- Brands can only create offers for themselves
- Creators can only apply to open offers
- Safety validation required for all content
- Contract parties only can view/modify
- Moderators have oversight access
- No romantic/NSFW content allowed

## 📈 Analytics Available

**For Brands:**
- Total views
- Click-through rate
- Engagement metrics
- Sales attributed
- Revenue generated
- Regional breakdown
- Retention impact

**Privacy Protected:**
- No individual user data
- No buyer identities
- No spending power info
- Aggregate data only

## ⚡ Quick Commands

### Deploy Functions
```bash
firebase deploy --only functions:createSponsorship,functions:applyToSponsorship,functions:approveSponsorshipCreator,functions:submitDeliverable,functions:approveDeliverable,functions:releaseEscrowForSponsorship,functions:rateSponsorship,functions:getSponsorshipAnalytics
```

### Deploy Rules
```bash
firebase deploy --only firestore:rules
```

### Test Safety Guards
```typescript
// This will fail
await SponsorshipSDK.createSponsorship({
  description: 'Dating app promotion' // ❌ romantic content
});

// This will pass
await SponsorshipSDK.createSponsorship({
  description: 'Fitness gear product review' // ✅ allowed
});
```

## 🎯 Status Flow

### Offer Lifecycle
```
draft → open → in_progress → completed
         ↓
      cancelled/rejected
```

### Deliverable Lifecycle
```
pending → submitted → approved
           ↓
        rejected (with feedback)
```

### Contract Lifecycle
```
in_progress → awaiting_approval → completed
      ↓
   cancelled
```

## 🚨 Common Issues

**Issue:** Safety check failing  
**Solution:** Remove romantic, NSFW, or external payment references

**Issue:** Can't apply to sponsorship  
**Solution:** Check if offer is still open and not full

**Issue:** Payment not released  
**Solution:** Ensure all deliverables are approved

**Issue:** Analytics not showing  
**Solution:** Wait 24h for aggregation, ensure contract completed

## 📞 Support

- Safety violations: Automatic blocking + escalation
- Payment disputes: Dispute Center
- Technical issues: Support team
- Policy questions: Legal Center

## 🎉 Success Metrics

Track these for optimal results:

**For Brands:**
- CTR > 2%
- Engagement rate > 5%
- Positive creator reviews
- On-time delivery rate

**For Creators:**
- Application acceptance rate
- Deliverable approval rate
- Average rating > 4.0
- Repeat brand partnerships

## 📚 Full Documentation

See [`PACK_151_IMPLEMENTATION_COMPLETE.md`](PACK_151_IMPLEMENTATION_COMPLETE.md:1) for complete details.