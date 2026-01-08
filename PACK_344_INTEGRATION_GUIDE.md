# PACK 344 — Integration Guide

This guide shows how to integrate Pack 344 AI Helpers into your chat, profile, and discovery screens.

---

## 1. Chat Message Helper Integration

### File: `app-mobile/app/chat/[chatId].tsx`

Add AI Suggestions to your chat input area:

```tsx
import { Pack344AiSuggestions } from '../../components/Pack344AiSuggestions';
import { checkForSpamPattern } from '../../services/pack344AntiCopyPasteService';
import { useTranslation } from '../../hooks/useTranslation';

export default function ChatConversationScreen() {
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  const { t } = useTranslation();
  const { locale } = useLocaleContext();
  
  // ... existing state ...
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [otherUserName, setOtherUserName] = useState('User');
  
  // PACK 344: Anti Copy-Paste check before sending
  const handleSendMessage = async () => {
    if (!inputText.trim() || !chatId || !user?.uid || sending || !otherUserId) {
      return;
    }

    const messageText = inputText.trim();
    
    // PACK 344: Check for spam pattern
    const spamCheck = await checkForSpamPattern(messageText, chatId);
    if (spamCheck.isSpamLike) {
      Alert.alert(
        t('pack344.spamWarningTitle'),
        t('pack344.spamWarningMessage'),
        [
          { text: t('pack344.editMessage'), style: 'cancel' },
          {
            text: t('pack344.getAiSuggestion'),
            onPress: () => {
              // Trigger AI suggestions modal
              // The Pack344AiSuggestions component handles this
            }
          }
        ]
      );
      return;
    }
    
    // ... continue with existing send logic (NSFW checks, billing, etc.) ...
  };
  
  return (
    <KeyboardAvoidingView style={styles.container} ...>
      {/* ... existing header and messages ... */}
      
      <View style={styles.inputContainer}>
        {/* Existing attach button */}
        <TouchableOpacity style={styles.attachButton} onPress={() => setShowMediaModal(true)}>
          <Text style={styles.attachButtonIcon}>📎</Text>
        </TouchableOpacity>
        
        {/* PACK 344: AI Suggestions Button */}
        <Pack344AiSuggestions
          sessionId={chatId}
          receiverProfileSummary={{
            nickname: otherUserName,
            age: undefined, // Load from profile if available
            interests: [], // Load from profile if available
            locationCountry: undefined, // Load from profile if available
          }}
          contextType={messages.length === 0 ? 'FIRST_MESSAGE' : 'REPLY'}
          lastUserMessage={inputText}
          lastPartnerMessage={messages[messages.length - 1]?.text}
          locale={locale}
          onSelectSuggestion={(text) => setInputText(text)}
        />
        
        {/* Existing text input */}
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Type a message..."
          placeholderTextColor="#999"
          multiline
          maxLength={1000}
        />
        
        {/* Existing send button */}
        <TouchableOpacity style={styles.sendButton} onPress={handleSendMessage} ...>
          <Text style={styles.sendButtonText}>
            {sending ? '...' : 'Send'}
          </Text>
        </TouchableOpacity>
      </View>
      
      {/* ... existing modals ... */}
    </KeyboardAvoidingView>
  );
}
```

---

## 2. Profile Coach Integration

### File: `app-mobile/app/profile/edit.tsx`

Add Profile Coach button to your profile edit screen:

```tsx
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { Pack344ProfileCoach } from '../components/Pack344ProfileCoach';
import { getProfile } from '../../lib/profileService';
import { AppHeader } from '../../components/AppHeader';

export default function EditProfileScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { locale } = useLocaleContext();
  
  const [profile, setProfile] = useState<any>(null);
  const [bioText, setBioText] = useState('');
  
  useEffect(() => {
    if (user?.uid) {
      loadProfile();
    }
  }, [user?.uid]);
  
  const loadProfile = async () => {
    if (!user?.uid) return;
    const profileData = await getProfile(user.uid);
    setProfile(profileData);
    setBioText(profileData?.bio || '');
  };
  
  return (
    <View style={styles.container}>
      <AppHeader 
        title="Edit Profile"
        rightAction={
          profile && (
            <Pack344ProfileCoach
              userId={user.uid}
              profileSummary={{
                gender: profile.gender,
                age: profile.age,
                bio: profile.bio,
                interests: profile.interests || [],
                photosCount: profile.photos?.length || 0,
                hasVideoBio: Boolean(profile.videoIntro)
              }}
              locale={locale}
              countryCode={profile.location?.countryCode}
              onApplyBioSuggestion={(bio) => {
                // Optional: auto-fill bio with AI suggestion
                setBioText(bio);
              }}
            />
          )
        }
      />
      
      <ScrollView style={styles.content}>
        {/* Your profile edit form */}
        <TextInput
          style={styles.bioInput}
          value={bioText}
          onChangeText={setBioText}
          placeholder="Write your bio..."
          multiline
        />
        
        {/* ... other profile fields ... */}
      </ScrollView>
    </View>
  );
}
```

