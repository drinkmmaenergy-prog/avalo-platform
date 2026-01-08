# PACK 143 - Avalo Business Suite Quick Reference

## 🚀 Quick Start

### Backend Functions (Firebase)
```typescript
import { CRMEngine } from './pack143-crm-engine';

// Create/update contact
await CRMEngine.createOrUpdateContact(creatorId, userId, {
  displayName: 'John Doe',
  avatar: 'https://...'
});

// Record purchase
await CRMEngine.recordPurchase(creatorId, userId, {
  productId: 'prod_123',
  productType: 'digital_product',
  productName: 'Workout Plan',
  amount: 29.99,
  currency: 'USD'
});

// Assign label
await CRMEngine.assignLabel(creatorId, userId, 'Gym Member');

// Create segment
const segment = await CRMEngine.createSegment(
  creatorId,
  'Active Members',
  'Members who purchased in last 30 days',
  { minSpent: 10 }
);

// Create funnel
const funnel = await CRMEngine.createFunnel(creatorId, {
  name: 'Welcome Series',
  description: 'Onboard new members',
  trigger: { type: 'new_follower' },
  steps: [
    {
      delayHours: 0,
      action: {
        type: 'send_message',
        messageTemplate: 'Welcome! Check out our products.'
      }
    }
  ]
});

// Create & send broadcast
const broadcast = await CRMEngine.createBroadcast(creatorId, {
  segmentId: 'seg_123',
  subject: 'New Workshop Available',
  content: 'Join our live workshop this Saturday!',
  contentType: 'text'
});

await CRMEngine.sendBroadcast(broadcast.id);

// Get analytics
const analytics = await CRMEngine.getAnalytics(creatorId, 'month');
```

### Frontend (React Native)
```typescript
import { functions } from '../../lib/firebase';
import { httpsCallable } from 'firebase/functions';

// Get contacts
const getContacts = httpsCallable(functions, 'getMyContacts');
const result = await getContacts({ limit: 50, offset: 0 });

// Create segment
const createSegment = httpsCallable(functions, 'createSegment');
await createSegment({
  name: 'VIP Members',
  description: 'High-value members',
  filters: { minSpent: 100 }
});

// Create funnel
const createFunnel = httpsCallable(functions, 'createFunnel');
await createFunnel({
  name: 'Product Launch',
  steps: [/* ... */]
});

// Send broadcast
const sendBroadcast = httpsCallable(functions, 'sendBroadcast');
await sendBroadcast({ broadcastId: 'brd_123' });

// Get analytics
const getAnalytics = httpsCallable(functions, 'getCRMAnalytics');
const analytics = await getAnalytics({ period: 'month' });
```

## 🛡️ Safety Rules

### ✅ ALLOWED
- Product names as labels ("Bought Workout Plan")
- Event participation ("Joined Morning Challenge")
- Educational tags ("Business Student")
- Purchase-based segments
- Product/event/educational broadcasts
- Aggregate analytics

### ❌ FORBIDDEN
**Labels:**
- Beauty/attractiveness ("hot", "beautiful", "sexy")
- Wealth ("rich", "high spender", "VIP wallet")
- Relationship ("single", "married", "dating")
- Sexual/NSFW tags
- Vulnerability indicators

**Content:**
- Romantic language ("love you", "miss you", "thinking of you")
- Emotional manipulation ("only you can help", "you're special to me")
- External payment links (PayPal, Venmo, OnlyFans, etc.)
- "Pay for attention" patterns
- Love bombing scripts

**Filters:**
- Personal attributes
- Location data
- Wealth indicators
- Vulnerability scores

## 📊 Limits

```typescript
MAX_BROADCAST_SIZE = 10,000        // Max contacts per broadcast
MAX_FUNNEL_STEPS = 10              // Max steps per funnel
MAX_LABELS_PER_CONTACT = 20        // Max labels per contact
```

## 🔍 Validation

```typescript
import { CRMSafetyValidator } from './pack143-safety-validator';

// Validate label
const result = CRMSafetyValidator.validateLabel('Gym Member');
if (!result.isValid) {
  console.error('Invalid label:', result.violations);
}

// Validate broadcast content
const contentResult = CRMSafetyValidator.validateBroadcastContent(
  'Check out our new product!',
  'New Launch'
);

// Validate funnel
const funnelResult = CRMSafetyValidator.validateFunnel({
  name: 'Welcome Series',
  steps: [/* ... */]
});

// Validate segment filters
const filterResult = CRMSafetyValidator.validateSegmentFilters({
  minSpent: 10,
  labels: ['Active Member']
});
```

