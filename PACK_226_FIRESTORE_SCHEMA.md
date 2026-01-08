# PACK 226 - Chemistry Lock-In Firestore Schema

## Overview

This document defines the Firestore data structure and security rules for the Chemistry Lock-In Engine (PACK 226).

---

## Collections

### 1. conversations/{conversationId}

Extended fields for Chemistry Lock-In:

```typescript
{
  // ... existing conversation fields ...
  
  // Chemistry Lock-In State
  chemistryLockIn: {
    isActive: boolean,              // Whether Lock-In is currently active
    startedAt: Timestamp | null,    // When Lock-In was activated
    endedAt: Timestamp | null,      // When Lock-In ended (if inactive)
    strengthScore: number,          // Chemistry score (sum of signal weights)
    signals: Array<{                // Detected chemistry signals
      type: string,                 // Signal type (messages, calls, etc.)
      weight: number,               // Signal weight (usually 1)
      detectedAt: Timestamp,        // When signal was detected
      metadata?: any                // Optional signal-specific data
    }>,
    lastActivityAt: Timestamp,      // Last message/call in conversation
    exitReason?: string,            // Why Lock-In ended (inactivity, disabled, safety, breakup)
    perksExpiresAt: Timestamp | null, // When special perks expire (72h from start)
    conversionSuggestionShown: boolean, // Whether 72h suggestion was shown
    reEntryCount: number            // Number of times Lock-In reactivated
  },
  
  // Abuse Prevention
  toxicCooldownUntil?: Timestamp,   // Toxic behavior cooldown (14 days)
  
  // Stats
  messageCount?: number             // Total messages in conversation
}
```

### 2. users/{userId}

Extended fields for Chemistry Lock-In notifications:

```typescript
{
  // ... existing user fields ...
  
  // Notification Preferences
  notificationPreferences: {
    globalNotifications: boolean,   // Master notification toggle
    chemistryLockIn: boolean        // Chemistry-specific notifications
  },
  
  // Notification Cooldowns (per notification type)
  lastChemistryNotification_lock_in_activated?: Timestamp,
  lastChemistryNotification_chemistry_continuing?: Timestamp,
  lastChemistryNotification_thinking_of_you?: Timestamp,
  lastChemistryNotification_perks_expiring?: Timestamp,
  lastChemistryNotification_conversion_suggestion?: Timestamp,
  
  // Per-conversation notification disabling
  chemistryNotificationsDisabled?: {
    [conversationId: string]: boolean
  }
}
```

### 3. users/{userId}/visibilityBoosts/{targetUserId}

Temporary visibility boost for Lock-In partners:

```typescript
{
  targetUserId: string,             // User to boost in discovery
  conversationId: string,           // Related conversation
  reason: 'chemistry_lock_in',      // Boost reason
  multiplier: number,               // Visibility multiplier (default: 10)
  expiresAt: Timestamp,             // When boost expires (72h)
  createdAt: Timestamp              // When boost was created
}
```

### 4. users/{userId}/photoLikes/{likeId}

Used to detect mutual photo likes:

```typescript
{
  userId: string,                   // User who liked the photo
  photoId: string,                  // Photo that was liked
  createdAt: Timestamp              // When like occurred
}
```

### 5. calls/{callId}

Used for chemistry signal detection:

```typescript
{
  // ... existing call fields ...
  conversationId: string,           // Related conversation
  type: 'voice' | 'video',          // Call type
  status: 'completed' | 'cancelled' | 'active',
  startedAt: Timestamp,
  endedAt?: Timestamp,
  duration?: number                 // Call duration in seconds
}
```

---

