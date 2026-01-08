/**
 * PACK 137: Avalo Global Community Challenges
 * Backend Firebase Functions for skill-based, fitness, lifestyle challenges
 * 
 * SAFETY GUARANTEES:
 * - No beauty/appearance competitions
 * - No dating/romance/NSFW
 * - No token bonuses or shortcuts
 * - No discovery/ranking boosts
 * - 100% consistency-based leaderboards
 * - 65/35 split for paid challenges
 */

import * as functions from 'firebase-functions';
import { db, serverTimestamp, generateId, increment } from './init';
import {
  Challenge,
  ChallengeParticipant,
  ChallengeProgress,
  ChallengePost,
  ChallengeBadge,
  LeaderboardEntry,
  CreateChallengeRequest,
  JoinChallengeRequest,
  SubmitTaskRequest,
  GetLeaderboardRequest,
  ChallengeResponse,
  ChallengeStatus,
  ParticipantStatus,
  validateChallengeContent,
  calculateLeaderboardScore,
  getDurationDays,
  calculateCompletionRate,
  validatePostContent,
} from './types/challenges.types';
import { Timestamp } from 'firebase-admin/firestore';

// ============================================
// CALLABLE FUNCTIONS
// ============================================

/**
 * Create a new challenge
 * Verified creators only
 */
export const createChallenge = functions.https.onCall(
  async (data: CreateChallengeRequest, context): Promise<ChallengeResponse<{ challengeId: string }>> => {
    try {
      // Authentication check
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
      }

      const userId = context.auth.uid;

      // Get user profile
      const userDoc = await db.collection('users').doc(userId).get();
      if (!userDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'User profile not found');
      }

      const userData = userDoc.data()!;

      // Verify creator status
      if (!userData.isCreator || !userData.earnFromChat) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Only verified creators can create challenges'
        );
      }

      // Validate input
      if (!data.title || data.title.length < 5 || data.title.length > 100) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Title must be 5-100 characters'
        );
      }

      if (!data.description || data.description.length < 20 || data.description.length > 1000) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Description must be 20-1000 characters'
        );
      }

      if (!data.taskTitle || data.taskTitle.length < 5 || data.taskTitle.length > 100) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Task title must be 5-100 characters'
        );
      }

      if (!data.taskDescription || data.taskDescription.length < 10 || data.taskDescription.length > 500) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Task description must be 10-500 characters'
        );
      }

      // Validate pricing
      if (data.isPaid) {
        if (data.entryTokens < 1 || data.entryTokens > 5000) {
          throw new functions.https.HttpsError(
            'invalid-argument',
            'Entry tokens must be 1-5000 for paid challenges'
          );
        }
      } else {
        data.entryTokens = 0;
      }

      // Validate max participants
      if (data.maxParticipants && (data.maxParticipants < 2 || data.maxParticipants > 10000)) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Max participants must be 2-10000'
        );
      }

      // SAFETY: Validate content for NSFW/forbidden content
      const validation = validateChallengeContent(
        data.title,
        data.description,
        data.category,
        data.taskTitle,
        data.taskDescription
      );

      if (!validation.isValid) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          `Challenge blocked: ${validation.violations.join(', ')}`
        );
      }

      // Parse dates
      const startDate = Timestamp.fromDate(new Date(data.startDate));
      const durationDays = getDurationDays(data.duration);
      const endDate = Timestamp.fromDate(
        new Date(startDate.toDate().getTime() + durationDays * 24 * 60 * 60 * 1000)
      );

      // Validate start date
      const now = Timestamp.now();
      if (startDate.toMillis() < now.toMillis()) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Challenge must start in the future'
        );
      }

      // Generate challenge ID
      const challengeId = generateId();

      // Calculate tasks required
      let tasksRequired = 0;
      if (data.taskFrequency === 'DAILY') {
        tasksRequired = durationDays * (data.tasksPerDay || 1);
      } else if (data.taskFrequency === 'WEEKLY') {
        const weeks = Math.ceil(durationDays / 7);
        tasksRequired = weeks * (data.tasksPerWeek || 1);
      } else {
        tasksRequired = durationDays; // Default to daily
      }

      // Create challenge document
      const challenge: Challenge = {
        challengeId,
        creatorId: userId,
        creatorName: userData.displayName || userData.username || 'Creator',
        creatorAvatar: userData.profileImage || undefined,
        title: data.title.trim(),
        description: data.description.trim(),
        category: data.category,
        isPaid: data.isPaid,
        entryTokens: data.entryTokens,
        duration: data.duration,
        durationDays,
        startDate,
        endDate,
        taskTitle: data.taskTitle.trim(),
        taskDescription: data.taskDescription.trim(),
        taskFrequency: data.taskFrequency,
        tasksPerDay: data.tasksPerDay,
        tasksPerWeek: data.tasksPerWeek,
        requiresPhoto: data.requiresPhoto,
        requiresVideo: data.requiresVideo,
        requiresTextLog: data.requiresTextLog,
        maxParticipants: data.maxParticipants,
        currentParticipants: 0,
        leaderboardMode: 'CONSISTENCY',
        status: ChallengeStatus.ACTIVE,
        isActive: true,
        containsNSFW: validation.containsNSFW,
        containsForbiddenContent: validation.containsForbiddenContent,
        totalRevenue: 0,
        platformFee: 0,
        creatorEarnings: 0,
        createdAt: serverTimestamp() as Timestamp,
        updatedAt: serverTimestamp() as Timestamp,
        tags: data.tags || [],
      };

      await db.collection('challenges').doc(challengeId).set(challenge);

      return {
        success: true,
        data: { challengeId },
        message: 'Challenge created successfully',
      };
    } catch (error: any) {
      console.error('Error creating challenge:', error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError('internal', error.message || 'Failed to create challenge');
    }
  }
);

