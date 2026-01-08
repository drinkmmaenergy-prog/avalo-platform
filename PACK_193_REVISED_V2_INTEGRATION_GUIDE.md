# PACK 193 — REVISED v2 — Integration Guide

## Quick Start: Permission-Driven Sexuality System

This guide provides step-by-step instructions for integrating the PACK 193 sexuality consent system into your Avalo application.

---

## 📦 Prerequisites

- Firebase project configured
- Firestore database enabled
- Cloud Functions deployed
- React Native/Expo app set up
- TypeScript support enabled

---

## 🚀 Step 1: Deploy Backend Infrastructure

### 1.1 Deploy Firestore Security Rules

```bash
# From project root
firebase deploy --only firestore:rules --project your-project-id
```

Files deployed:
- [`firestore-pack193-sexuality-consent.rules`](firestore-pack193-sexuality-consent.rules)

### 1.2 Deploy Firestore Indexes

```bash
firebase deploy --only firestore:indexes --project your-project-id
```

Files deployed:
- [`firestore-pack193-sexuality-consent.indexes.json`](firestore-pack193-sexuality-consent.indexes.json)

### 1.3 Deploy Cloud Functions

```bash
cd functions
npm install
npm run build
firebase deploy --only functions:enableSexualityConsent,functions:disableSexualityConsent,functions:initiateSexyModeSession,functions:respondToSexyModeInvitation,functions:endSexyModeSession,functions:sendSexyContent,functions:reportSexyContent,functions:autoExpireSessions,functions:monitorSexyContent --project your-project-id
```

Files deployed:
- [`functions/src/pack193-sexuality-consent.ts`](functions/src/pack193-sexuality-consent.ts)
- [`functions/src/pack193-sexuality-consent-functions.ts`](functions/src/pack193-sexuality-consent-functions.ts)

---

## 📱 Step 2: Integrate Frontend Components

### 2.1 Add Consent Toggle to Settings

**Location**: User Settings > Privacy Section

```tsx
// app-mobile/app/profile/settings/privacy.tsx
import SexualityConsentToggle from '../../components/SexualityConsentToggle';

export default function PrivacySettings() {
  return (
    <ScrollView>
      {/* Other privacy settings */}
      
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Adult Content</Text>
        <SexualityConsentToggle />
      </View>
      
      {/* More settings */}
    </ScrollView>
  );
}
```

### 2.2 Add Session Control to Chat Screen

**Location**: Chat/Conversation Screen Header

```tsx
// app-mobile/app/chat/[conversationId].tsx
import SexyModeSessionControl from '../../components/SexyModeSessionControl';

export default function ChatScreen({ route }) {
  const { conversationId, otherUserId } = route.params;
  const [sexyModeActive, setSexyModeActive] = useState(false);

  return (
    <View style={styles.container}>
      {/* Chat Header */}
      
      {/* Session Control */}
      <SexyModeSessionControl
        otherUserId={otherUserId}
        conversationId={conversationId}
        onSessionChange={(isActive) => {
          setSexyModeActive(isActive);
          // Update UI accordingly
        }}
      />
      
      {/* Messages List */}
      <MessagesList sexyModeActive={sexyModeActive} />
      
      {/* Message Input */}
      <MessageInput 
        sexyModeActive={sexyModeActive}
        onSend={handleSendMessage}
      />
    </View>
  );
}
```

### 2.3 Update Message Input Component

```tsx
// app-mobile/app/components/MessageInput.tsx
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';

interface Props {
  sexyModeActive: boolean;
  onSend: (message: any) => void;
}

export default function MessageInput({ sexyModeActive, onSend }: Props) {
  const [message, setMessage] = useState('');
  const [contentType, setContentType] = useState<ContentType>('text');

  const handleSend = async () => {
    if (sexyModeActive && isSexyContent(contentType)) {
      // Send through sexy content function
      const sendSexyContentFn = httpsCallable(functions, 'sendSexyContent');
      
      try {
        const result = await sendSexyContentFn({
          receiverId: otherUserId,
          contentType,
          content: message,
          sessionId: generateSessionId(currentUserId, otherUserId)
        });
        
        const data = result.data as any;
        onSend({ contentId: data.contentId, content: message, contentType });
        setMessage('');
      } catch (error) {
        Alert.alert('Error', 'Failed to send message');
      }
    } else {
      // Send regular message
      onSend({ content: message, contentType: 'text' });
      setMessage('');
    }
  };

  return (
    <View style={styles.container}>
      {sexyModeActive && (
        <View style={styles.modeIndicator}>
          <Text style={styles.modeText}>🔥 Sexy Mode Active</Text>
        </View>
      )}
      
      <TextInput
        value={message}
        onChangeText={setMessage}
        placeholder={sexyModeActive ? "Send sexy message..." : "Type a message..."}
        style={styles.input}
      />
      
      {sexyModeActive && (
        <TouchableOpacity onPress={() => {/* Show content type picker */}}>
          <MaterialIcons name="photo-camera" size={24} />
        </TouchableOpacity>
      )}
      
      <TouchableOpacity onPress={handleSend}>
        <MaterialIcons name="send" size={24} />
      </TouchableOpacity>
    </View>
  );
}
```

