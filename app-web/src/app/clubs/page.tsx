'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import EmptyState from '@/components/ui/EmptyState';

export default function ClubsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<'my' | 'browse' | 'create'>('browse');
  const [myClubs, setMyClubs] = useState<any[]>([]);
  const [allClubs, setAllClubs] = useState<any[]>([]);

  useEffect(() => {
    if (!user?.uid) return;
    httpsCallable(functions, 'getMyClubs')({})
      .then((r) => setMyClubs((r.data as any)?.clubs || []))
      .catch(() => {});
    httpsCallable(functions, 'listClubs')({})
      .then((r) => setAllClubs((r.data as any)?.clubs || []))
      .catch(() => {});
  }, [user?.uid]);

  // Create club form state
  const [clubName, setClubName] = useState('');
  const [clubDesc, setClubDesc] = useState('');
  const [clubFee, setClubFee] = useState(0);
  const [creating, setCreating] = useState(false);

  const handleCreateClub = async () => {
    if (!clubName) return;
    setCreating(true);
    try {
      const fn = httpsCallable(functions, 'createClub');
      await fn({ name: clubName, description: clubDesc, entryFee: clubFee });
      alert('Club created!');
      setTab('my');
      // Refresh my clubs
      httpsCallable(functions, 'getMyClubs')({})
        .then((r) => setMyClubs((r.data as any)?.clubs || []))
        .catch(() => {});
    } catch (e) {
      console.error(e);
      alert('Failed');
    }
    setCreating(false);
  };

  const handleJoinClub = async (clubId: string, fee: number) => {
    if (fee > 0 && !confirm(`Join this club? Entry fee: ${fee} tokens`)) return;
    try {
      await httpsCallable(functions, 'joinClub')({ clubId });
      alert('Joined!');
      // Refresh lists
      httpsCallable(functions, 'getMyClubs')({})
        .then((r) => setMyClubs((r.data as any)?.clubs || []))
        .catch(() => {});
    } catch (e) {
      console.error(e);
      alert('Failed to join');
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4 pb-24">
      <h1 className="text-2xl font-bold mb-1">Clubs</h1>
      <p className="text-sm text-gray-500 mb-4">
        Join communities, share content, meet people
      </p>

      <div className="flex gap-1 border-b mb-4">
        {[
          { id: 'browse', label: 'Browse' },
          { id: 'my', label: 'My Clubs' },
          { id: 'create', label: 'Create' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as 'my' | 'browse' | 'create')}
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

      {tab === 'browse' && (
        <div className="grid grid-cols-2 gap-3">
          {allClubs.map((c) => (
            <div key={c.id} className="border rounded-xl overflow-hidden">
              <div className="h-24 bg-gradient-to-br from-[#E8593C] to-[#8B5CF6] flex items-center justify-center text-white text-3xl">
                {c.emoji || '🏠'}
              </div>
              <div className="p-3">
                <p className="font-semibold text-sm">{c.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {c.memberCount || 0} members
                </p>
                <button
                  onClick={() => handleJoinClub(c.id, c.entryFee || 0)}
                  className="mt-2 w-full py-1.5 bg-[#E4458F] text-white rounded-lg text-xs font-medium"
                >
                  {c.entryFee > 0 ? `Join (${c.entryFee} tokens)` : 'Join Free'}
                </button>
              </div>
            </div>
          ))}
          {allClubs.length === 0 && (
            <EmptyState
              icon="🏠"
              title="No clubs yet"
              description="Join communities of people with shared interests."
              actionLabel="Browse Clubs"
              actionHref="/clubs"
            />
          )}
        </div>
      )}

      {tab === 'my' && (
        <div className="space-y-3">
          {myClubs.map((c) => (
            <a
              href={`/clubs/${c.id}`}
              key={c.id}
              className="flex items-center gap-3 p-3 border rounded-xl hover:bg-gray-50"
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#E8593C] to-[#8B5CF6] flex items-center justify-center text-white text-xl">
                {c.emoji || '🏠'}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-sm">{c.name}</p>
                <p className="text-xs text-gray-500">
                  {c.memberCount} members · {c.unreadPosts || 0} new posts
                </p>
              </div>
            </a>
          ))}
          {myClubs.length === 0 && (
            <EmptyState
              icon="🏠"
              title="No clubs yet"
              description="Join communities of people with shared interests."
              actionLabel="Browse Clubs"
              actionHref="/clubs"
            />
          )}
        </div>
      )}

      {tab === 'create' && (
        <div className="space-y-4">
          <input
            value={clubName}
            onChange={(e) => setClubName(e.target.value)}
            placeholder="Club name"
            className="w-full p-2 border rounded-lg"
          />
          <textarea
            value={clubDesc}
            onChange={(e) => setClubDesc(e.target.value)}
            placeholder="Description..."
            className="w-full p-2 border rounded-lg resize-none"
            rows={3}
          />
          <div>
            <label className="text-sm text-gray-600">Entry fee (0 = free)</label>
            <input
              type="number"
              value={clubFee}
              onChange={(e) => setClubFee(Number(e.target.value))}
              min={0}
              className="w-full mt-1 p-2 border rounded-lg"
            />
          </div>
          <button
            onClick={handleCreateClub}
            disabled={!clubName || creating}
            className="w-full py-3 bg-gradient-to-r from-[#E8593C] via-[#E4458F] to-[#8B5CF6] text-white rounded-lg font-medium disabled:opacity-50"
          >
            {creating ? 'Creating...' : 'Create Club'}
          </button>
        </div>
      )}
    </div>
  );
}
