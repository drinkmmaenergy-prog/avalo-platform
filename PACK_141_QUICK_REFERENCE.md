# PACK 141 — AI Companion Quick Reference

## 🚀 Quick Start

### Backend Setup

1. **Deploy Functions**:
```bash
cd functions
npm run build
firebase deploy --only functions:sendAICompanionMessage,startAICompanionCall,generateAICompanionMedia,completeAICompanionOnboarding,getAICompanions,getAICompanionPricingInfo,aiCompanionDailyCleanup
```

2. **Deploy Security Rules**:
```bash
firebase deploy --only firestore:rules
```

3. **Create Indexes**:
```bash
firebase deploy --only firestore:indexes
```

### Mobile Integration

1. **Navigate to AI Companions**:
```typescript
import { router } from 'expo-router';

router.push('/ai-companions' as any);
```

2. **Send Message to AI**:
```typescript
import { functions } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';

const sendMessage = httpsCallable(functions, 'sendAICompanionMessage');

const response = await sendMessage({
  companionId: 'companion_123',
  messageText: 'Help me with my goals',
});

// Response includes: sessionId, responseText, tokensCharged, safetyCheck
```

3. **Complete Onboarding**:
```typescript
const completeOnboarding = httpsCallable(functions, 'completeAICompanionOnboarding');

await completeOnboarding({
  selectedGoals: ['Improve productivity', 'Get fit'],
  communicationStyle: 'MOTIVATIONAL',
  allowedCategories: ['PRODUCTIVITY', 'FITNESS_WELLNESS'],
  disableEmotionalTopics: false,
});
```

---

## 📋 Key Constraints

### ✅ ALLOWED

- Productivity assistance
- Fitness & wellness coaching
- Language learning practice
- Creative brainstorming
- Entertainment & trivia
- Knowledge Q&A
- Styling tips (non-sexualized)

### ❌ FORBIDDEN

- Romance or dating simulation
- Flirting or sexual content
- Intimate roleplay
- Emotional dependency loops
- Pay-for-affection mechanics
- Body sexualization
- NSFW content

---

## 💰 Pricing

| Medium | Cost | Revenue |
|--------|------|---------|
| TEXT | 2 tokens/message | 100% Avalo |
| VOICE | 10 tokens/minute | 100% Avalo |
| VIDEO | 15 tokens/minute | 100% Avalo |
| MEDIA | 5 tokens/generation | 100% Avalo |

**NO DISCOUNTS • NO BONUSES • NO VARIABLE PRICING**

---

## 🛡️ Safety Checks

### Message Safety Flow

```typescript
// Automatic in sendAICompanionMessage
1. Check conversation limits → Block if exceeded
2. Check romantic phrases → Block if detected
3. Check NSFW phrases → Block if detected
4. Check dependency patterns → Warn if detected
5. Check wellness triggers → Escalate if detected
6. Allow message if all pass
```

### Blocked Phrase Examples

```typescript
// Romance
"love me", "be my girlfriend", "flirt with me"

// NSFW
"talk dirty", "send nudes", "seduce"

// Dependency
"only friend", "need you", "can't live without"

// Wellness (ESCALATE)
"harm myself", "want to die", "suicide"
```

---

## 📊 Firestore Collections

### Read/Write Patterns

| Collection | User Read | User Write | Admin Write |
|------------|-----------|------------|-------------|
| `ai_companion_profiles` | ✅ | ❌ | ✅ |
| `ai_companion_sessions` | ✅ Own | ❌ | ✅ |
| `ai_companion_memories` | ✅ Own | ❌ | ✅ |
| `ai_companion_safety_checks` | ✅ Own | ❌ | ✅ |
| `ai_companion_conversation_limits` | ✅ Own | ❌ | ✅ |
| `ai_companion_onboarding` | ✅ Own | ✅ Own | ✅ |

**All writes except onboarding go through Cloud Functions only**

---

## 🔗 Integration Examples

### Check User's Balance Before Interaction

```typescript
import { httpsCallable } from 'firebase/functions';

const checkBalance = async (userId: string, medium: 'TEXT' | 'VOICE' | 'VIDEO') => {
  // Get user's wallet
  const walletDoc = await db.collection('user_wallets').doc(userId).get();
  const balance = walletDoc.data()?.tokenBalance || 0;
  
  // Get pricing
  const pricing = {
    TEXT: 2,
    VOICE: 10,
    VIDEO: 15,
  };
  
  return balance >= pricing[medium];
};
```

### Display Safety Notice

```tsx
<View style={styles.safetyNotice}>
  <Text style={styles.safetyText}>
    ✓ Zero romance • Zero NSFW • 100% focused on your goals
  </Text>
</View>
```

### Handle Blocked Message

```typescript
const response = await sendMessage({ companionId, messageText });

if (!response.data.safetyCheck.passed) {
  // Message was blocked
  Alert.alert(
    'Message Blocked',
    response.data.responseText,
    [{ text: 'OK' }]
  );
  return;
}

// Message allowed, show response
setMessages(prev => [...prev, {
  text: response.data.responseText,
  isAI: true,
}]);
```

### Handle Conversation Limit

