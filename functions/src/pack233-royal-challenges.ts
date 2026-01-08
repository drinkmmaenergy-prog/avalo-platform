/**
 * PACK 233: Royal Couple Challenges
 * Backend Cloud Functions for competitive romantic duo missions
 * Drives chemistry, emotional connection, and paid interactions
 */

import { db, serverTimestamp, increment, arrayUnion } from './init';
import * as functions from 'firebase-functions';
import { isUserInSleepMode } from './pack228-sleep-mode';

// ============================================================================
// INTERFACES
// ============================================================================

interface RoyalChallenge {
  challengeId: string;
  coupleId: string;
  participantIds: [string, string];
  challengeType: ChallengeType;
  title: string;
  description: string;
  steps: ChallengeStep[];
  isActive: boolean;
  completed: boolean;
  assignedAt: FirebaseFirestore.Timestamp;
  expiresAt: FirebaseFirestore.Timestamp;
  completedAt?: FirebaseFirestore.Timestamp;
  progress: {
    userA: number;
    userB: number;
  };
  metadata: {
    difficulty: 'easy' | 'medium' | 'hard';
    estimatedTimeMinutes: number;
    paidInteractionHint?: string;
  };
}

interface ChallengeStep {
  stepId: string;
  description: string;
  requiredAction: 'message' | 'call' | 'video' | 'meeting' | 'shared_activity';
  completedBy: string[];
}

type ChallengeType = 
  | 'conversation' 
  | 'storytelling' 
  | 'flattery' 
  | 'affection' 
  | 'planning' 
  | 'actions' 
  | 'shared_activity';

interface EligibilityCheckResult {
  isEligible: boolean;
  reasons: string[];
  requirementsMet: {
    chemistryLockIn: boolean;
    callsCompleted: boolean;
    realMeeting: boolean;
    sharedMemories: boolean;
    mutualInterest: boolean;
    safetyCheck: boolean;
    notInSleepMode: boolean;
    notInBreakupRecovery: boolean;
    romanticMomentum: boolean;
  };
}

interface ChallengeReward {
  rewardId: string;
  coupleId: string;
  participantIds: [string, string];
  rewardType: 'theme' | 'sticker' | 'animation' | 'memory_highlight' | 'momentum_boost' | 'badge';
  rewardDetails: any;
  earnedAt: FirebaseFirestore.Timestamp;
  expiresAt?: FirebaseFirestore.Timestamp;
  claimed: boolean;
  claimedAt?: FirebaseFirestore.Timestamp;
}

// ============================================================================
// CHALLENGE DEFINITIONS
// ============================================================================

