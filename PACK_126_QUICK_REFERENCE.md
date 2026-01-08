# PACK 126 — Quick Reference Guide

## 🚀 Quick Start

### Backend: Check Consent Before ANY Communication

```typescript
import { checkConsent } from './pack126-consent-protocol';

// Before sending message/media/call
const result = await checkConsent({
  fromUserId: senderId,
  toUserId: recipientId,
  requestType: 'MESSAGE' // or 'MEDIA', 'CALL', 'LOCATION', 'EVENT_INVITE'
});

if (!result.allowed) {
  throw new Error(result.reason);
}

// Proceed with action
```

### Mobile: Add Consent Controls to Chat

```typescript
import ConsentManagementModal from '@/components/safety/ConsentManagementModal';
import HarassmentShieldBanner from '@/components/safety/HarassmentShieldBanner';
import TraumaAwarePrompt from '@/components/safety/TraumaAwarePrompt';

// In ChatScreen
<HarassmentShieldBanner level={shieldLevel} />
<TraumaAwarePrompt visible={showPrompt} ... />
```

---

## 📋 Consent States

| State | Description | User Can |
|-------|-------------|----------|
| **PENDING** | Initial state | Nothing yet |
| **ACTIVE_CONSENT** | Full communication | Everything |
| **PAUSED** | Temporary break | View only |
| **REVOKED** | Permanently ended | Nothing |

---

## 🛡️ Harassment Shield Levels

| Level | Trigger | Action |
|-------|---------|--------|
| **LOW** | Risk 10-24 | Slow mode (30s delay) |
| **MEDIUM** | Risk 25-49 | Reply-only mode |
| **HIGH** | Risk 50-74 | Hard block + case |
| **CRITICAL** | Risk 75+ | Lockdown + escalation |

---

## 🎯 Risk Orchestration Actions

| Risk Score | Action | Follow-up |
|------------|--------|-----------|
| 0-19 | NO_ACTION | Continue |
| 20-39 | SOFT_SAFETY_WARNING | Notify user |
| 40-69 | CONSENT_RECONFIRM | Re-verify |
| 70-89 | QUEUE_FOR_REVIEW | Create case |
| 90+ | IMMEDIATE_LOCKDOWN | Emergency |

---

## 📞 Cloud Functions

### User Functions

```typescript
// Consent management
pack126_requestConsent({ toUserId, requestType })
pack126_pauseConsent({ counterpartId, reason? })
pack126_revokeConsent({ counterpartId, reason? })
pack126_resumeConsent({ counterpartId })
pack126_checkConsent({ toUserId, requestType })
pack126_getConsentRecord({ counterpartId })
pack126_getUserConsentsByState({ state })

// Safety features
pack126_reportUser({ reportedUserId, reason, messageContent })
pack126_getActiveShield({ counterpartId })
pack126_getSafetyDashboard({})
```

### Admin Functions

```typescript
// Evidence vault access
pack126_admin_requestVaultAccess({ vaultId, reason, scope })
pack126_admin_approveVaultAccess({ vaultId, requestId, durationHours })
pack126_admin_accessVaultEvidence({ vaultId })

// Internal
pack126_orchestrateRisk({ context, counterpartId? })
```

---

## 🗄️ Firestore Collections

```
user_consent_records/{userA_userB}
harassment_shields/{userId_harasserId}
evidence_vaults/{vaultId}
vault_keys/{vaultId}          (admin-only)
safety_audit_logs/{logId}     (90-day retention)
```

---

## ⚙️ Configuration

### Default Thresholds

```typescript
// In functions/src/types/pack126-types.ts
harassmentShieldThresholds: {
  lowRisk: 20,
  mediumRisk: 50,
  highRisk: 75,
  criticalRisk: 90,
}

consentRequestTimeout: 300,        // 5 minutes
evidenceVaultRetention: 90,        // days
refundWindowMinutes: 5,            // 5 minutes
```

### Detection Weights

```typescript
// In functions/src/pack126-harassment-shield.ts
SPAM_BURST: 15,
REPEATED_UNWANTED: 20,
IMPERSONATION_ATTEMPT: 40,
NSFW_PRESSURE: 35,
TRAUMA_RISK_PHRASE: 50,
BLOCK_EVASION: 45,
COORDINATED_HARASSMENT: 50,
```

---

## 🔧 Common Integration Patterns

### Pattern 1: Chat Message Send

```typescript
export const sendMessage = async (fromUserId, toUserId, text) => {
  // 1. Check consent
  const consent = await checkConsent({ fromUserId, toUserId, requestType: 'MESSAGE' });
  if (!consent.allowed) throw new Error('Not permitted');
  
  // 2. Detect harassment
  const signals = await detectHarassmentFromMessage(fromUserId, toUserId, text, metadata);
  if (signals.length > 0) {
    await activateHarassmentShield(toUserId, fromUserId, signals);
  }
  
  // 3. Send message
  await deliverMessage(fromUserId, toUserId, text);
};
```

### Pattern 2: Video Call Initiation

```typescript
export const initiateCall = async (callerId, recipientId) => {
  // 1. Check consent
  const consent = await checkConsent({ fromUserId: callerId, toUserId: recipientId, requestType: 'CALL' });
  if (!consent.allowed) throw new Error('Call blocked');
  
  // 2. Risk assessment
  const risk = await orchestrateRiskAssessment({ userId: callerId, context: 'CALL_REQUEST', counterpartId: recipientId });
  if (risk.action === 'IMMEDIATE_LOCKDOWN') throw new Error('Call blocked for safety');
  if (risk.action === 'CONSENT_RECONFIRM') return { requiresConfirmation: true };
  
  // 3. Initiate call
  await startCall(callerId, recipientId);
};
```

