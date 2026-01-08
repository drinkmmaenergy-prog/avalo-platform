# PACK 442 — Pricing Elasticity & Dynamic Offer Control

**Version:** v1.0  
**Type:** CORE (Revenue Optimization)  
**Status:** ACTIVE

## Purpose

Precise control of prices, promotions, and paywalls in real time without LTV erosion. This pack introduces data-driven pricing flexibility based on demand, churn, fraud, and region, with strict revenue and compliance guardrails.

## Dependencies

- **PACK 277** — Wallet & Transactions
- **PACK 295** — Globalization & Localization
- **PACK 299** — Analytics Engine & Safety Monitor
- **PACK 301B** — Retention Implementation Complete
- **PACK 325** — Feed Monetization
- **PACK 437** — Post-Launch Hardening & Revenue Protection Core
- **PACK 441** — Growth Safety Net & Viral Abuse Control

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    PACK 442 Architecture                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐   │
│  │         Pricing Intelligence Dashboard                  │   │
│  │              (Admin Read-Only)                          │   │
│  └───────────────────┬────────────────────────────────────┘   │
│                      │                                          │
│  ┌───────────────────▼───────────────┐                         │
│  │   Pricing Elasticity Model (PEM)  │                         │
│  │  • Cohort Analysis                │                         │
│  │  • Regional Sensitivity            │                         │
│  │  • Channel Performance             │                         │
│  │  • LTV Prediction                  │                         │
│  └───────────────────┬────────────────┘                        │
│                      │                                          │
│  ┌───────────────────▼────────────────────────────────────┐   │
│  │         Dynamic Offer Orchestrator                      │   │
│  │  • Intro Offers      • Win-Back Pricing                 │   │
│  │  • Limited Promos    • Auto-Expiration                  │   │
│  └───────────────────┬────────────────────────────────────┘   │
│                      │                                          │
│  ┌───────────────────▼────────────────┐                        │
│  │    Paywall Guardrail Service       │                        │
│  │  • Minimum ARPU         [BLOCK]    │                        │
│  │  • Maximum Discount     [BLOCK]    │                        │
│  │  • Refund Rate          [BLOCK]    │                        │
│  │  • Creator Payout       [WARN]     │                        │
│  └───────────────────┬────────────────┘                        │
│                      │                                          │
│  ┌───────────────────▼────────────────────────────────────┐   │
│  │   Regional Price Compliance Adapter                     │   │
│  │  • VAT/Tax Calculation                                  │   │
│  │  • Currency Conversion                                  │   │
│  │  • Legal Minimums                                       │   │
│  │  • Volatility Buffers                                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Key Modules

### 1. Pricing Elasticity Model (PEM)

Models price sensitivity per user cohort, region, entry channel, and category creator.

**Learns From:**
- Conversion vs. Churn
- Refund/Chargeback Pressure
- Engagement Depth

**Key Methods:**
```typescript
// Calculate price sensitivity for a cohort
await pricingElasticityModel.calculatePriceSensitivity({
  cohort: 'new_users',
  region: 'US',
  channel: 'organic',
  categoryCreator: 'creator_123'
});

// Predict conversion at a target price
await pricingElasticityModel.predictConversionAtPrice(
  { cohort, region, channel },
  targetPrice
);

// Record pricing metrics for learning
await pricingElasticityModel.recordPricingMetrics(
  { cohort, region, channel },
  price,
  { conversions, revenue, refunds, chargebacks, churnEvents }
);
```

### 2. Dynamic Offer Orchestrator

Controls time-boxed, cohort-specific offers that automatically expire at risk of LTV erosion.

**Offer Types:**
- `INTRO_OFFER` — First-time user discounts
- `LIMITED_TIME_PROMO` — Flash sales
- `WIN_BACK` — Re-engagement offers
- `LOYALTY_REWARD` — Long-term user rewards
- `SEASONAL` — Holiday/event promotions

**Key Methods:**
```typescript
// Create a new dynamic offer
await dynamicOfferOrchestrator.createOffer({
  type: OfferType.INTRO_OFFER,
  cohort: 'new_users',
  region: 'US',
  channel: 'facebook_ads',
  originalPrice: 9.99,
  discountPercent: 20,
  durationHours: 48,
  maxRedemptions: 1000
});

// Check if user is eligible for offers
const eligibility = await dynamicOfferOrchestrator.checkOfferEligibility(
  userId,
  { cohort, region, channel }
);

// Redeem an offer
const result = await dynamicOfferOrchestrator.redeemOffer(userId, offerId);

// Auto-expire based on time or LTV erosion
await dynamicOfferOrchestrator.autoExpireOffers();
```

