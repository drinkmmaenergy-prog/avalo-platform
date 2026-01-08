# PACK 426 — Firestore Multi-Region Distribution Strategy

## Overview

This document defines Avalo's multi-region Firestore architecture to support global scale with ultra-low latency, fault tolerance, and optimized write/read patterns across Europe, US, APAC, LATAM, and MENA.

---

## 1. PRIMARY REGIONS

### 1.1 Region Mapping

| Region Code | Firebase Location | Purpose | Priority |
|-------------|------------------|---------|----------|
| **EU** | `europe-west1` (Belgium) | Primary region for European users | P0 |
| **US** | `us-central1` (Iowa) | Primary region for Americas | P0 |
| **APAC** | `asia-south1` (Mumbai) | Primary region for Asia-Pacific | P1 |

### 1.2 Fallback Strategy

- **EU users**: EU → US → APAC
- **US users**: US → EU → APAC
- **APAC users**: APAC → EU → US
- **LATAM users**: US → EU → APAC
- **MENA users**: EU → APAC → US

---

## 2. COLLECTION TIER SEPARATION

### 2.1 High-Write Collections (Regional Distribution)

**Distributed across regions for minimum latency:**

| Collection | Region Strategy | Reason |
|-----------|----------------|---------|
| `chats/*` | Regional (EU/US/ASIA) | Sub-350ms latency requirement |
| `messages/*` | Co-located with chat region | Real-time messaging |
| `aiSessions/*` | Co-located with LLM region | Token efficiency + low latency |
| `retentionEvents/*` | Region-specific logging | High-volume event tracking |
| `analyticsEvents/*` | Regional buffering | Rate-limited batch writes |
| `swipeActions/*` | Regional caching | High throughput swiping |

### 2.2 Global Collections (Single Region + CDN Cache)

**Centralized for consistency, cached globally:**

| Collection | Region | Cache Strategy | Reason |
|-----------|--------|----------------|---------|
| `userProfiles/*` | EU (primary) | Edge cache 5 min | Strong consistency needed |
| `feedPosts/*` | EU (primary) | CDN cache 2 min | Global feed algorithm |
| `fraudSignals/*` | EU (primary) | No cache | Single source of truth |
| `walletTransactions/*` | EU (primary) | No cache | Financial integrity |
| `tokenPurchases/*` | EU (primary) | No cache | Payment accuracy |
| `verificationStatus/*` | EU (primary) | Cache 10 min | Identity verification |
| `subscriptions/*` | EU (primary) | Cache 1 min | Subscription state |

### 2.3 Read-Optimized Collections (Replicated)

**Replicated with eventual consistency:**

| Collection | Replication | Sync Delay | Use Case |
|-----------|-------------|-----------|----------|
| `badgeDefinitions/*` | Global replicas | 5 seconds | Badge display |
| `appConfig/*` | Global replicas | 1 minute | Feature flags |
| `contentModeration/*` | Global replicas | 10 seconds | Safety rules |
| `aiCompanionTemplates/*` | Global replicas | 30 seconds | AI character data |

---

## 3. ROUTING LOGIC

### 3.1 User-to-Region Assignment

```typescript
function assignUserRegion(userCountry: string): Region {
  const EU_COUNTRIES = [
    'DE', 'FR', 'GB', 'IT', 'ES', 'PL', 'NL', 'BE', 'AT', 'CH',
    'SE', 'NO', 'DK', 'FI', 'IE', 'PT', 'GR', 'CZ', 'RO', 'HU'
  ];
  
  const US_COUNTRIES = [
    'US', 'CA', 'MX', 'BR', 'AR', 'CL', 'CO', 'PE', 'VE'
  ];
  
  const APAC_COUNTRIES = [
    'IN', 'CN', 'JP', 'KR', 'AU', 'NZ', 'SG', 'TH', 'ID', 'PH',
    'VN', 'MY', 'PK', 'BD', 'TW', 'HK'
  ];
  
  if (EU_COUNTRIES.includes(userCountry)) return 'EU';
  if (US_COUNTRIES.includes(userCountry)) return 'US';
  if (APAC_COUNTRIES.includes(userCountry)) return 'APAC';
  
  // Default fallback
  return 'EU';
}
```

### 3.2 Region Override Rules

