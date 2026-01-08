# PACK 385 — Quick Start Guide

## 🚀 Deploy in 5 Minutes

### Prerequisites

- Firebase CLI installed: `npm install -g firebase-tools`
- Firebase project configured
- Admin access to Firebase console
- Node.js 18+ installed

### Step 1: Deploy Everything

```bash
chmod +x deploy-pack385.sh
./deploy-pack385.sh
```

This deploys:
- ✅ 35+ Cloud Functions
- ✅ Firestore security rules
- ✅ 45+ Firestore indexes
- ✅ Admin control panel

**Time:** 5-10 minutes

### Step 2: Wait for Indexes

Firestore indexes take 5-15 minutes to build. Check status:

```bash
firebase firestore:indexes --project avalo
```

### Step 3: Access Admin Panel

URL: `https://avalo.web.app/launch-control`

**What you'll see:**
- 🌍 Global launch phase selector
- 📊 Traffic protection monitor
- 🗺️ Market activation map
- 🔗 Referral system health
- ⭐ Ambassador leaderboard
- 💰 Revenue & fraud analytics

### Step 4: Set Launch Phase

1. Open admin panel
2. Select phase (start with **INTERNAL**)
3. Click "Apply Phase Change"

**Phase Progression:**
```
INTERNAL → BETA → SOFT_LAUNCH → REGIONAL_SCALE → GLOBAL_PUBLIC
```

### Step 5: Activate First Market

**Option A: Using Admin Panel**
1. Click "Activate New Market"
2. Select country
3. Configure features & limits
4. Confirm activation

**Option B: Using Firebase Console**
```javascript
// Run in Firebase Console
const functions = firebase.functions();

await functions.httpsCallable('pack385_activateMarket')({
  countryCode: 'US',
  config: {
    countryName: 'United States',
    legalStatus: 'APPROVED',
    features: {
      payoutsEnabled: true,
      tokenPurchaseEnabled: true,
      kycRequired: 'BASIC',
      calendarEnabled: true,
      aiFeatures: true,
      adultContent: false
    },
    limits: {
      maxPayoutDaily: 10000,
      maxTokenPurchaseDaily: 5000,
      minAge: 18
    },
    compliance: {
      gdprRequired: false,
      dataResidency: false,
      localTaxWithholding: true
    }
  }
});
```

### Step 6: Assign Ambassadors (Optional)

```javascript
await functions.httpsCallable('pack385_assignLaunchAmbassador')({
  userId: 'user123',
  tier: 'LOCAL',  // or 'REGIONAL' or 'GLOBAL'
  region: 'North America',
  country: 'US'
});
```

---

## 🎯 Launch Phase Recommendations

### Phase 0: INTERNAL (1-2 weeks)
**Who:** Team members only  
**Focus:** Testing, bug fixes, polish  
**Features:** None public-facing

### Phase 1: BETA (2-4 weeks)
**Who:** 100-500 invited users  
**Focus:** Stability, feedback, iteration  
**Features:** Discovery, referrals, tokens

### Phase 2: SOFT_LAUNCH (1-2 months)
**Who:** 1 region, public signup  
**Focus:** Product-market fit, retention  
**Features:** + Payouts, store reviews

### Phase 3: REGIONAL_SCALE (2-3 months)
**Who:** 3-5 regions  
**Focus:** Scale testing, marketing  
**Features:** + Ads

### Phase 4: GLOBAL_PUBLIC (ongoing)
**Who:** Worldwide  
**Focus:** Viral growth, optimization  
**Features:** All unlocked

---

## 📊 Monitor Health

### Key Metrics to Watch

**Daily:**
- Active users
- Error rate
- Referral fraud rate
- Payout approval backlog

**Weekly:**
- Phase progression readiness
- Market performance
- Ambassador engagement
- Revenue vs fraud curve

**Monthly:**
- Global growth rate
- Market expansion opportunities
- System capacity utilization
- Financial health

### Alerts Setup