```typescript
try {
  const response = await sendMessage({ companionId, messageText });
} catch (error: any) {
  if (error.code === 'functions/resource-exhausted') {
    // Conversation limit hit
    Alert.alert(
      'Take a Break',
      'You\'ve reached your conversation limit. This helps maintain healthy usage patterns.',
      [{ text: 'OK' }]
    );
  }
}
```

---

## 🔍 Debugging

### Check Safety Logs

```typescript
// View user's safety checks
const safetyChecks = await db.collection('ai_companion_safety_checks')
  .where('userId', '==', userId)
  .orderBy('timestamp', 'desc')
  .limit(10)
  .get();

safetyChecks.forEach(doc => {
  const data = doc.data();
  console.log({
    message: data.messageText,
    concerns: data.detectedConcerns,
    action: data.action,
  });
});
```

### Check Conversation Limits

```typescript
const limits = await db.collection('ai_companion_conversation_limits')
  .doc(`${userId}_${companionId}`)
  .get();

console.log({
  dailyLimit: limits.data()?.dailyMessageLimit,
  cooldownActive: limits.data()?.cooldownRequired,
  cooldownUntil: limits.data()?.cooldownUntil,
});
```

### Verify Revenue Allocation

```typescript
// Check transaction
const txn = await db.collection('transactions')
  .where('type', '==', 'AI_COMPANION_CHARGE')
  .where('userId', '==', userId)
  .orderBy('timestamp', 'desc')
  .limit(1)
  .get();

const data = txn.docs[0].data();
console.log({
  tokensCharged: data.amount,
  avaloRevenue: data.revenueAllocation.avalo,  // Should be 100%
  creatorRevenue: data.revenueAllocation.creator, // Should be 0%
});
```

---

## 📱 UI Components

### AI Companion Card

```tsx
<TouchableOpacity
  style={styles.companionCard}
  onPress={() => selectCompanion(companion.companionId)}
>
  <Image source={{ uri: companion.avatarUrl }} style={styles.avatar} />
  <View>
    <Text style={styles.name}>{companion.name}</Text>
    <Text style={styles.category}>{companion.category}</Text>
    <Text style={styles.description}>{companion.description}</Text>
  </View>
</TouchableOpacity>
```

### Safety Opt-Out Toggles

```tsx
<Switch
  value={disableEmotionalTopics}
  onValueChange={setDisableEmotionalTopics}
  label="Disable Emotional Topics"
/>

<Switch
  value={disableVoiceMessages}
  onValueChange={setDisableVoiceMessages}
  label="Text-only Communication"
/>

<Switch
  value={disableAvatarImages}
  onValueChange={setDisableAvatarImages}
  label="Hide Companion Avatars"
/>
```

---

## ⚠️ Common Errors

| Error Code | Meaning | Solution |
|------------|---------|----------|
| `unauthenticated` | User not logged in | Require authentication |
| `invalid-argument` | Missing required fields | Check request parameters |
| `resource-exhausted` | Conversation limit hit | Show cooldown message |
| `failed-precondition` | Insufficient balance | Prompt token purchase |
| `not-found` | Companion doesn't exist | Check companionId |

---

## 🔐 Security Best Practices

1. **Never bypass safety checks** - All messages must go through `sendAICompanionMessage`
2. **Validate companion IDs** - Only use IDs from `getAICompanions`
3. **Respect conversation limits** - Don't attempt to circumvent cooldowns
4. **Log safety violations** - Track patterns with PACK 130
5. **Handle wellness triggers** - Always provide crisis resources

---

## 📊 Monitoring Checklist

Daily:
- [ ] Check safety violation count
- [ ] Review wellness escalations
- [ ] Verify 100% Avalo revenue allocation
- [ ] Monitor conversation limit hits

Weekly:
- [ ] Review blocked message categories
- [ ] Check false positive rate
- [ ] Analyze usage patterns
- [ ] Update blocked phrases if needed

---

## 🎯 Testing Commands

```bash
# Test safety filter
curl -X POST https://YOUR_REGION-YOUR_PROJECT.cloudfunctions.net/sendAICompanionMessage \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"companionId":"test","messageText":"love me"}'
# Should BLOCK

# Test normal message
curl -X POST https://YOUR_REGION-YOUR_PROJECT.cloudfunctions.net/sendAICompanionMessage \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"companionId":"test","messageText":"help me be productive"}'
# Should ALLOW

# Get pricing
curl https://YOUR_REGION-YOUR_PROJECT.cloudfunctions.net/getAICompanionPricingInfo
```

---

## 📚 Additional Resources

- Full Implementation: [`PACK_141_IMPLEMENTATION_COMPLETE.md`](PACK_141_IMPLEMENTATION_COMPLETE.md:1)
- Safety Framework: [`PACK_126_IMPLEMENTATION_COMPLETE.md`](PACK_126_IMPLEMENTATION_COMPLETE.md:1)
- Patrol AI: [`PACK_130_IMPLEMENTATION_COMPLETE.md`](PACK_130_IMPLEMENTATION_COMPLETE.md:1)
- Regional Compliance: [`PACK_122_IMPLEMENTATION_COMPLETE.md`](PACK_122_IMPLEMENTATION_COMPLETE.md:1)

---

**Version**: 1.0.0  
**Last Updated**: 2025-11-28  
**Status**: Production Ready ✅