const CHALLENGE_TEMPLATES: Record<ChallengeType, any[]> = {
  conversation: [
    {
      title: "Share Your Dreams",
      description: "Share three personal dreams for the future with each other.",
      difficulty: "medium",
      estimatedTimeMinutes: 20,
      paidInteractionHint: "Long meaningful conversation (paid chat)",
      steps: [
        { description: "Share your first dream", requiredAction: "message" },
        { description: "Discuss each other's dreams deeply", requiredAction: "message" },
        { description: "Find common ground in your dreams", requiredAction: "message" }
      ]
    },
    {
      title: "Future Conversations",
      description: "Discuss where you both see yourselves in 5 years.",
      difficulty: "medium",
      estimatedTimeMinutes: 25,
      paidInteractionHint: "Extended voice call recommended",
      steps: [
        { description: "Share your 5-year vision", requiredAction: "message" },
        { description: "Have a deep voice call about it", requiredAction: "call" }
      ]
    },
    {
      title: "Values Check-In",
      description: "Share what matters most to you in life.",
      difficulty: "easy",
      estimatedTimeMinutes: 15,
      steps: [
        { description: "List your top 3 values", requiredAction: "message" },
        { description: "Discuss why these matter to you", requiredAction: "message" }
      ]
    }
  ],
  
  storytelling: [
    {
      title: "Embarrassing Moments",
      description: "Tell each other your most embarrassing funny moment.",
      difficulty: "easy",
      estimatedTimeMinutes: 15,
      paidInteractionHint: "Video call to see reactions",
      steps: [
        { description: "Share your story in text first", requiredAction: "message" },
        { description: "Retell it on video call for reactions", requiredAction: "video" }
      ]
    },
    {
      title: "Childhood Memories",
      description: "Share a favorite childhood memory and why it's special.",
      difficulty: "easy",
      estimatedTimeMinutes: 20,
      steps: [
        { description: "Share your memory", requiredAction: "message" },
        { description: "Discuss what made it special", requiredAction: "message" }
      ]
    },
    {
      title: "First Impressions",
      description: "Tell each other what your first impression was when you matched.",
      difficulty: "easy",
      estimatedTimeMinutes: 15,
      paidInteractionHint: "Great for a voice call",
      steps: [
        { description: "Share your first impression", requiredAction: "message" },
        { description: "Discuss on a call for authenticity", requiredAction: "call" }
      ]
    }
  ],
  
  flattery: [
    {
      title: "5 Things I Find Attractive",
      description: "Write 5 things you find attractive about the other person.",
      difficulty: "easy",
      estimatedTimeMinutes: 10,
      paidInteractionHint: "Follow up with video call to see reaction",
      steps: [
        { description: "Write your 5 attractions", requiredAction: "message" },
        { description: "Video call to see their reaction", requiredAction: "video" }
      ]
    },
    {
      title: "Compliment Exchange",
      description: "Take turns giving each other genuine compliments.",
      difficulty: "easy",
      estimatedTimeMinutes: 15,
      steps: [
        { description: "Give a thoughtful compliment", requiredAction: "message" },
        { description: "Receive and respond to theirs", requiredAction: "message" },
        { description: "Do another round", requiredAction: "message" }
      ]
    },
    {
      title: "What I Admire About You",
      description: "Share what you admire most about each other's personality.",
      difficulty: "medium",
      estimatedTimeMinutes: 20,
      paidInteractionHint: "Deep conversation - paid chat",
      steps: [
        { description: "Share what you admire", requiredAction: "message" },
        { description: "Discuss why these traits matter", requiredAction: "message" }
      ]
    }
  ],
  
  affection: [
    {
      title: "Voice Compliment",
      description: "Send a short voice message complimenting the other person.",
      difficulty: "easy",
      estimatedTimeMinutes: 5,
      paidInteractionHint: "Natural lead-in to a call",
      steps: [
        { description: "Record a voice compliment", requiredAction: "message" },
        { description: "Have a call to talk about it", requiredAction: "call" }
      ]
    },
    {
      title: "Morning Greeting",
      description: "Send each other a sweet good morning message.",
      difficulty: "easy",
      estimatedTimeMinutes: 5,
      steps: [
        { description: "Send a thoughtful morning greeting", requiredAction: "message" }
      ]
    },
    {
      title: "Appreciation Message",
      description: "Tell each other one thing you appreciate about your connection.",
      difficulty: "easy",
      estimatedTimeMinutes: 10,
      steps: [
        { description: "Share what you appreciate", requiredAction: "message" },
        { description: "Respond meaningfully", requiredAction: "message" }
      ]
    }
  ],
  
  planning: [
    {
      title: "Ideal Date Planning",
      description: "Plan your ideal next date together (place & vibe).",
      difficulty: "medium",
      estimatedTimeMinutes: 30,
      paidInteractionHint: "Extended planning chat + meeting booking",
      steps: [
        { description: "Discuss what type of date you want", requiredAction: "message" },
        { description: "Choose a specific place and time", requiredAction: "message" },
        { description: "Book the meeting on calendar", requiredAction: "meeting" }
      ]
    },
    {
      title: "Weekend Adventure",
      description: "Plan a fun weekend activity you'd both enjoy.",
      difficulty: "medium",
      estimatedTimeMinutes: 25,
      paidInteractionHint: "Meeting booking encouraged",
      steps: [
        { description: "Brainstorm weekend ideas", requiredAction: "message" },
        { description: "Pick one and plan details", requiredAction: "message" },
        { description: "Set a date for it", requiredAction: "meeting" }
      ]
    },
    {
      title: "Future Trip Discussion",
      description: "Discuss where you'd love to travel together someday.",
      difficulty: "easy",
      estimatedTimeMinutes: 20,
      steps: [
        { description: "Share your dream destinations", requiredAction: "message" },
        { description: "Discuss what you'd do there", requiredAction: "message" }
      ]
    }
  ],
  
  actions: [
    {
      title: "Song Exchange",
      description: "Pick a song for each other that reminds you of them.",
      difficulty: "easy",
      estimatedTimeMinutes: 15,
      steps: [
        { description: "Choose and share your song", requiredAction: "message" },
        { description: "Explain why you picked it", requiredAction: "message" }
      ]
    },
    {
      title: "Photo Share",
      description: "Share a photo that represents something important to you.",
      difficulty: "easy",
      estimatedTimeMinutes: 10,
      steps: [
        { description: "Share your photo", requiredAction: "message" },
        { description: "Explain its significance", requiredAction: "message" }
      ]
    },
    {
      title: "Recommendation Exchange",
      description: "Recommend a book, movie, or show to each other.",
      difficulty: "easy",
      estimatedTimeMinutes: 15,
      steps: [
        { description: "Share your recommendation", requiredAction: "message" },
        { description: "Discuss why they'd enjoy it", requiredAction: "message" }
      ]
    }
  ],
  
  shared_activity: [
    {
      title: "Movie Night Discussion",
      description: "Watch the same movie tonight & discuss afterwards.",
      difficulty: "medium",
      estimatedTimeMinutes: 150,
      paidInteractionHint: "Post-movie call discussion",
      steps: [
        { description: "Pick a movie you'll both watch", requiredAction: "message" },
        { description: "Watch it at the same time", requiredAction: "shared_activity" },
        { description: "Have a call to discuss it", requiredAction: "call" }
      ]
    },
    {
      title: "Question Game",
      description: "Play 20 questions to learn more about each other.",
      difficulty: "easy",
      estimatedTimeMinutes: 30,
      paidInteractionHint: "Extended paid chat session",
      steps: [
        { description: "Start asking questions back and forth", requiredAction: "message" },
        { description: "Keep going for at least 10 questions each", requiredAction: "message" }
      ]
    },
    {
      title: "Cooking Challenge",
      description: "Cook the same recipe separately and share photos.",
      difficulty: "hard",
      estimatedTimeMinutes: 90,
      paidInteractionHint: "Video call while cooking together",
      steps: [
        { description: "Choose a recipe together", requiredAction: "message" },
        { description: "Cook it and share progress photos", requiredAction: "message" },
        { description: "Video call to show final results", requiredAction: "video" }
      ]
    }
  ]
};

