# PACK 46 — Quick Reference Guide
## Trust Engine & Blocklist Safety Mesh

**One-page reference for developers integrating PACK 46**

---

## 🎯 Core Concept

Trust scoring + Blocklist system that controls **WHO can interact**, not **HOW MUCH they pay**.

- Trust Score: 0-100 (deterministic)
- Risk Flags: SCAM_SUSPECT, HARASSMENT, SPAMMER, GHOSTING_EARNER
- Earn Mode Control: Disabled if score < 40 or GHOSTING_EARNER flag
- Blocklist: Server-side + local cache, hard enforcement

**Zero changes to token prices or revenue splits.**

---

## 📦 Import What You Need

```typescript
// Service
import {
  getTrustState,
  getBlocklist,
  blockUser,
  reportUser,
  isUserHighRisk,
  isEarnModeAllowed,
  isUserBlocked
} from '../services/trustService';

// Components
import { TrustWarningBanner } from '../components/TrustWarningBanner';
import { BlockedUserBanner } from '../components/BlockedUserBanner';
import { ReportUserSheet } from '../components/ReportUserSheet';

// Hook (easiest)
import { useTrustAndBlocklist } from '../hooks/useTrustAndBlocklist';
```

---

## 🚀 Quick Integration

### Option 1: Use the Hook (Recommended)

```typescript
function ChatScreen({ currentUserId, partnerId }) {
  const { isBlocked, isHighRisk, blockUser } = useTrustAndBlocklist({
    currentUserId,
    targetUserId: partnerId,
    autoLoad: true
  });

  if (isBlocked) return <BlockedUserBanner />;

  return (
    <View>
      <TrustWarningBanner userId={partnerId} />
      {/* Rest of UI */}
    </View>
  );
}
```

### Option 2: Use Services Directly

```typescript
function SwipeScreen({ currentUserId, profiles }) {
  const [blocklist, setBlocklist] = useState(null);

  useEffect(() => {
    getBlocklist(currentUserId).then(setBlocklist);
  }, []);

  const visibleProfiles = profiles.filter(p => 
    !isUserBlocked(blocklist, p.userId)
  );

  return <ProfileList profiles={visibleProfiles} />;
}
```

---

## 🔧 Common Operations

### Block a User

```typescript
import { blockUser } from '../services/trustService';

await blockUser(currentUserId, targetUserId);
// Automatically updates cache and backend
```

### Report a User

```typescript
import { reportUser } from '../services/trustService';

await reportUser({
  reporterId: currentUserId,
  targetId: targetUserId,
  reason: 'SCAM', // or 'HARASSMENT', 'SPAM', 'OTHER'
  messageId: 'optional-msg-id'
});
```

### Check if Blocked

```typescript
import { getBlocklist, isUserBlocked } from '../services/trustService';

const blocklist = await getBlocklist(currentUserId);
const blocked = isUserBlocked(blocklist, targetUserId);
```

### Check if High Risk

```typescript
import { getTrustState, isUserHighRisk } from '../services/trustService';

const trustState = await getTrustState(targetUserId);
const highRisk = isUserHighRisk(trustState);
// Returns true if score < 40 OR has high-risk flags
```

### Check Earn Mode Eligibility

```typescript
import { getTrustState, isEarnModeAllowed } from '../services/trustService';

const trustState = await getTrustState(currentUserId);
const canEarn = isEarnModeAllowed(trustState);
// Returns false if score < 40 OR has GHOSTING_EARNER flag
```

---

## 🎨 UI Components

### Trust Warning Banner

```tsx
<TrustWarningBanner 
  userId={targetUserId} 
  locale="en" 
/>
```

Shows: "⚠ This profile has been reported by other users. Interact with caution."

### Blocked User Banner

```tsx
<BlockedUserBanner locale="en" />
```

Shows: "🚫 You blocked this user."

### Report User Sheet

```tsx
const [showReport, setShowReport] = useState(false);

<ReportUserSheet
  visible={showReport}
  targetUserId={targetUserId}
  targetUserName="John Doe"
  reporterId={currentUserId}
  locale="en"
  onClose={() => setShowReport(false)}
  onReported={() => Toast.show('Report submitted')}
/>
```

---

## 📊 Trust Score Formula

```
trustScore = 80
  - (3 × totalReportsReceived)
  - (5 × totalBlocksReceived)
  - (4 × ghostingEarnSessions)
  - (2 × spamMessageCount)

Clamped to [0, 100]

Risk Flags:
- totalReportsReceived ≥ 3 → SCAM_SUSPECT
- totalBlocksReceived ≥ 5 → HARASSMENT
- spamMessageCount ≥ 10 → SPAMMER
- ghostingEarnSessions ≥ 5 → GHOSTING_EARNER

Earn Mode Allowed:
- false if (score < 40 OR has GHOSTING_EARNER flag)
- true otherwise
```

---

## 🔒 Enforcement Points