/**
 * Join a challenge
 * Handles payment for paid challenges
 */
export const joinChallenge = functions.https.onCall(
  async (data: JoinChallengeRequest, context): Promise<ChallengeResponse<{ participantId: string }>> => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
      }

      const userId = context.auth.uid;
      const { challengeId } = data;

      // Get challenge
      const challengeDoc = await db.collection('challenges').doc(challengeId).get();
      if (!challengeDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Challenge not found');
      }

      const challenge = challengeDoc.data() as Challenge;

      // Validate challenge status
      if (challenge.status !== ChallengeStatus.ACTIVE || !challenge.isActive) {
        throw new functions.https.HttpsError('failed-precondition', 'Challenge is not active');
      }

      // Check if challenge has started
      const now = Timestamp.now();
      if (challenge.startDate.toMillis() <= now.toMillis()) {
        throw new functions.https.HttpsError('failed-precondition', 'Challenge has already started');
      }

      // Check capacity
      if (challenge.maxParticipants && challenge.currentParticipants >= challenge.maxParticipants) {
        throw new functions.https.HttpsError('failed-precondition', 'Challenge is full');
      }

      // Cannot join own challenge
      if (challenge.creatorId === userId) {
        throw new functions.https.HttpsError('failed-precondition', 'Cannot join your own challenge');
      }

      // Check if already joined
      const existingParticipant = await db
        .collection('challenge_participants')
        .where('challengeId', '==', challengeId)
        .where('userId', '==', userId)
        .where('status', 'in', [ParticipantStatus.ACTIVE, ParticipantStatus.COMPLETED])
        .limit(1)
        .get();

      if (!existingParticipant.empty) {
        throw new functions.https.HttpsError('already-exists', 'Already joined this challenge');
      }

      // Get user data
      const userDoc = await db.collection('users').doc(userId).get();
      if (!userDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'User not found');
      }

      const userData = userDoc.data()!;

      // Handle payment for paid challenges
      let transactionId: string | undefined;
      let platformFee = 0;
      let creatorEarnings = 0;

      if (challenge.isPaid && challenge.entryTokens > 0) {
        const userTokens = userData.tokenBalance || 0;

        if (userTokens < challenge.entryTokens) {
          throw new functions.https.HttpsError(
            'failed-precondition',
            `Insufficient tokens. Need ${challenge.entryTokens}, have ${userTokens}`
          );
        }

        // Calculate split
        platformFee = Math.floor(challenge.entryTokens * 0.35);
        creatorEarnings = challenge.entryTokens - platformFee;

        // Process payment in transaction
        await db.runTransaction(async (transaction) => {
          const userRef = db.collection('users').doc(userId);
          const creatorRef = db.collection('users').doc(challenge.creatorId);
          const challengeRef = db.collection('challenges').doc(challengeId);

          const userSnapshot = await transaction.get(userRef);
          const currentBalance = userSnapshot.data()?.tokenBalance || 0;

          if (currentBalance < challenge.entryTokens) {
            throw new Error('Insufficient tokens');
          }

          // Deduct from user
          transaction.update(userRef, {
            tokenBalance: increment(-challenge.entryTokens),
          });

          // Add to creator
          transaction.update(creatorRef, {
            tokenBalance: increment(creatorEarnings),
            lifetimeEarnings: increment(creatorEarnings),
          });

          // Update challenge revenue
          transaction.update(challengeRef, {
            totalRevenue: increment(challenge.entryTokens),
            platformFee: increment(platformFee),
            creatorEarnings: increment(creatorEarnings),
            currentParticipants: increment(1),
          });

          // Create transaction record
          transactionId = generateId();
          const transactionRecord = {
            transactionId,
            type: 'CHALLENGE_ENTRY',
            fromUserId: userId,
            toUserId: challenge.creatorId,
            amount: challenge.entryTokens,
            platformFee,
            creatorEarnings,
            challengeId,
            createdAt: serverTimestamp(),
          };
          transaction.set(db.collection('transactions').doc(transactionId), transactionRecord);
        });
      } else {
        // Free challenge - just increment participants
        await db.collection('challenges').doc(challengeId).update({
          currentParticipants: increment(1),
        });
      }

      // Calculate tasks required
      let tasksRequired = 0;
      if (challenge.taskFrequency === 'DAILY') {
        tasksRequired = challenge.durationDays * (challenge.tasksPerDay || 1);
      } else if (challenge.taskFrequency === 'WEEKLY') {
        const weeks = Math.ceil(challenge.durationDays / 7);
        tasksRequired = weeks * (challenge.tasksPerWeek || 1);
      } else {
        tasksRequired = challenge.durationDays;
      }

      // Create participant record
      const participantId = generateId();
      const participant: ChallengeParticipant = {
        participantId,
        challengeId,
        challengeTitle: challenge.title,
        userId,
        userName: userData.displayName || userData.username || 'User',
        userAvatar: userData.profileImage,
        creatorId: challenge.creatorId,
        paidTokens: challenge.isPaid ? challenge.entryTokens : 0,
        platformFee,
        creatorEarnings,
        transactionId,
        tasksCompleted: 0,
        tasksRequired,
        completionRate: 0,
        currentStreak: 0,
        longestStreak: 0,
        status: ParticipantStatus.ACTIVE,
        isActive: true,
        completedAllTasks: false,
        earnedBadge: false,
        leaderboardScore: 0,
        joinedAt: serverTimestamp() as Timestamp,
        lastActivityAt: serverTimestamp() as Timestamp,
      };

      await db.collection('challenge_participants').doc(participantId).set(participant);

      return {
        success: true,
        data: { participantId },
        message: 'Successfully joined challenge',
      };
    } catch (error: any) {
      console.error('Error joining challenge:', error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError('internal', error.message || 'Failed to join challenge');
    }
  }
);