// ============================================================================
// ELIGIBILITY CHECKER
// ============================================================================

/**
 * Check if a couple is eligible for Royal Challenges
 */
export const checkChallengeEligibility = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { otherUserId } = data;
  const userId = context.auth.uid;

  try {
    const result = await performEligibilityCheck(userId, otherUserId);
    
    // Cache the result
    const coupleId = generateCoupleId(userId, otherUserId);
    await db.collection('challenge_eligibility_cache').doc(coupleId).set({
      coupleId,
      participantIds: [userId, otherUserId],
      isEligible: result.isEligible,
      requirementsMet: result.requirementsMet,
      lastCheckedAt: serverTimestamp(),
    });

    return result;
  } catch (error) {
    console.error('Error checking challenge eligibility:', error);
    throw new functions.https.HttpsError('internal', 'Failed to check eligibility');
  }
});

/**
 * Perform the actual eligibility check
 */
async function performEligibilityCheck(
  userAId: string,
  userBId: string
): Promise<EligibilityCheckResult> {
  const reasons: string[] = [];
  const requirementsMet = {
    chemistryLockIn: false,
    callsCompleted: false,
    realMeeting: false,
    sharedMemories: false,
    mutualInterest: false,
    safetyCheck: false,
    notInSleepMode: false,
    notInBreakupRecovery: false,
    romanticMomentum: false,
  };

  // 1. Check Chemistry Lock-In (active 2+ times)
  const chemistrySnap = await db.collection('chemistry_lock_events')
    .where('participantIds', 'array-contains', userAId)
    .get();
  
  const chemistryCount = chemistrySnap.docs.filter(doc => {
    const data = doc.data();
    return data.participantIds.includes(userBId) && data.status === 'active';
  }).length;
  
  requirementsMet.chemistryLockIn = chemistryCount >= 2;
  if (!requirementsMet.chemistryLockIn) {
    reasons.push('Need 2+ Chemistry Lock-In events');
  }

  // 2. Check calls (2+ calls over 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const callsSnap = await db.collection('calls')
    .where('participantIds', 'array-contains', userAId)
    .where('startedAt', '>', sevenDaysAgo)
    .get();
  
  const callCount = callsSnap.docs.filter(doc => {
    const data = doc.data();
    return data.participantIds.includes(userBId) && data.status === 'completed';
  }).length;
  
  requirementsMet.callsCompleted = callCount >= 2;
  if (!requirementsMet.callsCompleted) {
    reasons.push('Need 2+ calls in the last 7 days');
  }

  // 3. Check real meeting (1+ meeting)
  const meetingsSnap = await db.collection('meetings')
    .where('participantIds', 'array-contains', userAId)
    .get();
  
  const meetingCount = meetingsSnap.docs.filter(doc => {
    const data = doc.data();
    return data.participantIds.includes(userBId) && data.status === 'completed';
  }).length;
  
  requirementsMet.realMeeting = meetingCount >= 1;
  if (!requirementsMet.realMeeting) {
    reasons.push('Need at least 1 real meeting');
  }

  // 4. Check Shared Memory Log (4+ moments)
  const memoriesSnap = await db.collection('sharedMemories')
    .where('participantIds', 'array-contains', userAId)
    .get();
  
  let memoryCount = 0;
  for (const memDoc of memoriesSnap.docs) {
    const data = memDoc.data();
    if (data.participantIds.includes(userBId)) {
      const momentsSnap = await memDoc.ref.collection('moments').get();
      memoryCount = momentsSnap.size;
      break;
    }
  }
  
  requirementsMet.sharedMemories = memoryCount >= 4;
  if (!requirementsMet.sharedMemories) {
    reasons.push('Need 4+ moments in Shared Memory Log');
  }

  // 5. Check mutual "would meet again" status
  const userAPref = await db.collection('users').doc(userAId)
    .collection('meeting_preferences').doc(userBId).get();
  const userBPref = await db.collection('users').doc(userBId)
    .collection('meeting_preferences').doc(userAId).get();
  
  requirementsMet.mutualInterest = 
    userAPref.exists && userAPref.data()?.wouldMeetAgain === true &&
    userBPref.exists && userBPref.data()?.wouldMeetAgain === true;
  
  if (!requirementsMet.mutualInterest) {
    reasons.push('Both users must mark "Would meet again"');
  }

  // 6. Safety checks
  const safetyA = await checkSafety(userAId, userBId);
  const safetyB = await checkSafety(userBId, userAId);
  requirementsMet.safetyCheck = safetyA && safetyB;
  if (!requirementsMet.safetyCheck) {
    reasons.push('Safety concerns detected');
  }

  // 7. Check Sleep Mode status
  const sleepModeA = await isUserInSleepMode(userAId);
  const sleepModeB = await isUserInSleepMode(userBId);
  requirementsMet.notInSleepMode = !sleepModeA && !sleepModeB;
  if (!requirementsMet.notInSleepMode) {
    reasons.push('One or both users in Sleep Mode');
  }

  // 8. Check Breakup Recovery status
  const recoveryASnap = await db.collection('breakup_recovery_states').doc(userAId).get();
  const recoveryBSnap = await db.collection('breakup_recovery_states').doc(userBId).get();
  const inRecoveryA = recoveryASnap.exists && recoveryASnap.data()?.needsRecovery === true;
  const inRecoveryB = recoveryBSnap.exists && recoveryBSnap.data()?.needsRecovery === true;
  requirementsMet.notInBreakupRecovery = !inRecoveryA && !inRecoveryB;
  if (!requirementsMet.notInBreakupRecovery) {
    reasons.push('One or both users in Breakup Recovery');
  }

  // 9. Check Romantic Momentum (must be above 20)
  const momentumASnap = await db.collection('romantic_momentum_states').doc(userAId).get();
  const momentumBSnap = await db.collection('romantic_momentum_states').doc(userBId).get();
  const momentumA = momentumASnap.data()?.score || 0;
  const momentumB = momentumBSnap.data()?.score || 0;
  requirementsMet.romanticMomentum = momentumA >= 20 && momentumB >= 20;
  if (!requirementsMet.romanticMomentum) {
    reasons.push('Romantic Momentum must be above 20');
  }

  const isEligible = Object.values(requirementsMet).every(met => met === true);

  return { isEligible, reasons, requirementsMet };
}

