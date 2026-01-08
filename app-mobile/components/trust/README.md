# Trust & Blocklist Safety Mesh — Integration Guide

**PACK 46** — Trust Engine & Blocklist Safety Mesh

This guide shows how to integrate trust scoring, risk warnings, and blocklist functionality into your Avalo mobile app screens.

---

## Quick Start

### 1. Import Required Services

```typescript
import {
  getTrustState,
  getBlocklist,
  blockUser,
  reportUser,
  isUserHighRisk,
  isEarnModeAllowed,
  isUserBlocked
} from '../../services/trustService';
```

### 2. Import UI Components

```typescript
import { TrustWarningBanner } from '../TrustWarningBanner';
import { BlockedUserBanner } from '../BlockedUserBanner';
import { ReportUserSheet } from '../ReportUserSheet';
import { useTrustAndBlocklist } from '../../hooks/useTrustAndBlocklist';
```

---

## Integration Scenarios

### Scenario 1: Chat Screen

**Requirements**:
- Show warning banner for high-risk users
- Prevent sending messages to blocked users
- Add "Report User" and "Block User" menu items

**Implementation**:

```typescript
function ChatScreen({ currentUserId, partnerId, partnerName }) {
  const [showReport, setShowReport] = useState(false);
  
  const { isBlocked, isHighRisk, blockUser } = useTrustAndBlocklist({
    currentUserId,
    targetUserId: partnerId,
    autoLoad: true
  });

  // Early return if blocked
  if (isBlocked) {
    return (
      <View>
        <BlockedUserBanner />
        <Text>You cannot send messages to this user.</Text>
      </View>
    );
  }

  return (
    <View>
      {/* Show warning for high-risk users */}
      <TrustWarningBanner userId={partnerId} />
      
      {/* Chat UI */}
      
      {/* Menu with Report and Block */}
      <Menu>
        <MenuItem onPress={() => setShowReport(true)}>
          Report User
        </MenuItem>
        <MenuItem onPress={async () => {
          await blockUser(partnerId);
          // Navigate away or close chat
        }}>
          Block User
        </MenuItem>
      </Menu>

      <ReportUserSheet
        visible={showReport}
        targetUserId={partnerId}
        targetUserName={partnerName}
        reporterId={currentUserId}
        onClose={() => setShowReport(false)}
      />
    </View>
  );
}
```

### Scenario 2: Swipe/Discovery Screen

**Requirements**:
- Filter out blocked users from profile list
- No blocked profiles should appear

**Implementation**:

```typescript
function SwipeScreen({ currentUserId, profiles }) {
  const [blocklist, setBlocklist] = useState(null);

  useEffect(() => {
    loadBlocklist();
  }, [currentUserId]);

  const loadBlocklist = async () => {
    const list = await getBlocklist(currentUserId);
    setBlocklist(list);
  };

  // Filter out blocked users
  const visibleProfiles = profiles.filter(profile => 
    !isUserBlocked(blocklist, profile.userId)
  );

  return (
    <FlatList
      data={visibleProfiles}
      renderItem={({ item }) => <ProfileCard profile={item} />}
    />
  );
}
```

### Scenario 3: Profile View Screen

**Requirements**:
- Show trust warning banner
- Add block action
- Prevent viewing if blocked

**Implementation**:

```typescript
function ProfileScreen({ currentUserId, profileUserId }) {
  const { isBlocked, isHighRisk } = useTrustAndBlocklist({
    currentUserId,
    targetUserId: profileUserId
  });

  if (isBlocked) {
    return <View><Text>This user is blocked.</Text></View>;
  }

  return (
    <View>
      <TrustWarningBanner userId={profileUserId} />
      
      {/* Profile content */}
      
      <Button onPress={handleBlock}>Block User</Button>
    </View>
  );
}
```

### Scenario 4: Earn Mode Settings

**Requirements**:
- Check if user can enable earn mode
- Disable toggle if earnModeAllowed is false
- Show informational message

**Implementation**:

```typescript
function EarnModeSettings({ currentUserId }) {
  const [earnEnabled, setEarnEnabled] = useState(false);
  const [trustState, setTrustState] = useState(null);

  useEffect(() => {
    loadOwnTrustState();
  }, []);

  const loadOwnTrustState = async () => {
    const state = await getTrustState(currentUserId);
    setTrustState(state);
  };

  const canEarn = isEarnModeAllowed(trustState);

  return (
    <View>
      <Switch
        value={earnEnabled}
        onValueChange={setEarnEnabled}
        disabled={!canEarn}
      />
      
      {!canEarn && (
        <Text style={styles.warning}>
          Earning from chat is temporarily disabled on your account.
        </Text>
      )}
    </View>
  );
}
```

---

## API Reference

### Service Functions

#### Trust State
- `getTrustState(userId)` - Get trust state (cached or fetch)
- `refreshTrustState(userId)` - Force refresh from backend
- `fetchTrustState(userId)` - Get from cache only

#### Blocklist
- `getBlocklist(userId)` - Get blocklist (cached or fetch)
- `refreshBlocklist(userId)` - Force refresh from backend
- `blockUser(userId, blockedUserId)` - Block a user