/**
 * Submit task completion with post
 */
export const submitChallengeTask = functions.https.onCall(
  async (data: SubmitTaskRequest, context): Promise<ChallengeResponse<{ postId: string; progressId: string }>> => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
      }

      const userId = context.auth.uid;
      const { challengeId, taskNumber, taskDate, postType, caption, mediaUrl } = data;

      // Get challenge
      const challengeDoc = await db.collection('challenges').doc(challengeId).get();
      if (!challengeDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Challenge not found');
      }

      const challenge = challengeDoc.data() as Challenge;

      // Get participant record
      const participantSnapshot = await db
        .collection('challenge_participants')
        .where('challengeId', '==', challengeId)
        .where('userId', '==', userId)
        .where('status', '==', ParticipantStatus.ACTIVE)
        .limit(1)
        .get();

      if (participantSnapshot.empty) {
        throw new functions.https.HttpsError('not-found', 'Not enrolled in this challenge');
      }

      const participantDoc = participantSnapshot.docs[0];
      const participant = participantDoc.data() as ChallengeParticipant;

      // Validate task submission
      if (challenge.requiresPhoto && postType !== 'PROGRESS_PHOTO') {
        throw new functions.https.HttpsError('invalid-argument', 'Challenge requires photo submissions');
      }

      if (challenge.requiresVideo && postType !== 'VIDEO_UPDATE') {
        throw new functions.https.HttpsError('invalid-argument', 'Challenge requires video submissions');
      }

      if (challenge.requiresTextLog && postType !== 'TEXT_LOG') {
        throw new functions.https.HttpsError('invalid-argument', 'Challenge requires text log submissions');
      }

      // Validate caption if provided
      if (caption) {
        const contentValidation = validatePostContent(caption, postType);
        if (!contentValidation.isValid) {
          throw new functions.https.HttpsError(
            'invalid-argument',
            `Post blocked: ${contentValidation.violations.join(', ')}`
          );
        }
      }

      // Check if task already submitted
      const existingProgress = await db
        .collection('challenge_progress')
        .where('challengeId', '==', challengeId)
        .where('userId', '==', userId)
        .where('taskNumber', '==', taskNumber)
        .limit(1)
        .get();

      if (!existingProgress.empty) {
        throw new functions.https.HttpsError('already-exists', 'Task already submitted');
      }

      const taskDateTimestamp = Timestamp.fromDate(new Date(taskDate));

      // Get user data
      const userDoc = await db.collection('users').doc(userId).get();
      const userData = userDoc.data()!;

      // Create challenge post
      const postId = generateId();
      const post: ChallengePost = {
        postId,
        challengeId,
        userId,
        userName: userData.displayName || userData.username || 'User',
        userAvatar: userData.profileImage,
        type: postType,
        caption: caption?.trim(),
        mediaUrl,
        taskNumber,
        taskDate: taskDateTimestamp,
        likesCount: 0,
        commentsCount: 0,
        isVisible: true,
        containsNSFW: false,
        createdAt: serverTimestamp() as Timestamp,
        updatedAt: serverTimestamp() as Timestamp,
      };

      await db.collection('challenge_posts').doc(postId).set(post);

      // Create progress entry
      const progressId = generateId();
      
      // Calculate new streak
      const previousProgress = await db
        .collection('challenge_progress')
        .where('challengeId', '==', challengeId)
        .where('userId', '==', userId)
        .where('completed', '==', true)
        .orderBy('taskDate', 'desc')
        .limit(1)
        .get();

      let newStreak = 1;
      if (!previousProgress.empty) {
        const lastProgress = previousProgress.docs[0].data();
        const lastDate = lastProgress.taskDate.toDate();
        const currentDate = taskDateTimestamp.toDate();
        const daysDiff = Math.floor((currentDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysDiff === 1) {
          newStreak = lastProgress.streakDay + 1;
        }
      }

      const progress: ChallengeProgress = {
        progressId,
        challengeId,
        userId,
        participantId: participant.participantId,
        taskDate: taskDateTimestamp,
        taskNumber,
        completed: true,
        postId,
        submittedAt: serverTimestamp() as Timestamp,
        streakDay: newStreak,
        createdAt: serverTimestamp() as Timestamp,
      };

      await db.collection('challenge_progress').doc(progressId).set(progress);

      // Update participant stats
      const newTasksCompleted = participant.tasksCompleted + 1;
      const newCompletionRate = calculateCompletionRate(newTasksCompleted, participant.tasksRequired);
      const newLongestStreak = Math.max(newStreak, participant.longestStreak);
      const newLeaderboardScore = calculateLeaderboardScore(newCompletionRate, newStreak, newLongestStreak);

      const updates: Partial<ChallengeParticipant> = {
        tasksCompleted: newTasksCompleted,
        completionRate: newCompletionRate,
        currentStreak: newStreak,
        longestStreak: newLongestStreak,
        leaderboardScore: newLeaderboardScore,
        lastActivityAt: serverTimestamp() as Timestamp,
      };

      // Check if all tasks completed
      if (newTasksCompleted >= participant.tasksRequired) {
        updates.completedAllTasks = true;
        updates.status = ParticipantStatus.COMPLETED;
        updates.completedAt = serverTimestamp() as Timestamp;
        
        // Award badge
        if (!participant.earnedBadge) {
          const badgeId = generateId();
          const badge: ChallengeBadge = {
            badgeId,
            userId,
            challengeId,
            challengeTitle: challenge.title,
            category: challenge.category,
            completionRate: newCompletionRate,
            finalStreak: newStreak,
            tasksCompleted: newTasksCompleted,
            displayOnProfile: false,
            earnedAt: serverTimestamp() as Timestamp,
          };
          await db.collection('challenge_badges').doc(badgeId).set(badge);
          updates.earnedBadge = true;
        }
      }

      await db.collection('challenge_participants').doc(participantDoc.id).update(updates);

      return {
        success: true,
        data: { postId, progressId },
        message: 'Task submitted successfully',
      };
    } catch (error: any) {
      console.error('Error submitting task:', error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError('internal', error.message || 'Failed to submit task');
    }
  }
);