### 3. Paywall Guardrail Service

Hard limits to prevent revenue erosion and maintain creator payouts.

**Guardrails:**
- **Minimum ARPU:** Default $5.00
- **Maximum Discount:** Default 50%
- **Maximum Refund Rate:** Default 5%
- **Maximum Chargeback Rate:** Default 1%
- **Frequency Cap:** 1 offer per 30 days per user

**Key Methods:**
```typescript
// Validate an offer before creation
const check = await paywallGuardrailService.validateOffer({
  cohort, region, price, discountPercent, offerType
});

if (!check.approved) {
  console.log(`Offer blocked: ${check.reason}`);
}

// Get guardrail metrics
const metrics = await paywallGuardrailService.getGuardrailMetrics('US');
// Returns: currentARPU, refundRate, chargebackRate, activeOffersCount, violations

// Update guardrail config per region
await paywallGuardrailService.updateGuardrailConfig('EU', {
  minARPU: 6.0,
  maxDiscountPercent: 40
});
```

### 4. Regional Price Compliance Adapter

Region-aware pricing with VAT/tax calculation, currency conversion, and legal minimums.

**Features:**
- VAT-inclusive/exclusive pricing
- Real-time currency conversion
- Volatility buffers
- Psychological pricing (e.g., $9.99)
- Legal minimum enforcement

**Key Methods:**
```typescript
// Calculate regional price
const pricing = await regionalPriceComplianceAdapter.calculateRegionalPrice(
  9.99,  // Base price in USD
  'DE',  // Germany
  'USD'  // Base currency
);
// Returns: { priceWithVAT, currency, vatRate, volatilityBuffer, ... }

// Check price compliance
const compliance = await regionalPriceComplianceAdapter.checkPriceCompliance(
  8.99,
  'DE'
);

// Get tax breakdown
const breakdown = await regionalPriceComplianceAdapter.getTaxBreakdown(
  11.99,
  'DE'
);
// Returns: { basePrice, vatAmount, totalPrice, currency }

// Get all regional prices
const allPrices = await regionalPriceComplianceAdapter.getAllRegionalPrices(9.99);
```

### 5. Pricing Intelligence Dashboard

Admin-only, read-only dashboard for decision-making.

**Provides:**
- Elasticity curves
- Promo ROI (fraud-adjusted)
- LTV vs. price heatmaps
- Real-time alerts

**Key Methods:**
```typescript
// Get comprehensive dashboard metrics (admin only)
const dashboard = await pricingIntelligenceDashboard.getDashboardMetrics(
  adminId,
  { start: new Date('2024-01-01'), end: new Date('2024-01-31') }
);

// Get pricing recommendations
const recommendations = await pricingIntelligenceDashboard.getPricingRecommendations(adminId);

// Export dashboard data
const csvData = await pricingIntelligenceDashboard.exportDashboardData(
  adminId,
  'csv',
  timeRange
);
```

## Data Flow

### 1. Offer Creation Flow

```
Admin → Create Offer Request
    ↓
Guardrail Check (validate limits)
    ↓
LTV Impact Prediction (PEM)
    ↓
Offer Created (if approved)
    ↓
Active in Database
```

### 2. User Eligibility Flow

```
User Request → Check Eligibility
    ↓
Frequency Cap Check
    ↓
Get Active Offers (cohort/region/channel)
    ↓
Select Best Offer (LTV impact)
    ↓
Return Eligibility + Offer
```

### 3. Auto-Expiration Flow

```
Scheduled Task (every 15 min)
    ↓
Get All Active Offers
    ↓
For Each Offer:
  - Check Time Expiration
  - Check LTV Erosion
  - Check Refund Rate Spike
    ↓
Expire if Conditions Met
```

## Database Schema

### Collections

#### `dynamic_offers`
```typescript
{
  id: string;
  type: OfferType;
  cohort: string;
  region: string;
  channel: string;
  originalPrice: number;
  discountedPrice: number;
  discountPercent: number;
  startTime: Timestamp;
  endTime: Timestamp;
  maxRedemptions?: number;
  currentRedemptions: number;
  active: boolean;
  ltvImpact: number;
  createdAt: Timestamp;
  expiredAt?: Timestamp;
  expirationReason?: string;
}
```