### 1. Chat Screen
- Check `isBlocked` → prevent message sending
- Show `BlockedUserBanner` if blocked
- Show `TrustWarningBanner` if high risk
- Add "Report" and "Block" menu items

### 2. Swipe/Discovery Screen
- Filter profiles: `profiles.filter(p => !isUserBlocked(blocklist, p.id))`
- Blocked users never appear

### 3. Profile View Screen
- Check `isBlocked` → prevent viewing
- Show `TrustWarningBanner` if high risk
- Add "Block" action

### 4. Earn Mode Settings
- Load trust state for current user
- Disable toggle if `!isEarnModeAllowed(trustState)`
- Show disabled message

---

## 💾 Caching

**Storage**: AsyncStorage  
**Keys**: 
- `trust_state_v1_${userId}`
- `blocklist_v1_${userId}`

**TTL**: 5 minutes  
**Strategy**: Cache-first with background refresh  
**Offline**: Fully functional from cache

---

## 🌐 Localization

**English** (`strings.en.json`):
- trust.warningHighRisk
- trust.blockedBanner
- trust.earnDisabled
- trust.reportUser
- trust.report.reason.scam/harassment/spam/other

**Polish** (`strings.pl.json`):
Same keys with Polish translations

---

## 🔬 Testing

**Unit Tests**: [`functions/src/__tests__/trustSafetyPack46.test.ts`](functions/src/__tests__/trustSafetyPack46.test.ts:1)

Run tests:
```bash
cd functions
npm test trustSafetyPack46
```

**Manual Test Checklist**:
1. ✓ Report a user → verify counter increments
2. ✓ Block a user → verify blocklist updates
3. ✓ Reach 3 reports → verify SCAM_SUSPECT flag
4. ✓ Score drops below 40 → verify earn mode disabled
5. ✓ Go offline → verify blocklist still enforces
6. ✓ View high-risk profile → verify warning shows

---

## 📁 File Reference

| What | Where |
|------|-------|
| Backend Core | [`functions/src/trustSafetyPack46.ts`](functions/src/trustSafetyPack46.ts:1) |
| Cloud Functions | [`functions/src/index.ts:1251-1428`](functions/src/index.ts:1251) |
| Mobile Service | [`app-mobile/services/trustService.ts`](app-mobile/services/trustService.ts:1) |
| Warning Banner | [`app-mobile/components/TrustWarningBanner.tsx`](app-mobile/components/TrustWarningBanner.tsx:1) |
| Blocked Banner | [`app-mobile/components/BlockedUserBanner.tsx`](app-mobile/components/BlockedUserBanner.tsx:1) |
| Report Sheet | [`app-mobile/components/ReportUserSheet.tsx`](app-mobile/components/ReportUserSheet.tsx:1) |
| Hook | [`app-mobile/hooks/useTrustAndBlocklist.ts`](app-mobile/hooks/useTrustAndBlocklist.ts:1) |
| Integration Guide | [`app-mobile/components/trust/README.md`](app-mobile/components/trust/README.md:1) |
| Tests | [`functions/src/__tests__/trustSafetyPack46.test.ts`](functions/src/__tests__/trustSafetyPack46.test.ts:1) |

---

## 🚨 Important Rules

1. **DO NOT** change token prices
2. **DO NOT** modify revenue splits
3. **DO NOT** introduce refunds
4. **DO NOT** give free tokens
5. **DO** enforce blocklist everywhere
6. **DO** show warnings for high-risk users
7. **DO** disable earn mode when not allowed
8. **DO** handle offline gracefully

---

## 💡 Pro Tips

1. **Load blocklist early**: On app start or login
2. **Use the hook**: Simplest integration pattern
3. **Cache aggressively**: Trust data changes slowly
4. **Fail open for discovery**: If cache fails, show profiles (but still enforce blocks)
5. **Trust warnings are soft**: Don't block interaction, just inform
6. **Blocks are hard**: Completely prevent interaction

---

## 📞 Backend API Examples

### JavaScript/TypeScript

```typescript
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

// Report user
const report = httpsCallable(functions, 'trust_report');
await report({ targetId: 'user123', reason: 'SCAM' });

// Block user
const block = httpsCallable(functions, 'trust_block');
await block({ userId: 'me', blockedUserId: 'user123' });

// Get trust state
const getState = httpsCallable(functions, 'trust_getState');
const { data } = await getState({ userId: 'user123' });
// data = { userId, trustScore, riskFlags, earnModeAllowed, ... }

// Get blocklist
const getList = httpsCallable(functions, 'trust_getBlocklist');
const { data: { blockedUserIds } } = await getList({ userId: 'me' });
```

---

**End of Quick Reference**  
See [`PACK_46_TRUST_ENGINE_BLOCKLIST_IMPLEMENTATION.md`](PACK_46_TRUST_ENGINE_BLOCKLIST_IMPLEMENTATION.md:1) for full details.