---

## 🔐 Step 3: Implement Age Verification

### 3.1 Create Age Verification Screen

```tsx
// app-mobile/app/verification/age.tsx
import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';

export default function AgeVerification() {
  const [verifying, setVerifying] = useState(false);

  const handleVerify = async (method: 'id_document' | 'credit_card') => {
    setVerifying(true);
    
    try {
      // Integrate with age verification provider
      // Example: Jumio, Veriff, or Stripe age verification
      
      const verifyAge = httpsCallable(functions, 'submitAgeVerification');
      await verifyAge({
        method,
        verificationData: {
          // Provider-specific data
        }
      });
      
      Alert.alert('Success', 'Age verification submitted for review');
    } catch (error) {
      Alert.alert('Error', 'Verification failed');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Age Verification Required</Text>
      <Text style={styles.subtitle}>
        To access adult content, we need to verify you are 18 years or older.
      </Text>

      <TouchableOpacity
        style={styles.method}
        onPress={() => handleVerify('id_document')}
        disabled={verifying}
      >
        <MaterialIcons name="badge" size={32} />
        <Text style={styles.methodTitle}>ID Document</Text>
        <Text style={styles.methodDesc}>Upload government-issued ID</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.method}
        onPress={() => handleVerify('credit_card')}
        disabled={verifying}
      >
        <MaterialIcons name="credit-card" size={32} />
        <Text style={styles.methodTitle}>Credit Card</Text>
        <Text style={styles.methodDesc}>Verify age via credit card</Text>
      </TouchableOpacity>
    </View>
  );
}
```

### 3.2 Create Age Verification Cloud Function

```typescript
// functions/src/age-verification.ts
export const submitAgeVerification = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { method, verificationData } = data;
  const userId = context.auth.uid;

  try {
    // Integrate with verification provider
    // Example: Jumio, Veriff, Stripe, etc.
    
    let verificationResult;
    
    if (method === 'id_document') {
      // Process ID document verification
      verificationResult = await verifyIdDocument(verificationData);
    } else if (method === 'credit_card') {
      // Process credit card age verification
      verificationResult = await verifyCreditCard(verificationData);
    }

    // Store verification result
    await db.collection('user_age_verification').doc(userId).set({
      userId,
      isVerified18Plus: verificationResult.isAdult,
      verificationStatus: verificationResult.status,
      verificationMethod: method,
      submittedAt: admin.firestore.FieldValue.serverTimestamp(),
      verifiedAt: verificationResult.isAdult 
        ? admin.firestore.FieldValue.serverTimestamp() 
        : null,
      verificationProvider: verificationResult.provider
    });

    return {
      success: true,
      status: verificationResult.status,
      message: verificationResult.isAdult 
        ? 'Age verified successfully' 
        : 'Verification under review'
    };

  } catch (error: any) {
    console.error('Age verification error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});
```

---

## 📊 Step 4: Add Content Reporting

### 4.1 Create Report Button in Messages

```tsx
// app-mobile/app/components/MessageItem.tsx
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';

export default function MessageItem({ message, isSexyContent }) {
  const handleReport = async () => {
    Alert.alert(
      'Report Content',
      'Why are you reporting this message?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Inappropriate', onPress: () => submitReport('inappropriate') },
        { text: 'Harassment', onPress: () => submitReport('harassment') },
        { text: 'Non-consensual', onPress: () => submitReport('non_consensual') },
        { text: 'Prohibited Content', onPress: () => submitReport('prohibited_content') },
        { text: 'Minor Safety', onPress: () => submitReport('minor_safety'), style: 'destructive' }
      ]
    );
  };

  const submitReport = async (reportType: string) => {
    try {
      const reportContent = httpsCallable(functions, 'reportSexyContent');
      await reportContent({
        contentId: message.id,
        reportType,
        description: `User reported message as ${reportType}`
      });

      Alert.alert('Reported', 'Thank you. Our moderation team will review this.');
    } catch (error) {
      Alert.alert('Error', 'Failed to submit report');
    }
  };

  return (
    <View style={styles.messageContainer}>
      <Text style={styles.messageText}>{message.content}</Text>
      
      {isSexyContent && (
        <TouchableOpacity 
          style={styles.reportButton}
          onPress={handleReport}
        >
          <MaterialIcons name="flag" size={16} color="#999" />
        </TouchableOpacity>
      )}
    </View>
  );
}
```

