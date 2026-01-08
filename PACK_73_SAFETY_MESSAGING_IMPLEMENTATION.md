# PACK 73 — Safety Messaging & Risk-Aware Onboarding Flows

## Implementation Summary

Full implementation of safety-focused onboarding and in-app messaging layer for Avalo, with contextual safety tips, risk-aware banners, and UI nudges driven by existing Trust/AML/Fraud engines.

---

## 🎯 Core Features Implemented

### 1. Backend Components

#### Safety Signal Aggregation (`functions/src/safetySignals.ts`)
- **`getSafetyHintForPair(viewerUserId, counterpartUserId)`**: Aggregates risk signals from multiple sources
  - Trust Engine (PACK 46): blocklist status, trust flags
  - Enforcement (PACK 54): violations, restrictions
  - AML/Fraud (PACK 63, 71): financial risk levels
  - Moderation (PACK 54, 72): content violations history
- **Returns**: Discrete safety levels (`NONE`, `LOW`, `MEDIUM`, `HIGH`) with generic reason codes
- **Read-only**: No writes to other modules, pure aggregation

#### Safety UX API (`functions/src/safetyUx.ts`)
- **`GET /safety/ux-state`**: Get user's safety onboarding completion and tip visibility
- **`POST /safety/ux-event`**: Mark safety events (onboarding completed, tips shown, support clicks)
- **`GET /safety/hint`**: Get safety hint level for a counterpart user

#### Data Model (`safety_profiles/{userId}`)
```typescript
{
  userId: string,
  safetyOnboardingCompleted: boolean,
  safetyOnboardingCompletedAt: Timestamp | null,
  seenFirstMeetingTip: boolean,
  seenOffPlatformWarning: boolean,
  seenPaymentSafetyTip: boolean,
  highRiskPartnerWarningsShown: number,
  supportSafetyClicks: number,
  lastUpdatedAt: Timestamp,
  createdAt: Timestamp
}
```

#### Firebase Functions Exported
- `safety_getUxState`: Get user safety UX state
- `safety_markUxEvent`: Mark safety UX event
- `safety_getHint`: Get safety hint for counterpart

---

### 2. Mobile Components

#### Safety Service (`app-mobile/services/safetyService.ts`)
- **API Wrapper Functions**:
  - `getSafetyUxState(userId?)`: Fetch user's safety state
  - `markSafetyUxEvent(event)`: Record safety event
  - `getSafetyHint(counterpartUserId)`: Get safety hint for user
- **Local Storage Functions**:
  - `hasCompletedSafetyOnboardingLocally(userId)`: Check local completion
  - `markSafetyOnboardingCompletedLocally(userId)`: Mark local completion
  - `hasSafetyTipBeenShown(tipKey, userId)`: Check if tip shown
  - `markSafetyTipShown(tipKey, userId)`: Mark tip as shown

#### Safety Onboarding Screen (`app-mobile/screens/onboarding/SafetyOnboardingScreen.tsx`)
- **Multi-step onboarding** with 3 slides:
  1. Basic safety principles (18+, no money off-platform)
  2. Meeting safety (public places, inform friend, use in-app tools)
  3. Reporting and help (block, report, contact support)
- **Progress indicators**: Visual dots showing current slide
- **Navigation**: Back/Next buttons with finish action
- **Resilient**: Saves completion locally even if backend fails

#### Safety Info Screen (`app-mobile/screens/settings/SafetyInfoScreen.tsx`)
- **Static safety content**: Displays all safety guidelines
- **Quick actions**:
  - Open Support Center (PACK 68)
  - Open Privacy Center (PACK 64)
  - Open Safety Policy (external URL)
- **Tracks engagement**: Records support clicks via `SUPPORT_SAFETY_CLICK` event

#### Safety Modals (`app-mobile/components/safety/SafetyModals.tsx`)
- **Generic SafetyModal**: Reusable modal for all safety prompts
- **FirstMeetingTip**: Modal before first reservation
- **OffPlatformWarning**: Warning before sharing contact details
- **PaymentSafetyTip**: Tip before large payments

#### Safety Banner (`app-mobile/components/safety/SafetyBanner.tsx`)
- **Risk-aware banners** for chat screens
- **Color-coded by level**:
  - `LOW`: Green banner with gentle reminder
  - `MEDIUM`: Orange banner with caution message
  - `HIGH`: Red banner with strong warning
- **Action buttons** (MEDIUM/HIGH only):
  - Block user
  - Report user
  - Contact support (HIGH only)

---

### 3. I18n Translations

#### English (`app-mobile/locales/en/safety.json`)
- Complete translations for all safety messages
- Onboarding slides
- Modal prompts
- Chat banners
- Info screen content

#### Polish (`app-mobile/locales/pl/safety.json`)
- Full Polish translations
- All safety strings localized
- Culturally appropriate messaging

---

## 🔌 Integration Points

### Required in App Navigation

Add these routes to your main navigation:

```typescript
import SafetyOnboardingScreen from './screens/onboarding/SafetyOnboardingScreen';
import SafetyInfoScreen from './screens/settings/SafetyInfoScreen';

// In your navigation stack
<Stack.Screen 
  name="SafetyOnboarding" 
  component={SafetyOnboardingScreen}
  options={{ headerShown: false }}
/>

<Stack.Screen 
  name="SafetyInfo" 
  component={SafetyInfoScreen}
  options={{ title: 'Safety & Help' }}
/>
```

### Onboarding Flow Integration

After user login/signup, check if safety onboarding is needed:

```typescript
import { getSafetyUxState, hasCompletedSafetyOnboardingLocally } from './services/safetyService';
import { useAuth } from './contexts/AuthContext';

// In your main app component
const { user } = useAuth();
const [showSafetyOnboarding, setShowSafetyOnboarding] = useState(false);

useEffect(() => {
  async function checkSafetyOnboarding() {
    if (!user?.uid) return;
    
    // Check local first for speed
    const localComplete = await hasCompletedSafetyOnboardingLocally(user.uid);
    if (localComplete) return;
    
    // Check backend
    const state = await getSafetyUxState(user.uid);
    if (!state.safetyOnboardingCompleted) {
      setShowSafetyOnboarding(true);
    }
  }
  
  checkSafetyOnboarding();
}, [user]);

// Show modal or navigate to onboarding
if (showSafetyOnboarding) {
  return (
    <SafetyOnboardingScreen 
      onComplete={() => {
        setShowSafetyOnboarding(false);
        // Navigate to main app
      }} 
    />
  );
}
```

### Chat Screen Integration

Add safety banner to chat screens:

```typescript
import { SafetyBanner } from './components/safety/SafetyBanner';
import { getSafetyHint, markSafetyUxEvent } from './services/safetyService';
import { useState, useEffect } from 'react';

function ChatScreen({ counterpartUserId }) {
  const [safetyHint, setSafetyHint] = useState({ level: 'NONE', reasons: [] });
  const [bannerShown, setBannerShown] = useState(false);
  
  useEffect(() => {
    async function loadSafetyHint() {
      const hint = await getSafetyHint(counterpartUserId);
      setSafetyHint(hint);
      
      // Track if warning shown
      if (hint.level !== 'NONE' && !bannerShown) {
        await markSafetyUxEvent('HIGH_RISK_PARTNER_WARNING_SHOWN');
        setBannerShown(true);
      }
    }
    
    loadSafetyHint();
  }, [counterpartUserId]);
  
  const handleBlock = () => {
    // Call existing block function from PACK 46
  };
  
  const handleReport = () => {
    // Navigate to report flow from PACK 54
  };
  
  const handleSupport = async () => {
    await markSafetyUxEvent('SUPPORT_SAFETY_CLICK');
    // Navigate to Support Center (PACK 68)
  };
  
  return (
    <View>
      <SafetyBanner 
        level={safetyHint.level}
        onBlock={handleBlock}
        onReport={handleReport}
        onSupport={handleSupport}
      />
      {/* Rest of chat UI */}
    </View>
  );
}
```

### Reservation Flow Integration

Show first meeting tip before first reservation:

```typescript
import { FirstMeetingTip } from './components/safety/SafetyModals';
import { getSafetyUxState, markSafetyUxEvent } from './services/safetyService';
import { useState, useEffect } from 'react';

function ReservationConfirmScreen() {
  const [showTip, setShowTip] = useState(false);
  const { user } = useAuth();
  
  useEffect(() => {
    async function checkFirstMeeting() {
      const state = await getSafetyUxState(user?.uid);
      if (!state.seenFirstMeetingTip) {
        setShowTip(true);
      }
    }
    checkFirstMeeting();
  }, [user]);
  
  const handleTipConfirm = async () => {
    await markSafetyUxEvent('FIRST_MEETING_TIP_SHOWN');
    setShowTip(false);
    // Proceed with reservation
  };
  
  return (
    <View>
      <FirstMeetingTip 
        visible={showTip}
        onClose={() => setShowTip(false)}
        onConfirm={handleTipConfirm}
      />
      {/* Reservation form */}
    </View>
  );
}
```

### Contact Sharing Integration

Warn before sharing contact details:

```typescript
import { OffPlatformWarning } from './components/safety/SafetyModals';
import { getSafetyUxState, markSafetyUxEvent } from './services/safetyService';

function ContactShareButton() {
  const [showWarning, setShowWarning] = useState(false);
  const { user } = useAuth();
  
  const handleShareAttempt = async () => {
    const state = await getSafetyUxState(user?.uid);
    if (!state.seenOffPlatformWarning) {
      setShowWarning(true);
    } else {
      shareContact();
    }
  };
  
  const handleWarningClose = async () => {
    await markSafetyUxEvent('OFF_PLATFORM_WARNING_SHOWN');
    setShowWarning(false);
    shareContact();
  };
  
  return (
    <>
      <Button onPress={handleShareAttempt}>Share Contact</Button>
      <OffPlatformWarning 
        visible={showWarning}
        onClose={handleWarningClose}
      />
    </>
  );
}
```