/**
 * Check safety for a user pair
 */
async function checkSafety(userId: string, otherUserId: string): Promise<boolean> {
  // Check for open safety reports
  const reportsSnap = await db.collection('safety_reports')
    .where('reporterId', '==', userId)
    .where('reportedUserId', '==', otherUserId)
    .where('status', '==', 'open')
    .limit(1)
    .get();
  
  if (!reportsSnap.empty) return false;

  // Check for panic button events
  const panicSnap = await db.collection('panic_button_events')
    .where('userId', '==', userId)
    .where('targetUserId', '==', otherUserId)
    .limit(1)
    .get();
  
  if (!panicSnap.empty) return false;

  // Check toxic flags in emotional sentiment
  const sentimentSnap = await db.collection('emotional_sentiment_analysis')
    .where('userId', '==', userId)
    .where('targetUserId', '==', otherUserId)
    .where('toxicityScore', '>', 0.7)
    .limit(1)
    .get();
  
  return sentimentSnap.empty;
}

// ============================================================================
// WEEKLY ASSIGNMENT ENGINE
// ============================================================================

/**
 * Assign weekly challenges to eligible couples (scheduled function)
 */
export const assignWeeklyChallenges = functions.pubsub
  .schedule('every monday 09:00')
  .timeZone('UTC')
  .onRun(async (context) => {
    try {
      console.log('Starting weekly challenge assignment...');
      
      // Get all eligible couples from cache
      const eligibleCouplesSnap = await db.collection('challenge_eligibility_cache')
        .where('isEligible', '==', true)
        .get();

      let assignedCount = 0;

      for (const coupleDoc of eligibleCouplesSnap.docs) {
        const coupleData = coupleDoc.data();
        const coupleId = coupleData.coupleId;
        const participantIds = coupleData.participantIds;

        // Check if user has challenges disabled
        const userASettingsSnap = await db.collection('users').doc(participantIds[0])
          .collection('settings').doc('royal_challenges').get();
        const userBSettingsSnap = await db.collection('users').doc(participantIds[1])
          .collection('settings').doc('royal_challenges').get();
        
        const userAEnabled = !userASettingsSnap.exists || userASettingsSnap.data()?.enabled !== false;
        const userBEnabled = !userBSettingsSnap.exists || userBSettingsSnap.data()?.enabled !== false;
        
        if (!userAEnabled || !userBEnabled) {
          continue; // Skip if either user has disabled challenges
        }

        // Check if they already have an active challenge
        const activeSnap = await db.collection('royal_challenges')
          .where('coupleId', '==', coupleId)
          .where('isActive', '==', true)
          .limit(1)
          .get();
        
        if (!activeSnap.empty) {
          continue; // Already has active challenge
        }

        // Assign a new challenge
        await assignChallengeToCouple(coupleId, participantIds as [string, string]);
        assignedCount++;
      }

      console.log(`Weekly challenge assignment complete. Assigned ${assignedCount} challenges.`);
      
      await updateAnalytics('weekly_assignment', assignedCount);
    } catch (error) {
      console.error('Error in weekly challenge assignment:', error);
    }
  });

