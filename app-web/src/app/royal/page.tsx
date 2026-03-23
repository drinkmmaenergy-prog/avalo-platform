'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

/**
 * Royal Club levels (from royalEngine.ts / pack253-royal):
 * none → bronze → silver → gold → royal
 *
 * Score increases with activity: messages sent, matches, events attended, tokens spent.
 */

const ROYAL_LEVELS = [
  {
    level: 'Bronze',
    score: 20,
    perks: ['Visibility boost in Discover', 'Bronze badge'],
  },
  {
    level: 'Silver',
    score: 40,
    perks: ['Early chat invitations', '+0.5 queue priority', 'Silver badge'],
  },
  {
    level: 'Gold',
    score: 60,
    perks: ['+1.0 queue priority', 'Romantic conversation starters', 'Gold badge'],
  },
  {
    level: 'Royal',
    score: 80,
    perks: [
      '+2.0 queue priority',
      'Exclusive badge',
      'Early story access',
      '6 tokens/min voice calls (vs 10)',
      '10 tokens/min video (vs 15)',
      '5 free AI messages (vs 3)',
    ],
  },
];

function getLevelFromScore(score: number): string {
  if (score >= 80) return 'royal';
  if (score >= 60) return 'gold';
  if (score >= 40) return 'silver';
  if (score >= 20) return 'bronze';
  return 'none';
}

function getLevelEmoji(level: string): string {
  switch (level) {
    case 'royal':
      return '👑';
    case 'gold':
      return '🥇';
    case 'silver':
      return '🥈';
    case 'bronze':
      return '🥉';
    default:
      return '⚪';
  }
}

export default function RoyalPage() {
  const { user } = useAuth();
  const [vipScore, setVipScore] = useState(0);
  const [userLevel, setUserLevel] = useState('none');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      return;
    }

    const loadRoyalStatus = async () => {
      setLoading(true);

      // Try royal_scores/{uid} or users/{uid} for vipScore
      try {
        const royalDoc = await getDoc(doc(db, 'royal_scores', user.uid));
        if (royalDoc.exists()) {
          const data = royalDoc.data();
          const score = data?.score || data?.vipScore || 0;
          setVipScore(score);
          setUserLevel(data?.level || getLevelFromScore(score));
          setLoading(false);
          return;
        }
      } catch {
        // collection may not exist
      }

      // Fallback: check users/{uid} for vipScore field
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          const score = data?.vipScore || data?.royalScore || 0;
          setVipScore(score);
          setUserLevel(data?.royalLevel || data?.vipLevel || getLevelFromScore(score));
        }
      } catch {
        // ignore
      }

      setLoading(false);
    };

    loadRoyalStatus();
  }, [user?.uid]);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto p-4 pb-24">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3" />
          <div className="h-32 bg-gray-200 rounded-xl" />
          <div className="h-24 bg-gray-200 rounded-xl" />
          <div className="h-24 bg-gray-200 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 pb-24">
      <div className="space-y-4">
        <h2 className="text-xl font-bold">Royal Club</h2>

        {/* Current level */}
        <div className="p-4 bg-gradient-to-r from-amber-100 to-yellow-100 rounded-xl">
          <p className="text-sm text-amber-800">Your level</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-2xl">{getLevelEmoji(userLevel)}</span>
            <p className="text-2xl font-bold text-amber-900">
              {userLevel?.toUpperCase() || 'NONE'}
            </p>
          </div>
          <p className="text-xs text-amber-700 mt-1">Score: {vipScore}/100</p>
          <div className="w-full h-2 bg-amber-200 rounded-full mt-2">
            <div
              className="h-full bg-amber-600 rounded-full transition-all"
              style={{ width: `${Math.min(vipScore, 100)}%` }}
            />
          </div>
        </div>

        {/* Level benefits */}
        {ROYAL_LEVELS.map((l) => (
          <div
            key={l.level}
            className={`p-4 border rounded-xl ${
              vipScore >= l.score
                ? 'border-amber-400 bg-amber-50/50'
                : 'opacity-60'
            }`}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{l.level}</h3>
              <span className="text-xs">{l.score}+ points</span>
            </div>
            <ul className="text-xs text-gray-600 mt-2 space-y-1">
              {l.perks.map((p) => (
                <li key={p}>✓ {p}</li>
              ))}
            </ul>
          </div>
        ))}

        <p className="text-xs text-gray-400 text-center">
          Score increases with activity: messages sent, matches, events attended,
          tokens spent.
        </p>
      </div>
    </div>
  );
}