### Pattern 3: Trauma-Aware Exit

```typescript
// User clicks "I'm uncomfortable" button
const handleUncomfortable = () => {
  showTraumaAwarePrompt({
    onPause: () => pauseConsent(counterpartId),
    onRevoke: () => revokeConsent(counterpartId),
    onSupport: () => router.push('/support'),
  });
  // No questions asked, no explanations required
};
```

---

## 📊 Dashboard Quick View

```typescript
const dashboard = await getSafetyDashboard();

// Safety level (non-numerical)
dashboard.safetyLevel // 'PROTECTED' | 'STANDARD' | 'NEEDS_ATTENTION'

// Consent stats
dashboard.consentHistory.activeConsents    // Number
dashboard.consentHistory.pausedConsents    // Number
dashboard.consentHistory.revokedConsents   // Number

// Protection info
dashboard.activeProtections                // String array
dashboard.blockedUsers.length              // Number

// Available tools
dashboard.availableTools.map(t => t.name)  // Tool names
```

---

## 🚨 Emergency Actions

### User Reports Harassment

```typescript
const reportUser = httpsCallable(functions, 'pack126_reportUser');
const result = await reportUser({
  reportedUserId: harasserId,
  reason: 'Harassment',
  messageContent: lastMessage,
  metadata: { messagesInLastMinute: 10 }
});

if (result.data.shieldActivated) {
  // Automatic protection enabled
  Alert.alert('Protected', `Shield level: ${result.data.level}`);
}
```

### User Feels Unsafe

```typescript
// Instant protection, no explanation needed
const pauseConsent = httpsCallable(functions, 'pack126_pauseConsent');
await pauseConsent({ counterpartId });

// OR permanent end
const revokeConsent = httpsCallable(functions, 'pack126_revokeConsent');
await revokeConsent({ counterpartId });
```

---

## 🔍 Debugging

### Check Why Action Blocked

```typescript
// 1. Check consent
const consent = await getConsentRecord(userId, counterpartId);
console.log('Consent state:', consent?.state);

// 2. Check shield
const shield = await getActiveShield(userId, counterpartId);
console.log('Shield level:', shield?.level);

// 3. Check enforcement (PACK 87)
const enforcement = await getEnforcementState(userId);
console.log('Account status:', enforcement?.accountStatus);
```

### Monitor Safety Events

```typescript
// Query audit logs
const logs = await db.collection('safety_audit_logs')
  .where('userId', '==', userId)
  .orderBy('timestamp', 'desc')
  .limit(10)
  .get();

logs.forEach(log => {
  console.log(log.data().eventType, log.data().details);
});
```

---

## ✅ Pre-Deployment Checklist

### Backend
- [ ] Functions deployed
- [ ] Firestore rules updated
- [ ] Indexes created
- [ ] Scheduled jobs enabled
- [ ] Environment variables set

### Mobile
- [ ] Components imported
- [ ] Routes configured
- [ ] Permissions requested
- [ ] Error handling added
- [ ] Tested on iOS
- [ ] Tested on Android

### Web
- [ ] Components integrated
- [ ] Routes added
- [ ] Styles compiled
- [ ] Error handlers added
- [ ] Tested in browsers

### Desktop
- [ ] Components integrated
- [ ] Native modules built
- [ ] Keyboard shortcuts configured
- [ ] Tested on platforms

---

## 📈 Success Metrics

Track these in production:

```typescript
// Firestore queries for metrics
const metrics = {
  // Consent
  totalConsents: await countDocuments('user_consent_records'),
  activeConsents: await countWhere('user_consent_records', 'state', '==', 'ACTIVE_CONSENT'),
  
  // Shields
  activeShields: await countWhere('harassment_shields', 'resolvedAt', '==', null),
  criticalShields: await countWhere('harassment_shields', 'level', '==', 'CRITICAL'),
  
  // Vaults
  activeVaults: await countWhere('evidence_vaults', 'expiresAt', '>', new Date()),
  
  // Dashboard
  dashboardViews: await countWhere('safety_audit_logs', 'eventType', '==', 'SAFETY_DASHBOARD_VIEWED'),
};
```

---

## 🔒 Security Checklist

Before production:

- [ ] Encryption keys stored securely
- [ ] Admin roles verified
- [ ] Firestore rules tested
- [ ] Evidence access logged
- [ ] GDPR compliance verified
- [ ] Penetration testing completed

---

## 💡 Tips & Best Practices

### DO

✅ Check consent before EVERY communication  
✅ Show trauma-aware prompts prominently  
✅ Log all safety events for audit  
✅ Respect revoked consent immediately  
✅ Cache consent state client-side (5 min max)  
✅ Handle errors gracefully  
✅ Test harassment detection thresholds  

### DON'T

❌ Skip consent checks "for performance"  
❌ Cache consent state too long  
❌ Expose internal risk scores to users  
❌ Bypass shields with admin override  
❌ Store message content in evidence  
❌ Make safety affect monetization  
❌ Allow "pay for safety" features  

---

## 🆘 Support Resources

- **Integration Guide**: [`PACK_126_INTEGRATION_GUIDE.md`](PACK_126_INTEGRATION_GUIDE.md:1)
- **Full Implementation**: [`PACK_126_IMPLEMENTATION_COMPLETE.md`](PACK_126_IMPLEMENTATION_COMPLETE.md:1)
- **Type Definitions**: [`functions/src/types/pack126-types.ts`](functions/src/types/pack126-types.ts:1)

---

**Quick Reference Version**: 1.0  
**Last Updated**: 2025-11-28  
**Platform**: Avalo Safety Framework