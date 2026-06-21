# Legacy Archive [G6a]

Files in this directory are EXCLUDED from the TypeScript compilation tree.
The `functions/tsconfig.json` `include` directive only covers `src/**/*.ts`.
Nothing here is compiled or deployed.

These files were archived during G5/G6a for containing:
- `users/{uid}/wallet/current` (forbidden phantom wallet path)
- `users/{uid}/wallet/main` (forbidden legacy path)
- `user_wallets` (forbidden collection name)
- `80/20`, `65/35`, `70/30` revenue splits (canonical: creatorEarningAccounts + Avalo 20% commission at payout)
- `EARNER_CUT_PERCENT`, `MONETIZATION_SPLITS` split logic
- `Date.now()` idempotency keys (canonical: deterministic key format)

Git history preserves full content for audit purposes.

Canonical replacements:
- chat billing: canonicalChatStateMachineV3.ts
- call billing: call/canonicalCallBillingV2.ts
- room billing: rooms/canonicalMultiRoomV2.ts
- creator earnings: creator/canonicalEarningService.ts
- wallet reads/writes: wallet/walletService.ts
