/**
 * PACK 279D - AI Profile Page (Web)
 * Detailed AI Companion profile with pricing and session routing
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { doc, getDoc, collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';

// ============================================================================
// TYPES
// ============================================================================

interface AICompanionProfile {
  id: string;
  name: string;
  avatar: string;
  gender: 'male' | 'female' | 'other';
  language: string;
  style: string[];
  rating: number;
  reviewCount: number;
  creatorType: 'USER_CREATED' | 'AVALO_CREATED';
  creatorId?: string;
  creatorName?: string;
  isRoyalExclusive: boolean;
  description: string;
  personalityPrompt: string;
  chatPrice: number;
  voicePricing: { standard: number; vip: number; royal: number };
  videoPricing: { standard: number; vip: number; royal: number };
}

interface Review {
  id: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  createdAt: Date;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function AIProfilePage() {
  const router = useRouter();
  const params = useParams();
  const companionId = params.id as string;

  const [companion, setCompanion] = useState<AICompanionProfile | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [startingSession, setStartingSession] = useState<'chat' | 'voice' | 'video' | null>(null);

  useEffect(() => {
    if (companionId) {
      loadCompanionProfile();
    }
  }, [companionId]);

  const loadCompanionProfile = async () => {
    try {
      setLoading(true);

      // Load companion data
      const companionRef = doc(db, 'aiCompanions', companionId);
      const companionSnap = await getDoc(companionRef);

      if (!companionSnap.exists()) {
        alert('AI Companion not found');
        router.push('/ai/discovery');
        return;
      }

      const data = companionSnap.data();
      const profile: AICompanionProfile = {
        id: companionSnap.id,
        name: data.name || 'AI Companion',
        avatar: data.avatarUrl || '🤖',
        gender: data.gender || 'other',
        language: data.language || 'en',
        style: data.style || [],
        rating: data.rating || 0,
        reviewCount: data.reviewCount || 0,
        creatorType: data.creatorType || 'AVALO_CREATED',
        creatorId: data.creatorId,
        creatorName: data.creatorName,
        isRoyalExclusive: data.isRoyalExclusive || false,
        description: data.description || '',
        personalityPrompt: data.personalityPrompt || '',
        chatPrice: 100,
        voicePricing: { standard: 10, vip: 7, royal: 5 },
        videoPricing: { standard: 20, vip: 14, royal: 10 },
      };

      setCompanion(profile);

      // Load reviews
      const reviewsRef = collection(db, 'aiCompanionReviews');
      const reviewsQuery = query(
        reviewsRef,
        where('companionId', '==', companionId),
        orderBy('createdAt', 'desc'),
        limit(5)
      );
      const reviewsSnap = await getDocs(reviewsQuery);

      const loadedReviews: Review[] = reviewsSnap.docs.map((doc) => ({
        id: doc.id,
        userId: doc.data().userId,
        userName: doc.data().userName || 'Anonymous',
        rating: doc.data().rating,
        comment: doc.data().comment,
        createdAt: doc.data().createdAt?.toDate() || new Date(),
      }));

      setReviews(loadedReviews);
    } catch (error) {
      console.error('Error loading companion profile:', error);
      alert('Failed to load companion profile');
    } finally {
      setLoading(false);
    }
  };

  const handleStartChat = async () => {
    if (!companion) return;

    try {
      setStartingSession('chat');
      const startChatFn = httpsCallable(functions, 'pack279_aiChatStart');
      const result = await startChatFn({ companionId: companion.id });

      const data = result.data as any;
      if (data.success) {
        router.push(`/ai/chat/${companion.id}`);
      } else {
        alert(data.error || 'Failed to start chat');
      }
    } catch (error: any) {
      console.error('Error starting chat:', error);
      alert(error.message || 'Failed to start chat session');
    } finally {
      setStartingSession(null);
    }
  };

  const handleStartVoice = async () => {
    if (!companion) return;

    try {
      setStartingSession('voice');
      const startVoiceFn = httpsCallable(functions, 'pack279_aiVoiceStart');
      const result = await startVoiceFn({ companionId: companion.id });

      const data = result.data as any;
      if (data.success) {
        router.push(`/ai/voice/${companion.id}`);
      } else {
        alert(data.error || 'Failed to start voice session');
      }
    } catch (error: any) {
      console.error('Error starting voice:', error);
      alert(error.message || 'Failed to start voice session');
    } finally {
      setStartingSession(null);
    }
  };

  const handleStartVideo = async () => {
    if (!companion) return;

    try {
      setStartingSession('video');
      const startVideoFn = httpsCallable(functions, 'pack322_aiVideoStartSession');
      const result = await startVideoFn({
        userId: 'current_user_id', // TODO: Get from auth context
        companionId: companion.id,
      });

      const data = result.data as any;
      if (data.success) {
        router.push(`/ai/video/${companion.id}?sessionId=${data.sessionId}`);
      } else {
        alert(data.error || 'Failed to start video session');
      }
    } catch (error: any) {
      console.error('Error starting video:', error);
      alert(error.message || 'Failed to start video session');
    } finally {
      setStartingSession(null);
    }
  };

  if (loading || !companion) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading AI Profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <button
            onClick={() => router.back()}
            className="text-blue-600 hover:text-blue-700 font-semibold mb-2"
          >
            ← Back
          </button>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">AI Profile</h1>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Profile Info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Profile Header */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-8 shadow">
              <div className="flex items-start gap-6">
                {/* Avatar */}
                <div className="relative">
                  {companion.avatar.startsWith('http') ? (
                    <img
                      src={companion.avatar}
                      alt={companion.name}
                      className="w-32 h-32 rounded-full"
                    />
                  ) : (
                    <div className="text-8xl">{companion.avatar}</div>
                  )}
                  {companion.isRoyalExclusive && (
                    <div className="absolute -bottom-2 -right-2 bg-yellow-400 text-black px-3 py-1 rounded-full text-sm font-bold">
                      👑 Royal Exclusive
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1">
                  <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
                    {companion.name}
                  </h2>

                  {/* Style Badges */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {companion.style.map((style, index) => (
                      <span
                        key={index}
                        className="px-4 py-2 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-sm font-semibold rounded-lg"
                      >
                        {style}
                      </span>
                    ))}
                  </div>

                  {/* Rating */}
                  <div className="flex items-center gap-3">
                    <span className="text-yellow-500 text-xl font-bold">
                      ⭐ {companion.rating.toFixed(1)}
                    </span>
                    <span className="text-gray-600 dark:text-gray-400">
                      ({companion.reviewCount} reviews)
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">About</h3>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                {companion.description}
              </p>
            </div>

            {/* Personality */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Personality</h3>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed italic">
                {companion.personalityPrompt.substring(0, 200)}...
              </p>
            </div>

            {/* Creator Info */}
            {companion.creatorType === 'USER_CREATED' && (
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Creator</h3>
                <p className="text-gray-700 dark:text-gray-300">
                  👤 Created by {companion.creatorName || 'User'}
                </p>
              </div>
            )}

            {/* Reviews */}
            {reviews.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                  Recent Reviews
                </h3>
                <div className="space-y-4">
                  {reviews.map((review) => (
                    <div
                      key={review.id}
                      className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-gray-900 dark:text-white">
                          {review.userName}
                        </span>
                        <span className="text-yellow-500 font-bold">
                          ⭐ {review.rating.toFixed(1)}
                        </span>
                      </div>
                      <p className="text-gray-700 dark:text-gray-300">{review.comment}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Pricing & Actions */}
          <div className="space-y-6">
            {/* Pricing Card */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow sticky top-4">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6">Pricing</h3>

              {/* Chat Pricing */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-gray-900 dark:text-white">
                    💬 Chat
                  </span>
                  <span className="text-lg font-bold text-blue-600">
                    {companion.chatPrice} tokens
                  </span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Per bucket</p>
              </div>

              {/* Voice Pricing */}
              <div className="mb-6">
                <div className="font-semibold text-gray-900 dark:text-white mb-2">
                  🎤 Voice Call
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Standard:</span>
                    <span className="font-semibold">{companion.voicePricing.standard}/min</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">VIP:</span>
                    <span className="font-semibold">{companion.voicePricing.vip}/min</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Royal:</span>
                    <span className="font-semibold">{companion.voicePricing.royal}/min</span>
                  </div>
                </div>
              </div>

              {/* Video Pricing */}
              <div className="mb-8">
                <div className="font-semibold text-gray-900 dark:text-white mb-2">
                  📹 Video Call
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Standard:</span>
                    <span className="font-semibold">{companion.videoPricing.standard}/min</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">VIP:</span>
                    <span className="font-semibold">{companion.videoPricing.vip}/min</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Royal:</span>
                    <span className="font-semibold">{companion.videoPricing.royal}/min</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-3">
                <button
                  onClick={handleStartChat}
                  disabled={startingSession !== null}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {startingSession === 'chat' ? 'Starting...' : '💬 Start Chat'}
                </button>

                <button
                  onClick={handleStartVoice}
                  disabled={startingSession !== null}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {startingSession === 'voice' ? 'Starting...' : '🎤 Voice Call'}
                </button>

                <button
                  onClick={handleStartVideo}
                  disabled={startingSession !== null}
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {startingSession === 'video' ? 'Starting...' : '📹 Video Call'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}