/**
 * Get challenge leaderboard (consistency-based only)
 */
export const getChallengeLeaderboard = functions.https.onCall(
  async (data: GetLeaderboardRequest, context): Promise<ChallengeResponse<LeaderboardEntry[]>> => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
      }

      const { challengeId, limit = 50 } = data;

      // Validate limit
      const actualLimit = Math.min(Math.max(limit, 1), 100);

      // Get top participants by leaderboard score
      const participantsSnapshot = await db
        .collection('challenge_participants')
        .where('challengeId', '==', challengeId)
        .where('status', 'in', [ParticipantStatus.ACTIVE, ParticipantStatus.COMPLETED])
        .orderBy('leaderboardScore', 'desc')
        .orderBy('completionRate', 'desc')
        .limit(actualLimit)
        .get();

      const leaderboard: LeaderboardEntry[] = [];
      let rank = 1;

      for (const doc of participantsSnapshot.docs) {
        const participant = doc.data() as ChallengeParticipant;

        leaderboard.push({
          rank: rank++,
          userId: participant.userId,
          userName: participant.userName,
          userAvatar: participant.userAvatar,
          completionRate: participant.completionRate,
          currentStreak: participant.currentStreak,
          longestStreak: participant.longestStreak,
          tasksCompleted: participant.tasksCompleted,
          leaderboardScore: participant.leaderboardScore,
        });
      }

      return {
        success: true,
        data: leaderboard,
      };
    } catch (error: any) {
      console.error('Error getting leaderboard:', error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError('internal', error.message || 'Failed to get leaderboard');
    }
  }
);

