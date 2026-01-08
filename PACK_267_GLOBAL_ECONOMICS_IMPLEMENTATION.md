# PACK 267 — Global Economics & Split Rules Implementation

**Status**: ✅ COMPLETE  
**Created**: 2025-12-03  
**Location**: [`app-mobile/lib/economic-constants.ts`](app-mobile/lib/economic-constants.ts)

## Overview

Created a single, central source of truth for all Avalo economic rules to ensure no future module can accidentally change splits, prices, or payout values.

## Implementation Details

### 1. Core Economic Constants

All revenue split ratios are now defined as immutable constants:

```typescript
// Chat: 35% platform, 65% creator
export const AVALO_SPLIT_CHAT = {
  platform: 0.35,
  creator: 0.65,
} as const;

// Calendar: 20% platform, 80% creator
export const AVALO_SPLIT_CALENDAR = {
  platform: 0.20,
  creator: 0.80,
} as const;

// Events: 20% platform, 80% creator
export const AVALO_SPLIT_EVENTS = {
  platform: 0.20,
  creator: 0.80,
} as const;
```

### 2. Payout Rate

Fixed token-to-PLN conversion rate for all creator payouts:

```typescript
// 1 token = 0.20 PLN (FIXED)
export const AVALO_PAYOUT_RATE_PLN = 0.20;
```

**Important**: This rate is independent of token purchase packs and applies uniformly to all creator payouts.

### 3. Chat Pricing Constants

```typescript
export const CHAT_BASE_PRICE_TOKENS = 100;      // Standard chat entry
export const CHAT_MIN_PRICE_TOKENS = 100;       // With moderation
export const CHAT_MAX_PRICE_TOKENS = 500;       // With moderation
export const VOICE_CALL_PRICE_PER_MIN_TOKENS = 10;
export const VIDEO_CALL_PRICE_PER_MIN_TOKENS = 20;
```

### 4. Token Packs Configuration

Seven token packs for user purchases:

| Pack ID | Tokens | Price (PLN) | ₵/Token |
|---------|--------|-------------|---------|
| mini | 100 | 31.99 | 0.3199 |
| basic | 300 | 85.99 | 0.2866 |
| standard | 500 | 134.99 | 0.2700 |
| premium | 1,000 | 244.99 | 0.2450 |
| pro | 2,000 | 469.99 | 0.2350 |
| elite | 5,000 | 1,125.99 | 0.2252 |
| royal | 10,000 | 2,149.99 | 0.2150 |

```typescript
export const TOKEN_PACKS: readonly TokenPack[] = [
  { id: "mini", tokens: 100, pricePLN: 31.99 },
  // ... etc
] as const;
```

**Note**: These prices are for purchases only and do NOT affect creator payout rates.

### 5. Free Messages & Low-Popularity Rules

Constants for promotional/support features:

```typescript
// Free messages for low-popularity creators
export const FREE_MESSAGES_LOW_POPULARITY_PER_USER = 10; // 20 total
export const FREE_MESSAGES_ROYAL_PER_USER = 6;            // 12 total

// Low-popularity thresholds
export const LOW_POPULARITY_THRESHOLD = {
  swipeRightRate: 0.05,      // 5% or less
  matchesPerDay: 1,
  activeChatsPerWeek: 2,
} as const;
```

### 6. Refund Rules (Flags)

Policy flags for different monetization types:

```typescript
export const REFUND_RULES = {
  chat: {
    refundUnusedWordsOnly: true,
    refundPlatformFee: false,
  },
  calendar: {
    refundPlatformFeeOnHostCancel: true,
    refundPlatformFeeOnMismatch: true,
  },
  events: {
    refundPlatformFeeOnOrganizerCancel: true,
    refundPlatformFeeOnMismatch: true,
  },
} as const;
```

### 7. Helper Functions

#### Split Calculation Functions

```typescript
// Apply chat split (35/65)
export function applyChatSplit(grossTokens: number): SplitResult

// Apply calendar split (20/80)
export function applyCalendarSplit(grossTokens: number): SplitResult

// Apply event split (20/80)
export function applyEventSplit(grossTokens: number): SplitResult
```

