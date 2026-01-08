/**
 * PACK 191 — Avalo Live Video Arena
 * 
 * SFW Interactive Livestreams with Paid Reactions, Group Challenges, and Zero Sexual/Escort Dynamics
 * 
 * Key Features:
 * - Real-time livestreaming for creators and communities
 * - Interactive mechanics (reactions, polls, challenges)
 * - Safe monetization (no romantic/erotic content)
 * - Real-time safety monitoring
 * - Group streams and collaborations
 * - Creator burnout protection
 * - VOD/Replay system
 * 
 * Allowed Categories: fitness, gaming, education, art, music, travel, lifestyle, entertainment, cooking, business, wellness
 * Blocked: erotic, flirty, romantic companionship, seduction, jealousy dynamics
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const db = getFirestore();

// ============================================================================
// TYPES
// ============================================================================

export type StreamStatus = 'scheduled' | 'live' | 'ended' | 'cancelled';
export type StreamCategory = 
  | 'fitness' | 'gaming' | 'education' | 'art' | 'music' 
  | 'travel' | 'lifestyle' | 'entertainment' | 'cooking' 
  | 'business' | 'wellness' | 'dance' | 'sports';

export interface LiveStream {
  streamId: string;
  hostId: string;
  hostName: string;
  hostAvatar?: string;
  title: string;
  description?: string;
  category: StreamCategory;
  status: StreamStatus;
  
  // Participants
  viewerCount: number;
  participantIds: string[];
  maxParticipants: number; // For collab streams (1-4 creators)
  
  // Monetization
  totalReactionTokens: number;
  totalPollTokens: number;
  totalChallengeTokens: number;
  
  // Timing
  scheduledFor?: Timestamp | FieldValue;
  startedAt?: Timestamp | FieldValue;
  endedAt?: Timestamp | FieldValue;
  duration: number; // seconds
  
  // Content Safety
  isSFW: boolean;
  isVerified: boolean;
  moderationFlags: number;
  
  // Settings
  allowChat: boolean;
  allowReactions: boolean;
  allowChallenges: boolean;
  slowModeSeconds: number;
  
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
}

export interface StreamReaction {
  reactionId: string;
  streamId: string;
  senderId: string;
  recipientId: string; // Host
  reactionType: 'fire' | 'heart' | 'star' | 'clap' | 'trophy';
  tokens: number;
  message?: string;
  createdAt: Timestamp | FieldValue;
}

export interface StreamPoll {
  pollId: string;
  streamId: string;
  hostId: string;
  question: string;
  options: PollOption[];
  status: 'active' | 'ended';
  requireTokens: boolean;
  tokenCost: number;
  totalVotes: number;
  endsAt?: Timestamp | FieldValue;
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
}

export interface PollOption {
  id: string;
  text: string;
  votes: number;
}

export interface StreamChallenge {
  challengeId: string;
  streamId: string;
  hostId: string;
  title: string;
  description: string;
  challengeType: 'skill' | 'creative' | 'fitness' | 'knowledge';
  status: 'active' | 'judging' | 'completed';
  entryTokens: number;
  prizeTokens: number;
  submissionCount: number;
  winnerId?: string;
  endsAt: Timestamp | FieldValue;
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
}

export interface ModerationEvent {
  eventId: string;
  streamId: string;
  eventType: 'harassment' | 'bullying' | 'hate_speech' | 'sexual_content' | 'stalking' | 'minor_risk';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  userId?: string;
  action: 'warning' | 'timeout' | 'ban' | 'stream_freeze';
  automated: boolean;
  createdAt: Timestamp | FieldValue;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const ALLOWED_CATEGORIES: StreamCategory[] = [
  'fitness', 'gaming', 'education', 'art', 'music', 
  'travel', 'lifestyle', 'entertainment', 'cooking', 
  'business', 'wellness', 'dance', 'sports'
];

const REACTION_COSTS = {
  fire: 10,
  heart: 25,
  star: 50,
  clap: 100,
  trophy: 500,
};

const REVENUE_SPLIT = {
  creator: 0.70, // 70% to creator
  platform: 0.30, // 30% to Avalo
};

const STREAM_LIMITS = {
  maxDuration: 14400, // 4 hours
  maxParticipants: 4, // For collab streams
  maxViewers: 10000,
  minAccountAge: 7, // days
  burnoutCooldown: 3600, // 1 hour between streams
};

// ============================================================================
// STREAM MANAGEMENT
// ============================================================================

/**
 * Create a new livestream
 */