/**
 * Get challenge details
 */
export const getChallengeDetails = functions.https.onCall(
  async (data: { challengeId: string }, context): Promise<ChallengeResponse<Challenge>> => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
      }

      const { challengeId } = data;

      const challengeDoc = await db.collection('challenges').doc(challengeId).get();
      if (!challengeDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Challenge not found');
      }

      const challenge = challengeDoc.data() as Challenge;

      return {
        success: true,
        data: challenge,
      };
    } catch (error: any) {
      console.error('Error getting challenge details:', error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError('internal', error.message || 'Failed to get challenge details');
    }
  }
);

/**
 * List all active challenges
 */
export const listChallenges = functions.https.onCall(
  async (
    data: { category?: string; limit?: number },
    context
  ): Promise<ChallengeResponse<Challenge[]>> => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
      }

      const { category, limit = 50 } = data;
      const actualLimit = Math.min(Math.max(limit, 1), 100);

      let query = db
        .collection('challenges')
        .where('status', '==', ChallengeStatus.ACTIVE)
        .where('isActive', '==', true)
        .orderBy('createdAt', 'desc')
        .limit(actualLimit);

      if (category) {
        query = query.where('category', '==', category) as any;
      }

      const snapshot = await query.get();
      const challenges = snapshot.docs.map((doc) => doc.data() as Challenge);

      return {
        success: true,
        data: challenges,
      };
    } catch (error: any) {
      console.error('Error listing challenges:', error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError('internal', error.message || 'Failed to list challenges');
    }
  }
);

/**
 * Get user's participated challenges
 */
export const getMyChallenges = functions.https.onCall(
  async (data: { status?: string }, context): Promise<ChallengeResponse<ChallengeParticipant[]>> => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
      }

      const userId = context.auth.uid;
      const { status } = data;

      let query = db
        .collection('challenge_participants')
        .where('userId', '==', userId)
        .orderBy('joinedAt', 'desc');

      if (status) {
        query = query.where('status', '==', status) as any;
      }

      const snapshot = await query.get();
      const participants = snapshot.docs.map((doc) => doc.data() as ChallengeParticipant);

      return {
        success: true,
        data: participants,
      };
    } catch (error: any) {
      console.error('Error getting my challenges:', error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError('internal', error.message || 'Failed to get challenges');
    }
  }
);

/**
 * Leave a challenge (before completion)
 * NO REFUND as per policy
 */
export const leaveChallenge = functions.https.onCall(
  async (data: { challengeId: string }, context): Promise<ChallengeResponse> => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
      }

      const userId = context.auth.uid;
      const { challengeId } = data;

      // Get participant record
      const participantSnapshot = await db
        .collection('challenge_participants')
        .where('challengeId', '==', challengeId)
        .where('userId', '==', userId)
        .where('status', '==', ParticipantStatus.ACTIVE)
        .limit(1)
        .get();

      if (participantSnapshot.empty) {
        throw new functions.https.HttpsError('not-found', 'Not enrolled in this challenge');
      }

      const participantDoc = participantSnapshot.docs[0];

      // Update status to DROPPED (no refund)
      await participantDoc.ref.update({
        status: ParticipantStatus.DROPPED,
        isActive: false,
      });

      // Decrement participant count
      await db.collection('challenges').doc(challengeId).update({
        currentParticipants: increment(-1),
      });

      return {
        success: true,
        message: 'Left challenge successfully. Note: No refund for paid challenges.',
      };
    } catch (error: any) {
      console.error('Error leaving challenge:', error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError('internal', error.message || 'Failed to leave challenge');
    }
  }
);

