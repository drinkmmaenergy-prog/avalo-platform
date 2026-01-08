# Avalo Data Model

## Overview

Complete data model documentation for Avalo's Firestore database, including collections, relationships, and indexing strategy.

## Core Collections

### Users Collection

**Path**: `/users/{userId}`

```typescript
interface User {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  coverPhoto?: string;
  dateOfBirth: string;
  age: number;
  gender: 'male' | 'female' | 'non-binary' | 'other';
  bio?: string;
  location?: {
    city: string;
    country: string;
    coordinates?: { lat: number; lng: number };
  };
  interests: string[];
  isCreator: boolean;
  isVerified: boolean;
  kycStatus: 'pending' | 'submitted' | 'approved' | 'rejected';
  stats: {
    followers: number;
    following: number;
    posts: number;
    likesReceived: number;
  };
  settings: {
    visibility: 'public' | 'private' | 'friends';
    showLocation: boolean;
    showAge: boolean;
    allowMessages: boolean;
    messagePrice?: number;
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Indexes:**
- `email` (unique)
- `isCreator, isVerified`
- `location.city, location.country`
- `createdAt`

### Posts Collection

**Path**: `/posts/{postId}`

```typescript
interface Post {
  id: string;
  authorId: string;
  type: 'text' | 'image' | 'video' | 'story';
  content: string;
  mediaUrls?: string[];
  gated: boolean;
  unlockPrice?: number;
  likes: number;
  comments: number;
  views: number;
  shares: number;
  createdAt: Timestamp;
  expiresAt?: Timestamp; // For stories
}
```

**Subcollections:**
- `/posts/{postId}/likes/{userId}` - Post likes
- `/posts/{postId}/comments/{commentId}` - Comments

**Indexes:**
- `authorId, createdAt desc`
- `type, createdAt desc`
- `gated, createdAt desc`

### Chats Collection

**Path**: `/chats/{chatId}`

```typescript
interface Chat {
  id: string;
  participants: string[]; // [userId1, userId2]
  type: 'direct' | 'ai' | 'group';
  pricing: {
    basePrice: number;
    introMessagePrice: number;
    mediaMessagePrice: number;
  };
  freeMessagesUsed: number;
  freeMessagesLimit: number;
  lastMessage?: {
    content: string;
    senderId: string;
    createdAt: Timestamp;
  };
  unreadCount: Record<string, number>; // { userId: count }
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Subcollection:**
- `/chats/{chatId}/messages/{messageId}`

```typescript
interface Message {
  id: string;
  senderId: string;
  recipientId: string;
  content: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'gift';
  mediaUrl?: string;
  price?: number;
  paid: boolean;
  read: boolean;
  delivered: boolean;
  createdAt: Timestamp;
}
```

**Indexes:**
- `participants` (array-contains)
- `updatedAt desc`
- Messages: `chatId, createdAt desc`

### Transactions Collection

**Path**: `/transactions/{transactionId}`

```typescript
interface Transaction {
  id: string;
  userId: string;
  type: 'deposit' | 'withdraw' | 'purchase' | 'earning' | 'refund';
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  description: string;
  metadata: {
    stripePaymentId?: string;
    postId?: string;
    chatId?: string;
    messageId?: string;
  };
  createdAt: Timestamp;
  completedAt?: Timestamp;
}
```

**Indexes:**
- `userId, createdAt desc`
- `type, status`
- `status, createdAt desc`

### Wallets Collection

**Path**: `/wallets/{userId}`

```typescript
interface Wallet {
  userId: string;
  balance: number;
  currency: string;
  pendingBalance: number;
  lifetimeEarnings: number;
  lifetimeSpending: number;
  stripeCustomerId?: string;
  paymentMethods: Array<{
    id: string;
    type: string;
    last4?: string;
    isDefault: boolean;
  }>;
  updatedAt: Timestamp;
}
```

**Indexes:**
- `userId` (unique)

### Matches Collection

**Path**: `/matches/{matchId}`

```typescript
interface Match {
  id: string;
  userId: string;
  matchedUserId: string;
  score: number;
  reasons: string[];
  status: 'pending' | 'liked' | 'passed' | 'matched';
  chatId?: string;
  createdAt: Timestamp;
}
```

**Indexes:**
- `userId, status`
- `matchedUserId, status`
- `status, createdAt desc`

### AI Chats Collection

**Path**: `/aiChats/{chatId}`

```typescript
interface AIChat {
  id: string;
  userId: string;
  companionId: string;
  conversationHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Timestamp;
  }>;
  context: {
    userPreferences: Record<string, any>;
    memory: Record<string, any>;
  };
  nsfwEnabled: boolean;
  totalTokens: number;
  totalCost: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Indexes:**
- `userId, updatedAt desc`
- `companionId, createdAt desc`

### Subscriptions Collection

**Path**: `/subscriptions/{subscriptionId}`

```typescript
interface Subscription {
  id: string;
  userId: string;
  creatorId: string;
  tierId: string;
  status: 'active' | 'cancelled' | 'expired';
  startDate: Timestamp;
  expiresAt: Timestamp;
  autoRenew: boolean;
  stripeSubscriptionId?: string;
  createdAt: Timestamp;
}
```

**Indexes:**
- `userId, status`
- `creatorId, status`
- `expiresAt`

## Data Relationships

### User → Posts (1:N)
```
users/{userId} → posts (where authorId = userId)
```

### User → Chats (N:N)
```
users/{userId} → chats (where participants contains userId)
```

### Creator → Subscribers (1:N)
```
users/{creatorId} → subscriptions (where creatorId = creatorId)
```

### Match → Chat (1:1)
```
matches/{matchId}.chatId → chats/{chatId}
```

## Denormalization Strategy

### Why Denormalize?

Firestore charges per document read. Denormalization reduces reads by embedding frequently accessed data.

### What to Denormalize

**Posts:**
```typescript
{
  postId: "post123",
  // Embedded author data
  author: {
    uid: "user123",
    displayName: "John Doe",
    photoURL: "https://...",
    isVerified: true
  },
  content: "..."
}
```

**Benefits:**
- Single read gets post + author
- Reduced latency
- Lower costs

**Drawbacks:**
- Data can be stale
- Update complexity
- Storage overhead

### When to Normalize

- Frequently updated data
- Large nested objects
- Many-to-many relationships
- Security-sensitive data

## Indexing Strategy

### Automatic Indexes
Firestore automatically indexes:
- Single field ascending
- Single field descending
- Document ID

### Composite Indexes
Required for queries with multiple filters:

```json
{
  "collectionGroup": "posts",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "authorId", "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
}
```

### Index Maintenance
- Review unused indexes monthly
- Add indexes for slow queries
- Monitor index build time
- Clean up temporary indexes

## Data Migration

### Adding Fields
```typescript
// Safe - backwards compatible
await batch.update(userRef, {
  newField: defaultValue
});
```

### Removing Fields
```typescript
// Two-phase deployment
// Phase 1: Stop writing field
// Phase 2: Delete field
await batch.update(userRef, {
  oldField: FieldValue.delete()
});
```

### Changing Types
```typescript
// Create new field, migrate data, delete old
await batch.update(userRef, {
  scoreNew: parseFloat(oldScore),
  score: FieldValue.delete()
});
```

## Security Rules

### User Data
```javascript
match /users/{userId} {
  allow read: if request.auth != null;
  allow write: if request.auth.uid == userId;
}
```

### Creator Content
```javascript
match /posts/{postId} {
  allow read: if request.auth != null;
  allow create: if request.auth != null;
  allow update, delete: if request.auth.uid == resource.data.authorId;
}
```

### Payments
```javascript
match /transactions/{transactionId} {
  allow read: if request.auth.uid == resource.data.userId;
  allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
  allow update, delete: if false; // Immutable
}
```

## Query Patterns

### Feed Query
```typescript
// Get user feed
await db.collection('posts')
  .where('authorId', 'in', followingIds)
  .orderBy('createdAt', 'desc')
  .limit(20)
  .get();
```

### Chat List
```typescript
// Get user chats
await db.collection('chats')
  .where('participants', 'array-contains', userId)
  .orderBy('updatedAt', 'desc')
  .limit(50)
  .get();
```

### Revenue Report
```typescript
// Creator earnings
await db.collection('transactions')
  .where('userId', '==', creatorId)
  .where('type', '==', 'earning')
  .where('createdAt', '>=', startDate)
  .orderBy('createdAt', 'desc')
  .get();
```

## Data Retention

### Policies
- **User Data**: Retained until deletion request
- **Messages**: 1 year
- **Transactions**: 7 years (compliance)
- **Logs**: 90 days
- **Analytics**: Aggregated forever

### Deletion
- Soft delete for 30 days
- Hard delete after grace period
- Compliance with GDPR
- Backup retention: 90 days

## Performance Optimization

### Query Limits
- Default limit: 20 documents
- Maximum limit: 100 documents
- Use pagination for more

### Batch Operations
- Maximum 500 operations per batch
- Use batch for multi-document updates
- Atomic transactions for consistency

### Connection Pooling
- Reuse Firestore client
- Connection per function instance
- Automatic connection management

## Monitoring

### Metrics
- Collection sizes
- Document read/write counts
- Index usage
- Query performance
- Storage costs

### Alerts
- Expensive queries (>1000 reads)
- Missing indexes
- Collection hotspots
- Storage approaching limits