export const createLiveStream = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { 
      title, 
      description, 
      category, 
      scheduledFor,
      maxParticipants = 1
    } = request.data;

    // Validate category
    if (!ALLOWED_CATEGORIES.includes(category)) {
      throw new HttpsError('invalid-argument', 'Invalid stream category. Must be SFW category.');
    }

    // Check user eligibility
    const userDoc = await db.collection('users').doc(uid).get();
    const userData = userDoc.data();

    if (!userData) {
      throw new HttpsError('not-found', 'User not found');
    }

    // Must be 18+ verified
    if (!userData.verification?.age18) {
      throw new HttpsError('failed-precondition', 'Must verify 18+ to create livestreams');
    }

    // Check account age
    const accountCreated = userData.createdAt?.toDate() || new Date();
    const accountAgeDays = Math.floor((Date.now() - accountCreated.getTime()) / (1000 * 60 * 60 * 24));
    
    if (accountAgeDays < STREAM_LIMITS.minAccountAge) {
      throw new HttpsError(
        'failed-precondition', 
        `Account must be at least ${STREAM_LIMITS.minAccountAge} days old to stream`
      );
    }

    // Check burnout cooldown
    const burnoutDoc = await db.collection('creator_burnout').doc(uid).get();
    if (burnoutDoc.exists) {
      const burnoutData = burnoutDoc.data();
      const lastStreamEnd = burnoutData?.lastStreamEndedAt?.toDate() || new Date(0);
      const timeSinceLastStream = Date.now() - lastStreamEnd.getTime();
      
      if (timeSinceLastStream < STREAM_LIMITS.burnoutCooldown * 1000) {
        const remainingSeconds = Math.ceil((STREAM_LIMITS.burnoutCooldown * 1000 - timeSinceLastStream) / 1000);
        throw new HttpsError(
          'resource-exhausted',
          `Please rest ${Math.ceil(remainingSeconds / 60)} minutes before starting another stream`
        );
      }
    }

    // Create stream
    const streamRef = db.collection('live_streams').doc();
    const stream: Partial<LiveStream> = {
      streamId: streamRef.id,
      hostId: uid,
      hostName: userData.name || 'Unknown',
      hostAvatar: userData.photos?.[0],
      title,
      description,
      category,
      status: scheduledFor ? 'scheduled' : 'live',
      viewerCount: 0,
      participantIds: [],
      maxParticipants: Math.min(maxParticipants, STREAM_LIMITS.maxParticipants),
      totalReactionTokens: 0,
      totalPollTokens: 0,
      totalChallengeTokens: 0,
      scheduledFor: scheduledFor ? Timestamp.fromMillis(scheduledFor) : undefined,
      startedAt: !scheduledFor ? FieldValue.serverTimestamp() : undefined,
      duration: 0,
      isSFW: true,
      isVerified: userData.verification?.status === 'verified' || false,
      moderationFlags: 0,
      allowChat: true,
      allowReactions: true,
      allowChallenges: true,
      slowModeSeconds: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await streamRef.set(stream);

    return {
      success: true,
      streamId: streamRef.id,
      stream,
    };
  }
);

/**
 * Start a scheduled stream
 */
export const startLiveStream = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { streamId } = request.data;

    const streamRef = db.collection('live_streams').doc(streamId);
    const streamDoc = await streamRef.get();

    if (!streamDoc.exists) {
      throw new HttpsError('not-found', 'Stream not found');
    }

    const stream = streamDoc.data() as LiveStream;

    if (stream.hostId !== uid) {
      throw new HttpsError('permission-denied', 'Only host can start stream');
    }

    if (stream.status !== 'scheduled') {
      throw new HttpsError('failed-precondition', 'Stream must be scheduled to start');
    }

    await streamRef.update({
      status: 'live',
      startedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { success: true };
  }
);

/**
 * End a livestream
 */