#### Reporting
- `reportUser({ reporterId, targetId, reason, messageId? })` - Report a user

#### Helpers
- `isUserHighRisk(trustState)` - Check if user has high risk
- `isEarnModeAllowed(trustState)` - Check if can earn from chat
- `isUserBlocked(blocklist, targetId)` - Check if user is blocked

### React Hook

```typescript
const {
  trustState,        // TrustState | null
  isHighRisk,        // boolean
  canEarnFromChat,   // boolean
  blocklist,         // Blocklist | null
  isBlocked,         // boolean
  loadingTrust,      // boolean
  loadingBlocklist,  // boolean
  blockUser,         // (userId: string) => Promise<void>
  refreshTrustState, // () => Promise<void>
  refreshBlocklist,  // () => Promise<void>
  trustError,        // Error | null
  blocklistError     // Error | null
} = useTrustAndBlocklist({
  currentUserId: 'user123',
  targetUserId: 'user456',
  autoLoad: true
});
```

---

## Component Props

### TrustWarningBanner

```typescript
<TrustWarningBanner
  userId={string}          // Required: User ID to check
  locale={'en' | 'pl'}     // Optional: Default 'en'
/>
```

### BlockedUserBanner

```typescript
<BlockedUserBanner
  locale={'en' | 'pl'}     // Optional: Default 'en'
/>
```

### ReportUserSheet

```typescript
<ReportUserSheet
  visible={boolean}        // Required: Sheet visibility
  targetUserId={string}    // Required: User being reported
  targetUserName={string}  // Optional: Display name
  reporterId={string}      // Required: Current user ID
  messageId={string}       // Optional: Related message ID
  locale={'en' | 'pl'}     // Optional: Default 'en'
  onClose={() => void}     // Required: Close callback
  onReported={() => void}  // Optional: Success callback
/>
```

---

## Best Practices

### 1. Cache Management

Always load blocklist on app start or user login:

```typescript
// In app initialization
useEffect(() => {
  const initTrust = async () => {
    await refreshBlocklist(currentUserId);
  };
  initTrust();
}, [currentUserId]);
```

### 2. Offline Support

Trust service handles offline gracefully. Always check cache first:

```typescript
// Service automatically tries cache first
const trustState = await getTrustState(userId);
// Falls back to backend if cache is stale
```

### 3. Error Handling

Always handle errors when blocking/reporting:

```typescript
try {
  await blockUser(currentUserId, targetUserId);
  Alert.alert('Success', 'User blocked');
} catch (error) {
  Alert.alert('Error', 'Failed to block user');
}
```

### 4. UI Feedback

Always provide feedback after actions:

```typescript
<ReportUserSheet
  onReported={() => {
    Toast.show('Report submitted');
  }}
/>
```

---

## Common Patterns

### Pattern 1: Guard at Screen Entry

```typescript
const { isBlocked } = useTrustAndBlocklist({
  currentUserId,
  targetUserId,
  autoLoad: true
});

if (isBlocked) {
  return <BlockedView />;
}

return <NormalChatView />;
```

### Pattern 2: Conditional Rendering

```typescript
{isHighRisk && <TrustWarningBanner userId={partnerId} />}
{isBlocked && <BlockedUserBanner />}
{!canEarnFromChat && <EarnDisabledMessage />}
```

### Pattern 3: Filtered Lists

```typescript
const visibleProfiles = profiles.filter(p => 
  !isUserBlocked(blocklist, p.userId)
);
```

---

## Troubleshooting

### Issue: Warning banner not showing

**Solution**: Ensure trust state is loaded and isUserHighRisk returns true. Check cache expiration (5 minutes).

### Issue: Blocklist not enforcing

**Solution**: Verify blocklist is loaded successfully. Check AsyncStorage for cached data. Ensure targetUserId is provided to hook.

### Issue: Earn mode toggle not disabled

**Solution**: Load trust state for current user (not target user). Check earnModeAllowed field in state.

### Issue: Cache not updating after block

**Solution**: Use blockUser from service (not direct API call). It automatically updates cache.

---

## Data Flow

```
User Action (Report/Block)
    ↓
Mobile Service Call
    ↓
Backend Cloud Function
    ↓
Update Firestore (trust_state, reports, blocklist)
    ↓
Recompute Trust Score
    ↓
Return to Mobile
    ↓
Update AsyncStorage Cache
    ↓
UI Auto-Updates (via React state)
```

---

## Security Notes

1. **Server-Side Trust**: Trust scores computed on backend only. Mobile cannot manipulate.
2. **Idempotent Operations**: Blocking same user multiple times is safe.
3. **User Privacy**: Users cannot see who blocked/reported them.
4. **No Retroactive Changes**: Existing earnings/transactions unaffected by trust changes.
5. **Graceful Degradation**: Offline mode uses cached data, continues to enforce blocklist.

---

## See Also

- `PACK_46_TRUST_ENGINE_BLOCKLIST_IMPLEMENTATION.md` - Full implementation details
- `functions/src/trustSafetyPack46.ts` - Backend trust engine
- `app-mobile/services/trustService.ts` - Mobile trust service
- Integration examples in `app-mobile/components/trust/` directory

---

**End of Integration Guide**