#### `offer_redemptions`
```typescript
{
  userId: string;
  offerId: string;
  offerType: OfferType;
  originalPrice: number;
  discountedPrice: number;
  discountPercent: number;
  cohort: string;
  region: string;
  channel: string;
  redeemedAt: Timestamp;
}
```

#### `pricing_history`
```typescript
{
  cohort: string;
  region: string;
  channel: string;
  price: number;
  conversions: number;
  revenue: number;
  timestamp: Timestamp;
}
```

#### `pricing_elasticity_metrics`
```typescript
{
  cohort: string;
  region: string;
  channel: string;
  conversionRate: number;
  churnRate: number;
  refundRate: number;
  chargebackRate: number;
  engagementDepth: number;
  ltv: number;
  timestamp: Timestamp;
}
```

#### `guardrail_config`
```typescript
{
  region: string; // Document ID
  minARPU: number;
  maxDiscountPercent: number;
  maxRefundRate: number;
  maxChargebackRate: number;
  frequencyCapDays: number;
  minPrice: number;
  updatedAt: Timestamp;
}
```

#### `regional_pricing_config`
```typescript
{
  region: string; // Document ID (e.g., 'US', 'DE', 'GB')
  currency: string;
  vatRate: number;
  vatInclusive: boolean;
  legalMinimum?: number;
  volatilityBuffer: number;
  updatedAt: Timestamp;
}
```

#### `currency_rules`
```typescript
{
  currency: string; // Document ID (e.g., 'USD', 'EUR')
  roundingRule: 'nearest' | 'up' | 'down' | 'psychological';
  decimalPlaces: number;
  minPrice?: number;
  updatedAt: Timestamp;
}
```

#### `exchange_rates`
```typescript
{
  id: string; // Format: 'FROM_TO' (e.g., 'USD_EUR')
  from: string;
  to: string;
  rate: number;
  updatedAt: Timestamp;
}
```

## Usage Examples

### Example 1: Create Win-Back Offer

```typescript
import { dynamicOfferOrchestrator, OfferType } from './pack442';

// Create a 30% discount for churned users
const offer = await dynamicOfferOrchestrator.createOffer({
  type: OfferType.WIN_BACK,
  cohort: 'churned_7days',
  region: 'US',
  channel: 'email',
  originalPrice: 14.99,
  discountPercent: 30,
  durationHours: 72,
  maxRedemptions: 500,
  metadata: { campaign: 'win_back_q1_2024' }
});
```

### Example 2: Check Eligibility and Redeem

```typescript
import { dynamicOfferOrchestrator } from './pack442';

// Check eligibility
const eligibility = await dynamicOfferOrchestrator.checkOfferEligibility(
  'user_123',
  { cohort: 'new_users', region: 'US', channel: 'organic' }
);

if (eligibility.eligible && eligibility.offer) {
  // Show offer to user
  console.log(`Special offer: $${eligibility.offer.discountedPrice}`);
  
  // User accepts, redeem offer
  const result = await dynamicOfferOrchestrator.redeemOffer(
    'user_123',
    eligibility.offer.id
  );
  
  if (result.success) {
    console.log(`Offer redeemed! Pay only $${result.price}`);
  }
}
```

### Example 3: Regional Pricing

```typescript
import { regionalPriceComplianceAdapter } from './pack442';

// Get price for German market
const dePricing = await regionalPriceComplianceAdapter.calculateRegionalPrice(
  9.99,  // $9.99 USD
  'DE',  // Germany
  'USD'
);

console.log(`Germany price: €${dePricing.priceWithVAT} (includes ${dePricing.vatRate}% VAT)`);

// Get tax breakdown
const breakdown = await regionalPriceComplianceAdapter.getTaxBreakdown(
  dePricing.priceWithVAT,
  'DE'
);

console.log(`Base: €${breakdown.basePrice}, VAT: €${breakdown.vatAmount}`);
```

### Example 4: Dashboard Analytics

