# PACK 378 Quick Start Guide
## Global Payments, Tax, VAT & Legal Compliance Engine

### 🚀 5-Minute Setup

#### 1. Deploy to Firebase
```powershell
./deploy-pack378.ps1
```

#### 2. Configure Tax Profiles (Admin Dashboard)
Navigate to: `https://admin.avalo.app/pack378-tax-dashboard`

Add your first country:
```typescript
{
  countryCode: "US",
  vatRate: 0,                    // No VAT in US
  digitalServicesTax: 0,
  creatorIncomeTaxEstimate: 25,  // ~25% federal + state
  payoutWithholdingEnabled: true,
  withholdingRate: 24,           // IRS withholding
  withholdingThreshold: 600,     // $600 threshold for 1099
  requiresInvoice: false,
  vatMossEnabled: false,
  reverseChargeEnabled: false
}
```

#### 3. Use in Mobile App

**Calculate Tax on Purchase:**
```typescript
import { Tax } from './lib/pack378-integration';

// Show user full price breakdown
const taxInfo = await Tax.getPurchaseTaxBreakdown(99.99, 'US');
console.log(taxInfo.displayPrice);    // "$99.99"
console.log(taxInfo.breakdown);       // ["Base Price: $99.99", "Total: $99.99"]
```

**Check Creator Payout Eligibility:**
```typescript
const canWithdraw = await Tax.canCreatorWithdraw('creator123', 500);

if (!canWithdraw.allowed) {
  alert(`Cannot withdraw: ${canWithdraw.reason}`);
  showActions(canWithdraw.requiredActions);
}
```

**Show Net Earnings:**
```typescript
const earnings = await Tax.getCreatorNetEarning(1000, 'creator123');
console.log(earnings.net);               // $540.20
console.log(earnings.takeHomePercentage); // 54.0%
earnings.breakdown.forEach(line => console.log(line));
```

**Localize Prices:**
```typescript
const localPrice = await Tax.getLocalizedPrice(9.99, 'IN', 'google');
console.log(localPrice.price);    // "₹750.00"
console.log(localPrice.reason);   // "Adjusted for IN purchasing power"
```

**Report Abuse (DSA Compliant):**
```typescript
const report = await Tax.reportAbuse(
  'post123',
  'message',
  'harassment',
  'User is sending threatening messages'
);
console.log(`Report ${report.reportId} will be reviewed in ${report.expectedResolution}`);
```

---

### 🎯 Common Use Cases

#### Use Case 1: Token Purchase with VAT
```typescript
// User in Poland buying 100 tokens at $9.99
const taxInfo = await Tax.getPurchaseTaxBreakdown(9.99, 'PL');

// Display to user:
// "Base Price: $8.12"
// "VAT (23%): $1.87"
// "Total: $9.99"
// "✓ EU VAT MOSS applied"
```

#### Use Case 2: Creator Withdrawal Check
```typescript
// Before showing withdrawal button
const canWithdraw = await Tax.canCreatorWithdraw(creatorId, amount);

if (canWithdraw.allowed) {
  // Show withdrawal form
  showWithdrawalForm();
} else {
  // Show compliance requirements
  showCompliancePrompt({
    title: 'Complete Requirements',
    actions: canWithdraw.requiredActions,
    // e.g., ["Complete KYC verification", "Add tax ID"]
  });
}
```

#### Use Case 3: Earnings Transparency
```typescript
// Show creator what they'll actually receive
const earnings = await Tax.getCreatorNetEarning(monthlyGross, creatorId);

displayEarningsCard({
  gross: earnings.gross,
  fees: earnings.platformFee,
  taxes: earnings.taxes,
  net: earnings.net,
  details: earnings.breakdown
});

// Displays:
// Gross Earning: $1,000.00
// Platform Fee (20%): -$200.00
// Withholding Tax: -$96.00
// Est. Income Tax: -$163.80
// ─────────────────────
// Net Take-Home: $540.20
// (54.0% of gross)
```

#### Use Case 4: Store-Compliant Pricing
```typescript
// Validate Apple in-app purchase
const storeCheck = await Tax.validateStorePurchase('apple', 9.99, 'US');

if (!storeCheck.allowed) {
  console.error('Price not in Apple approved tiers');
  // Adjust to nearest tier: $9.99
}
```

---

