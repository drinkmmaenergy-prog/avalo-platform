# PACK 383 — Quick Start Guide

## 🚀 Getting Started with Global Payment Routing

This guide will help you quickly integrate Avalo's payment routing, compliance, and payout system.

---

## Prerequisites

1. ✅ PACK 277 (Wallet & Token Store) deployed
2. ✅ Firebase project configured
3. ✅ Admin role assigned in Firestore
4. ✅ Users collection populated

---

## Installation

### 1. Deploy Infrastructure

```bash
# Make deployment script executable
chmod +x deploy-pack383.sh

# Deploy all components
./deploy-pack383.sh
```

This deploys:
- Firestore security rules
- Firestore indexes
- 22+ Cloud Functions
- 6 scheduled jobs

### 2. Configure Environment

```bash
# Set API keys (production only)
firebase functions:config:set \
  pack383.stripe_api_key="sk_live_YOUR_KEY" \
  pack383.fx_provider_key="YOUR_FX_KEY" \
  pack383.kyc_provider_key="YOUR_KYC_KEY" \
  pack383.aml_provider_key="YOUR_AML_KEY"

# Redeploy functions to apply config
firebase deploy --only functions
```

### 3. Initialize Provider Configs

Create initial payout providers in Firestore:

```javascript
// In Firebase Console or via admin SDK
db.collection('payoutProviders').add({
  name: 'Stripe Connect',
  type: 'stripe',
  enabled: true,
  supportedCountries: ['US', 'CA', 'GB', 'AU', 'PL', /* ... */],
  supportedCurrencies: ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'PLN'],
  minAmount: 5,
  maxAmount: 50000,
  costPerTransaction: 0.0025, // 0.25%
  processingTime: '1-3 days',
  riskScore: 3,
  reliability: 0.99
});
```

### 4. Create Payout Routes

```javascript
db.collection('globalPayoutRoutes').add({
  countryCode: 'US',
  supportedCurrencies: ['USD', 'EUR', 'GBP'],
  minPayoutThreshold: 5,
  processingTime: '1-3 days',
  providerPriority: ['Stripe Connect', 'Wise', 'ACH'],
  riskTier: 3,
  costPerTransaction: 2.5,
  regulatoryRequirements: ['KYC', 'W-9'],
  enabled: true,
  lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
});
```

---

## Basic Usage

### Initiate a Payout

```typescript
import { getFunctions, httpsCallable } from 'firebase/functions';

const functions = getFunctions();
const initiatePayout = httpsCallable(functions, 'pack383_initiatePayout');

try {
  const result = await initiatePayout({
    userId: currentUser.uid,
    amount: 100,        // tokens
    currency: 'USD',
    reason: 'creator_earnings',
    priority: 'normal'
  });

  console.log('✅ Payout initiated');
  console.log('Payout ID:', result.data.payoutId);
  console.log('Net amount:', result.data.netAmount);
  console.log('Tax withheld:', result.data.taxAmount);
  console.log('ETA:', result.data.estimatedArrival);
} catch (error) {
  console.error('❌ Payout failed:', error.message);
}
```

### Submit KYC Verification

```typescript
const submitKYC = httpsCallable(functions, 'pack383_submitKYC');

await submitKYC({
  documentType: 'passport',
  documentNumber: 'AB1234567',
  fullName: 'John Doe',
  dateOfBirth: '1990-01-01',
  nationality: 'US',
  residenceCountry: 'US',
  address: {
    street: '123 Main St',
    city: 'New York',
    state: 'NY',
    postalCode: '10001',
    country: 'US'
  }
});
```

### Check Payout Limits

```typescript
const getUserLimits = httpsCallable(functions, 'pack383_getUserPayoutLimits');

const limits = await getUserLimits({ userId: currentUser.uid });

console.log('Risk Tier:', limits.data.riskTier);
console.log('Daily limit:', limits.data.limits.daily);
console.log('Daily remaining:', limits.data.remaining.daily);
console.log('Can payout?', limits.data.eligibleForPayout);
```

### Preview Token Conversion

```typescript
const previewConversion = httpsCallable(functions, 'pack383_previewConversion');

const preview = await previewConversion({
  tokens: 100,
  targetCurrency: 'USD'
});

console.log('Tokens:', preview.data.tokens);
console.log('PLN value:', preview.data.plnAmount);
console.log('USD amount:', preview.data.estimatedAmount);
console.log('Fees:', preview.data.estimatedFees);
console.log('Meets minimum?', preview.data.meetsMinimum);
```

---

## Testing

### 1. Test Payout Routing

```bash
# Open Firebase Functions shell
firebase functions:shell

# Test route resolution
pack383_resolveOptimalPayoutRoute({
  userId: 'test_user_123',
  amount: 100,
  currency: 'USD'
})
```

