# FTUX Missions Integration Guide - Phase 32-4

This guide shows how to trigger FTUX mission events throughout the app.

## Already Integrated

✅ **Home Tab (`app/(tabs)/home.tsx`)**
- `MATCH_CREATED` - Triggers when a match is created
- `FIRST_MESSAGE_SENT` - Triggers when sending icebreaker message

## Required Integrations

### 1. Profile Setup/Edit Screen

Add to profile save/update functions:

```typescript
import { useFtuxMissions } from '../../hooks/useFtuxMissions';

// In your profile edit component
const ftuxMissions = useFtuxMissions(currentUser);

// After successfully saving profile with complete basic info
await saveProfile(uid, profileData, photoURLs);
ftuxMissions.registerEvent({ type: 'PROFILE_COMPLETED' });
```

### 2. Photo Upload Screen

Add to photo upload success handler:

```typescript
import { useFtuxMissions } from '../../hooks/useFtuxMissions';

// In your photo upload component
const ftuxMissions = useFtuxMissions(currentUser);

// After successfully uploading photos
const photoURLs = await uploadProfilePhotos(uid, photoUris);
ftuxMissions.registerEvent({ 
  type: 'PHOTOS_UPLOADED', 
  totalPhotos: photoURLs.length 
});
```

### 3. Chat Screen

Add to message send function:

```typescript
import { useFtuxMissions } from '../../hooks/useFtuxMissions';

// In your chat component
const ftuxMissions = useFtuxMissions(currentUser);

// After successfully sending first message
const success = await sendMessage(chatId, message);
if (success) {
  ftuxMissions.registerEvent({ type: 'FIRST_MESSAGE_SENT' });
}
```

### 4. AI Bot Chat Screen

Add when user starts conversation with AI:

```typescript
import { useFtuxMissions } from '../../hooks/useFtuxMissions';

// In your AI chat component
const ftuxMissions = useFtuxMissions(currentUser);

// When user sends first message to AI bot
ftuxMissions.registerEvent({ type: 'AI_BOT_USED' });
```

### 5. LIVE Tab

Add to LIVE tab mount or first visit:

```typescript
import { useFtuxMissions } from '../../hooks/useFtuxMissions';

// In your LIVE tab component
const ftuxMissions = useFtuxMissions(currentUser);

// On first visit (use AsyncStorage to track)
useEffect(() => {
  const trackLiveVisit = async () => {
    const visited = await AsyncStorage.getItem('ftux_live_visited');
    if (!visited) {
      await AsyncStorage.setItem('ftux_live_visited', 'true');
      ftuxMissions.registerEvent({ type: 'LIVE_TAB_VISITED' });
    }
  };
  trackLiveVisit();
}, []);
```

### 6. Creator Follow

Add to follow button handler:

```typescript
import { useFtuxMissions } from '../../hooks/useFtuxMissions';

// In your creator profile or follow component
const ftuxMissions = useFtuxMissions(currentUser);

// After successfully following a creator
await followCreator(creatorId);
ftuxMissions.registerEvent({ type: 'CREATOR_FOLLOWED' });
```

### 7. Safe Meet Setup

Add to Safe Meet configuration screen:

```typescript
import { useFtuxMissions } from '../../hooks/useFtuxMissions';

// In your Safe Meet setup component
const ftuxMissions = useFtuxMissions(currentUser);

// After successfully setting trusted contact
await saveSafeMeetContact(contactData);
ftuxMissions.registerEvent({ type: 'SAFE_MEET_CONTACT_SET' });
```

## Mission IDs Reference

```typescript
type FtuxMissionId =
  | 'COMPLETE_PROFILE'      // Profile has bio, interests filled
  | 'UPLOAD_3_PHOTOS'       // User uploaded 3+ photos
  | 'MAKE_FIRST_MATCH'      // User got first match
  | 'SEND_FIRST_MESSAGE'    // User sent first message in any chat
  | 'TRY_AI_BOT'           // User started AI bot conversation
  | 'VISIT_LIVE_TAB'       // User visited LIVE tab at least once
  | 'FOLLOW_CREATOR'       // User followed any creator/profile
  | 'SET_SAFE_MEET_CONTACT' // User set Safe-Meet trusted contact
```

## Event Types Reference

```typescript
type FtuxMissionEvent =
  | { type: 'PROFILE_COMPLETED' }
  | { type: 'PHOTOS_UPLOADED'; totalPhotos: number }
  | { type: 'MATCH_CREATED' }
  | { type: 'FIRST_MESSAGE_SENT' }
  | { type: 'AI_BOT_USED' }
  | { type: 'LIVE_TAB_VISITED' }
  | { type: 'CREATOR_FOLLOWED' }
  | { type: 'SAFE_MEET_CONTACT_SET' }
```

## Testing

### Reset FTUX Missions (Development Only)

```typescript
import { resetFtuxMissions } from '../utils/ftuxMissionEngine';

// In a dev screen or console
await resetFtuxMissions();
```

### Check Current State

```typescript
import { loadFtuxState } from '../utils/ftuxMissionEngine';

const state = await loadFtuxState();
console.log('FTUX State:', state);
```

## Notes

- All mission tracking is **local only** (AsyncStorage)
- No backend calls are made
- Missions expire after 7 days from account creation
- Missions disappear when all are completed
- Gender-adaptive i18n keys are automatically selected based on user gender
- The banner only shows if missions exist, aren't expired, and at least one is incomplete

## Localization

All mission strings are in:
- `app-mobile/i18n/strings.en.json` (English)
- `app-mobile/i18n/strings.pl.json` (Polish)

Under the `ftuxMissions` key with gender-specific variants (`_male`, `_female`, `_other`).