**Example Usage**:
```typescript
import { applyChatSplit } from '@/lib/economic-constants';

const chatCost = 100;
const { platform, creator } = applyChatSplit(chatCost);
// platform: 35, creator: 65
```

#### Payout Conversion

```typescript
// Convert tokens to PLN for payouts
export function tokensToPLN(tokens: number): number
```

**Example Usage**:
```typescript
import { tokensToPLN } from '@/lib/economic-constants';

const creatorTokens = 1000;
const payoutPLN = tokensToPLN(creatorTokens);
// payoutPLN: 200.00 PLN
```

### 8. Validation & Utility Functions

```typescript
// Validate split configuration
export function validateSplit(split: { platform: number; creator: number }): boolean

// Get token pack by ID
export function getTokenPackById(packId: string): TokenPack | undefined

// Calculate price per token (display only)
export function getPricePerToken(pack: TokenPack): number

// Check low-popularity status
export function isLowPopularity(metrics: {
  swipeRightRate: number;
  matchesPerDay: number;
  activeChatsPerWeek: number;
}): boolean
```

### 9. Automatic Validation

The module performs self-validation on load:

```typescript
// Validates all splits sum to 1.0
if (!validateSplit(AVALO_SPLIT_CHAT)) {
  console.error("CRITICAL: AVALO_SPLIT_CHAT does not sum to 1.0!");
}
```

## Integration Guidelines

### For Future Development

1. **ALWAYS import from this module**:
   ```typescript
   import {
     applyChatSplit,
     applyCalendarSplit,
     applyEventSplit,
     tokensToPLN,
     TOKEN_PACKS,
     CHAT_BASE_PRICE_TOKENS,
   } from '@/lib/economic-constants';
   ```

2. **NEVER hardcode**:
   - ❌ `const platformFee = amount * 0.35;`
   - ✅ `const { platform, creator } = applyChatSplit(amount);`

3. **Split calculations**:
   ```typescript
   // Chat monetization
   const chatRevenue = 100;
   const { platform, creator } = applyChatSplit(chatRevenue);
   
   // Calendar booking
   const bookingRevenue = 500;
   const { platform, creator } = applyCalendarSplit(bookingRevenue);
   
   // Event ticket
   const ticketRevenue = 200;
   const { platform, creator } = applyEventSplit(ticketRevenue);
   ```

4. **Payout calculations**:
   ```typescript
   // Always use fixed rate
   const creatorEarnings = 1000; // tokens
   const payoutAmount = tokensToPLN(creatorEarnings); // 200 PLN
   ```

5. **Token pack references**:
   ```typescript
   // Get pack information
   const pack = getTokenPackById("premium");
   if (pack) {
     console.log(`${pack.tokens} tokens for ${pack.pricePLN} PLN`);
   }
   
   // Iterate packs
   TOKEN_PACKS.forEach(pack => {
     console.log(`${pack.id}: ${pack.tokens} tokens`);
   });
   ```

### Module Restrictions

The following areas MUST use these constants:

1. **Chat Pack** - Use [`applyChatSplit()`](app-mobile/lib/economic-constants.ts:160) and [`CHAT_BASE_PRICE_TOKENS`](app-mobile/lib/economic-constants.ts:61)
2. **Calendar Pack** - Use [`applyCalendarSplit()`](app-mobile/lib/economic-constants.ts:172) 
3. **Events Pack** - Use [`applyEventSplit()`](app-mobile/lib/economic-constants.ts:184)
4. **Wallet/Payout Pack** - Use [`tokensToPLN()`](app-mobile/lib/economic-constants.ts:198) and [`TOKEN_PACKS`](app-mobile/lib/economic-constants.ts:98)
5. **Free Messages Logic** - Use [`FREE_MESSAGES_*`](app-mobile/lib/economic-constants.ts:115) and [`isLowPopularity()`](app-mobile/lib/economic-constants.ts:259)

## Benefits

### 1. Consistency
- Single source of truth prevents drift across modules
- All calculations use the same formula

### 2. Type Safety
- TypeScript enforces correct usage
- Compile-time errors prevent economic bugs

### 3. Maintainability
- One place to update economic rules
- Easy to audit and verify correctness

### 4. Transparency
- Clear documentation of all economic rules
- Easy to understand platform economics