/**
 * Get challenge posts (progress submissions)
 */
export const getChallengePosts = functions.https.onCall(
  async (
    data: { challengeId: string; limit?: number },
    context
  ): Promise<ChallengeResponse<ChallengePost[]>> => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
      }

      const { challengeId, limit = 50 } = data;
      const actualLimit = Math.min(Math.max(limit, 1), 100);

      const snapshot = await db
        .collection('challenge_posts')
        .where('challengeId', '==', challengeId)
        .where('isVisible', '==', true)
        .orderBy('createdAt', 'desc')
        .limit(actualLimit)
        .get();

      const posts = snapshot.docs.map((doc) => doc.data() as ChallengePost);

      return {
        success: true,
        data: posts,
      };
    } catch (error: any) {
      console.error('Error getting challenge posts:', error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError('internal', error.message || 'Failed to get challenge posts');
    }
  }
);

/**
 * Get user progress in a challenge
 */
export const getChallengeProgress = functions.https.onCall(
  async (data: { challengeId: string }, context): Promise<ChallengeResponse<ChallengeProgress[]>> => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
      }

      const userId = context.auth.uid;
      const { challengeId } = data;

      const snapshot = await db
        .collection('challenge_progress')
        .where('challengeId', '==', challengeId)
        .where('userId', '==', userId)
        .orderBy('taskDate', 'asc')
        .get();

      const progress = snapshot.docs.map((doc) => doc.data() as ChallengeProgress);

      return {
        success: true,
        data: progress,
      };
    } catch (error: any) {
      console.error('Error getting challenge progress:', error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError('internal', error.message || 'Failed to get progress');
    }
  }
);

/**
 * Cancel challenge (creator only)
 * Returns all paid entry fees to participants
 */
export const cancelChallenge = functions.https.onCall(
  async (data: { challengeId: string; reason: string }, context): Promise<ChallengeResponse> => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
      }

      const userId = context.auth.uid;
      const { challengeId, reason } = data;

      // Get challenge
      const challengeDoc = await db.collection('challenges').doc(challengeId).get();
      if (!challengeDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Challenge not found');
      }

      const challenge = challengeDoc.data() as Challenge;

      // Verify creator
      if (challenge.creatorId !== userId) {
        throw new functions.https.HttpsError('permission-denied', 'Only creator can cancel challenge');
      }

      // Get all active participants
      const participantsSnapshot = await db
        .collection('challenge_participants')
        .where('challengeId', '==', challengeId)
        .where('status', '==', ParticipantStatus.ACTIVE)
        .get();

      // Refund all paid entries
      let refundedCount = 0;
      const batch = db.batch();

      for (const doc of participantsSnapshot.docs) {
        const participant = doc.data() as ChallengeParticipant;

        if (participant.paidTokens > 0) {
          // Refund to user
          const userRef = db.collection('users').doc(participant.userId);
          batch.update(userRef, {
            tokenBalance: increment(participant.paidTokens),
          });

          // Deduct from creator
          const creatorRef = db.collection('users').doc(challenge.creatorId);
          batch.update(creatorRef, {
            tokenBalance: increment(-participant.creatorEarnings),
            lifetimeEarnings: increment(-participant.creatorEarnings),
          });

          refundedCount++;
        }

        // Update participant status
        batch.update(doc.ref, {
          status: ParticipantStatus.REMOVED,
          isActive: false,
        });
      }

      // Update challenge status
      batch.update(challengeDoc.ref, {
        status: ChallengeStatus.CANCELLED,
        isActive: false,
        moderationNotes: `Cancelled by creator: ${reason}`,
        updatedAt: serverTimestamp(),
      });

      await batch.commit();

      return {
        success: true,
        message: `Challenge cancelled. Refunded ${refundedCount} participants.`,
      };
    } catch (error: any) {
      console.error('Error cancelling challenge:', error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError('internal', error.message || 'Failed to cancel challenge');
    }
  }
);