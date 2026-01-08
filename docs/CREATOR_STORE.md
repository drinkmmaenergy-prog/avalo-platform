# Avalo Creator Marketplace (Phase 24)

## Overview

The Creator Marketplace enables creators to sell digital products (photo packs, videos, custom content) directly to users, expanding monetization beyond chat, tips, and calendar bookings.

---

## Revenue Model

**Split**: 20% Platform / 80% Creator

This is consistent with the calendar booking revenue split and ensures creators earn the majority of revenue from their digital products.

```typescript
platformFee = floor(price * 0.20)
creatorEarnings = price - platformFee
```

**Example**:
- Product price: 1,000 tokens
- Platform fee: 200 tokens
- Creator earnings: 800 tokens

---

## Product Types

### 1. PHOTO_PACK

**Description**: Collection of exclusive photos (typically 5-20 images)

**Typical Pricing**: 500-2,000 tokens

**Content Format**: JPEG/PNG files

**Use Cases**:
- Behind-the-scenes content
- Professional photoshoots
- Exclusive lifestyle photos

### 2. VIDEO

**Description**: Single video file (up to 10 minutes)

**Typical Pricing**: 1,000-5,000 tokens

**Content Format**: MP4/MOV files

**Use Cases**:
- Personalized video messages
- Tutorials or educational content
- Performance recordings

### 3. CALL_SLOT

**Description**: Exclusive 1-on-1 call slot booking (integration with calendar)

**Typical Pricing**: 2,000-10,000 tokens

**Use Cases**:
- Consulting sessions
- Personalized advice
- Virtual meet-and-greet

### 4. CUSTOM

**Description**: Creator-defined custom content or service

**Typical Pricing**: Variable

**Use Cases**:
- Custom artwork commissions
- Personalized merchandise
- Exclusive experiences

---

## Product Lifecycle

### Statuses

```
DRAFT → ACTIVE → PAUSED → ARCHIVED
         ↓
      (sales)
```

| Status | Description | Visible to Users | Purchasable |
|--------|-------------|------------------|-------------|
| `DRAFT` | Creator is editing product | No | No |
| `ACTIVE` | Product live in marketplace | Yes | Yes |
| `PAUSED` | Temporarily unavailable | Yes (with badge) | No |
| `ARCHIVED` | Removed from marketplace | No | No |

---

## API Endpoints

### 1. Create Product

```typescript
const result = await functions.httpsCallable('createCreatorProductV1')({
  type: "photo_pack",
  title: "Summer Beach Photoshoot",
  description: "Exclusive 10 photos from my recent beach trip",
  price: 1500,
  stock: 50,  // Optional: limit purchases
  contentFiles: ["photo1.jpg", "photo2.jpg", ...],
});

// Returns:
{
  productId: "prod_abc123",
  uploadUrls: {
    "photo1.jpg": "https://storage...?expires=...",
    "photo2.jpg": "https://storage...?expires=...",
    // ... more signed URLs (30 min expiry)
  }
}
```

**Requirements**:
- User must be a creator (verified 18+)
- Price: 10-50,000 tokens
- Title: 5-100 characters
- Description: 10-1000 characters
- Content files: 1-50 files

### 2. Publish Product

```typescript
await functions.httpsCallable('publishCreatorProductV1')({
  productId: "prod_abc123"
});

// Changes status from DRAFT → ACTIVE
```

### 3. Get Creator Products

```typescript
const products = await functions.httpsCallable('getCreatorProductsV1')({
  creatorId: "creator_xyz",  // Optional: filter by creator
  type: "photo_pack",         // Optional: filter by type
  limit: 20,
  offset: 0
});

// Returns:
{
  products: [
    {
      productId: "prod_abc123",
      creatorId: "creator_xyz",
      creatorName: "Jane Doe",
      type: "photo_pack",
      title: "Summer Beach Photoshoot",
      description: "...",
      price: 1500,
      thumbnailURL: "...",
      purchaseCount: 42,
      status: "active",
      createdAt: Timestamp,
    },
    // ... more products
  ],
  total: 150
}
```

### 4. Purchase Product

```typescript
const result = await functions.httpsCallable('purchaseCreatorProductV1')({
  productId: "prod_abc123"
});

// Returns:
{
  purchaseId: "pur_xyz789",
  contentURLs: [
    "https://storage...?expires=...",  // 7-day signed URLs
    // ... more content URLs
  ],
  expiresAt: Timestamp,  // 7 days from now
  downloadLimit: 3       // Max downloads per purchase
}
```

