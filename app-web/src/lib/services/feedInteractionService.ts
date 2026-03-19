"use client";

/**
 * Feed Interaction Service
 * Handles follow/unfollow, tipping, and social interactions for the feed.
 *
 * Firestore collections:
 *   - follows: { followerId, followingId, createdAt }
 *   - tips:    { senderId, recipientId, postId, amount, createdAt }
 *
 * Cloud Functions:
 *   - sendChatGift (existing) — used for chat context only
 *   - For feed tips: direct Firestore write + wallet deduction via callable
 */

import { requireDb, requireFunctions } from '../firebase';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  addDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

// ============================================================================
// FOLLOW / UNFOLLOW
// ============================================================================

/**
 * Follow a user.
 * Document ID: `{followerId}_{followingId}` for idempotent writes.
 */
export async function followUser(
  followerId: string,
  followingId: string
): Promise<void> {
  if (followerId === followingId) return;

  const followDocId = `${followerId}_${followingId}`;
  const followRef = doc(requireDb(), 'follows', followDocId);

  await setDoc(followRef, {
    followerId,
    followingId,
    createdAt: serverTimestamp(),
  });
}

/**
 * Unfollow a user.
 */
export async function unfollowUser(
  followerId: string,
  followingId: string
): Promise<void> {
  const followDocId = `${followerId}_${followingId}`;
  const followRef = doc(requireDb(), 'follows', followDocId);

  await deleteDoc(followRef);
}

/**
 * Check if currentUser follows targetUser.
 */
export async function checkIsFollowing(
  followerId: string,
  followingId: string
): Promise<boolean> {
  const followDocId = `${followerId}_${followingId}`;
  const followRef = doc(requireDb(), 'follows', followDocId);
  const snap = await getDoc(followRef);
  return snap.exists();
}

/**
 * Batch check which user IDs the current user is following.
 * Returns a Record<userId, boolean>.
 */
export async function batchCheckFollowing(
  followerId: string,
  targetUserIds: string[]
): Promise<Record<string, boolean>> {
  const result: Record<string, boolean> = {};
  if (!followerId || targetUserIds.length === 0) return result;

  const uniqueIds = [...new Set(targetUserIds)];

  const checks = uniqueIds.map(async (targetId) => {
    const followDocId = `${followerId}_${targetId}`;
    const followRef = doc(requireDb(), 'follows', followDocId);
    const snap = await getDoc(followRef);
    result[targetId] = snap.exists();
  });

  await Promise.all(checks);
  return result;
}

/**
 * Get the list of user IDs that `followerId` is following.
 * Used for feed ordering (followed-first).
 */
export async function getFollowingIds(followerId: string): Promise<string[]> {
  try {
    const q = query(
      collection(requireDb(), 'follows'),
      where('followerId', '==', followerId)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data().followingId as string);
  } catch (error) {
    console.error('Error getting following IDs:', error);
    return [];
  }
}

// ============================================================================
// TIPPING
// ============================================================================

export interface SendFeedTipParams {
  senderId: string;
  recipientId: string;
  postId: string;
  amount: number;
}

export interface SendFeedTipResult {
  success: boolean;
  error?: string;
}

/**
 * Send a tip on a feed post.
 *
 * Strategy:
 * 1. Try calling the `sendFeedTip` Cloud Function (if deployed).
 * 2. Fallback: write to `tips` collection directly.
 *    Note: wallet deduction must happen server-side for security.
 *    The direct-write fallback records the intent; a backend trigger
 *    should process the deduction.
 */
export async function sendFeedTip(
  params: SendFeedTipParams
): Promise<SendFeedTipResult> {
  try {
    // Attempt callable first (preferred — handles wallet deduction atomically)
    const sendTipFn = httpsCallable<
      SendFeedTipParams,
      { success: boolean; error?: string }
    >(requireFunctions(), 'sendFeedTip');

    const result = await sendTipFn(params);
    return result.data;
  } catch (callableError: any) {
    // If the callable doesn't exist yet, fall back to direct Firestore write
    if (
      callableError?.code === 'not-found' ||
      callableError?.code === 'unimplemented' ||
      callableError?.message?.includes('not found')
    ) {
      console.warn(
        '[feedInteractionService] sendFeedTip callable not deployed, falling back to direct write'
      );
      return await sendFeedTipDirect(params);
    }

    console.error('[feedInteractionService] sendFeedTip error:', callableError);
    return {
      success: false,
      error: callableError?.message || 'Failed to send tip',
    };
  }
}

/**
 * Direct Firestore write fallback for tips.
 * Creates a tip record in the `tips` collection.
 * A backend Cloud Function trigger should process wallet deduction.
 */
async function sendFeedTipDirect(
  params: SendFeedTipParams
): Promise<SendFeedTipResult> {
  try {
    await addDoc(collection(requireDb(), 'tips'), {
      senderId: params.senderId,
      recipientId: params.recipientId,
      postId: params.postId,
      amount: params.amount,
      type: 'feed_tip',
      status: 'pending',
      createdAt: serverTimestamp(),
    });

    return { success: true };
  } catch (error: any) {
    console.error('[feedInteractionService] Direct tip write failed:', error);
    return {
      success: false,
      error: error?.message || 'Failed to record tip',
    };
  }
}
