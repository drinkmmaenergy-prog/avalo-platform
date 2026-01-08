# AVALO_PAYMENTS_AND_TOKEN_MODEL_v1.md

## Token Packs (Stripe)
- MINI: 100 tokens
- BASIC: 300 tokens
- STANDARD: 500 tokens
- PREMIUM: 1000 tokens
- PRO: 2000 tokens
- ELITE: 5000 tokens

Display fiat prices on web. In-app shows tokens only.  
Settlement rate fixed: **1 token = 0.20 PLN** for splits and payouts.

## Splits
- Chat: 35% Avalo, 65% Earner (platform fee non-refundable)
- Video: 30% Avalo, 70% Earner
- Calendar: 20% Avalo, 80% Earner (fee non-refundable)
- Tips: 20% Avalo, 80% Earner
- Subscriptions: 30% Avalo, 70% Earner

## Chat Deposit
- Initial: 100 tokens.  
- Deduct 35 to Avalo immediately. 65 escrow.  
- Words → tokens: 11 words/token; Royal earner 7 words/token.

## Refunds
- 48h inactivity: refund unused escrow to payer.  
- Earner voluntary refund button: refunds remaining escrow 100% (fee stays).  
- Calendar: creator no-show/cancel → full escrow refund to booker; fee stays.

## Payouts
- Earned tokens × 0.20 PLN → payout.  
- Methods: SEPA/ACH, PayPal, Crypto, Wise.  
- Apply minimums and external fees.

## Webhooks
- Stripe: `checkout.session.completed`, `payment_intent.succeeded`, `customer.subscription.*`
- PayPal: capture webhooks (if enabled)
- Coinbase Commerce: `charge:confirmed`

Map product → token quantity. Write `transactions`, credit `wallet.balance`.
