'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { collection, query, orderBy, limit, getDocs, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Avatar } from '@/components/ui/Avatar';
import { LeaderboardRowSkeleton, SkeletonList } from '@/components/ui/Skeleton';

const TABS = [
  { id: 'top_earners', label: 'Top Earners', icon: '💰' },
  { id: 'most_popular', label: 'Most Popular', icon: '🔥' },
  { id: 'top_creators', label: 'Top Creators', icon: '⭐' },
  { id: 'rising', label: 'Rising Stars', icon: '🚀' },
];

export default function LeaderboardPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('most_popular');
  const [leaders, setLeaders] = useState<any[]>([]);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [period, setPeriod] = useState<'weekly' | 'monthly' | 'alltime'>('weekly');

  useEffect(() => {
    const load = async () => {
      let sortField = 'profileScore';
      if (tab === 'top_earners') sortField = 'totalEarned';
      if (tab === 'top_creators') sortField = 'followerCount';
      if (tab === 'rising') sortField = 'weeklyGrowth';

      // Try leaderboard collection first, fallback to public_profiles
      try {
        const q = query(
          collection(db, 'leaderboards', period, tab),
          orderBy('score', 'desc'),
          limit(50),
        );
        const snap = await getDocs(q);
        if (snap.size > 0) {
          setLeaders(snap.docs.map((d, i) => ({ rank: i + 1, ...d.data() })));
          const myEntry = snap.docs.findIndex((d) => d.data().userId === user?.uid);
          setMyRank(myEntry >= 0 ? myEntry + 1 : null);
          return;
        }
      } catch {
        // Leaderboard collection may not exist yet; fall through to fallback
      }

      // Fallback: use public_profiles sorted by score
      const q = query(
        collection(db, 'public_profiles'),
        where('discoverable', '==', true),
        orderBy(sortField, 'desc'),
        limit(50),
      );
      const snap = await getDocs(q).catch(() => ({ docs: [] as any[] }));
      setLeaders(snap.docs.map((d: any, i: number) => ({ rank: i + 1, uid: d.id, ...d.data() })));
    };
    load();
  }, [tab, period, user?.uid]);

  const getRankBadge = (rank: number) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `#${rank}`;
  };

  return (
    <div className="max-w-2xl mx-auto p-4 pb-24">
      <h1 className="text-2xl font-bold mb-1">Leaderboard</h1>
      <p className="text-sm text-gray-500 mb-4">See who&apos;s on top</p>

      {/* Period selector */}
      <div className="flex gap-2 mb-4">
        {[
          { id: 'weekly', label: 'This Week' },
          { id: 'monthly', label: 'This Month' },
          { id: 'alltime', label: 'All Time' },
        ].map((p) => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id as 'weekly' | 'monthly' | 'alltime')}
            className={`px-3 py-1 rounded-full text-xs ${
              period === p.id ? 'bg-[#E4458F] text-white' : 'bg-gray-100'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Category tabs */}
      <div className="flex gap-1 overflow-x-auto border-b mb-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 ${
              tab === t.id
                ? 'border-[#E4458F] text-[#E4458F]'
                : 'border-transparent text-gray-500'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* My rank banner */}
      {myRank && (
        <div className="p-3 bg-gradient-to-r from-[#E8593C]/10 to-[#8B5CF6]/10 rounded-xl mb-4 flex items-center justify-between">
          <span className="text-sm">Your rank</span>
          <span className="font-bold text-lg">{getRankBadge(myRank)}</span>
        </div>
      )}

      {/* Leaderboard list */}
      <div className="space-y-2">
        {leaders.map((l) => (
          <a
            href={`/profile/${l.uid || l.userId}`}
            key={l.uid || l.userId}
            className="flex items-center gap-3 p-3 border rounded-xl hover:bg-gray-50"
          >
            <span className="w-8 text-center font-bold text-sm">
              {getRankBadge(l.rank)}
            </span>
            <Avatar src={l.photoURL} name={l.displayName} size={40} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {l.displayName || 'User'}
              </p>
              <p className="text-xs text-gray-500">{l.city || ''}</p>
            </div>
            <span className="text-sm font-semibold text-[#E4458F]">
              {l.score || l.followerCount || 0}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
