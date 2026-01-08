# PACK 191 — Live Arena Quick Start Guide

Get started with Avalo Live Video Arena in 5 minutes.

## Prerequisites

- ✅ Firebase project configured
- ✅ Avalo mobile app set up
- ✅ User authentication working
- ✅ 18+ age verification implemented

## Step 1: Deploy Backend (5 minutes)

### Deploy Firestore Rules

```bash
# Deploy security rules
firebase deploy --only firestore:rules

# Deploy indexes
firebase deploy --only firestore:indexes
```

### Deploy Cloud Functions

```bash
cd functions
npm install
npm run build
firebase deploy --only functions:createLiveStream,startLiveStream,endLiveStream,joinLiveStream,sendStreamReaction,createStreamPoll,voteOnPoll,createStreamChallenge,submitToChallenge,reportStream,inviteToCollabStream,respondToCollabInvite,leaveCollabStream,getCollabParticipants,monitorStreamHealth,createStreamReplay,updateViewerActivity,monitorStreamChat,detectHarassmentCampaigns,detectStalking,monitorCreatorBurnout,detectViewerExploitation,cleanupModerationEvents
```

## Step 2: Test Basic Stream (2 minutes)

### Create a Test Stream

```typescript
import { liveArenaSDK } from './lib/live-arena-sdk';

// Create stream
const result = await liveArenaSDK.createStream({
  title: "Test Fitness Stream",
  description: "Testing the live arena",
  category: "fitness"
});

console.log('Stream created:', result.streamId);

// Start streaming
await liveArenaSDK.startStream(result.streamId);

// End stream
await liveArenaSDK.endStream(result.streamId);
```

## Step 3: Test Safety Features (2 minutes)

### Test Toxic Content Detection

```typescript
// Join a stream
await liveArenaSDK.joinStream(streamId);

// Try sending inappropriate message (will be blocked)
try {
  await liveArenaSDK.sendChatMessage(streamId, "inappropriate content");
  // Message should be auto-deleted
} catch (error) {
  console.log('Message blocked:', error);
}
```

## Step 4: Test Monetization (2 minutes)

### Send a Reaction

```typescript
// Send fire reaction (10 tokens)
await liveArenaSDK.sendReaction(
  streamId,
  'fire',
  'Great content! 🔥'
);
```

### Create a Poll

```typescript
// Create poll
const poll = await liveArenaSDK.createPoll({
  streamId,
  question: "What should we do next?",
  options: ["Yoga", "Boxing", "Dance"],
  requireTokens: false
});

// Vote
await liveArenaSDK.voteOnPoll(poll.pollId, 'opt_0');
```

## Step 5: Test Collaboration (2 minutes)

### Invite Co-Host

```typescript
// Host invites another creator
const invite = await liveArenaSDK.inviteToCollabStream(
  streamId,
  inviteeUserId,
  "Want to co-host this fitness stream?"
);

// Invitee accepts
await liveArenaSDK.respondToCollabInvite(
  invite.inviteId,
  true // accept
);
```

## Common Scenarios

### Scenario 1: Fitness Workout Stream

```typescript
// 1. Create stream
const { streamId } = await liveArenaSDK.createStream({
  title: "Morning HIIT Workout",
  category: "fitness",
  description: "30-minute high intensity training"
});

// 2. Start stream
await liveArenaSDK.startStream(streamId);

// 3. During stream, viewers send reactions
// Viewer action:
await liveArenaSDK.sendReaction(streamId, 'fire');

// 4. Create challenge
await liveArenaSDK.createChallenge({
  streamId,
  title: "Plank Challenge",
  description: "Hold plank for 60 seconds",
  challengeType: "fitness",
  entryTokens: 50,
  prizeTokens: 500,
  durationMinutes: 5
});

// 5. End stream
await liveArenaSDK.endStream(streamId);
```

### Scenario 2: Gaming Tournament

