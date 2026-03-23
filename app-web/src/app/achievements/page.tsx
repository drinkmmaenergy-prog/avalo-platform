'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

/**
 * Achievement types from backend (pack112-achievements.ts):
 * - First Match 💝
 * - First Message ✉️
 * - 10 Matches 🔥
 * - 100 Messages 📨
 * - First Earning 💰
 * - Verified ✅
 * - Royal Member 👑
 * - Event Host 🎪
 * - 1000 Tokens Earned 💎
 * - Content Creator 📸
 * - Super Connector (50 matches) 🌟
 * - First Live Session 📡
 */

const ALL_ACHIEVEMENTS = [
  { id: 'first_match', name: 'First Match', emoji: '💝', description: 'Get your first match' },
  { id: 'first_message', name: 'First Message', emoji: '✉️', description: 'Send your first message' },
  { id: '10_matches', name: '10 Matches', emoji: '🔥', description: 'Reach 10 matches' },
  { id: '100_messages', name: '100 Messages', emoji: '📨', description: 'Send 100 messages' },
  { id: 'first_earning', name: 'First Earning', emoji: '💰', description: 'Earn your first tokens' },
  { id: 'verified', name: 'Verified', emoji: '✅', description: 'Complete identity verification' },
  { id: 'royal_member', name: 'Royal Member', emoji: '👑', description: 'Reach Royal Club status' },
  { id: 'event_host', name: 'Event Host', emoji: '🎪', description: 'Host your first event' },
  { id: '1000_tokens', name: '1000 Tokens', emoji: '💎', description: 'Earn 1,000 tokens total' },
  { id: 'content_creator', name: 'Content Creator', emoji: '📸', description: 'Publish your first content' },
  { id: 'super_connector', name: 'Super Connector', emoji: '🌟', description: 'Reach 50 matches' },
  { id: 'first_live', name: 'First Live', emoji: '📡', description: 'Start your first live session' },
];

interface UserAchievement {
  id: string;
  name: string;
  emoji: string;
  description?: string;
  unlockedAt?: any;
  unlocked: boolean;
}

export default function AchievementsPage() {
  const { user } = useAuth();
  const [achievements, setAchievements] = useState<UserAchievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [unlockedCount, setUnlockedCount] = useState(0);

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      return;
    }

    const loadAchievements = async () => {
      setLoading(true);
      const unlockedIds = new Set<string>();
      const unlockedMap = new Map<string, any>();

      // Try users/{uid}/achievements subcollection first
      try {
        const subColSnap = await getDocs(collection(db, 'users', user.uid, 'achievements'));
        subColSnap.docs.forEach((d) => {
          unlockedIds.add(d.id);
          unlockedMap.set(d.id, d.data());
        });
      } catch {
        // subcollection may not exist
      }

      // Also try achievements/{uid} document
      if (unlockedIds.size === 0) {
        try {
          const docSnap = await getDoc(doc(db, 'achievements', user.uid));
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data?.badges && Array.isArray(data.badges)) {
              data.badges.forEach((b: any) => {
                unlockedIds.add(b.id || b);
                unlockedMap.set(b.id || b, b);
              });
            }
            // Also handle map-style achievements
            Object.entries(data || {}).forEach(([key, val]) => {
              if (key !== 'badges' && typeof val === 'object' && val !== null) {
                unlockedIds.add(key);
                unlockedMap.set(key, val);
              }
            });
          }
        } catch {
          // document may not exist
        }
      }

      // Merge with known achievements
      const merged: UserAchievement[] = ALL_ACHIEVEMENTS.map((a) => ({
        ...a,
        unlocked: unlockedIds.has(a.id),
        unlockedAt: unlockedMap.get(a.id)?.unlockedAt || null,
      }));

      setAchievements(merged);
      setUnlockedCount(merged.filter((a) => a.unlocked).length);
      setLoading(false);
    };

    loadAchievements();
  }, [user?.uid]);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto p-4 pb-24">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3" />
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-24 bg-gray-200 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 pb-24">
      <h1 className="text-2xl font-bold mb-1">Achievements</h1>
      <p className="text-sm text-gray-500 mb-4">
        {unlockedCount} of {ALL_ACHIEVEMENTS.length} unlocked
      </p>

      {/* Progress bar */}
      <div className="w-full h-2 bg-gray-200 rounded-full mb-6">
        <div
          className="h-full bg-gradient-to-r from-[#E8593C] via-[#E4458F] to-[#8B5CF6] rounded-full transition-all"
          style={{
            width: `${(unlockedCount / ALL_ACHIEVEMENTS.length) * 100}%`,
          }}
        />
      </div>

      {/* Unlocked achievements */}
      {achievements.filter((a) => a.unlocked).length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Unlocked</h2>
          <div className="flex gap-2 overflow-x-auto py-2 mb-6">
            {achievements
              .filter((a) => a.unlocked)
              .map((a) => (
                <div
                  key={a.id}
                  className="flex-shrink-0 w-16 text-center"
                  title={a.name}
                >
                  <div className="w-12 h-12 rounded-full mx-auto flex items-center justify-center text-xl bg-yellow-100">
                    {a.emoji}
                  </div>
                  <p className="text-[9px] text-gray-500 mt-0.5 truncate">
                    {a.name}
                  </p>
                </div>
              ))}
          </div>
        </>
      )}

      {/* All achievements grid */}
      <h2 className="text-sm font-semibold text-gray-700 mb-3">All Achievements</h2>
      <div className="grid grid-cols-2 gap-3">
        {achievements.map((a) => (
          <div
            key={a.id}
            className={`p-4 border rounded-xl ${
              a.unlocked
                ? 'border-amber-400 bg-amber-50/50'
                : 'opacity-50'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center text-xl ${
                  a.unlocked ? 'bg-yellow-100' : 'bg-gray-100'
                }`}
              >
                {a.emoji}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{a.name}</p>
                <p className="text-xs text-gray-500">{a.description}</p>
              </div>
            </div>
            {a.unlocked && (
              <div className="mt-2 text-[10px] text-amber-600 font-medium">
                ✓ Unlocked
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