---

## 3. Discovery Coach Integration

### File: `app-mobile/app/discovery/index.tsx`

Add "Improve My Chances" coach to discovery screen:

```tsx
import React, { useState } from 'react';
import { View, TouchableOpacity, Text } from 'react-native';
import { Pack344ProfileCoach } from '../components/Pack344ProfileCoach';
import { AppHeader } from '../components/AppHeader';

export default function DiscoveryScreen() {
  const { user } = useAuth();
  const { locale } = useLocaleContext();
  const [showCoach, setShowCoach] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  
  useEffect(() => {
    loadProfileAndStats();
  }, [user?.uid]);
  
  const loadProfileAndStats = async () => {
    if (!user?.uid) return;
    
    // Load profile
    const profileData = await getProfile(user.uid);
    setProfile(profileData);
    
    // Load stats (from analytics or live count)
    // This is placeholder - implement based on your analytics
    const statsData = {
      matchesLast7Days: 5,
      chatsStartedLast7Days: 8,
      paidChatsLast7Days: 2,
    };
    setStats(statsData);
  };
  
  return (
    <SafeAreaView style={styles.container}>
      <AppHeader
        title="Discovery"
        rightAction={
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {/* PACK 344: Coach Button */}
            <TouchableOpacity onPress={() => setShowCoach(true)}>
              <Text style={styles.coachIcon}>🎯</Text>
            </TouchableOpacity>
            
            {/* Existing search/filter icons */}
            <TouchableOpacity onPress={() => setShowSearch(true)}>
              <Text style={styles.filterIcon}>🔍</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowFilters(true)}>
              <Text style={styles.filterIcon}>⚙️</Text>
            </TouchableOpacity>
          </View>
        }
      />
      
      {/* Discovery grid and other content */}
      {/* ... */}
      
      {/* PACK 344: Coach Modal */}
      {showCoach && profile && (
        <Pack344ProfileCoach
          userId={user.uid}
          profileSummary={{
            gender: profile.gender,
            age: profile.age,
            bio: profile.bio,
            interests: profile.interests || [],
            photosCount: profile.photos?.length || 0,
            hasVideoBio: Boolean(profile.videoIntro)
          }}
          statsSummary={stats}
          locale={locale}
          countryCode={profile.location?.countryCode}
        />
      )}
    </SafeAreaView>
  );
}
```

---

## 4. Anti Copy-Paste Guard Usage (Standalone)

If you need to check for spam outside of the chat screen:

```tsx
import { checkForSpamPattern, hashMessage, clearMessageHashCache } from '../../services/pack344AntiCopyPasteService';

// Check if message is spam before sending
const messageText = "Hello, how are you?";
const chatId = "chat_123";

const result = await checkForSpamPattern(messageText, chatId);

if (result.isSpamLike) {
  console.log(`Spam detected! Sent to ${result.recipientsCount} different chats`);
  // Show warning to user
}

// Get hash of a message (for debugging)
const hash = hashMessage(messageText);
console.log('Message hash:', hash);

// Clear cache (e.g., on logout)
await clearMessageHashCache();
```

---

## 5. TypeScript Types

Add to your types file (e.g., `app-mobile/types/pack344.types.ts`):

```typescript
export interface MessageSuggestion {
  id: string;
  text: string;
  tone: 'playful' | 'polite' | 'confident' | 'curious';
}

export interface ProfileSummary {
  gender: 'female' | 'male' | 'nonbinary';
  age?: number;
  bio?: string;
  interests?: string[];
  photosCount: number;
  hasVideoBio: boolean;
}

export interface StatsSummary {
  matchesLast7Days?: number;
  chatsStartedLast7Days?: number;
  paidChatsLast7Days?: number;
}

export interface ProfileAndDiscoveryTips {
  profileTips: string[];
  discoveryTips: string[];
}
```

---

## 6. Backend API Contracts

### `pack344_getMessageSuggestions`

**Input**:
```typescript
{
  sessionId: string;
  receiverProfileSummary: {
    nickname: string;
    age?: number;
    interests?: string[];
    locationCountry?: string;
  };
  contextType: "FIRST_MESSAGE" | "REPLY";
  lastUserMessage?: string;
  lastPartnerMessage?: string;
  locale: string; // "en" or "pl"
}
```

**Output**:
```typescript
{
  suggestions: Array<{
    id: string;
    text: string;
    tone: "playful" | "polite" | "confident";
  }>;
}
```

### `pack344_flagRepeatedMessagePattern`

**Input**:
```typescript
{
  messageHash: string;
  chatId: string;
}
```