/**
 * Assign a specific challenge to a couple
 */
async function assignChallengeToCouple(
  coupleId: string,
  participantIds: [string, string]
): Promise<void> {
  // Get challenge history to avoid repeating recent challenges
  const historySnap = await db.collection('challenge_completion_history')
    .where('coupleId', '==', coupleId)
    .orderBy('completedAt', 'desc')
    .limit(5)
    .get();
  
  const recentTypes = historySnap.docs.map(doc => doc.data().challengeType);

  // Select a challenge type that hasn't been used recently
  const availableTypes = Object.keys(CHALLENGE_TEMPLATES).filter(
    type => !recentTypes.includes(type)
  ) as ChallengeType[];
  
  const selectedType = availableTypes.length > 0
    ? availableTypes[Math.floor(Math.random() * availableTypes.length)]
    : Object.keys(CHALLENGE_TEMPLATES)[0] as ChallengeType;
  
  // Select a specific challenge from that type
  const templates = CHALLENGE_TEMPLATES[selectedType];
  const template = templates[Math.floor(Math.random() * templates.length)];

  // Create the challenge
  const challengeId = db.collection('royal_challenges').doc().id;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const challenge: Partial<RoyalChallenge> = {
    challengeId,
    coupleId,
    participantIds,
    challengeType: selectedType,
    title: template.title,
    description: template.description,
    steps: template.steps.map((step: any, index: number) => ({
      stepId: `step_${index + 1}`,
      description: step.description,
      requiredAction: step.requiredAction,
      completedBy: []
    })),
    isActive: true,
    completed: false,
    assignedAt: serverTimestamp() as any,
    expiresAt: expiresAt as any,
    progress: {
      userA: 0,
      userB: 0
    },
    metadata: {
      difficulty: template.difficulty,
      estimatedTimeMinutes: template.estimatedTimeMinutes,
      paidInteractionHint: template.paidInteractionHint
    }
  };

  await db.collection('royal_challenges').doc(challengeId).set(challenge);
  
  // Create progress tracking for both users
  await db.collection('royal_challenges').doc(challengeId)
    .collection('challenge_progress').doc(participantIds[0]).set({
      userId: participantIds[0],
      challengeId,
      progressPercentage: 0,
      stepsCompleted: [],
      lastUpdatedAt: serverTimestamp()
    });
  
  await db.collection('royal_challenges').doc(challengeId)
    .collection('challenge_progress').doc(participantIds[1]).set({
      userId: participantIds[1],
      challengeId,
      progressPercentage: 0,
      stepsCompleted: [],
      lastUpdatedAt: serverTimestamp()
    });

  console.log(`Assigned challenge ${challengeId} to couple ${coupleId}`);
}

// ============================================================================
// COMPLETION TRACKER
// ============================================================================

/**
 * Track challenge step completion
 */