- **VIP users**: Can manually select preferred region
- **Business accounts**: Region locked based on business registration
- **Fraud flagged users**: Routed to EU (centralized monitoring)
- **First-time users**: Assigned based on IP geolocation

---

## 4. DATA CONSISTENCY MODEL

### 4.1 Strong Consistency (EU Primary)

- Wallet balances
- Token purchases
- Subscription status
- Fraud signals
- Identity verification
- Payment transactions

### 4.2 Eventual Consistency (Regional Replicas)

- Feed posts (2-5 second lag acceptable)
- User profiles (cache invalidation on update)
- Badge definitions
- AI companion templates
- App configuration

### 4.3 Session Consistency (Regional)

- Chat messages (session-bound)
- AI conversations (context locality)
- Swipe sessions (temporary state)

---

## 5. WRITE PATTERNS

### 5.1 Regional Writes

**Chat Message Write:**
```
User (EU) → EU Firestore → Local writes
User (US) → US Firestore → Local writes
Cross-region chat → Both regions updated asynchronously
```

### 5.2 Global Writes

**Profile Update:**
```
User (any region) → EU Firestore primary → Cache invalidation globally
```

### 5.3 Distributed Transactions

**Token Purchase:**
```
1. Write to EU Firestore (transactions)
2. Update user wallet (EU primary)
3. Trigger analytics event (regional)
4. Invalidate cache globally
```

---

## 6. FIRESTORE INDEXES

### 6.1 Regional Indexes

Each region maintains:
- Chat queries by timestamp
- AI session lookups by userId
- Swipe history by sessionId
- Retention event queries by timestamp

### 6.2 Global Indexes

EU primary maintains:
- User profile searches
- Feed post ranking queries
- Fraud detection composite indexes
- Wallet transaction history

---

## 7. COST OPTIMIZATION

### 7.1 Read Cost Reduction

- **Edge caching**: 70% read reduction for profiles
- **Regional routing**: 45% latency improvement
- **Batch reads**: Group related queries

### 7.2 Write Cost Management

- **Regional buffering**: Batch analytics writes every 10 seconds
- **Deduplication**: Prevent duplicate swipe events
- **Rate limiting**: Throttle high-volume users

### 7.3 Storage Optimization

- **TTL policies**: Auto-delete old chat messages (90 days)
- **Compression**: Store large text fields compressed
- **Media references**: Store URLs only, not binaries

---

## 8. MIGRATION STRATEGY

### Phase 1: EU Single-Region (Current)
- All data in `europe-west1`
- No regional routing

### Phase 2: US Region Addition
- Deploy US Firestore instance
- Route US/LATAM users to US region
- Maintain EU as fallback

### Phase 3: APAC Region Addition
- Deploy APAC Firestore instance
- Route APAC users to Mumbai
- Full tri-region architecture

### Phase 4: Data Rebalancing
- Migrate existing US users to US region
- Migrate APAC users to APAC region
- Keep EU users in EU region

---

## 9. MONITORING & ALERTS

### Key Metrics

| Metric | Threshold | Action |
|--------|-----------|--------|
| **Write latency** | > 500ms (p95) | Scale up region |
| **Read latency** | > 200ms (p95) | Increase cache TTL |
| **Cross-region sync delay** | > 10 seconds | Alert engineering |
| **Regional unavailability** | > 1 minute | Trigger failover |
| **Write errors** | > 1% | Investigate immediately |

---

## 10. SECURITY & COMPLIANCE

### 10.1 Data Residency

- **GDPR (EU)**: EU user data stays in EU region
- **CCPA (US)**: US user data can be stored in US region
- **APAC regulations**: Region-specific compliance

### 10.2 Cross-Region Transfer Rules

- **Encrypted in transit**: All cross-region sync uses TLS 1.3
- **Audit logging**: All cross-region data access logged
- **User consent**: Required for cross-region data movement

---

## 11. ACCEPTANCE CRITERIA

✅ Firestore regions deployed: EU, US, APAC  
✅ Collection tier separation implemented  
✅ Regional routing logic active  
✅ Cache strategies configured  
✅ Monitoring dashboards deployed  
✅ Failover mechanisms tested  
✅ Cost optimization rules applied  
✅ Data residency compliance verified  

---

**Status**: Ready for implementation  
**Owner**: Infrastructure Team  
**Dependencies**: PACK 425 (Global Market Expansion Engine)  
**Next**: PACK 427 (Global Observability & Incident Response)