```typescript
// 1. Create collab stream
const { streamId } = await liveArenaSDK.createStream({
  title: "Fortnite Tournament Finals",
  category: "gaming",
  maxParticipants: 4 // Up to 4 players
});

// 2. Invite team members
const invites = await Promise.all([
  liveArenaSDK.inviteToCollabStream(streamId, player2Id),
  liveArenaSDK.inviteToCollabStream(streamId, player3Id),
  liveArenaSDK.inviteToCollabStream(streamId, player4Id)
]);

// 3. Start when all accepted
await liveArenaSDK.startStream(streamId);

// 4. Run polls during tournament
await liveArenaSDK.createPoll({
  streamId,
  question: "Who will win this match?",
  options: ["Team A", "Team B"],
  requireTokens: true,
  tokenCost: 10
});
```

### Scenario 3: Educational Webinar

```typescript
// 1. Schedule stream for later
const { streamId } = await liveArenaSDK.createStream({
  title: "Introduction to TypeScript",
  category: "education",
  scheduledFor: new Date(Date.now() + 2 * 60 * 60 * 1000) // 2 hours from now
});

// 2. When time arrives, start
await liveArenaSDK.startStream(streamId);

// 3. Audience asks questions via challenge
await liveArenaSDK.createChallenge({
  streamId,
  title: "Q&A Challenge",
  description: "Best question wins a consultation",
  challengeType: "knowledge",
  entryTokens: 0, // Free to enter
  prizeTokens: 1000
});
```

## Troubleshooting

### "User must be authenticated"
**Solution:** Ensure Firebase auth is initialized and user is logged in.

```typescript
import { getAuth } from 'firebase/auth';
const auth = getAuth();
console.log('Current user:', auth.currentUser);
```

### "Must verify 18+ to create livestreams"
**Solution:** User needs age verification completed.

```typescript
// Check verification status
const userDoc = await db.collection('users').doc(userId).get();
console.log('Age verified:', userDoc.data().verification?.age18);
```

### "Insufficient balance"
**Solution:** User needs tokens to send reactions/vote.

```typescript
// Check wallet balance
const userDoc = await db.collection('users').doc(userId).get();
console.log('Balance:', userDoc.data().wallet?.balance);
```

### Stream won't start
**Possible causes:**
- Stream status is not 'scheduled'
- User doesn't own the stream
- In burnout cooldown period

```typescript
// Check stream status
const streamDoc = await db.collection('live_streams').doc(streamId).get();
console.log('Status:', streamDoc.data().status);
console.log('Host:', streamDoc.data().hostId);
```

## Safety Testing Checklist

✅ **Test Toxic Content**
- Send message with profanity → Should be blocked
- Send harassment → User should be timed out
- Request personal info → User should be timed out

✅ **Test Burnout Protection**
- Stream for 3+ hours → Should get break reminder
- Stream for 4+ hours → Should auto-end
- Try starting new stream immediately → Should be in cooldown

✅ **Test Viewer Protection**
- Send excessive reactions → Should get spending warning
- Accumulate >5000 tokens in 1 hour → Should get concern notification

## Monitoring

### Check Active Streams

```typescript
const liveStreams = await db.collection('live_streams')
  .where('status', '==', 'live')
  .get();

console.log(`${liveStreams.size} streams currently live`);
```

### Check Moderation Events

```typescript
const events = await db.collection('stream_moderation_events')
  .where('severity', '==', 'critical')
  .orderBy('createdAt', 'desc')
  .limit(10)
  .get();

console.log('Recent critical events:', events.docs.map(d => d.data()));
```

### Check Creator Burnout

```typescript
const burnout = await db.collection('creator_burnout')
  .where('breakReminders', '>', 0)
  .get();

console.log(`${burnout.size} creators received break reminders`);
```

## Next Steps

1. **Customize UI** - Modify [`app/arena/index.tsx`](app-mobile/app/arena/index.tsx) for your design
2. **Add Analytics** - Track stream metrics and user engagement
3. **Enhance Safety** - Add custom moderation patterns
4. **Scale Testing** - Test with multiple concurrent streams
5. **Production Deploy** - Deploy to production Firebase project

## Resources

- 📖 [Full Implementation Guide](PACK_191_LIVE_ARENA_IMPLEMENTATION.md)
- 🔒 [Security Rules](firestore-pack191-live-arena.rules)
- ⚙️ [Cloud Functions](functions/src/pack191-live-arena.ts)
- 📱 [Client SDK](app-mobile/lib/live-arena-sdk.ts)

## Support

Need help? Check the full documentation or review the implementation files.

---

**Ready to go live!** 🎥✨

Your Live Arena is now configured and ready for production use.