export const trackChallengeProgress = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { challengeId, stepId } = data;
  const userId = context.auth.uid;

  try {
    const challengeRef = db.collection('royal_challenges').doc(challengeId);
    const challengeSnap = await challengeRef.get();

    if (!challengeSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Challenge not found');
    }

    const challenge = challengeSnap.data() as RoyalChallenge;

    // Verify user is a participant
    if (!challenge.participantIds.includes(userId)) {
      throw new functions.https.HttpsError('permission-denied', 'Not a challenge participant');
    }

    // Update step completion
    const stepIndex = challenge.steps.findIndex(s => s.stepId === stepId);
    if (stepIndex === -1) {
      throw new functions.https.HttpsError('not-found', 'Step not found');
    }

    const step = challenge.steps[stepIndex];
    if (!step.completedBy.includes(userId)) {
      step.completedBy.push(userId);
    }

    // Calculate progress
    const userIndex = challenge.participantIds.indexOf(userId);
    const userKey = userIndex === 0 ? 'userA' : 'userB';
    const userProgress = (step.completedBy.filter(id => id === userId).length / challenge.steps.length) * 100;
    
    challenge.progress[userKey] = Math.round(userProgress);

    // Update user's progress document
    await challengeRef.collection('challenge_progress').doc(userId).update({
      progressPercentage: challenge.progress[userKey],
      stepsCompleted: arrayUnion(stepId),
      lastUpdatedAt: serverTimestamp()
    });

    // Check if both users completed all steps
    const allStepsCompleted = challenge.steps.every(s => 
      s.completedBy.length === 2 &&
      s.completedBy.includes(challenge.participantIds[0]) &&
      s.completedBy.includes(challenge.participantIds[1])
    );

    if (allStepsCompleted && !challenge.completed) {
      // Mark challenge as completed
      await challengeRef.update({
        completed: true,
        isActive: false,
        completedAt: serverTimestamp(),
        steps: challenge.steps
      });

      // Award rewards
      await awardChallengeRewards(challenge);

      // Update competitive stats
      await updateCompetitiveStats(challenge);

      // Add to completion history
      await db.collection('challenge_completion_history').add({
        coupleId: challenge.coupleId,
        participantIds: challenge.participantIds,
        challengeId: challenge.challengeId,
        challengeType: challenge.challengeType,
        completedAt: serverTimestamp(),
        timeToComplete: Date.now() - challenge.assignedAt.toMillis()
      });

      // Boost Romantic Momentum (PACK 224)
      await boostRomanticMomentum(challenge.participantIds);

      return { 
        success: true, 
        completed: true,
        message: 'Challenge completed! Rewards earned!' 
      };
    }

    await challengeRef.update({
      steps: challenge.steps,
      progress: challenge.progress
    });

    return { 
      success: true, 
      completed: false,
      progress: challenge.progress 
    };
  } catch (error) {
    console.error('Error tracking challenge progress:', error);
    throw new functions.https.HttpsError('internal', 'Failed to track progress');
  }
});

/**
 * Auto-expire old challenges (scheduled function)
 */
export const expireOldChallenges = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async (context) => {
    try {
      const now = new Date();
      
      const expiredSnap = await db.collection('royal_challenges')
        .where('isActive', '==', true)
        .where('expiresAt', '<=', now)
        .where('completed', '==', false)
        .get();

      for (const challengeDoc of expiredSnap.docs) {
        await challengeDoc.ref.update({
          isActive: false,
          expiredAt: serverTimestamp()
        });
      }

      console.log(`Expired ${expiredSnap.size} old challenges`);
    } catch (error) {
      console.error('Error expiring challenges:', error);
    }
  });

// ============================================================================
// REWARD HANDLER
// ============================================================================

/**
 * Award rewards for completed challenge
 */
async function awardChallengeRewards(challenge: RoyalChallenge): Promise<void> {
  const rewardTypes: ChallengeReward['rewardType'][] = [
    'theme',
    'sticker', 
    'memory_highlight',
    'momentum_boost'
  ];

  // Select random reward
  const rewardType = rewardTypes[Math.floor(Math.random() * rewardTypes.length)];
  
  let rewardDetails: any = {};
  let expiresAt: Date | undefined;

  switch (rewardType) {
    case 'theme':
      rewardDetails= {
        themeName: 'Royal Duo Theme',
        themeId: 'royal_duo_gold',
        duration: '48 hours'
      };
      expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
      break;
    
    case 'sticker':
      rewardDetails = {
        stickerName: 'Royal Challenge Duo',
        stickerId: 'royal_couple_badge',
        permanent: true
      };
      break;
    
    case 'memory_highlight':
      rewardDetails = {
        highlightDuration: '7 days',
        glowEffect: true
      };
      expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      break;
    
    case 'momentum_boost':
      rewardDetails = {
        boostAmount: 10,
        duration: '24 hours'
      };
      expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      break;
  }

  // Create reward document
  await db.collection('challenge_rewards').add({
    coupleId: challenge.coupleId,
    participantIds: challenge.participantIds,
    rewardType,
    rewardDetails,
    earnedAt: serverTimestamp(),
    expiresAt: expiresAt || null,
    claimed: false
  });

  // Award badge for first completion
  const historySnap = await db.collection('challenge_completion_history')
    .where('coupleId', '==', challenge.coupleId)
    .get();
  
  if (historySnap.size === 1) {
    // First challenge completed
    await db.collection('challenge_badges').add({
      coupleId: challenge.coupleId,
      participantIds: challenge.participantIds,
      badgeType: 'first_challenge',
      badgeName: 'Royal Challenge Pioneers',
      isActive: true,
      earnedAt: serverTimestamp()
    });
  }

  // Check for streak badges
  await checkStreakBadges(challenge.coupleId, challenge.participantIds);
}