**Output**:
```typescript
{
  isSpamLike: boolean;
  recipientsCount: number;
  threshold: number;
}
```

### `pack344_getProfileAndDiscoveryTips`

**Input**:
```typescript
{
  profileSummary: {
    gender: "female" | "male" | "nonbinary";
    age?: number;
    bio?: string;
    interests?: string[];
    photosCount: number;
    hasVideoBio: boolean;
  };
  statsSummary?: {
    matchesLast7Days?: number;
    chatsStartedLast7Days?: number;
    paidChatsLast7Days?: number;
  };
  locale: string;
  countryCode?: string;
}
```

**Output**:
```typescript
{
  profileTips: string[]; // max 5
  discoveryTips: string[]; // max 5
}
```

---

## 7. Error Handling

All AI helper functions gracefully handle errors:

```typescript
try {
  const result = await getSuggestions(...);
} catch (error: any) {
  if (error.code === 'resource-exhausted') {
    // Daily limit reached
    Alert.alert('Limit Reached', t('pack344.dailyLimitReached'));
  } else if (error.code === 'unauthenticated') {
    // Not logged in
    router.push('/auth/login');
  } else {
    // Generic error - show fallback
    Alert.alert('Error', t('pack344.aiSuggestionsUnavailable'));
  }
}
```

Functions automatically fall back to hardcoded suggestions if OpenAI fails.

---

## 8. Testing Checklist

### Backend
- [ ] Call `pack344_getMessageSuggestions` with test data
- [ ] Verify suggestions are in correct locale
- [ ] Test rate limiting (try 51 requests in one day)
- [ ] Test spam pattern detection (5+ chats in 15 min)
- [ ] Verify OpenAI fallback works (disconnect API)

### Frontend
- [ ] AI button appears in chat input
- [ ] Modal opens and shows loading state
- [ ] Suggestions display correctly
- [ ] Tapping suggestion inserts text
- [ ] Spam warning appears for repeated messages
- [ ] Profile coach modal works
- [ ] Tips display in two sections
- [ ] All text is localized

---

## 9. Analytics & Monitoring

Monitor Pack 344 usage via Firestore Console:

### `/pack344_analytics`
```
- suggestion_generated events
- spam_pattern_detected events
- tips_generated events
```

### `/pack344_suggestion_usage`
```
userId -> { count: number, date: string }
```

Track:
- Daily active users of AI helpers
- Average suggestions per user
- Spam detection rate
- Conversion to paid chats (A/B test)

---

## 10. Configuration

### Firebase Functions Config

Set OpenAI API key:
```bash
firebase functions:config:set openai.key="sk-..."
```

Or in `.env` file:
```
AI_API_KEY=sk-...
```

### App Configuration

No client-side config needed - all AI processing happens in Cloud Functions.

---

## 11. Rollout Strategy

### Week 1: Beta (10% of users)
- Feature flag: `pack344_enabled: true` for 10% of users
- Monitor error rates and usage
- Collect qualitative feedback

### Week 2-3: Gradual Rollout
- 25% → 50% → 75%
- A/B test: Compare paid chat conversion rates
- Iterate on suggestions based on feedback

### Week 4: Full Release
- 100% rollout
- Add to onboarding flow
- Promote with in-app tooltips

---

## 12. Privacy & Safety Notes

✅ **Safe**:
- Only uses minimal profile data (nickname, age, interests)
- Last 1-2 messages for context
- No access to explicit media
- All AI outputs are moderated

❌ **NOT Stored**:
- Full chat history
- Personal identifiers (phone, email)
- Explicit content
- Financial details

🔒 **Rate Limited**:
- 50 suggestions per user per day
- Prevents abuse and controls costs

---

## 13. Cost Management

### OpenAI Costs (GPT-4o-mini)

- ~$0.0001 per suggestion request
- 50/day limit = $0.005 per user per day
- 1000 active users = $5/day = $150/month

### Firebase Costs

- Functions: ~10K invocations/day = $0.02/day
- Firestore: ~10K writes + 20K reads/day = $0.50/month

**Total**: ~$200/month for 30K active users

---

## 14. Troubleshooting

**Problem**: AI suggestions not appearing  
**Solution**: Check Firebase Functions logs, verify OpenAI API key is set

**Problem**: "Daily limit reached" error  
**Solution**: Reset is daily at midnight user time. Check `pack344_suggestion_usage` collection.

**Problem**: Spam detection too aggressive  
**Solution**: Adjust `PACK344_CONFIG.repeatDetectionThreshold` in backend (default 5)

**Problem**: Suggestions in wrong language  
**Solution**: Verify `locale` parameter is being passed correctly ("en" or "pl")

---

**Last Updated**: 2025-12-13  
**For Support**: Check Firebase Console logs or PACK_344_AI_HELPERS_IMPLEMENTATION.md