---

## 🎨 Step 5: Update UI Based on Mode

### 5.1 Conditional Content Rendering

```tsx
// app-mobile/app/components/ConversationScreen.tsx
export default function ConversationScreen() {
  const [sexyModeActive, setSexyModeActive] = useState(false);

  return (
    <View style={styles.container}>
      {/* Header with mode indicator */}
      <View style={[
        styles.header, 
        sexyModeActive && styles.headerSexyMode
      ]}>
        <Text style={styles.headerTitle}>
          {otherUser.name}
          {sexyModeActive && ' 🔥'}
        </Text>
      </View>

      {/* Safety banner when sexy mode active */}
      {sexyModeActive && (
        <View style={styles.safetyBanner}>
          <MaterialIcons name="security" size={16} color="#FF6B9D" />
          <Text style={styles.safetyText}>
            Sexy Mode Active • Private & Consensual
          </Text>
        </View>
      )}

      {/* Messages with different styling */}
      <FlatList
        data={messages}
        renderItem={({ item }) => (
          <MessageItem
            message={item}
            isSexyContent={item.contentType !== 'text'}
            showControls={sexyModeActive}
          />
        )}
      />
    </View>
  );
}
```

### 5.2 Content Type Indicators

```tsx
// Show different UI for sexy content types
export function ContentTypeIndicator({ contentType }) {
  const icons = {
    text_flirty: '💬',
    text_sexy: '🔥',
    photo_bikini: '👙',
    photo_lingerie: '👗',
    photo_sensual: '📸',
    selfie_sexy: '🤳',
    emoji_flirty: '😘',
    compliment: '💖'
  };

  return (
    <View style={styles.indicator}>
      <Text style={styles.icon}>{icons[contentType]}</Text>
    </View>
  );
}
```

---

## 🔔 Step 6: Add Notifications

### 6.1 Session Invitation Notification

```typescript
// functions/src/notifications.ts
export const onSexyModeInvitation = functions.firestore
  .document('sexy_mode_sessions/{sessionId}')
  .onCreate(async (snap, context) => {
    const session = snap.data() as SexyModeSession;

    // Determine who needs notification
    const recipientId = session.initiatedBy === session.user1Id 
      ? session.user2Id 
      : session.user1Id;

    // Get recipient's FCM token
    const userDoc = await db.collection('users').doc(recipientId).get();
    const fcmToken = userDoc.data()?.fcmToken;

    if (fcmToken) {
      await admin.messaging().send({
        token: fcmToken,
        notification: {
          title: 'Sexy Mode Request',
          body: 'Someone wants to enable adult content in your conversation',
        },
        data: {
          type: 'sexy_mode_invitation',
          sessionId: session.sessionId
        }
      });
    }
  });
```

### 6.2 Handle Notification in App

```tsx
// app-mobile/app/_layout.tsx
import * as Notifications from 'expo-notifications';

Notifications.addNotificationResponseReceivedListener(response => {
  const data = response.notification.request.content.data;

  if (data.type === 'sexy_mode_invitation') {
    // Navigate to conversation
    router.push(`/chat/${data.sessionId}`);
  }
});
```

---

## 🧪 Step 7: Testing

### 7.1 Test Suite

```typescript
// functions/test/pack193-sexuality-consent.test.ts
import { describe, it, expect, beforeEach } from '@jest/globals';
import * as admin from 'firebase-admin';

describe('PACK 193 - Sexuality Consent System', () => {
  beforeEach(async () => {
    // Setup test data
  });

  it('should require age verification for consent', async () => {
    // Test age verification requirement
  });

  it('should create session with mutual consent', async () => {
    // Test session creation
  });

  it('should block prohibited content', async () => {
    // Test content validation
  });

  it('should auto-expire sessions', async () => {
    // Test expiration logic
  });

  it('should downgrade to PG when consent withdrawn', async () => {
    // Test consent withdrawal
  });
});
```

### 7.2 Manual Testing Checklist

```markdown
## Test Scenarios

### User A (Verified 18+)
- [ ] Can enable sexuality consent
- [ ] Can initiate sexy mode with User B
- [ ] Can send allowed content types
- [ ] Cannot send prohibited content
- [ ] Can disable consent anytime

### User B (Verified 18+)
- [ ] Receives session invitation
- [ ] Can accept/reject invitation
- [ ] Session activates when both consent
- [ ] Can end session anytime

### Safety Tests
- [ ] Unverified users cannot enable consent
- [ ] Content requires active session
- [ ] Expired sessions block content
- [ ] Reports create moderation flags
- [ ] Violations are logged

### Edge Cases
- [ ] Session expires after 24 hours
- [ ] Disabling consent ends all sessions
- [ ] Either user can end session
- [ ] Content remains private after session ends
```