/**
 * Check and award streak badges
 */
async function checkStreakBadges(
  coupleId: string,
  participantIds: [string, string]
): Promise<void> {
  const statsSnap = await db.collection('competitive_stats')
    .where('coupleId', '==', coupleId)
    .orderBy('weekStartDate', 'desc')
    .limit(1)
    .get();
  
  if (!statsSnap.empty) {
    const stats = statsSnap.docs[0].data();
    const consecutiveWeeks = stats.consecutiveWeeks || 0;

    if (consecutiveWeeks >= 4 && consecutiveWeeks % 4 === 0) {
      await db.collection('challenge_badges').add({
        coupleId,
        participantIds,
        badgeType: 'streak',
        badgeName: `${consecutiveWeeks}-Week Champions`,
        isActive: true,
        earnedAt: serverTimestamp()
      });
    }
  }
}

// ============================================================================
// COMPETITIVE STATS
// ============================================================================

/**
 * Update competitive stats after challenge completion
 */
async function updateCompetitiveStats(challenge: RoyalChallenge): Promise<void> {
  const weekStart = getWeekStartDate();
  const weekStartStr = weekStart.toISOString().split('T')[0];

  // Get user locations for city-based leaderboard
  const userASnap = await db.collection('users').doc(challenge.participantIds[0]).get();
  const userBSnap = await db.collection('users').doc(challenge.participantIds[1]).get();
  
  const cityId = userASnap.data()?.cityId || userBSnap.data()?.cityId || 'global';

  // Update couple stats
  const statId = `${challenge.coupleId}_${weekStartStr}`;
  const statRef = db.collection('competitive_stats').doc(statId);
  const statSnap = await statRef.get();

  if (statSnap.exists) {
    await statRef.update({
      totalChallengesCompleted: increment(1),
      lastUpdatedAt: serverTimestamp()
    });
  } else {
    // Check previous week for consecutive tracking
    const lastWeek = new Date(weekStart.getTime() - 7 * 24 * 60 * 60 * 1000);
    const lastWeekStr = lastWeek.toISOString().split('T')[0];
    const lastWeekStatSnap = await db.collection('competitive_stats')
      .doc(`${challenge.coupleId}_${lastWeekStr}`)
      .get();
    
    const consecutiveWeeks = lastWeekStatSnap.exists 
      ? (lastWeekStatSnap.data()?.consecutiveWeeks || 0) + 1
      : 1;

    await statRef.set({
      coupleId: challenge.coupleId,
      participantIds: challenge.participantIds,
      cityId,
      weekStartDate: weekStartStr,
      totalChallengesCompleted: 1,
      consecutiveWeeks,
      createdAt: serverTimestamp(),
      lastUpdatedAt: serverTimestamp()
    });
  }

  // Update leaderboard cache
  await updateLeaderboardCache(cityId, weekStartStr);
}

/**
 * Update leaderboard cache for a city and week
 */
async function updateLeaderboardCache(cityId: string, weekStartStr: string): Promise<void> {
  // Get top couples for this city and week
  const statsSnap = await db.collection('competitive_stats')
    .where('cityId', '==', cityId)
    .where('weekStartDate', '==', weekStartStr)
    .orderBy('totalChallengesCompleted', 'desc')
    .limit(100)
    .get();

  // Calculate percentile rankings
  const totalCouples = statsSnap.size;

  statsSnap.docs.forEach(async (doc, index) => {
    const percentile = Math.round(((totalCouples - index) / totalCouples) * 100);
    
    await db.collection('competitive_leaderboard_cache').doc(`${cityId}_${weekStartStr}_${doc.id}`).set({
      coupleId: doc.data().coupleId,
      cityId,
      weekStartDate: weekStartStr,
      rank: index + 1,
      percentile,
      totalCompleted: doc.data().totalChallengesCompleted,
      lastUpdatedAt: serverTimestamp()
    });
  });
}