**Transaction Flow**:
1. Check user has sufficient tokens
2. Verify product is available
3. Atomic Firestore transaction:
   - Deduct tokens from buyer
   - Credit creator (80%)
   - Credit platform (20%)
   - Create transaction records
   - Update product stats
   - Decrement stock (if limited)
4. Generate signed content URLs
5. Create purchase record

### 5. Get My Purchases

```typescript
const purchases = await functions.httpsCallable('getMyPurchasesV1')({
  limit: 20,
  offset: 0
});

// Returns:
{
  purchases: [
    {
      purchaseId: "pur_xyz789",
      productId: "prod_abc123",
      productTitle: "Summer Beach Photoshoot",
      creatorName: "Jane Doe",
      price: 1500,
      purchasedAt: Timestamp,
      contentURLs: [...],
      expiresAt: Timestamp,
      downloadCount: 1,
      downloadLimit: 3
    }
  ]
}
```

### 6. Deactivate Product

```typescript
await functions.httpsCallable('deactivateProductV1')({
  productId: "prod_abc123"
});

// Changes status to ARCHIVED
```

### 7. Get Creator Analytics

```typescript
const analytics = await functions.httpsCallable('getCreatorAnalyticsV1')({});

// Returns:
{
  totalProducts: 15,
  totalRevenue: 125000,      // Tokens earned
  totalPurchases: 342,
  totalViews: 5420,
  topProducts: [
    {
      productId: "prod_abc123",
      title: "Summer Beach Photoshoot",
      revenue: 45000,
      purchases: 30,
      views: 890
    },
    // ... top 5
  ]
}
```

---

## Firestore Schema

### `creatorProducts/{productId}`

```typescript
{
  productId: string,
  creatorId: string,
  type: ProductType,
  title: string,
  description: string,
  price: number,              // Tokens
  stock?: number,             // Optional purchase limit
  thumbnailURL: string,
  contentFiles: string[],     // GCS paths
  status: ProductStatus,
  purchaseCount: number,
  totalRevenue: number,       // Creator earnings only
  viewCount: number,
  createdAt: Timestamp,
  updatedAt: Timestamp,
  publishedAt?: Timestamp,
}
```

### `productPurchases/{purchaseId}`

```typescript
{
  purchaseId: string,
  productId: string,
  buyerId: string,
  creatorId: string,
  price: number,
  platformFee: number,
  creatorEarnings: number,
  contentURLs: string[],      // Signed URLs (7-day expiry)
  expiresAt: Timestamp,
  downloadCount: number,
  downloadLimit: number,
  purchasedAt: Timestamp,
  lastAccessedAt?: Timestamp,
}
```

---

## Content Storage

### Google Cloud Storage

**Bucket**: `{project-id}-creator-products`

**Path Structure**:
```
/creator-products/{creatorId}/{productId}/{filename}
```

**Example**:
```
gs://avalo-prod-creator-products/creator_xyz/prod_abc123/photo1.jpg
```

### Upload Flow

1. Creator creates product → gets signed upload URLs (30 min expiry)
2. Client uploads files directly to GCS using signed URLs
3. Creator publishes product → content becomes available
4. Purchases generate signed download URLs (7 day expiry)

### Access Control

- **Upload**: Signed URLs with 30-minute expiry
- **Download**: Signed URLs with 7-day expiry
- **Refresh**: Buyers can refresh URLs if expired (up to download limit)

---

## Download Limits

**Default**: 3 downloads per purchase

**Rationale**: Prevents sharing purchased content

**Enforcement**:
- Download count tracked in `productPurchases` collection
- URLs expire after 7 days
- Users can refresh URLs if not expired and under download limit

---

## Pricing Constraints

- **Minimum**: 10 tokens
- **Maximum**: 50,000 tokens
- **Must be integer** (no fractional tokens)

**Rationale**: Prevents pricing errors and ensures reasonable transaction sizes

---

## Stock Management

Products can have optional stock limits:
- **Unlimited**: No `stock` field set
- **Limited**: `stock` field set to initial quantity
- **Auto-decrement**: Each purchase decrements stock by 1
- **Sold out**: Stock reaches 0, product becomes unavailable

---

## Security Rules

```javascript
match /creatorProducts/{productId} {
  allow read: if authed() &&
    (resource.data.status == "active" ||
     resource.data.creatorId == uid() ||
     isAdmin());

  allow create: if authed() &&
    request.resource.data.creatorId == uid() &&
    request.resource.data.status == "draft";

  allow update: if authed() && resource.data.creatorId == uid();

  allow delete: if authed() &&
    (resource.data.creatorId == uid() || isAdmin());
}

match /productPurchases/{purchaseId} {
  allow read: if authed() &&
    (resource.data.buyerId == uid() ||
     resource.data.creatorId == uid() ||
     isAdmin());

  allow create: if false; // Via callable function only
  allow update: if false; // Download count via server
  allow delete: if false;
}
```

