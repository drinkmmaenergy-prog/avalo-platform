'use client';

/**
 * FIX 108: Daily Missions + Streak System
 *
 * Floating card shown on all authenticated pages via AppShell.
 * Reads/writes daily_missions subcollection under users/{uid}.
 * Streak data from users/{uid}.streak.current.
 *
 * INVARIANTS:
 *   - Uses requireDb() canonical guard for Firestore access.
 *   - Uses useAuth() from AuthProvider for user context.
 *   - Actual token credit handled by backend (missions engine).
 *   - Mission progress tracked via trackMissionProgress() helper.
 */

import { useState, useEffect } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { requireDb } from '@/lib/firebase';

/* ─── Mission definitions ──────────────────────────────────────────────── */

const DAILY_MISSIONS = [
  { id: 'like_5', title: 'Like 5 profiles', target: 5, reward: 5, icon: '❤️', action: 'like' },
  { id: 'send_message', title: 'Send a message', target: 1, reward: 3, icon: '💬', action: 'message' },
  { id: 'view_10', title: 'View 10 profiles', target: 10, reward: 3, icon: '👀', action: 'view' },
  { id: 'complete_profile', title: 'Add a new photo', target: 1, reward: 10, icon: '📸', action: 'photo' },
  { id: 'share_app', title: 'Share Avalo with a friend', target: 1, reward: 15, icon: '📤', action: 'share' },
] as const;

/* ─── Types ────────────────────────────────────────────────────────────── */

interface MissionState {
  id: string;
  title: string;
  target: number;
  reward: number;
  icon: string;
  action: string;
  progress: number;
  completed: boolean;
  claimed: boolean;
}

/* ─── Component ────────────────────────────────────────────────────────── */

export default function DailyMissions() {
  const { firebaseUser } = useAuth();
  const [missions, setMissions] = useState<MissionState[]>([]);
  const [streak, setStreak] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [totalReward, setTotalReward] = useState(0);

  useEffect(() => {
    if (!firebaseUser?.uid) return;
    const db = requireDb();
    const todayKey = new Date().toISOString().split('T')[0];

    // Load today's missions
    getDoc(doc(db, 'users', firebaseUser.uid, 'daily_missions', todayKey))
      .then((snap) => {
        const data = snap.data();
        if (data) {
          setMissions(
            DAILY_MISSIONS.map((m) => ({
              ...m,
              progress: data.progress?.[m.id] || 0,
              completed: (data.progress?.[m.id] || 0) >= m.target,
              claimed: data.claimed?.[m.id] || false,
            }))
          );
        } else {
          setMissions(
            DAILY_MISSIONS.map((m) => ({
              ...m,
              progress: 0,
              completed: false,
              claimed: false,
            }))
          );
        }
      })
      .catch(() =>
        setMissions(
          DAILY_MISSIONS.map((m) => ({
            ...m,
            progress: 0,
            completed: false,
            claimed: false,
          }))
        )
      );

    // Load streak
    getDoc(doc(db, 'users', firebaseUser.uid))
      .then((snap) => {
        setStreak(snap.data()?.streak?.current || 0);
      })
      .catch(() => {});
  }, [firebaseUser?.uid]);

  const claimReward = async (missionId: string, reward: number) => {
    if (!firebaseUser?.uid) return;
    const db = requireDb();
    const todayKey = new Date().toISOString().split('T')[0];

    await setDoc(
      doc(db, 'users', firebaseUser.uid, 'daily_missions', todayKey),
      {
        [`claimed.${missionId}`]: true,
      },
      { merge: true }
    );

    setTotalReward((prev) => prev + reward);
    setMissions((prev) =>
      prev.map((m) => (m.id === missionId ? { ...m, claimed: true } : m))
    );
    // Note: actual token credit handled by backend (missions engine)
  };

  const completedCount = missions.filter((m) => m.completed).length;

  // Don't render until missions are loaded
  if (missions.length === 0) return null;

  return (
    <div className="fixed bottom-20 right-4 z-30">
      {/* Collapsed — mission counter */}
      {!expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="bg-gradient-to-r from-[#E8593C] to-[#8B5CF6] text-white rounded-full px-4 py-2 shadow-lg flex items-center gap-2 hover:shadow-xl transition"
        >
          <span>🎯</span>
          <span className="text-sm font-medium">
            {completedCount}/{missions.length}
          </span>
          {streak > 0 && (
            <span className="text-xs bg-white/20 rounded-full px-1.5">
              🔥{streak}
            </span>
          )}
        </button>
      )}

      {/* Expanded — mission list */}
      {expanded && (
        <div className="bg-white rounded-2xl shadow-2xl w-80 max-h-96 overflow-y-auto">
          <div className="p-4 bg-gradient-to-r from-[#E8593C] to-[#8B5CF6] rounded-t-2xl text-white">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold">Daily Missions</h3>
                <p className="text-xs text-white/70">
                  {completedCount}/{missions.length} completed
                </p>
              </div>
              <div className="text-right">
                {streak > 0 && (
                  <p className="text-lg font-bold">🔥 {streak} day streak</p>
                )}
                <button
                  onClick={() => setExpanded(false)}
                  className="text-white/70 text-xs"
                >
                  Close
                </button>
              </div>
            </div>
            {/* Progress bar */}
            <div className="w-full h-1.5 bg-white/20 rounded-full mt-2">
              <div
                className="h-full bg-white rounded-full transition-all"
                style={{
                  width: `${(completedCount / missions.length) * 100}%`,
                }}
              />
            </div>
          </div>

          <div className="p-3 space-y-2">
            {missions.map((m) => (
              <div
                key={m.id}
                className={`flex items-center gap-3 p-2 rounded-xl ${
                  m.completed ? 'bg-green-50' : 'bg-gray-50'
                }`}
              >
                <span className="text-xl">{m.icon}</span>
                <div className="flex-1">
                  <p className="text-sm font-medium">{m.title}</p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1 bg-gray-200 rounded-full">
                      <div
                        className="h-full bg-[#E4458F] rounded-full"
                        style={{
                          width: `${Math.min(100, (m.progress / m.target) * 100)}%`,
                        }}
                      />
                    </div>
                    <span className="text-[10px] text-gray-500">
                      {m.progress}/{m.target}
                    </span>
                  </div>
                </div>
                {m.completed && !m.claimed ? (
                  <button
                    onClick={() => claimReward(m.id, m.reward)}
                    className="px-2 py-1 bg-[#E4458F] text-white rounded-full text-[10px] font-medium animate-pulse"
                  >
                    +{m.reward} 🪙
                  </button>
                ) : m.claimed ? (
                  <span className="text-green-500 text-sm">✓</span>
                ) : null}
              </div>
            ))}

            {/* Streak bonus */}
            {completedCount === missions.length && (
              <div className="p-3 bg-gradient-to-r from-amber-50 to-yellow-50 rounded-xl text-center">
                <p className="text-sm font-bold">🔥 All missions complete!</p>
                <p className="text-xs text-gray-500">
                  Streak bonus: +{Math.min(streak * 2, 20)} tokens tomorrow
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