### Settings Menu Integration

Add "Safety & Help" link in settings:

```typescript
// In your settings screen
<TouchableOpacity 
  onPress={() => navigation.navigate('SafetyInfo')}
>
  <Text>Safety & Help</Text>
</TouchableOpacity>
```

---

## 📊 Analytics Events

The system automatically tracks these events:

- `ONBOARDING_COMPLETED`: User finished safety onboarding
- `FIRST_MEETING_TIP_SHOWN`: First meeting tip displayed
- `OFF_PLATFORM_WARNING_SHOWN`: Contact sharing warning shown
- `PAYMENT_SAFETY_TIP_SHOWN`: Payment safety tip displayed
- `HIGH_RISK_PARTNER_WARNING_SHOWN`: High-risk chat banner shown
- `SUPPORT_SAFETY_CLICK`: User clicked support from safety context

These can be queried from `safety_profiles` collection for analytics.

---

## 🔒 Privacy & Security

- **No internal scores exposed**: Only discrete levels (NONE/LOW/MEDIUM/HIGH)
- **Generic reason codes**: No specific risk scores shown to users
- **Read-only aggregation**: Safety signals don't modify other systems
- **Local resilience**: Onboarding state cached locally
- **No pricing changes**: Purely educational, no economic impact

---

## ✅ Testing Checklist

### Backend
- [ ] Safety hint returns correct levels for different risk profiles
- [ ] UX state tracks onboarding completion
- [ ] Events are recorded with correct timestamps
- [ ] Counters increment properly (warnings shown, support clicks)

### Mobile
- [ ] Onboarding shows on first launch for new users
- [ ] Onboarding can be completed and doesn't show again
- [ ] First meeting tip shows before first reservation
- [ ] Off-platform warning shows before contact sharing
- [ ] Chat banners display with correct colors and messages
- [ ] Action buttons in banners work correctly
- [ ] Settings link navigates to Safety Info screen
- [ ] All translations display correctly (EN/PL)

### Integration
- [ ] Works with existing Trust Engine (PACK 46)
- [ ] Integrates with Moderation (PACK 54)
- [ ] Links to Support Center (PACK 68)
- [ ] Connects to Privacy Center (PACK 64)
- [ ] Compatible with AML Hub (PACK 63)

---

## 🚀 Deployment Notes

### Firebase Functions
Deploy with:
```bash
cd functions
npm run build
firebase deploy --only functions:safety_getUxState,functions:safety_markUxEvent,functions:safety_getHint
```

### Mobile App
1. Ensure i18n translations are loaded
2. Add navigation routes for new screens
3. Integrate safety checks into existing flows
4. Test with different user risk profiles

### Firestore Indexes
Required index for moderation cases query:
```
Collection: moderation_cases
Fields: userId (ASC), status (ASC), createdAt (DESC)
```

---

## 📝 Future Enhancements

1. **Video safety tips**: Add video tutorials in onboarding
2. **Dynamic content**: Pull safety tips from remote config
3. **Localization expansion**: Add more languages
4. **Safety score dashboard**: Show users their safety engagement
5. **Emergency contacts**: Integration with emergency services
6. **Location sharing**: Real-time location sharing for meetings
7. **Check-in reminders**: Automatic check-in prompts after meetings

---

## 🔗 Related Packs

- **PACK 46**: Trust Engine & Blocklist Safety Mesh (risk signals)
- **PACK 54**: Moderation & Enforcement Layer (violation history)
- **PACK 55**: Global Compliance & Safety Core (age verification, policies)
- **PACK 57**: Disputes & Evidence Center (dispute handling)
- **PACK 58**: Reservations & Escrow (meeting bookings)
- **PACK 59**: User Control Center (privacy settings)
- **PACK 60**: Security & 2FA (account protection)
- **PACK 63**: AML Hub (financial risk)
- **PACK 64**: GDPR Center (data privacy)
- **PACK 68**: Support Center (help tickets)
- **PACK 71**: Fraud Analytics (fraud detection)
- **PACK 72**: AI Moderation V2 (content moderation)

---

## 📞 Support

For implementation questions or issues:
1. Check this documentation first
2. Review code comments in source files
3. Test with example integration code above
4. Ensure all dependencies are properly installed

---

**PACK 73 Implementation Complete** ✅

All components delivered:
- ✅ Backend safety signal aggregation
- ✅ Backend safety UX API
- ✅ Mobile safety onboarding flow
- ✅ Mobile safety info screen
- ✅ Mobile safety modals and banners
- ✅ Safety service API wrapper
- ✅ I18n translations (EN/PL)
- ✅ Integration documentation
- ✅ Firebase Functions exports

No pricing or economic logic was changed. All features are additive and backward compatible.