---

## Feature Flag

- **Flag Name**: `creator_store`
- **Default**: `false`
- **Rollout**: Gradual percentage-based rollout

---

## Testing

See `functions/src/creatorStore.test.ts` for comprehensive unit tests covering:
- Revenue split calculation
- Pricing validation
- Product availability checks
- Signed URL expiration
- Purchase eligibility
- Stock management
- Creator analytics aggregation

---

## UI/UX Considerations

### Creator Dashboard

**Sections**:
1. **Products**: List all products with status
2. **Analytics**: Revenue, purchases, top products
3. **Create New**: Product creation wizard

**Features**:
- Drag-and-drop file uploads
- Price calculator (shows platform fee + earnings)
- Stock management
- Pause/Resume products

### Buyer Experience

**Discovery**:
- Creator profile → Products tab
- Marketplace browse page
- Search by type, price range

**Purchase Flow**:
1. View product details
2. Click "Purchase for X tokens"
3. Confirm purchase
4. Instant access to content (download/view)

**My Purchases**:
- List all purchased products
- Re-download if not expired
- Refresh URLs if expired (within limit)

---

## Moderation

### Content Guidelines

Prohibited content:
- Illegal content
- Explicit adult content (outside platform policy)
- Copyrighted material (without rights)
- Spam or misleading content

### Reporting

Users can report products via:
```typescript
await functions.httpsCallable('reportUserCallable')({
  targetUserId: creatorId,
  reason: "inappropriate_content",
  details: "Product contains prohibited content",
  context: { productId: "prod_abc123" }
});
```

### Moderation Actions

Moderators can:
- Review reported products
- Archive products (removes from marketplace)
- Ban creators from selling products
- Issue refunds for policy violations

---

## Analytics & Metrics

### Platform Metrics

- Total marketplace revenue (platform fees)
- Total creator earnings
- Average product price
- Best-selling product types
- Conversion rate (views → purchases)

### Creator Metrics

- Revenue per product
- Purchase velocity
- View-to-purchase conversion rate
- Top-performing products
- Earnings trend (daily/weekly/monthly)

---

## Future Enhancements

- **Bundles**: Sell multiple products as a package
- **Subscriptions**: Recurring access to content library
- **Auctions**: Bid-based pricing for exclusive content
- **Tips on Products**: Allow buyers to tip on top of purchase price
- **Reviews**: Buyer reviews and ratings
- **Recommendations**: AI-powered product suggestions
- **Promotions**: Discount codes and limited-time offers
- **Affiliates**: Referral commissions for promoting products

---

## Integration with Existing Systems

### Wallet System

- Uses existing token balance
- Same transaction logging as chat/tips/calendar
- Same payout system for creator withdrawals

### Calendar Integration

`CALL_SLOT` products can optionally:
- Auto-create calendar availability
- Sync with existing calendar slots
- Allow booking via product purchase

### Moderation System

- Products can be flagged via existing report system
- Same moderation queue as posts/messages
- Admin panel includes product review tools

---

## Compliance

### GDPR

- Purchase history available in data export
- Account deletion removes purchase records (but not transaction logs)
- Content access revoked on account deletion

### Tax Reporting

- Platform tracks revenue splits for tax reporting
- Creators responsible for reporting earnings
- Transaction records retained for 7 years (legal requirement)

---

## Performance Optimization

### Caching

- Product listings cached (5 min TTL)
- Creator analytics cached (15 min TTL)
- Signed URLs cached client-side until near expiry

### CDN

- Thumbnails served via CDN
- Content files served via signed URLs (direct GCS access)

### Indexing

Required Firestore indexes:
- `creatorProducts`: `status + createdAt`
- `creatorProducts`: `creatorId + status + createdAt`
- `creatorProducts`: `type + status + createdAt`
- `productPurchases`: `buyerId + purchasedAt`
- `productPurchases`: `creatorId + purchasedAt`

---

## Deployment Checklist

- [ ] Enable `creator_store` feature flag for beta users
- [ ] Create GCS bucket with CORS configuration
- [ ] Set up signed URL generation service account
- [ ] Configure Firestore indexes
- [ ] Update security rules
- [ ] Deploy Cloud Functions
- [ ] Test purchase flow end-to-end
- [ ] Set up analytics tracking
- [ ] Enable monitoring and alerts
- [ ] Train moderators on product review process
- [ ] Prepare user documentation and FAQs
- [ ] Announce to creators via email/notification