### 5. Protection
- `as const` prevents accidental modifications
- Validation on module load catches configuration errors

## Economic Model Summary

### Revenue Splits
- **Chat**: Platform 35%, Creator 65%
- **Calendar**: Platform 20%, Creator 80%
- **Events**: Platform 20%, Creator 80%

### Creator Payouts
- **Fixed Rate**: 1 token = 0.20 PLN
- **Independent**: Not affected by purchase pack pricing
- **Predictable**: Creators always know their earnings

### User Pricing
- **Variable**: Bulk discounts on larger packs
- **Range**: 0.2150 - 0.3199 PLN per token
- **Transparent**: Clear pricing tiers

### Free Messages
- **Low-popularity creators**: 10 messages per user
- **Royal Club members**: 6 messages per user
- **Automatic**: Based on engagement thresholds

## Testing Recommendations

```typescript
import {
  applyChatSplit,
  tokensToPLN,
  validateSplit,
  AVALO_SPLIT_CHAT,
} from '@/lib/economic-constants';

// Test split calculations
describe('Revenue Splits', () => {
  it('should calculate chat split correctly', () => {
    const result = applyChatSplit(100);
    expect(result.platform).toBe(35);
    expect(result.creator).toBe(65);
  });
  
  it('should validate split configuration', () => {
    expect(validateSplit(AVALO_SPLIT_CHAT)).toBe(true);
  });
});

// Test payout conversions
describe('Payout Conversions', () => {
  it('should convert tokens to PLN', () => {
    expect(tokensToPLN(1000)).toBe(200);
    expect(tokensToPLN(100)).toBe(20);
  });
});
```

## Migration Checklist

When migrating existing code to use this module:

- [ ] Identify all hardcoded split ratios
- [ ] Replace with [`applyChatSplit()`](app-mobile/lib/economic-constants.ts:160), [`applyCalendarSplit()`](app-mobile/lib/economic-constants.ts:172), or [`applyEventSplit()`](app-mobile/lib/economic-constants.ts:184)
- [ ] Find all payout calculations
- [ ] Replace with [`tokensToPLN()`](app-mobile/lib/economic-constants.ts:198)
- [ ] Update token pack references to use [`TOKEN_PACKS`](app-mobile/lib/economic-constants.ts:98)
- [ ] Replace price constants with [`CHAT_BASE_PRICE_TOKENS`](app-mobile/lib/economic-constants.ts:61), etc.
- [ ] Test all economic calculations
- [ ] Verify splits sum to 100%
- [ ] Document any exceptions or special cases

## Security Considerations

1. **Immutability**: All constants use `as const` to prevent runtime modifications
2. **Validation**: Automatic validation on module load
3. **Type Safety**: TypeScript prevents incorrect usage
4. **Centralization**: Single point of control reduces attack surface
5. **Audit Trail**: All economic rules documented and versioned

## Future Enhancements

Potential additions to this module:

1. **Dynamic pricing rules** (surge pricing, discounts)
2. **Regional pricing adjustments** (beyond base PLN)
3. **Promotional rates** (temporary events, campaigns)
4. **Creator tier modifiers** (verified, premium creators)
5. **Platform fee adjustments** (based on volume, partnerships)

Any such enhancements should be added to this central module to maintain consistency.

## Compliance & Auditing

This module serves as the official economic specification for:

- Financial audits
- Creator payout calculations
- Platform revenue reporting
- Tax compliance
- Dispute resolution

All economic disputes should reference this module as the source of truth.

---

## Summary

✅ **Single source of truth for all economic rules**  
✅ **Type-safe constants and helper functions**  
✅ **Automatic validation on module load**  
✅ **Clear separation of purchase vs. payout rates**  
✅ **Comprehensive documentation and examples**  
✅ **Ready for integration across all modules**

**Next Steps**:
1. Update existing chat/calendar/events modules to use these constants
2. Add tests for all economic calculations
3. Create migration guide for legacy code
4. Set up audit logging for economic operations

---

**File Location**: [`app-mobile/lib/economic-constants.ts`](app-mobile/lib/economic-constants.ts:1)  
**Total Lines**: 301  
**Module Size**: ~8KB  
**TypeScript**: Strict mode enabled  
**Exports**: 20+ constants, functions, and types