---

## 📈 Step 8: Monitoring & Analytics

### 8.1 Add Analytics Events

```typescript
// app-mobile/lib/analytics.ts
import { logEvent } from 'firebase/analytics';

export function trackConsentEnabled() {
  logEvent(analytics, 'consent_enabled', {
    feature: 'sexuality_consent',
    version: '2.0'
  });
}

export function trackSessionStarted(sessionId: string) {
  logEvent(analytics, 'sexy_mode_session_started', {
    sessionId
  });
}

export function trackContentSent(contentType: string) {
  logEvent(analytics, 'sexy_content_sent', {
    contentType
  });
}

export function trackViolation(violationType: string) {
  logEvent(analytics, 'consent_violation', {
    violationType,
    severity: 'critical'
  });
}
```

### 8.2 Setup Monitoring Dashboard

```typescript
// View metrics in Firebase Console or create custom dashboard
const metrics = {
  activeConsentUsers: 'users with consentEnabled=true',
  activeSessions: 'sexy_mode_sessions where isActive=true',
  contentSent24h: 'sexy_content created in last 24h',
  violationsDetected: 'sexy_mode_violations where isResolved=false',
  reportsSubmitted: 'sexy_content_reports where isResolved=false'
};
```

---

## 🔄 Step 9: Migration (If Updating Existing System)

### 9.1 Migration Script

```typescript
// functions/src/migrate-pack193-v2.ts
export const migrateToPack193v2 = functions.https.onRequest(async (req, res) => {
  // Admin only
  if (!isAdmin(req)) {
    res.status(403).send('Unauthorized');
    return;
  }

  try {
    // Disable old system
    await disableOldSexyModeSystem();

    // Migrate existing consent preferences
    const users = await db.collection('users').get();
    
    for (const userDoc of users.docs) {
      const userData = userDoc.data();
      
      if (userData.hasOldConsent) {
        // Create new consent preferences
        await db.collection('sexuality_consent_preferences').doc(userDoc.id).set({
          userId: userDoc.id,
          consentEnabled: true,
          isActive: true,
          enabledAt: admin.firestore.FieldValue.serverTimestamp(),
          consentVersion: '2.0',
          requiresAgeVerification: true,
          canBeDisabledAnytime: true,
          migratedFrom: 'pack193_v1'
        });
      }
    }

    res.send({ success: true, usersMigrated: users.size });

  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});
```

---

## 🎓 Best Practices

### DO ✅
- Always validate age before enabling consent
- Show clear consent status indicators
- Log all actions for compliance
- Provide easy opt-out mechanisms
- Use clear, non-technical language
- Test content validation thoroughly
- Monitor violation patterns
- Respond quickly to reports

### DON'T ❌
- Allow consent without age verification
- Hide session status from users
- Make it difficult to disable
- Store explicit content logs visibly
- Use confusing terminology
- Skip content validation
- Ignore moderation flags
- Delay report handling

---

## 🆘 Troubleshooting

### Issue: Functions not deploying
```bash
# Check function syntax
npm run build

# Deploy with verbose logging
firebase deploy --only functions --debug

# Check Firebase console logs
firebase functions:log
```

### Issue: Security rules rejecting writes
```bash
# Test rules locally
firebase emulators:start --only firestore

# Check rules in Firebase console
# Firestore > Rules tab
```

### Issue: Age verification not working
```typescript
// Verify document exists
const ageDoc = await db.collection('user_age_verification').doc(userId).get();
console.log('Age verification:', ageDoc.exists, ageDoc.data());

// Check verification status
if (!ageDoc.data()?.isVerified18Plus) {
  console.log('User not verified as 18+');
}
```

---

## 📞 Support

For additional support:
- Review main documentation: [`PACK_193_REVISED_V2_IMPLEMENTATION_COMPLETE.md`](PACK_193_REVISED_V2_IMPLEMENTATION_COMPLETE.md)
- Check Firebase console for errors
- Review Cloud Functions logs
- Test with Firebase Emulator Suite

---

## ✅ Integration Checklist

Before going live, ensure:

- [ ] Firestore rules deployed
- [ ] Firestore indexes created
- [ ] All Cloud Functions deployed
- [ ] Age verification system integrated
- [ ] UI components added to app
- [ ] Notifications configured
- [ ] Analytics tracking implemented
- [ ] Content moderation dashboard set up
- [ ] Testing completed
- [ ] Documentation reviewed
- [ ] Team trained on system

---

**Integration Complete!** 🎉

Your app now has a fully compliant, consent-driven sexuality system that protects users while respecting their autonomy.

**Remember**: "We don't police attraction — we protect consent."