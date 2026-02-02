# DEPRECATED: Client-Side Token Mutations

**DO NOT USE THE FOLLOWING FILES FOR TOKEN OPERATIONS**

---

## ⚠️ FORBIDDEN FILES

### `services/tokenService.ts`

This file contains client-side token mutations which are **FORBIDDEN** in Phase 3.2.

**Forbidden functions:**
- `deductTokens(userId, amount)` — Directly modifies Firestore balance
- `addTokens(userId, amount)` — Directly modifies Firestore balance
- `addTokensAfterPurchase(userId, tokens)` — Client-side token credit
- `processMessageTransaction(...)` — Client-side transaction processing
- `spendTokensForMessage(userId, cost)` — Client-side spending

**Why forbidden:**
1. Violates thin-client architecture
2. Creates security vulnerabilities (users can manipulate balance)
3. Bypasses backend validation and audit logging
4. Can cause inconsistent state between client and server

### `services/stripeService.ts`

This file contains mock purchase logic which is **FORBIDDEN** in production.

**Forbidden functions:**
- `mockCompletePurchase(userId, pack)` — Directly writes tokens to Firestore
- `createCheckoutSession(userId, pack)` — Creates pending_purchases (should be backend)

**Why forbidden:**
1. Bypasses Stripe payment validation
2. No webhook verification
3. Direct Firestore writes without idempotency
4. No fraud protection

---

## ✅ CANONICAL REPLACEMENTS

### For Wallet Operations

Use `services/walletApi.ts` and `hooks/useWallet.ts`:

```typescript
// ✅ CORRECT: Read-only balance subscription
import { useWallet } from '@/hooks/useWallet';

const { balance, loading, purchaseTokens, hasTokens } = useWallet();

// Check balance (read-only)
if (hasTokens(10)) {
  // User can afford action
}

// Purchase tokens (opens Stripe Checkout via backend)
await purchaseTokens('standard');
```

### For Token Spending

Token spending happens automatically via backend when calling business functions:

```typescript
// ✅ CORRECT: Backend handles token spending
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';

const sendMessage = httpsCallable(functions, 'sendMessage');

// Backend will:
// 1. Validate user has enough tokens
// 2. Deduct tokens
// 3. Credit creator (minus fee)
// 4. Record transaction
// 5. Send message
const result = await sendMessage({
  chatId: 'abc123',
  content: 'Hello!',
});

// Balance updates automatically via Firestore subscription
```

---

## Migration Checklist

If you find any file importing from deprecated services, update it:

| Old Import | New Import |
|------------|------------|
| `import { getTokenBalance } from '@/services/tokenService'` | `import { useWallet } from '@/hooks/useWallet'` |
| `import { deductTokens } from '@/services/tokenService'` | REMOVE - backend handles this |
| `import { addTokens } from '@/services/tokenService'` | REMOVE - backend handles this |
| `import { mockCompletePurchase } from '@/services/stripeService'` | `import { useWallet } from '@/hooks/useWallet'` |

---

## Backend Functions for Token Operations

| Operation | Backend Function | Pack |
|-----------|-----------------|------|
| Get balance | Firestore subscription | N/A |
| Get token packs | `wallet_getTokenPacks` | PACK 277 |
| Purchase tokens | `tokens_createCheckoutSession` | PACK 288 |
| Spend tokens (chat) | `sendMessage` (internal) | PACK 273 |
| Spend tokens (media) | `unlockPaidMedia` (internal) | PACK 250 |
| Spend tokens (call) | `startCall` (internal) | Various |
| Record transaction | Automatic | PACK 277 |

---

## Security Notes

1. **Never trust client balance** — Always verify on backend before operations
2. **No direct Firestore writes to wallet** — All updates go through backend
3. **Stripe webhooks verify payments** — Never credit tokens without webhook
4. **Audit trail required** — All transactions logged by backend