## Firestore Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Helper functions
    function isAuthenticated() {
      return request.auth != null;
    }
    
    function isParticipant(conversationId) {
      return isAuthenticated() && 
        request.auth.uid in get(/databases/$(database)/documents/conversations/$(conversationId)).data.participants;
    }
    
    function isOwner(userId) {
      return isAuthenticated() && request.auth.uid == userId;
    }
    
    // Conversations
    match /conversations/{conversationId} {
      // Read: participants only
      allow read: if isParticipant(conversationId);
      
      // Write: participants only (but restrict chemistryLockIn fields)
      allow update: if isParticipant(conversationId) && 
        // Participants cannot directly modify Lock-In state
        !request.resource.data.diff(resource.data).affectedKeys()
          .hasAny(['chemistryLockIn.isActive', 'chemistryLockIn.startedAt', 
                   'chemistryLockIn.strengthScore', 'chemistryLockIn.signals']);
      
      // Messages subcollection
      match /messages/{messageId} {
        allow read: if isParticipant(conversationId);
        allow create: if isParticipant(conversationId) && 
          request.resource.data.senderId == request.auth.uid;
      }
    }
    
    // Users
    match /users/{userId} {
      allow read: if isAuthenticated();
      
      // Users can update their own notification preferences
      allow update: if isOwner(userId) && 
        // Can only update notification preferences
        request.resource.data.diff(resource.data).affectedKeys()
          .hasAny(['notificationPreferences', 'chemistryNotificationsDisabled']);
      
      // Visibility boosts (managed by server)
      match /visibilityBoosts/{targetUserId} {
        allow read: if isOwner(userId);
        allow write: if false; // Server-only writes
      }
      
      // Photo likes
      match /photoLikes/{likeId} {
        allow read: if isOwner(userId);
        allow create: if isOwner(userId) && 
          request.resource.data.userId == request.auth.uid;
      }
      
      // Notifications
      match /notifications/{notificationId} {
        allow read: if isOwner(userId);
        allow update: if isOwner(userId) && 
          // Can only mark as read
          request.resource.data.diff(resource.data).affectedKeys()
            .hasOnly(['read']);
      }
    }
    
    // Calls (managed by server)
    match /calls/{callId} {
      allow read: if isAuthenticated() && 
        request.auth.uid in resource.data.participants;
      allow write: if false; // Server-only writes
    }
  }
}
```

---

## Firestore Indexes

Required composite indexes for Chemistry Lock-In queries:

```json
{
  "indexes": [
    {
      "collectionGroup": "conversations",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "chemistryLockIn.isActive", "order": "ASCENDING" },
        { "fieldPath": "chemistryLockIn.lastActivityAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "messages",
      "queryScope": "COLLECTION_GROUP",
      "fields": [
        { "fieldPath": "conversationId", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "messages",
      "queryScope": "COLLECTION_GROUP",
      "fields": [
        { "fieldPath": "senderId", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "calls",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "conversationId", "order": "ASCENDING" },
        { "fieldPath": "startedAt", "order": "DESCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "visibilityBoosts",
      "queryScope": "COLLECTION_GROUP",
      "fields": [
        { "fieldPath": "expiresAt", "order": "ASCENDING" },
        { "fieldPath": "reason", "order": "ASCENDING" }
      ]
    }
  ]
}
```

---

## Data Migration

### Initial Setup

1. Add default notification preferences to existing users:

```typescript
// Cloud Function or script
async function addDefaultChemistryPreferences() {
  const usersSnapshot = await db.collection('users').get();
  
  const batch = db.batch();
  let updateCount = 0;
  
  for (const doc of usersSnapshot.docs) {
    const user = doc.data();
    
    if (!user.notificationPreferences) {
      batch.update(doc.ref, {
        'notificationPreferences.globalNotifications': true,
        'notificationPreferences.chemistryLockIn': true
      });
      updateCount++;
    }
  }
  
  if (updateCount > 0) {
    await batch.commit();
  }
  
  console.log(`Updated ${updateCount} users with default preferences`);
}
```

2. Initialize chemistryLockIn object for existing conversations:

```typescript
async function initializeChemistryLockIn() {
  const conversationsSnapshot = await db.collection('conversations').get();
  
  const batch = db.batch();
  let updateCount = 0;
  
  for (const doc of conversationsSnapshot.docs) {
    const conversation = doc.data();
    
    if (!conversation.chemistryLockIn) {
      batch.update(doc.ref, {
        'chemistryLockIn.isActive': false,
        'chemistryLockIn.startedAt': null,
        'chemistryLockIn.endedAt': null,
        'chemistryLockIn.strengthScore': 0,
        'chemistryLockIn.signals': [],
        'chemistryLockIn.lastActivityAt': conversation.lastMessageAt || Timestamp.now(),
        'chemistryLockIn.conversionSuggestionShown': false,
        'chemistryLockIn.reEntryCount': 0
      });
      updateCount++;
    }
  }
  
  if (updateCount > 0) {
    await batch.commit();
  }
  
  console.log(`Initialized chemistryLockIn for ${updateCount} conversations`);
}
```

---

## Performance Considerations

1. **Indexes**: Deploy all composite indexes before enabling Lock-In features
2. **Batch Operations**: Use batched writes for visibility boosts (max 500 per batch)
3. **Query Limits**: Limit signal detection queries to 100 messages max
4. **Caching**: Cache conversation Lock-In state in client app to reduce reads
5. **Notification Throttling**: Max 1 chemistry notification per user per 12 hours

---

## Monitoring Queries

### Active Lock-Ins Count
```typescript
const activeCount = await db
  .collection('conversations')
  .where('chemistryLockIn.isActive', '==', true)
  .count()
  .get();
```

### Average Chemistry Score
```typescript
const conversations = await db
  .collection('conversations')
  .where('chemistryLockIn.isActive', '==', true)
  .select('chemistryLockIn.strengthScore')
  .get();

const avgScore = conversations.docs
  .reduce((sum, doc) => sum + doc.data().chemistryLockIn.strengthScore, 0) 
  / conversations.size;
```

### Lock-In Expiration Queue
```typescript
const expiringLockIns = await db
  .collection('conversations')
  .where('chemistryLockIn.isActive', '==', true)
  .where('chemistryLockIn.perksExpiresAt', '<=', Timestamp.fromDate(
    new Date(Date.now() + 24 * 60 * 60 * 1000) // Next 24h
  ))
  .get();
```

---

## Backup Strategy

- Backup `conversations` collection daily (includes Lock-In state)
- Backup `users` notification preferences weekly
- Retain `visibilityBoosts` for 90 days (auto-cleanup)
- Archive expired Lock-In data after 180 days

---

## CONFIRMATION

✅ PACK 226 Firestore schema defined
✅ Security rules implemented
✅ Required indexes documented
✅ Data migration scripts provided
✅ Performance considerations noted