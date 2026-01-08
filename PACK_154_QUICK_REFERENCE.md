# PACK 154 — Multilingual Translation & Moderation
## Quick Reference Guide

---

## 📋 Core Concepts

### Protected Translation Principles
- ✅ Neutral tone preservation
- ✅ Professional communication
- ✅ Cultural expressions (when safe)
- ✅ Humor preservation (optional)
- ✅ Constructive dialogue

### Zero-Tolerance Violations (AUTO-BLOCKED)
- 🛑 Adding romance/affection not in original
- 🛑 NSFW content addition
- 🛑 Tone escalation to intimate/sexual
- 🛑 Romance monetization
- 🛑 Harassment amplification
- 🛑 Language mixing exploits
- 🛑 Emoji/numeric sexual encoding

### Translation Safety Layers
```
Layer 1: Language Detection (confidence ≥70%)
Layer 2: PACK 153 Source Check
Layer 3: Tone Analysis (Original vs Translated)
Layer 4: Multilingual Pattern Detection
Layer 5: Escalation Detection (ANY romance shift = BLOCK)
```

---

## 🔌 Quick Integration

### Translate a Message

```typescript
import { translateMessage } from '@/services/translationService';

const result = await translateMessage({
  content: "Hello, how are you?",
  targetLanguage: "es",
  contentType: "TEXT_MESSAGE",
  channelType: "direct_message"
});

if (result.success && !result.blocked) {
  console.log(result.translatedContent);
} else {
  alert(result.messageToUser); // Show block reason
}
```

### Auto-Translate in Chat

```typescript
import { TranslationToggle } from '@/components/TranslationToggle';
import { BilingualMessageView } from '@/components/BilingualMessageView';

// In settings
<TranslationToggle 
  onPreferencesChange={(prefs) => updateUserPrefs(prefs)} 
/>

// In chat
{message.translated && preferences.bilingualMode ? (
  <BilingualMessageView
    originalText={message.text}
    translatedText={message.translated}
    sourceLanguage={message.language}
    targetLanguage={preferences.targetLanguage}
  />
) : (
  <Text>{message.translated || message.text}</Text>
)}
```

### Detect Language

```typescript
import { detectLanguage } from '@/services/translationService';

const detected = await detectLanguage(userInput);
console.log(detected.language); // "es"
console.log(detected.confidence); // 95
```

### Voice Translation

```typescript
import { translateVoice } from '@/services/translationService';

const result = await translateVoice({
  transcript: audioText,
  targetLanguage: "en",
  callId: call.id
});

if (result.shouldMute) {
  muteUser(result.muteReason);
}
```

---

## 🎨 UI Components

### Translation Toggle

```typescript
import { TranslationToggle } from '@/components/TranslationToggle';

<TranslationToggle 
  style={{ margin: 16 }}
  onPreferencesChange={(prefs) => {
    console.log('Auto-translate:', prefs.autoTranslate);
    console.log('Bilingual mode:', prefs.bilingualMode);
  }}
/>
```

**Features:**
- Auto-translate ON/OFF
- Bilingual mode toggle
- Preserve humor setting
- Quick settings access

### Bilingual Message View

```typescript
import { BilingualMessageView } from '@/components/BilingualMessageView';

<BilingualMessageView
  originalText="Hello, friend!"
  translatedText="¡Hola, amigo!"
  sourceLanguage="en"
  targetLanguage="es"
  showOriginalByDefault={false}
/>
```

**Features:**
- Toggle between languages
- Language indicators with flags
- Secondary language preview

### Appeal Center

```typescript
import { router } from 'expo-router';

// Navigate to appeal center
router.push('/translation/appeal-center');
```

**Features:**
- View blocked translations
- Submit appeals with evidence
- Track appeal status
- View reviewer feedback

---

## 📁 File Structure

```
Backend:
functions/src/
├── types/translation.types.ts          # Type definitions
├── pack154-translation-system.ts       # Core engine
└── pack154-endpoints.ts                # Cloud Functions

Frontend:
app-mobile/
├── services/translationService.ts      # API wrapper
├── app/components/
│   ├── TranslationToggle.tsx           # Settings toggle
│   └── BilingualMessageView.tsx        # Bilingual view
└── app/translation/
    └── appeal-center.tsx               # Appeal UI
```

---

## 🔑 Key Functions

### User Functions
- `pack154_translateMessage` - Translate text message
- `pack154_translateVoice` - Translate voice transcript
- `pack154_detectLanguage` - Detect text language
- `pack154_getPreferences` - Get translation settings
- `pack154_updatePreferences` - Update settings
- `pack154_getTranslationHistory` - View history
- `pack154_getBlockedTranslations` - View blocked
- `pack154_submitAppeal` - Submit appeal
- `pack154_getMyAppeals` - View appeals
- `pack154_checkAppealEligibility` - Check if appealable

### Admin Functions
- `pack154_admin_reviewAppeal` - Review appeal
- `pack154_admin_getPendingAppeals` - Get pending
- `pack154_admin_getStats` - Get statistics

---

## 📊 Collections

| Collection | Description |
|------------|-------------|
| `translation_logs` | All translation attempts |
| `translation_flags` | Safety violations detected |
| `blocked_translation_attempts` | Repeat offender tracking |
| `translation_appeals` | User appeal submissions |
| `translation_preferences` | User settings |
| `translation_stats` | Usage statistics |

---

## 🚨 Common Use Cases

### 1. Enable Auto-Translation

```typescript
import { updateTranslationPreferences } from '@/services/translationService';

await updateTranslationPreferences({
  autoTranslate: true,
  targetLanguages: ['en'],
  bilingualMode: false
});
```

### 2. Translate Before Sending