export const endLiveStream = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { streamId } = request.data;

    const streamRef = db.collection('live_streams').doc(streamId);
    const streamDoc = await streamRef.get();

    if (!streamDoc.exists) {
      throw new HttpsError('not-found', 'Stream not found');
    }

    const stream = streamDoc.data() as LiveStream;

    if (stream.hostId !== uid) {
      throw new HttpsError('permission-denied', 'Only host can end stream');
    }

    // Calculate duration
    const startedAt = stream.startedAt as Timestamp;
    const duration = startedAt ? Math.floor((Date.now() - startedAt.toMillis()) / 1000) : 0;

    // Calculate total revenue and split
    const totalRevenue = stream.totalReactionTokens + stream.totalPollTokens + stream.totalChallengeTokens;
    const creatorEarnings = Math.floor(totalRevenue * REVENUE_SPLIT.creator);
    const platformEarnings = totalRevenue - creatorEarnings;

    // Update stream
    await streamRef.update({
      status: 'ended',
      endedAt: FieldValue.serverTimestamp(),
      duration,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Update creator wallet
    if (creatorEarnings > 0) {
      await db.collection('users').doc(uid).update({
        'wallet.balance': FieldValue.increment(creatorEarnings),
        'wallet.earned': FieldValue.increment(creatorEarnings),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    // Update burnout tracking
    await db.collection('creator_burnout').doc(uid).set({
      userId: uid,
      lastStreamEndedAt: FieldValue.serverTimestamp(),
      totalStreamDuration: FieldValue.increment(duration),
      streamsToday: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    // Create analytics
    await db.collection('stream_analytics').doc(streamId).set({
      streamId,
      hostId: uid,
      duration,
      totalRevenue,
      creatorEarnings,
      platformEarnings,
      peakViewers: stream.viewerCount,
      totalReactions: stream.totalReactionTokens,
      totalPolls: stream.totalPollTokens,
      totalChallenges: stream.totalChallengeTokens,
      category: stream.category,
      createdAt: FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      duration,
      totalRevenue,
      creatorEarnings,
      platformEarnings,
    };
  }
);

/**
 * Join a livestream as viewer
 */
export const joinLiveStream = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { streamId } = request.data;

    const streamRef = db.collection('live_streams').doc(streamId);
    const streamDoc = await streamRef.get();

    if (!streamDoc.exists) {
      throw new HttpsError('not-found', 'Stream not found');
    }

    const stream = streamDoc.data() as LiveStream;

    if (stream.status !== 'live') {
      throw new HttpsError('failed-precondition', 'Stream is not live');
    }

    // Add participant
    await db.collection('stream_participants').doc(`${streamId}_${uid}`).set({
      streamId,
      userId: uid,
      role: 'viewer',
      status: 'active',
      joinedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Update viewer count
    await streamRef.update({
      viewerCount: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { success: true, stream };
  }
);

// ============================================================================
// REACTIONS & MONETIZATION
// ============================================================================

/**
 * Send a paid reaction during stream
 */
export const sendStreamReaction = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { streamId, reactionType, message } = request.data;

    if (!REACTION_COSTS[reactionType as keyof typeof REACTION_COSTS]) {
      throw new HttpsError('invalid-argument', 'Invalid reaction type');
    }

    const tokens = REACTION_COSTS[reactionType as keyof typeof REACTION_COSTS];

    // Get stream
    const streamDoc = await db.collection('live_streams').doc(streamId).get();
    if (!streamDoc.exists) {
      throw new HttpsError('not-found', 'Stream not found');
    }

    const stream = streamDoc.data() as LiveStream;

    if (stream.status !== 'live') {
      throw new HttpsError('failed-precondition', 'Stream is not live');
    }

    if (!stream.allowReactions) {
      throw new HttpsError('failed-precondition', 'Reactions are disabled for this stream');
    }

    // Cannot send to self
    if (uid === stream.hostId) {
      throw new HttpsError('failed-precondition', 'Cannot send reactions to yourself');
    }

    // Check wallet balance
    const userDoc = await db.collection('users').doc(uid).get();
    const userData = userDoc.data();
    const balance = userData?.wallet?.balance || 0;

    if (balance < tokens) {
      throw new HttpsError('failed-precondition', `Insufficient balance. Need ${tokens} tokens`);
    }

    // Execute transaction
    await db.runTransaction(async (transaction) => {
      // Deduct from sender
      transaction.update(db.collection('users').doc(uid), {
        'wallet.balance': FieldValue.increment(-tokens),
        'wallet.spent': FieldValue.increment(tokens),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Create reaction
      const reactionRef = db.collection('stream_reactions').doc();
      transaction.set(reactionRef, {
        reactionId: reactionRef.id,
        streamId,
        senderId: uid,
        recipientId: stream.hostId,
        reactionType,
        tokens,
        message: message || null,
        createdAt: FieldValue.serverTimestamp(),
      });

      // Update stream stats
      transaction.update(db.collection('live_streams').doc(streamId), {
        totalReactionTokens: FieldValue.increment(tokens),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Create transaction record
      transaction.set(db.collection('transactions').doc(), {
        userId: uid,
        type: 'stream_reaction',
        amount: -tokens,
        metadata: {
          streamId,
          hostId: stream.hostId,
          reactionType,
        },
        createdAt: FieldValue.serverTimestamp(),
      });
    });

    return { success: true, tokens, reactionType };
  }
);

/**
 * Create a poll during stream
 */
export const createStreamPoll = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { streamId, question, options, requireTokens, tokenCost, durationMinutes } = request.data;

    // Get stream
    const streamDoc = await db.collection('live_streams').doc(streamId).get();
    if (!streamDoc.exists) {
      throw new HttpsError('not-found', 'Stream not found');
    }

    const stream = streamDoc.data() as LiveStream;

    if (stream.hostId !== uid) {
      throw new HttpsError('permission-denied', 'Only host can create polls');
    }

    if (stream.status !== 'live') {
      throw new HttpsError('failed-precondition', 'Stream must be live to create polls');
    }

    // Create poll
    const pollRef = db.collection('stream_polls').doc();
    const poll: Partial<StreamPoll> = {
      pollId: pollRef.id,
      streamId,
      hostId: uid,
      question,
      options: options.map((text: string, index: number) => ({
        id: `opt_${index}`,
        text,
        votes: 0,
      })),
      status: 'active',
      requireTokens: requireTokens || false,
      tokenCost: requireTokens ? (tokenCost || 10) : 0,
      totalVotes: 0,
      endsAt: durationMinutes 
        ? Timestamp.fromMillis(Date.now() + durationMinutes * 60 * 1000)
        : undefined,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await pollRef.set(poll);

    return { success: true, pollId: pollRef.id, poll };
  }
);

/**
 * Vote on a poll
 */
export const voteOnPoll = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { pollId, optionId } = request.data;

    const pollDoc = await db.collection('stream_polls').doc(pollId).get();
    if (!pollDoc.exists) {
      throw new HttpsError('not-found', 'Poll not found');
    }

    const poll = pollDoc.data() as StreamPoll;

    if (poll.status !== 'active') {
      throw new HttpsError('failed-precondition', 'Poll is not active');
    }

    // Check if already voted
    const existingVote = await db.collection('poll_votes')
      .where('pollId', '==', pollId)
      .where('userId', '==', uid)
      .limit(1)
      .get();

    if (!existingVote.empty) {
      throw new HttpsError('failed-precondition', 'Already voted on this poll');
    }

    // Check token requirement
    if (poll.requireTokens && poll.tokenCost > 0) {
      const userDoc = await db.collection('users').doc(uid).get();
      const balance = userDoc.data()?.wallet?.balance || 0;

      if (balance < poll.tokenCost) {
        throw new HttpsError('failed-precondition', `Need ${poll.tokenCost} tokens to vote`);
      }

      // Deduct tokens
      await db.collection('users').doc(uid).update({
        'wallet.balance': FieldValue.increment(-poll.tokenCost),
        'wallet.spent': FieldValue.increment(poll.tokenCost),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Update stream revenue
      await db.collection('live_streams').doc(poll.streamId).update({
        totalPollTokens: FieldValue.increment(poll.tokenCost),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    // Record vote
    await db.collection('poll_votes').doc().set({
      pollId,
      userId: uid,
      optionId,
      tokensPaid: poll.requireTokens ? poll.tokenCost : 0,
      createdAt: FieldValue.serverTimestamp(),
    });

    // Update poll
    const options = poll.options.map(opt => 
      opt.id === optionId ? { ...opt, votes: opt.votes + 1 } : opt
    );

    await db.collection('stream_polls').doc(pollId).update({
      options,
      totalVotes: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { success: true };
  }
);

// ============================================================================
// CHALLENGES
// ============================================================================

/**
 * Create a challenge during stream
 */
export const createStreamChallenge = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { 
      streamId, 
      title, 
      description, 
      challengeType, 
      entryTokens, 
      prizeTokens,
      durationMinutes 
    } = request.data;

    // Get stream
    const streamDoc = await db.collection('live_streams').doc(streamId).get();
    if (!streamDoc.exists) {
      throw new HttpsError('not-found', 'Stream not found');
    }

    const stream = streamDoc.data() as LiveStream;

    if (stream.hostId !== uid) {
      throw new HttpsError('permission-denied', 'Only host can create challenges');
    }

    if (!stream.allowChallenges) {
      throw new HttpsError('failed-precondition', 'Challenges are disabled for this stream');
    }

    // Create challenge
    const challengeRef = db.collection('stream_challenges').doc();
    const challenge: Partial<StreamChallenge> = {
      challengeId: challengeRef.id,
      streamId,
      hostId: uid,
      title,
      description,
      challengeType: challengeType || 'skill',
      status: 'active',
      entryTokens: entryTokens || 0,
      prizeTokens: prizeTokens || 0,
      submissionCount: 0,
      endsAt: Timestamp.fromMillis(Date.now() + (durationMinutes || 10) * 60 * 1000),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await challengeRef.set(challenge);

    return { success: true, challengeId: challengeRef.id, challenge };
  }
);

/**
 * Submit to a challenge
 */
export const submitToChallenge = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { challengeId, submission } = request.data;

    const challengeDoc = await db.collection('stream_challenges').doc(challengeId).get();
    if (!challengeDoc.exists) {
      throw new HttpsError('not-found', 'Challenge not found');
    }

    const challenge = challengeDoc.data() as StreamChallenge;

    if (challenge.status !== 'active') {
      throw new HttpsError('failed-precondition', 'Challenge is not active');
    }

    // Check if already submitted
    const existingSubmission = await db.collection('challenge_submissions')
      .where('challengeId', '==', challengeId)
      .where('userId', '==', uid)
      .limit(1)
      .get();

    if (!existingSubmission.empty) {
      throw new HttpsError('failed-precondition', 'Already submitted to this challenge');
    }

    // Check entry fee
    if (challenge.entryTokens > 0) {
      const userDoc = await db.collection('users').doc(uid).get();
      const balance = userDoc.data()?.wallet?.balance || 0;

      if (balance < challenge.entryTokens) {
        throw new HttpsError('failed-precondition', `Need ${challenge.entryTokens} tokens to enter`);
      }

      // Deduct tokens
      await db.collection('users').doc(uid).update({
        'wallet.balance': FieldValue.increment(-challenge.entryTokens),
        'wallet.spent': FieldValue.increment(challenge.entryTokens),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Update stream revenue
      await db.collection('live_streams').doc(challenge.streamId).update({
        totalChallengeTokens: FieldValue.increment(challenge.entryTokens),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    // Create submission
    await db.collection('challenge_submissions').doc().set({
      challengeId,
      streamId: challenge.streamId,
      userId: uid,
      submission,
      status: 'submitted',
      tokensPaid: challenge.entryTokens,
      submittedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Update challenge stats
    await db.collection('stream_challenges').doc(challengeId).update({
      submissionCount: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { success: true };
  }
);

// ============================================================================
// SAFETY & MODERATION
// ============================================================================

/**
 * Report stream for safety violations
 */
export const reportStream = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { streamId, reportType, description } = request.data;

    const validReportTypes = [
      'sexual_content',
      'harassment',
      'hate_speech',
      'minor_safety',
      'violence',
      'spam',
      'other'
    ];

    if (!validReportTypes.includes(reportType)) {
      throw new HttpsError('invalid-argument', 'Invalid report type');
    }

    // Create report
    const reportRef = db.collection('stream_reports').doc();
    await reportRef.set({
      reportId: reportRef.id,
      streamId,
      reporterId: uid,
      reportType,
      description,
      status: 'pending',
      priority: reportType === 'minor_safety' || reportType === 'sexual_content' ? 'critical' : 'high',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Create moderation event
    await db.collection('stream_moderation_events').doc().set({
      eventId: reportRef.id,
      streamId,
      eventType: reportType,
      severity: reportType === 'minor_safety' || reportType === 'sexual_content' ? 'critical' : 'high',
      description: `User report: ${description}`,
      userId: uid,
      action: 'flagged',
      automated: false,
      createdAt: FieldValue.serverTimestamp(),
    });

    // If critical, auto-flag the stream
    if (reportType === 'minor_safety' || reportType === 'sexual_content') {
      await db.collection('live_streams').doc(streamId).update({
        moderationFlags: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    return { success: true, reportId: reportRef.id };
  }
);

/**
 * Scheduled: Monitor stream health and burnout
 */
export const monitorStreamHealth = onSchedule(
  {
    schedule: 'every 5 minutes',
    region: 'europe-west3',
  },
  async () => {
    console.log('Monitoring stream health...');

    // Get all live streams
    const liveStreams = await db.collection('live_streams')
      .where('status', '==', 'live')
      .get();

    for (const streamDoc of liveStreams.docs) {
      const stream = streamDoc.data() as LiveStream;
      const streamId = streamDoc.id;

      // Check duration limit
      const startedAt = stream.startedAt as Timestamp;
      if (startedAt) {
        const duration = Math.floor((Date.now() - startedAt.toMillis()) / 1000);
        
        if (duration > STREAM_LIMITS.maxDuration) {
          console.log(`Stream ${streamId} exceeded max duration, auto-ending`);
          
          await streamDoc.ref.update({
            status: 'ended',
            endedAt: FieldValue.serverTimestamp(),
            duration,
            updatedAt: FieldValue.serverTimestamp(),
          });

          // Create moderation event
          await db.collection('stream_moderation_events').doc().set({
            streamId,
            eventType: 'other',
            severity: 'low',
            description: 'Stream auto-ended due to duration limit',
            action: 'stream_freeze',
            automated: true,
            createdAt: FieldValue.serverTimestamp(),
          });
        }
      }

      // Check moderation flags
      if (stream.moderationFlags >= 3) {
        console.log(`Stream ${streamId} has too many flags, auto-ending`);
        
        await streamDoc.ref.update({
          status: 'ended',
          endedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }

    console.log('Stream health monitoring complete');
  }
);

/**
 * Auto-create stream replay after stream ends
 */
export const createStreamReplay = onDocumentUpdated(
  {
    document: 'live_streams/{streamId}',
    region: 'europe-west3',
  },
  async (event) => {
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();

    if (!beforeData || !afterData) return;

    // Check if stream just ended
    if (beforeData.status === 'live' && afterData.status === 'ended') {
      const streamId = event.params.streamId;
      
      // Create replay if stream was successful and had viewers
      if (afterData.viewerCount > 0 && afterData.duration > 60) {
        await db.collection('stream_replays').doc(streamId).set({
          replayId: streamId,
          streamId,
          hostId: afterData.hostId,
          title: afterData.title,
          description: afterData.description,
          category: afterData.category,
          duration: afterData.duration,
          viewCount: 0,
          isPublic: true,
          isSFW: afterData.isSFW,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        console.log(`Created replay for stream ${streamId}`);
      }
    }
  }
);

/**
 * Track active viewer engagement
 */
export const updateViewerActivity = onDocumentCreated(
  {
    document: 'stream_chat/{messageId}',
    region: 'europe-west3',
  },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const { streamId, senderId } = data;

    // Update participant last activity
    await db.collection('stream_participants')
      .doc(`${streamId}_${senderId}`)
      .update({
        lastActivityAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })
      .catch(() => {
        // Participant not found, ignore
      });
  }
);