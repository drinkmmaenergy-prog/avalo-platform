# PACK 156: Mystery Shopper & Compliance - Quick Reference

## 🎯 Purpose
Automated fraud detection and compliance enforcement using decoy accounts and human auditors to catch romance scams, NSFW solicitation, payment fraud, and other policy violations.

## 📦 What Was Built

### Backend (6 modules)
1. **Types & Schemas** - Data models and interfaces
2. **Probe Engine** - Automated decoy account testing
3. **Compliance Cases** - Violation tracking and evidence
4. **Enforcement** - Penalties, freezes, and bans
5. **Appeals** - User appeal workflow
6. **Schedulers** - Automated jobs and cleanup

### Frontend (6 components)
1. **Mobile Warning Banner** - Alert display
2. **Mobile Warnings Screen** - View/acknowledge warnings
3. **Mobile Education Screen** - Required training modules
4. **Mobile Appeal Screen** - Submit appeals
5. **Web Warning Banner** - Web alert display
6. **Desktop Compliance Panel** - Desktop status interface

## 🔑 Key Features

### Mystery Shopper System
- **5 Decoy Types:** new_user, high_spender, beginner_creator, event_attendee, digital_product_customer
- **6 Probe Types:** external_contact, romantic_monetization, escort_dynamics, nsfw_solicitation, refund_fraud, visibility_bartering
- **Automated Probing:** Scheduled tests based on risk scores
- **Contextual Detection:** Smart violation pattern recognition

### Enforcement Levels
- **Severity 5 (Critical):** Instant account ban
- **Severity 4 (Severe):** Feature freeze
- **Severity 3 (Moderate):** Warning + education
- **Severity 2 (Minor):** Education only
- **Severity 1 (Info):** Logged only

### Risk Scoring
- **Score Range:** 0-100 (higher = better)
- **Tiers:** Excellent, Good, Fair, Poor, Critical
- **Audit Frequency:** Scales based on tier
- **Score Decay:** +2 points/month for good behavior

## 📂 File Locations

### Backend
```
functions/src/
├── types/mystery-shopper.types.ts
└── mystery-shopper/
    ├── probe-engine.ts
    ├── compliance-cases.ts
    ├── enforcement.ts
    ├── appeals.ts
    └── schedulers.ts
```

### Mobile
```
app-mobile/app/
├── components/compliance/
│   └── ComplianceWarningBanner.tsx
└── profile/compliance/
    ├── warnings.tsx
    ├── education.tsx
    └── appeal.tsx
```

### Web & Desktop
```
app-web/components/compliance/ComplianceWarningBanner.tsx
app-desktop/src/components/CompliancePanel.tsx
```

## 🗄️ Database Collections

1. `mystery_shopper_profiles` - Decoy accounts
2. `compliance_cases` - Violation records
3. `compliance_risk_scores` - User risk ratings
4. `audit_actions` - Enforcement actions
5. `compliance_appeals` - Appeal submissions
6. `probe_results` - Probe execution logs
7. `device_bans` - Banned devices
8. `ip_bans` - Banned IP addresses

## 🔐 Reason Codes

| Code | Description |
|------|-------------|
| `ESC_001` | Escorting/sugar dating solicitation |
| `SEX_001-004` | Sexual services/content violations |
| `ROM_001-004` | Romantic monetization schemes |
| `EXT_001-003` | External payment solicitation |
| `FRD_001-003` | Fraud and refund schemes |
| `VIS_001-002` | Visibility bartering |
| `SAF_001` | Offline safety violation |
| `MIS_001` | Misleading service description |

## ⚡ Quick Start

### Create Mystery Shopper
```typescript
import { createMysteryShopperProfile } from './mystery-shopper/probe-engine';

const shopper = await createMysteryShopperProfile('high_spender', {
  spendingProfile: 'high',
  activityPattern: 'very_active'
});
```

### Run Probe
```typescript
import { runMysteryShopperProbe } from './mystery-shopper/probe-engine';

const result = await runMysteryShopperProbe({
  shopperProfileId: 'shopper123',
  targetUserId: 'user456',
  probeType: 'romantic_monetization'
});
```

### Apply Penalty
```typescript
import { applyCompliancePenalty } from './mystery-shopper/enforcement';

await applyCompliancePenalty({
  caseId: 'case789',
  targetUserId: 'user456',
  severity: 4,
  reason: 'Flirting for tokens detected',
  reasonCode: 'ROM_001',
  appliedBy: 'auditor123',
  frozenFeatures: ['chat', 'events']
});
```

### Submit Appeal
```typescript
import { submitAppeal } from './mystery-shopper/appeals';

const appealId = await submitAppeal({
  caseId: 'case789',
  actionId: 'action123',
  userId: 'user456',
  reason: 'This was a misunderstanding...',
  evidence: 'Additional context...'
});
```

## 📊 Scheduled Jobs

| Job | Frequency | Purpose |
|-----|-----------|---------|
| `scheduledProbes` | Every hour | Schedule new probes |
| `scoreDecay` | Daily | Improve scores over time |
| `complianceCleanup` | Daily | Remove expired data |
| `consistencyAudit` | Weekly | Check data integrity |

## 🔒 Security Rules

- Mystery shopper profiles: **Admin only**
- Compliance cases: **User can read own, admins full access**
- Risk scores: **User can read own score, admins full access**
- Appeals: **User can submit, admins review**
- Device/IP bans: **Admin only**

## 📱 User Experience Flow

1. **Violation Detected** → Case created, risk score updated
2. **Penalty Applied** → User sees warning banner
3. **User Acknowledges** → Warning marked as read
4. **Education Required?** → User completes modules
5. **Appeal Possible?** → User can submit appeal within 14 days
6. **Appeal Reviewed** → Admin approves/denies
7. **Score Improves** → Over time with good behavior

## ⚠️ Non-Negotiable Rules

✅ Mystery shoppers never punish legitimate behavior
✅ No impact on feed visibility or matchmaking
✅ No incentives for auditors based on ban volume
✅ Tokenomics completely separate
✅ Decoys never entrap users into violations

## 📈 Key Metrics

Monitor these in your dashboard:
- Total probes executed
- Violations detected
- Detection rate
- False positive rate
- Open cases by severity
- Average resolution time
- Appeals submitted vs approved
- Risk score distribution
- Feature freezes active
- Accounts banned

## 🆘 Troubleshooting

### User Can't Access Feature
1. Check `audit_actions` for active penalties
2. Verify `compliance_education` completion
3. Check feature freeze expiration

### Probe Not Detecting Violations
1. Review `probe_results` logs
2. Check scenario red flags
3. Verify contextual check logic

### Appeal Not Processing
1. Check appeal deadline hasn't passed
2. Verify case status is not already resolved
3. Confirm auditor assignment

## 🔗 Related Systems

- **PACK 155:** Data retention (evidence expiration)
- **PACK 72:** AI moderation (content analysis)
- **PACK 85:** Trust & risk engine (risk scoring)
- **PACK 87:** Enforcement state machine (account states)
- **PACK 90:** Audit logging (action tracking)

## 📞 Support Contacts

- **Technical Issues:** Backend team
- **False Positives:** Compliance team
- **Appeal Reviews:** Legal/compliance team
- **User Support:** Customer success team

---

**Version:** 1.0.0
**Last Updated:** 2024-11-29
**Status:** ✅ Production Ready