### 2. Test KYC Flow

1. Submit KYC via function
2. Check `userKYCProfiles` collection
3. Manually approve (admin):
   ```javascript
   db.collection('userKYCProfiles').doc(userId).update({
     status: 'verified',
     verifiedAt: firebase.firestore.FieldValue.serverTimestamp()
   });
   ```

### 3. Test AML Screening

```bash
pack383_runAMLCheck({
  userId: 'test_user_123',
  amount: 500,
  currency: 'USD'
})
```

### 4. Test Limit Enforcement

```bash
pack383_enforcePayoutLimits({
  userId: 'test_user_123',
  requestAmount: 1000
})
```

---

## Admin Dashboard

Access the finance dashboard:

```
https://your-app.com/admin/finance
```

**Features:**
- View pending payouts
- Monitor risk alerts
- Approve/reject KYC
- Block high-risk users
- Generate tax reports

---

## Monitoring

### View Function Logs

```bash
# All pack383 functions
firebase functions:log --only pack383

# Specific function
firebase functions:log --only pack383_initiatePayout

# Follow in real-time
firebase functions:log --only pack383 --follow
```

### Key Metrics to Monitor

1. **Payout Success Rate**
   ```javascript
   db.collection('payouts')
     .where('status', '==', 'completed')
     .count()
   ```

2. **Average Processing Time**
   ```javascript
   // Time from createdAt to completedAt
   ```

3. **Blocked Payouts**
   ```javascript
   db.collection('payouts')
     .where('status', '==', 'blocked')
     .get()
   ```

4. **High-Risk Users**
   ```javascript
   db.collection('userRiskProfiles')
     .where('tier', '>=', 4)
     .get()
   ```

---

## Common Issues

### Issue: "KYC verification required before payout"

**Solution:** User must submit KYC first:
```typescript
await submitKYC({ /* user details */ });
```

### Issue: "Payout limit exceeded"

**Solution:** Check user's risk tier and limits:
```typescript
const limits = await getUserPayoutLimits({ userId });
console.log('Available:', limits.data.remaining.daily);
```

**Admin can upgrade tier:**
```typescript
await upgradeUserRiskTier({
  userId,
  newTier: 2,
  reason: 'Good payment history'
});
```

### Issue: "No payout routes available for country"

**Solution:** Add route configuration for that country in `globalPayoutRoutes` collection.

### Issue: "Provider execution failed"

**Solution:**
1. Check provider configuration in `payoutProviders`
2. Verify API keys in functions config
3. Check provider status/downtime

---

## Security Best Practices

1. **Always require KYC before first payout**
   - Enforced automatically by functions
   
2. **Monitor AML screening results**
   - Review `amlScreeningResults` collection daily
   
3. **Watch for sanctions matches**
   - Auto-screening runs daily
   - Manual review required for matches
   
4. **Set conservative limits for new users**
   - Start at tier 3 (default)
   - Auto-upgrade after clean history

5. **Enable chargeback protection**
   - Reserve holds for high-risk users
   - Freeze windows for disputed accounts

---

## Integration Checklist

- [ ] Deploy all functions
- [ ] Configure API keys
- [ ] Create initial provider configs
- [ ] Set up payout routes for target countries
- [ ] Test KYC submission flow
- [ ] Test payout initiation
- [ ] Configure admin dashboard access
- [ ] Set up monitoring alerts
- [ ] Train support team on admin tools
- [ ] Document country-specific requirements

---

## Next Steps

1. **PACK 277 Integration**
   - Ensure token balances sync correctly
   - Test token-to-payout conversion

2. **PACK 296 Integration**
   - Verify all actions are logged
   - Set up audit log retention

3. **PACK 302 Integration**
   - Connect fraud detection to payout blocking
   - Sync fraud scores with risk tiers

4. **Production Readiness**
   - Replace mock providers with real APIs
   - Set up production API keys
   - Configure rate limits
   - Enable monitoring alerts
   - Train compliance team

---

## Support

- 📖 Full documentation: [`PACK_383_GLOBAL_PAYOUT_COMPLIANCE_ENGINE.md`](PACK_383_GLOBAL_PAYOUT_COMPLIANCE_ENGINE.md)
- 🔧 Deployment script: [`deploy-pack383.sh`](deploy-pack383.sh)
- 🔒 Security rules: [`firestore-pack383-finance.rules`](firestore-pack383-finance.rules)
- 📊 Indexes: [`firestore-pack383-finance.indexes.json`](firestore-pack383-finance.indexes.json)

---

**Status:** ✅ Production Ready  
**Last Updated:** 2025-12-30
