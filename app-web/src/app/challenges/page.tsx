'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';

interface Challenge {
  id: string;
  title: string;
  description: string;
  emoji?: string;
  prizeTokens: number;
  participantCount: number;
  daysLeft: number;
  deadline?: any;
  myProgress?: number;
  joined?: boolean;
  status?: string;
}

export default function ChallengesPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'active' | 'my'>('active');
  const [allChallenges, setAllChallenges] = useState<Challenge[]>([]);
  const [myChallenges, setMyChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadChallenges = async () => {
      setLoading(true);
      try {
        const listResult = await httpsCallable(functions, 'listChallenges')({});
        const data = listResult.data as any;
        setAllChallenges(data?.challenges || []);
      } catch (e) {
        console.error('[Challenges] Failed to list challenges:', e);
      }

      if (user?.uid) {
        try {
          const myResult = await httpsCallable(functions, 'getMyChallenges')({});
          const myData = myResult.data as any;
          setMyChallenges(myData?.challenges || []);
        } catch (e) {
          console.error('[Challenges] Failed to get my challenges:', e);
        }
      }

      setLoading(false);
    };

    loadChallenges();
  }, [user?.uid]);

  const handleJoinChallenge = async (challengeId: string) => {
    try {
      await httpsCallable(functions, 'joinChallenge')({ challengeId });
      alert('Joined challenge!');
      // Refresh
      const myResult = await httpsCallable(functions, 'getMyChallenges')({});
      const myData = myResult.data as any;
      setMyChallenges(myData?.challenges || []);
    } catch (e) {
      console.error('[Challenges] Failed to join:', e);
      alert('Failed to join challenge');
    }
  };

  const isJoined = (challengeId: string) => {
    return myChallenges.some((c) => c.id === challengeId);
  };

  const getMyProgress = (challengeId: string) => {
    const mine = myChallenges.find((c) => c.id === challengeId);
    return mine?.myProgress || 0;
  };

  const renderChallengeCard = (challenge: Challenge) => {
    const joined = isJoined(challenge.id);
    const progress = joined ? getMyProgress(challenge.id) : (challenge.myProgress || 0);

    return (
      <div key={challenge.id} className="p-4 border rounded-xl">
        <div className="flex items-center justify-between mb-2">
          <span className="text-2xl">{challenge.emoji || '🏆'}</span>
          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
            {challenge.daysLeft}d left
          </span>
        </div>
        <h3 className="font-semibold">{challenge.title}</h3>
        <p className="text-xs text-gray-500 mt-1">{challenge.description}</p>
        <div className="flex items-center justify-between mt-3">
          <span className="text-xs">🏆 {challenge.prizeTokens} tokens</span>
          <span className="text-xs text-gray-400">
            {challenge.participantCount} participants
          </span>
        </div>
        <div className="w-full h-1.5 bg-gray-200 rounded-full mt-2">
          <div
            className="h-full bg-[#E4458F] rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <button
          onClick={() => handleJoinChallenge(challenge.id)}
          className="mt-3 w-full py-2 bg-[#E4458F] text-white rounded-lg text-sm font-medium"
        >
          {joined ? 'View Progress' : 'Join Challenge'}
        </button>
      </div>
    );
  };

  return (
    <div className="max-w-2xl mx-auto p-4 pb-24">
      <h1 className="text-2xl font-bold mb-1">Challenges</h1>
      <p className="text-sm text-gray-500 mb-4">
        Complete challenges, earn tokens, climb the leaderboard
      </p>

      {/* Tabs */}
      <div className="flex gap-1 border-b mb-4">
        {[
          { id: 'active', label: 'Active Challenges' },
          { id: 'my', label: 'My Challenges' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as 'active' | 'my')}
            className={`px-4 py-2 text-sm font-medium border-b-2 ${
              tab === t.id
                ? 'border-[#E4458F] text-[#E4458F]'
                : 'border-transparent text-gray-500'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse p-4 border rounded-xl">
              <div className="h-6 bg-gray-200 rounded w-1/3 mb-2" />
              <div className="h-4 bg-gray-200 rounded w-2/3" />
            </div>
          ))}
        </div>
      )}

      {!loading && tab === 'active' && (
        <div className="space-y-3">
          {allChallenges.map(renderChallengeCard)}
          {allChallenges.length === 0 && (
            <p className="text-center text-gray-400 py-8">
              No active challenges right now. Check back soon!
            </p>
          )}
        </div>
      )}

      {!loading && tab === 'my' && (
        <div className="space-y-3">
          {myChallenges.map(renderChallengeCard)}
          {myChallenges.length === 0 && (
            <p className="text-center text-gray-400 py-8">
              You haven&apos;t joined any challenges yet
            </p>
          )}
        </div>
      )}
    </div>
  );
}