```typescript
import { pricingIntelligenceDashboard } from './pack442';

// Get comprehensive metrics (admin only)
const dashboard = await pricingIntelligenceDashboard.getDashboardMetrics(
  'admin_123',
  { start: new Date('2024-01-01'), end: new Date('2024-01-31') }
);

console.log(`Total Revenue: $${dashboard.overview.totalRevenue}`);
console.log(`Average ARPU: $${dashboard.overview.averageARPU}`);
console.log(`Active Offers: ${dashboard.overview.activeOffers}`);

// Check for alerts
dashboard.alerts.forEach(alert => {
  console.log(`[${alert.severity}] ${alert.message}`);
});

// Get pricing recommendations
const recommendations = await pricingIntelligenceDashboard.getPricingRecommendations('admin_123');

recommendations.forEach(rec => {
  console.log(`${rec.cohort}/${rec.region}: Current $${rec.currentPrice} → Recommended $${rec.recommendedPrice}`);
  console.log(`Expected LTV increase: ${rec.expectedLTVIncrease.toFixed(2)}%`);
});
```

## Scheduled Jobs

### Auto-Expire Offers
**Frequency:** Every 15 minutes  
**Function:** Checks all active offers and expires those that:
- Have passed their end time
- Show LTV erosion > 10%
- Have refund rate > 5%

### Update Elasticity Models
**Frequency:** Every 6 hours  
**Function:** Recalculates price sensitivity models with latest transaction data

### Refresh Exchange Rates
**Frequency:** Every hour  
**Function:** Updates currency exchange rates from external service

### Generate Pricing Recommendations
**Frequency:** Daily at 8 AM  
**Function:** Analyzes pricing data and generates actionable recommendations for admins

## Security & Compliance

### Access Control
- **Users:** Can view and redeem eligible offers only
- **Admins:** Read-only access to pricing intelligence dashboard
- **Pricing Admins:** Can update guardrail configs and regional pricing
- **System:** Full write access via Cloud Functions only

### GDPR Compliance
- No personal data stored in offer analytics
- User redemptions linked by UUID only
- Admin export includes no PII

### Financial Compliance
- VAT/tax calculations align with regional laws
- Legal minimum prices enforced
- Audit trail for all pricing changes

## Performance Considerations

### Caching
- Exchange rates cached for 1 hour
- Guardrail configs cached per request
- Elasticity models recalculated every 6 hours

### Indexing
- Composite indexes on `cohort + region + channel`
- Timestamp indexes for time-range queries
- Active offer indexes for fast eligibility checks

### Rate Limiting
- Offer eligibility checks: 10 req/min per user
- Dashboard queries: 100 req/min per admin
- Offer redemptions: 1 per user per offer

## Monitoring & Alerts

### Key Metrics
- **ARPU Trend:** Alert if drops below threshold
- **Refund Rate:** Alert if exceeds 5%
- **Chargeback Rate:** Alert if exceeds 1%
- **Guardrail Violations:** Alert on any violation
- **Offer Performance:** Alert on poor-performing offers

### Logging
All critical events are logged:
- Offer creation/expiration
- Guardrail violations
- Price compliance issues
- Dashboard exports
- Redemption successes/failures

## Explicit Non-Goals

❌ **No manual pricing** — All pricing decisions go through the orchestrator  
❌ **No fixed global discounts** — All offers are cohort/region-specific  
❌ **No testing without guardrails** — Guardrails cannot be bypassed  
❌ **No changes to checkout UX** — This pack doesn't modify payment flows

## CTO Rationale

**Problem:** Overly aggressive promotions = quick cash, long-term LTV loss

**Solution:** This pack:
- ✅ Maximizes net LTV through data-driven pricing
- ✅ Minimizes refund drag with guardrails
- ✅ Provides flexibility without chaos
- ✅ Protects creator payouts
- ✅ Ensures regional compliance

## Validation Checklist

- [x] Models based solely on production data
- [x] Active and auditable guardrails
- [x] Integration with revenue protection (PACK 437)
- [x] Zero regression in checkout UX
- [x] Admin-only dashboard access
- [x] Regional pricing compliance (PACK 295/296)
- [x] Fraud-adjusted ROI calculations (PACK 441)

## Testing

### Unit Tests
```bash
npm test functions/src/pack442/*.test.ts
```

### Integration Tests
```bash
npm run test:integration -- pack442
```

### Manual Testing
See `PACK442_TESTING_GUIDE.md` for step-by-step manual testing procedures.

## Deployment

```bash
# Run deployment script
bash deploy-pack442.sh

# Or manual deployment:
firebase deploy --only firestore:rules,firestore:indexes,functions
```

## Support

For questions or issues with PACK 442:
1. Check this README first
2. Review the code documentation
3. Contact the revenue optimization team

---

**Pack 442** — Pricing Elasticity & Dynamic Offer Control v1.0  
*Smart pricing. Protected revenue. Maximum LTV.*