Configure in admin panel:
1. Traffic → CRITICAL (auto-throttle)
2. Fraud rate > 15% in market
3. Payout review queue > 100
4. Ambassador violations

---

## 🔧 Common Operations

### Change Launch Phase
```javascript
await pack385_setLaunchPhase({ phase: 'SOFT_LAUNCH' });
```

### Emergency Traffic Protection
```javascript
await pack385_setTrafficLevel({ 
  level: 'CRITICAL',
  reason: 'Traffic spike from viral post'
});
```

### Suspend Market
```javascript
await pack385_suspendMarket({
  countryCode: 'XX',
  reason: 'Legal compliance issue'
});
```

### Approve Payout Manually
```javascript
await pack385_approvePayoutRequest({
  requestId: 'payout123',
  notes: 'Verified manually - approved'
});
```

---

## 🚨 Troubleshooting

### "Phase not applying"
- Check user has admin role
- Verify functions deployed
- Check Firebase logs

### "Market activation failed"
- Ensure PACK 383 (compliance) ready
- Ensure PACK 277 (wallet) configured
- Check pre-activation logs

### "Referrals not rewarding"
- Verify unlock conditions met
- Check for fraud flags
- Confirm account verified

### "Payouts stuck"
- Check market maturity (delay period)
- Review fraud risk score
- Verify KYC status

---

## 🎓 Learning Resources

**Documentation:**
- Full docs: `PACK_385_PUBLIC_LAUNCH_ORCHESTRATION.md`
- API reference: See Cloud Functions section
- Security: Firestore rules documentation

**Video Tutorials:** (Coming soon)
- Launch phase progression
- Market activation walkthrough
- Ambassador program setup
- Traffic protection configuration

---

## ✅ Pre-Launch Checklist

Before going to SOFT_LAUNCH:

- [ ] All dependency packs deployed (277, 296, 300, 300A, 301, 301B, 302, 383, 384)
- [ ] At least 1 market fully activated
- [ ] Ambassador program configured
- [ ] Referral system tested
- [ ] Payout flow tested
- [ ] Traffic protection tested
- [ ] Admin panel accessible
- [ ] Monitoring dashboards set up
- [ ] Legal team approval
- [ ] Financial systems ready
- [ ] Support team trained

Before going to GLOBAL_PUBLIC:

- [ ] 3+ markets proven stable
- [ ] Retention > 30% (D30)
- [ ] Fraud rate < 5%
- [ ] Revenue vs fraud curve healthy
- [ ] Infrastructure scaled
- [ ] Crisis response plan ready
- [ ] 24/7 monitoring in place
- [ ] Marketing campaign scheduled
- [ ] PR strategy finalized
- [ ] Influencer agreements signed

---

## 💡 Pro Tips

1. **Start Small**: Use INTERNAL phase for minimum 2 weeks
2. **One Market First**: Perfect one market before expanding
3. **Monitor Closely**: Check admin panel hourly during early phases
4. **Ambassador Power**: They drive 40%+ of early growth
5. **Fraud First**: Block fraud early to prevent cascading issues
6. **Traffic Prep**: Test CRITICAL mode before you need it
7. **Payout Buffer**: Use delayed payouts in new markets
8. **Document Everything**: Keep launch diary for retrospectives
9. **Team Alignment**: Daily standups during launch phases
10. **Celebrate Milestones**: Each phase transition is an achievement!

---

## 🎉 Ready to Launch!

You're now ready to orchestrate Avalo's global launch with:
- ✅ Controlled phase progression
- ✅ Fraud-safe viral loops
- ✅ Market-by-market expansion
- ✅ Traffic spike protection
- ✅ Safe payout management
- ✅ Ambassador-driven growth

**Remember:** This system ensures you never launch in an unsafe state, never collapse under load, and never lose money to fraud.

**Launch with confidence! 🚀**

---

**Questions?** Check the full documentation in `PACK_385_PUBLIC_LAUNCH_ORCHESTRATION.md`

**Version:** 1.0.0  
**Last Updated:** 2025-12-30  
**Status:** Production Ready