/**
 * Get placement message for couple
 */
export const getCouplePlacement = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { otherUserId } = data;
  const userId = context.auth.uid;
  const coupleId = generateCoupleId(userId, otherUserId);

  try {
    const weekStart = getWeekStartDate();
    const weekStartStr = weekStart.toISOString().split('T')[0];

    // Get user city
    const userSnap = await db.collection('users').doc(userId).get();
    const cityId = userSnap.data()?.cityId || 'global';

    // Get couple's cache entry
    const cacheSnap = await db.collection('competitive_leaderboard_cache')
      .where('coupleId', '==', coupleId)
      .where('cityId', '==', cityId)
      .where('weekStartDate', '==', weekStartStr)
      .limit(1)
      .get();

    if (cacheSnap.empty) {
      return {
        hasPlacement: false,
        message: 'Complete your first challenge this week to see your placement!'
      };
    }

    const placement = cacheSnap.docs[0].data();
    
    let message = '';
    if (placement.percentile >= 90) {
      message = `You two are in the top ${placement.percentile}% of couples in your city this week — chemistry on fire! 🔥`;
    } else if (placement.percentile >= 50) {
      message = `You're doing great! Top ${placement.percentile}% of couples in your city. Keep the momentum going!`;
    } else {
      message = `You've completed ${placement.totalCompleted} challenge(s) this week. Keep going!`;
    }

    return {
      hasPlacement: true,
      rank: placement.rank,
      percentile: placement.percentile,
      totalCompleted: placement.totalCompleted,
      message
    };
  } catch (error) {
    console.error('Error getting couple placement:', error);
    throw new functions.https.HttpsError('internal', 'Failed to get placement');
  }
});

// ============================================================================
// INTEGRATION WITH OTHER PACKS
// ============================================================================

/**
 * Boost Romantic Momentum after challenge completion (PACK 224)
 */
async function boostRomanticMomentum(participantIds: [string, string]): Promise<void> {
  for (const userId of participantIds) {
    const momentumRef = db.collection('romantic_momentum_states').doc(userId);
    const momentumSnap = await momentumRef.get();
    
    if (momentumSnap.exists) {
      const currentScore = momentumSnap.data()?.score || 0;
      const boostedScore = Math.min(100, currentScore + 5); // +5 bonus for challenge completion
      
      await momentumRef.update({
        score: boostedScore,
        lastUpdate: serverTimestamp(),
        lastBoostReason: 'royal_challenge_completed'
      });
    }
  }
}

// ============================================================================
// ANALYTICS
// ============================================================================

/**
 * Update challenge analytics
 */
async function updateAnalytics(
  eventType: 'weekly_assignment' | 'challenge_completed' | 'reward_claimed',
  value: any
): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const analyticsRef = db.collection('challenge_analytics').doc(today);

  const updates: any = {};
  
  if (eventType === 'weekly_assignment') {
    updates.totalAssignments = increment(value);
  } else if (eventType === 'challenge_completed') {
    updates.totalCompletions = increment(1);
  } else if (eventType === 'reward_claimed') {
    updates.totalRewardsClaimed = increment(1);
  }

  await analyticsRef.set({
    date: today,
    ...updates,
    lastUpdated: serverTimestamp()
  }, { merge: true });
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate consistent couple ID from two user IDs
 */
function generateCoupleId(userAId: string, userBId: string): string {
  return [userAId, userBId].sort().join('_');
}

/**
 * Get start of current week (Monday)
 */
function getWeekStartDate(): Date {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + daysToMonday);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

/**
 * Get active challenges for a user
 */
export const getActiveChallenges = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  try {
    const challengesSnap = await db.collection('royal_challenges')
      .where('participantIds', 'array-contains', userId)
      .where('isActive', '==', true)
      .orderBy('assignedAt', 'desc')
      .get();

    const challenges = challengesSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return { challenges };
  } catch (error) {
    console.error('Error getting active challenges:', error);
    throw new functions.https.HttpsError('internal', 'Failed to get challenges');
  }
});

/**
 * Disable challenges for user
 */
export const toggleChallenges = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const { enabled } = data;

  try {
    await db.collection('users').doc(userId)
      .collection('settings').doc('royal_challenges')
      .set({
        enabled,
        updatedAt: serverTimestamp()
      }, { merge: true });

    return { success: true, enabled };
  } catch (error) {
    console.error('Error toggling challenges:', error);
    throw new functions.https.HttpsError('internal', 'Failed to toggle challenges');
  }
});