```typescript
const result = await translateMessage({
  content: userInput,
  targetLanguage: recipientLanguage,
  contentType: 'TEXT_MESSAGE',
  channelType: 'direct_message'
});

if (!result.blocked) {
  sendMessage(result.translatedContent);
} else {
  showError(result.messageToUser);
}
```

### 3. Handle Blocked Translation

```typescript
if (result.blocked) {
  Alert.alert(
    'Translation Blocked',
    result.messageToUser,
    [
      { text: 'Edit Message' },
      { 
        text: 'Appeal', 
        onPress: () => showAppealForm(result.translationId) 
      }
    ]
  );
}
```

### 4. Submit Appeal

```typescript
import { submitTranslationAppeal } from '@/services/translationService';

await submitTranslationAppeal(
  translationId,
  "This is a cultural expression",
  "In my language, this is common between friends"
);
```

### 5. Check Translation Status

```typescript
import { 
  getTranslationHistory,
  formatBlockReason 
} from '@/services/translationService';

const { translations } = await getTranslationHistory(10);

translations.forEach(t => {
  if (t.blocked) {
    console.log(`Blocked: ${formatBlockReason(t.blockReason)}`);
  }
});
```

---

## ⚙️ Configuration

### Supported Languages

```typescript
const languages = [
  'en', 'es', 'fr', 'de', 'it', 'pt', 'ru',
  'zh', 'ja', 'ko', 'ar', 'hi', 'tr', 'pl',
  // ... 20+ total
];
```

### Block Reasons

```typescript
type TranslationBlockReason =
  | 'TONE_ESCALATION'           // Added romance/affection
  | 'NSFW_CONTENT'              // Sexual content
  | 'HARASSMENT_DETECTED'       // Harassment/threats
  | 'ROMANCE_MONETIZATION'      // Monetizing intimacy
  | 'MANIPULATION_ATTEMPT'      // Unsafe meaning change
  | 'SOURCE_ALREADY_BLOCKED'    // Original blocked
  | 'LANGUAGE_MIXING_EXPLOIT'   // Language mixing
  | 'EMOJI_ENCODED_SEXUAL'      // Sexual emojis
  | 'NUMERIC_SLANG_SEXUAL'      // Numeric codes
  | 'VOICE_TONE_SEXUAL';        // Inappropriate audio
```

---

## 🔗 Integration with PACK 153

Translation automatically uses PACK 153 for source validation:

```typescript
// Translation checks source first
const pack153Result = await evaluateMessageSafety({
  content: originalMessage,
  contentType: 'TEXT_MESSAGE',
  userId: senderId
});

if (!pack153Result.allowed) {
  return {
    blocked: true,
    blockReason: 'SOURCE_ALREADY_BLOCKED',
    messageToUser: pack153Result.messageToUser
  };
}

// Then proceeds with translation...
```

---

## 🎯 Best Practices

1. **Always check before displaying**
   ```typescript
   if (result.success && !result.blocked) {
     displayTranslation(result.translatedContent);
   }
   ```

2. **Show clear user feedback**
   ```typescript
   if (result.blocked) {
     showBlockNotification(result.messageToUser);
   }
   ```

3. **Provide appeal option**
   ```typescript
   if (result.blocked && result.appealEligible) {
     showAppealButton(result.translationId);
   }
   ```

4. **Cache preferences**
   ```typescript
   const [prefs, setPrefs] = useState<TranslationPreferences>();
   
   useEffect(() => {
     getTranslationPreferences().then(setPrefs);
   }, []);
   ```

5. **Handle errors gracefully**
   ```typescript
   try {
     const result = await translateMessage(params);
   } catch (error) {
     showFallbackMessage(originalText);
   }
   ```

---

## 🐛 Troubleshooting

### Translation blocked incorrectly?
- Check if PACK 153 blocks the original
- Review tone analysis for escalation
- Submit appeal with context
- Check for emoji/slang patterns

### Language detection wrong?
- Ensure text is >20 characters
- Check for mixed languages
- Provide sourceLanguage explicitly
- Review confidence score

### Performance issues?
- Enable client-side caching
- Batch translation requests
- Use appropriate indexes
- Monitor function execution time

### Appeal not working?
- Verify translation ID
- Check block reason (NSFW can't appeal)
- Ensure reason is provided
- Check user authentication

---

## 📖 Utility Functions

### Get Language Display Info

```typescript
import { 
  getLanguageName, 
  getLanguageFlag 
} from '@/services/translationService';

const name = getLanguageName('es'); // "Spanish"
const flag = getLanguageFlag('es'); // 🇪🇸
```

### Format Block Reason

```typescript
import { formatBlockReason } from '@/services/translationService';

const message = formatBlockReason('TONE_ESCALATION');
// "Translation would add romantic or affectionate tone"
```

### Get Status Message

```typescript
import { getTranslationStatusMessage } from '@/services/translationService';

const message = getTranslationStatusMessage(
  result.blocked, 
  result.blockReason
);
```

---

## 📞 Support

For implementation questions:
- Review [PACK_154_IMPLEMENTATION_COMPLETE.md](PACK_154_IMPLEMENTATION_COMPLETE.md:1)
- Check code comments
- Monitor Cloud Functions logs
- Test with provided examples

---

## 🚀 Quick Start Checklist

- [ ] Deploy Cloud Functions
- [ ] Deploy Firestore rules
- [ ] Create Firestore indexes
- [ ] Add TranslationToggle to settings
- [ ] Integrate with chat system
- [ ] Add Appeal Center link
- [ ] Test language detection
- [ ] Test safe translation
- [ ] Test block scenarios
- [ ] Test appeal workflow
- [ ] Monitor logs

---

**Version:** 1.0.0  
**Last Updated:** November 29, 2025  
**Status:** Production Ready ✨
