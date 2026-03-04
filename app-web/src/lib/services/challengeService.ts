"use client";

/**
 * Brand Challenges & Rewards Service
 * Handles task-based engagement and token rewards
 */

import { requireDb, requireFunctions } from '../firebase';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  doc,
  getDoc,
  Timestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { BrandChallenge } from '../types';

// ============================================================================
// CHALLENGE DISCOVERY
// ============================================================================

/**
 * Get active challenges
 */
export async function getActiveChallenges(limitCount: number = 20): Promise<BrandChallenge[]> {
  try {
    const now = Timestamp.now();
    const q = query(
      collection(requireDb(), 'brand_challenges'),
      where('startDate', '<=', now),
      where('endDate', '>', now),
      orderBy('startDate', 'desc'),
      limit(limitCount)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as BrandChallenge[];
  } catch (error) {
    console.error('Error getting active challenges:', error);
    throw error;
  }
}

/**
 * Get specific challenge
 */
export async function getChallenge(challengeId: string): Promise<BrandChallenge | null> {
  try {
    const challengeRef = doc(requireDb(), 'brand_challenges', challengeId);
    const challengeSnap = await getDoc(challengeRef);

    if (!challengeSnap.exists()) {
      return null;
    }

    return {
      id: challengeSnap.id,
      ...challengeSnap.data(),
    } as BrandChallenge;
  } catch (error) {
    console.error('Error getting challenge:', error);
    throw error;
  }
}

/**
 * Get user's enrolled challenges
 */
export async function getUserChallenges(userId: string): Promise<any[]> {
  try {
    const q = query(
      collection(requireDb(), 'user_challenges'),
      where('userId', '==', userId),
      where('status', 'in', ['active', 'completed']),
      orderBy('enrolledAt', 'desc'),
      limit(50)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
  } catch (error) {
    console.error('Error getting user challenges:', error);
    throw error;
  }
}

// ============================================================================
// ENROLLMENT
// ============================================================================

/**
 * Enroll in challenge
 */
export async function enrollInChallenge(params: {
  userId: string;
  challengeId: string;
}): Promise<{
  success: boolean;
  enrollmentId?: string;
  error?: string;
}> {
  try {
    const enroll = httpsCallable<typeof params, {
      success: boolean;
      enrollmentId: string;
    }>(requireFunctions(), 'enrollInChallenge');
    
    const result = await enroll(params);
    return result.data;
  } catch (error: any) {
    console.error('Error enrolling in challenge:', error);
    return {
      success: false,
      error: error.message || 'Failed to enroll in challenge',
    };
  }
}

// ============================================================================
// TASK COMPLETION
// ============================================================================

/**
 * Complete a challenge task
 */
export async function completeTask(params: {
  userId: string;
  challengeId: string;
  taskId: string;
  proof?: string; // Optional proof of completion (URL, screenshot, etc.)
}): Promise<{
  success: boolean;
  tokensEarned?: number;
  challengeCompleted?: boolean;
  error?: string;
}> {
  try {
    const complete = httpsCallable<typeof params, {
      success: boolean;
      tokensEarned: number;
      challengeCompleted: boolean;
    }>(requireFunctions(), 'completeChallengeTask');
    
    const result = await complete(params);
    return result.data;
  } catch (error: any) {
    console.error('Error completing task:', error);
    return {
      success: false,
      error: error.message || 'Failed to complete task',
    };
  }
}

/**
 * Verify task completion (for automated tasks)
 */
export async function verifyTaskCompletion(params: {
  userId: string;
  challengeId: string;
  taskId: string;
  taskType: 'view' | 'engage' | 'share' | 'create';
  metadata?: Record<string, any>;
}): Promise<{
  verified: boolean;
  tokensEarned?: number;
}> {
  try {
    const verify = httpsCallable<typeof params, {
      verified: boolean;
      tokensEarned: number;
    }>(requireFunctions(), 'verifyChallengeTask');
    
    const result = await verify(params);
    return result.data;
  } catch (error) {
    console.error('Error verifying task:', error);
    return { verified: false };
  }
}

// ============================================================================
// REWARDS
// ============================================================================

/**
 * Claim challenge reward
 */
export async function claimReward(params: {
  userId: string;
  challengeId: string;
}): Promise<{
  success: boolean;
  tokensAwarded?: number;
  error?: string;
}> {
  try {
    const claim = httpsCallable<typeof params, {
      success: boolean;
      tokensAwarded: number;
    }>(requireFunctions(), 'claimChallengeReward');
    
    const result = await claim(params);
    return result.data;
  } catch (error: any) {
    console.error('Error claiming reward:', error);
    return {
      success: false,
      error: error.message || 'Failed to claim reward',
    };
  }
}

/**
 * Get reward history
 */
export async function getRewardHistory(userId: string, limitCount: number = 50): Promise<any[]> {
  try {
    const q = query(
      collection(requireDb(), 'challenge_rewards'),
      where('userId', '==', userId),
      orderBy('claimedAt', 'desc'),
      limit(limitCount)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
  } catch (error) {
    console.error('Error getting reward history:', error);
    throw error;
  }
}

// ============================================================================
// PROGRESS TRACKING
// ============================================================================

/**
 * Get challenge progress
 */
export async function getChallengeProgress(params: {
  userId: string;
  challengeId: string;
}): Promise<{
  tasksCompleted: number;
  totalTasks: number;
  tokensEarned: number;
  isComplete: boolean;
}> {
  try {
    const getProgress = httpsCallable<typeof params, {
      tasksCompleted: number;
      totalTasks: number;
      tokensEarned: number;
      isComplete: boolean;
    }>(requireFunctions(), 'getChallengeProgress');
    
    const result = await getProgress(params);
    return result.data;
  } catch (error) {
    console.error('Error getting challenge progress:', error);
    return {
      tasksCompleted: 0,
      totalTasks: 0,
      tokensEarned: 0,
      isComplete: false,
    };
  }
}

// ============================================================================
// LEADERBOARDS
// ============================================================================

/**
 * Get challenge leaderboard
 */
export async function getChallengeLeaderboard(params: {
  challengeId: string;
  limitCount?: number;
}): Promise<Array<{
  userId: string;
  displayName: string;
  photoURL?: string;
  tasksCompleted: number;
  tokensEarned: number;
  rank: number;
}>> {
  try {
    const getLeaderboard = httpsCallable<typeof params, {
      leaderboard: Array<{
        userId: string;
        displayName: string;
        photoURL?: string;
        tasksCompleted: number;
        tokensEarned: number;
        rank: number;
      }>;
    }>(requireFunctions(), 'getChallengeLeaderboard');
    
    const result = await getLeaderboard(params);
    return result.data.leaderboard;
  } catch (error) {
    console.error('Error getting leaderboard:', error);
    return [];
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if challenge is active
 */
export function isChallengeActive(challenge: BrandChallenge): boolean {
  const now = Date.now();
  const start = challenge.startDate.toMillis();
  const end = challenge.endDate.toMillis();
  return now >= start && now < end;
}

/**
 * Get time remaining
 */
export function getTimeRemaining(challenge: BrandChallenge): string {
  const now = Date.now();
  const end = challenge.endDate.toMillis();
  const diff = end - now;

  if (diff <= 0) {
    return 'Ended';
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  if (days > 0) {
    return `${days}d ${hours}h remaining`;
  }

  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m remaining`;
}

/**
 * Calculate completion percentage
 */
export function calculateCompletionPercentage(tasksCompleted: number, totalTasks: number): number {
  if (totalTasks === 0) return 0;
  return Math.round((tasksCompleted / totalTasks) * 100);
}