## 📱 UI Navigation

```typescript
// From any screen, navigate to CRM
router.push('/crm');

// Specific CRM screens
router.push('/crm/contacts');
router.push('/crm/segments');
router.push('/crm/funnels');
router.push('/crm/broadcasts');
router.push('/crm/analytics');
```

## 🔗 Integration Points

### After Purchase Transaction
```typescript
// In your payment handler
await CRMEngine.recordPurchase(creatorId, buyerId, {
  productId: transaction.productId,
  productType: transaction.type,
  productName: transaction.name,
  amount: transaction.amount,
  currency: 'USD'
});
```

### After User Interaction (Chat/Call)
```typescript
// After first message sent
await CRMEngine.createOrUpdateContact(creatorId, userId, {
  displayName: user.displayName,
  avatar: user.photoURL
});
```

### Funnel Triggers
```typescript
// Trigger funnel on event
await CRMEngine.triggerFunnel(funnelId, userId);
```

### User Opt-Out
```typescript
// Allow user to opt out of broadcasts
await CRMEngine.optOutBroadcasts(creatorId, userId);
```

## 🗂️ Collections Reference

| Collection | Purpose | Access |
|------------|---------|--------|
| `crm_contacts` | Contact records | Creator only |
| `crm_segments` | Audience segments | Creator only |
| `crm_funnels` | Automated sequences | Creator only |
| `crm_broadcasts` | Broadcast messages | Creator only |
| `contact_labels` | Label metadata | Creator only |
| `funnel_enrollments` | User funnel status | Creator + User |
| `broadcast_messages` | Delivered messages | Creator + User |

## 🎯 Common Use Cases

### 1. Welcome New Followers
```typescript
// Create welcome funnel
const funnel = await CRMEngine.createFunnel(creatorId, {
  name: 'New Follower Welcome',
  trigger: { type: 'new_follower' },
  steps: [
    {
      delayHours: 0,
      action: {
        type: 'show_post',
        contentId: 'intro_video_123'
      }
    },
    {
      delayHours: 24,
      action: {
        type: 'offer_product',
        productId: 'starter_pack_456'
      }
    }
  ]
});
```

### 2. Promote Event to Active Members
```typescript
// Create segment
const segment = await CRMEngine.createSegment(
  creatorId,
  'Active Members',
  'Members with recent purchases',
  {
    minSpent: 10,
    lastInteractionDays: 30
  }
);

// Send broadcast
const broadcast = await CRMEngine.createBroadcast(creatorId, {
  segmentId: segment.id,
  subject: 'Join Our Live Workshop',
  content: 'We\'re hosting a live workshop this Saturday at 2 PM. Join us!',
  contentType: 'event_invite'
});

await CRMEngine.sendBroadcast(broadcast.id);
```

### 3. Track Product Performance
```typescript
// Get analytics
const analytics = await CRMEngine.getAnalytics(creatorId, 'month');

console.log('Top Products:', analytics.metrics.topPerformingProducts);
console.log('Conversion Rate:', analytics.metrics.conversionRate);
console.log('Total Revenue:', analytics.metrics.totalRevenue);
```

## 🧪 Testing Commands

```bash
# Test contact creation
curl -X POST https://your-functions-url/createCRMContact \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"targetUserId": "user_123", "userData": {"displayName": "Test", "avatar": "https://..."}}'

# Test segment creation
curl -X POST https://your-functions-url/createSegment \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"name": "Test Segment", "filters": {}}'

# Test broadcast (should fail with external link)
curl -X POST https://your-functions-url/createBroadcast \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"content": "Check out paypal.com/me"}'  # Should be blocked
```

## 📞 Support

For issues or questions:
1. Check [`PACK_143_IMPLEMENTATION_COMPLETE.md`](PACK_143_IMPLEMENTATION_COMPLETE.md)
2. Review safety validator at [`functions/src/pack143-safety-validator.ts`](functions/src/pack143-safety-validator.ts)
3. Check API endpoints at [`functions/src/pack143-endpoints.ts`](functions/src/pack143-endpoints.ts)

## ⚡ Performance Tips

1. **Batch Contact Updates**: Use batch writes for multiple contact updates
2. **Cache Segments**: Cache segment counts to avoid recalculation
3. **Paginate Contacts**: Always use limit/offset for large contact lists
4. **Index Queries**: Ensure Firestore indexes are deployed
5. **Lazy Load Analytics**: Load analytics on-demand, not on dashboard load

---

**Remember**: All CRM features must maintain zero visibility advantage and zero external monetization. Privacy and ethics are non-negotiable.