### 🔧 Feature Flag Control

Enable/disable features without redeployment:

```typescript
// In Firebase Console > Firestore > featureFlags > pack378
{
  "tax.engine.enabled": true,               // ✓ Production ready
  "vat.engine.enabled": true,               // ✓ Production ready
  "payout.withholding.enabled": true,       // ✓ Production ready
  "legal.dsa.enabled": true,                // ✓ Production ready
  "store.compliance.enabled": true,         // ✓ Production ready
  "price.normalization.enabled": true,      // ✓ Production ready
  "audit.exports.enabled": true,            // ✓ Production ready
  "compliance.gate.strict.enabled": false   // ⚠ Enable for production
}
```

**To enable strict compliance:**
```typescript
// In Firebase Console, set:
"compliance.gate.strict.enabled": true

// This will:
// - Block all payouts that don't meet 100% requirements
// - Require identity verification before any transaction
// - Enforce VAT registration for high-volume creators
// - Enable enhanced fraud detection
```

---

### 📊 Admin Dashboard Quick Actions

#### Generate Monthly VAT Report
```typescript
// In admin dashboard
generateReport('vat_report');
// Downloads: vat_report_2025-01-01_2025-01-31.csv
```

#### Generate Payout Tax Report
```typescript
generateReport('payout_tax');
// Downloads: payout_tax_2025-01-01_2025-01-31.csv
```

#### Check Compliance Alerts
View real-time DSA compliance events in the dashboard.

---

### 🧪 Testing Checklist

Before production:

- [ ] Test VAT calculation for EU country
- [ ] Test non-VAT calculation for US
- [ ] Test reverse charge for B2B transaction
- [ ] Test payout compliance gate (pass)
- [ ] Test payout compliance gate (fail)
- [ ] Test price normalization for low PPP country
- [ ] Test Apple store price validation
- [ ] Test Google Play price validation
- [ ] Test DSA abuse reporting
- [ ] Generate test VAT report
- [ ] Verify invoice generation
- [ ] Test withholding calculation
- [ ] Test fraud score blocking

---

### ⚠️ Production Checklist

Before going live:

- [ ] Configure tax profiles for all target countries
- [ ] Load regional price profiles with current PPP data
- [ ] Enable strict compliance mode (`compliance.gate.strict.enabled: true`)
- [ ] Set up automated monthly report emails
- [ ] Configure abuse report review workflow
- [ ] Train support team on compliance requirements
- [ ] Set up compliance monitoring dashboard
- [ ] Verify integration with PACK 277 (Wallet)
- [ ] Verify integration with PACK 302 (Fraud Detection)
- [ ] Legal review of DSA compliance implementation
- [ ] Accountant review of tax calculation logic
- [ ] Test full withdrawal flow end-to-end

---

### 🆘 Troubleshooting

**Issue: Tax calculation returns 0%**
- Check if tax profile exists for country
- Verify `tax.engine.enabled` flag is true
- Check Cloud Function logs

**Issue: Payout blocked unexpectedly**
- Check compliance result: `checkPayoutCompliance(creatorId, amount)`
- Review required actions
- Check fraud score in PACK 302

**Issue: Price normalization not working**
- Verify regional price profile exists
- Check `price.normalization.enabled` flag
- Ensure PPP multiplier is set

**Issue: VAT MOSS not applying**
- Verify country is in EU
- Check `vatMossEnabled` in tax profile
- Confirm user location verification

---

### 📚 Additional Resources

- [Full Documentation](./PACK_378_IMPLEMENTATION.md)
- [Deployment Script](./deploy-pack378.ps1)
- [Tax Compliance Service](./app-mobile/services/pack378-tax-compliance.ts)
- [Integration Helper](./app-mobile/lib/pack378-integration.ts)
- [Admin Dashboard](./admin-web/src/pages/pack378-tax-dashboard.tsx)

---

### 💡 Pro Tips

1. **Always show tax breakdown** to users before purchase
2. **Display net earnings** to creators for transparency
3. **Enable strict mode gradually** - start with warnings, then enforcement
4. **Generate reports monthly** for clean accounting
5. **Monitor DSA alerts** daily for compliance
6. **Update PPP data** quarterly for accurate pricing
7. **Test withholding** in sandbox before production

---

**PACK 378 is now ready to make Avalo legally compliant worldwide! 🌍**
