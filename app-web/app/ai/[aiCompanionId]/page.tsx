/**
 * PACK 340 - AI Profile Page (Web)
 * View AI companion details and start sessions
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  getAICompanion,
  createAIChatSession,
  type AICompanion,
  type SessionType,
  formatTokens,
  formatRating,
  getCreatorBadge,
  calculateEffectivePrice,
} from '../../../../packages/ui-ai';

export default function AIProfilePage({ params }: { params: { aiCompanionId: string } }) {
  const [companion, setCompanion] = useState<AICompanion | null>(null);
  const [loading, setLoading] = useState(true);
  const [startingSession, setStartingSession] = useState(false);

  // Mock user tier and token balance - in production, fetch from context/state
  const userTier = { tier: 'FREE' as const, ageVerified: true, kycVerified: true };
  const tokenBalance = 5000; // mock

  useEffect(() => {
    loadCompanion();
  }, [params.aiCompanionId]);

  const loadCompanion = async () => {
    try {
      setLoading(true);
      const data = await getAICompanion(params.aiCompanionId);
      setCompanion(data);
    } catch (error) {
      console.error('Error loading companion:', error);
    } finally {
      setLoading(false);
    }
  };

  const startSession = async (sessionType: SessionType) => {
    if (!companion) return;

    // Check age verification
    if (!userTier.ageVerified) {
      alert('Age verification required. You must be 18+ to use AI companions.');
      return;
    }

    // Calculate price
    let basePrice = 0;
    if (sessionType === 'CHAT') basePrice = companion.chatBucketPrice;
    else if (sessionType === 'VOICE') basePrice = companion.voicePricePerMinute;
    else if (sessionType === 'VIDEO') basePrice = companion.videoPricePerMinute;

    const { price, discount } = calculateEffectivePrice(basePrice, sessionType, userTier);

    // Check balance
    if (tokenBalance < price) {
      if (confirm(`Insufficient tokens. You need ${formatTokens(price)} tokens. Buy more?`)) {
        window.location.href = '/wallet';
      }
      return;
    }

    // Confirm
    const confirmMsg = `Start ${sessionType} session?\n\nPrice: ${formatTokens(price)} tokens${discount > 0 ? ` (-${discount}%)` : ''}\n\n⚠️ No refund after session start\nYour balance: ${formatTokens(tokenBalance)} tokens`;

    if (!confirm(confirmMsg)) return;

    try {
      setStartingSession(true);
      const session = await createAIChatSession(params.aiCompanionId, sessionType);
      window.location.href = `/ai/chat/${session.sessionId}`;
    } catch (error) {
      console.error('Error starting session:', error);
      alert('Failed to start session');
    } finally {
      setStartingSession(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!companion) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-xl text-gray-600">AI companion not found</p>
      </div>
    );
  }

  const badge = getCreatorBadge(companion);
  const chatPrice = calculateEffectivePrice(companion.chatBucketPrice, 'CHAT', userTier);
  const voicePrice = calculateEffectivePrice(companion.voicePricePerMinute, 'VOICE', userTier);
  const videoPrice = calculateEffectivePrice(companion.videoPricePerMinute, 'VIDEO', userTier);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="flex flex-col items-center">
            <div className="relative w-32 h-32 rounded-full overflow-hidden bg-gray-200 mb-4">
              <Image src={companion.avatarUrl} alt={companion.name} fill className="object-cover" />
            </div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">{companion.name}</h1>
            <span
              className="px-4 py-2 text-sm font-bold text-white rounded-lg mb-2"
              style={{ backgroundColor: badge.color }}
            >
              {badge.text}
            </span>
            <p className="text-lg text-gray-600">🌐 {companion.language.toUpperCase()}</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Bio */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-6">
          <p className="text-lg text-gray-700 leading-relaxed">{companion.shortBio}</p>
        </div>

        {/* Style Tags */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Style</h2>
          <div className="flex flex-wrap gap-2">
            {companion.styleTags.map((tag, idx) => (
              <span key={idx} className="px-4 py-2 bg-blue-50 text-blue-600 rounded-full text-sm font-medium">
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Stats</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-gray-50 rounded-lg text-center">
              <p className="text-3xl font-bold text-gray-900 mb-1">{companion.totalChats}</p>
              <p className="text-sm text-gray-600">Total Chats</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg text-center">
              <p className="text-3xl font-bold text-gray-900 mb-1">{formatRating(companion.averageRating)}</p>
              <p className="text-sm text-gray-600">Rating</p>
            </div>
          </div>
        </div>

        {/* Pricing */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Pricing</h2>

          {/* Chat */}
          <div className="p-4 bg-gray-50 rounded-lg mb-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-lg font-semibold text-gray-900">💬 Text Chat</span>
              {chatPrice.discount > 0 && (
                <span className="px-3 py-1 bg-green-500 text-white text-xs font-bold rounded">
                  -{chatPrice.discount}%
                </span>
              )}
            </div>
            <p className="text-2xl font-bold text-blue-600">{formatTokens(chatPrice.price)} tokens / bucket</p>
            <p className="text-sm text-gray-600">({companion.wordsPerBucket} words)</p>
          </div>

          {/* Voice */}
          <div className="p-4 bg-gray-50 rounded-lg mb-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-lg font-semibold text-gray-900">🎤 Voice Call</span>
              {voicePrice.discount > 0 && (
                <span className="px-3 py-1 bg-yellow-400 text-black text-xs font-bold rounded">
                  VIP -{voicePrice.discount}%
                </span>
              )}
            </div>
            <p className="text-2xl font-bold text-blue-600">{formatTokens(voicePrice.price)} tokens / minute</p>
            {voicePrice.discount > 0 && (
              <p className="text-sm text-gray-500 line-through">{formatTokens(companion.voicePricePerMinute)} tokens</p>
            )}
          </div>

          {/* Video */}
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-lg font-semibold text-gray-900">📹 Video Call</span>
              {videoPrice.discount > 0 && (
                <span className="px-3 py-1 bg-yellow-400 text-black text-xs font-bold rounded">
                  VIP -{videoPrice.discount}%
                </span>
              )}
            </div>
            <p className="text-2xl font-bold text-blue-600">{formatTokens(videoPrice.price)} tokens / minute</p>
            {videoPrice.discount > 0 && (
              <p className="text-sm text-gray-500 line-through">{formatTokens(companion.videoPricePerMinute)} tokens</p>
            )}
          </div>
        </div>

        {/* Legal Banner */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-yellow-800 text-center">
            ⚠️ AI interaction · 18+ only · Tokens required · No refunds after session start
          </p>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={() => startSession('CHAT')}
            disabled={startingSession}
            className="px-6 py-4 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            💬 Start Chat
          </button>
          <button
            onClick={() => startSession('VOICE')}
            disabled={startingSession}
            className="px-6 py-4 bg-white text-blue-600 border-2 border-blue-600 rounded-lg font-semibold hover:bg-blue-50 transition-colors disabled:opacity-50"
          >
            🎤 Start Voice
          </button>
          <button
            onClick={() => startSession('VIDEO')}
            disabled={startingSession}
            className="px-6 py-4 bg-white text-blue-600 border-2 border-blue-600 rounded-lg font-semibold hover:bg-blue-50 transition-colors disabled:opacity-50"
          >
            📹 Start Video
          </button>
        </div>

        <div className="h-12"></div>
      </div>
    </div>
  );
}
