'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useParams, useRouter } from 'next/navigation';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';

interface ClubDetails {
  id: string;
  name: string;
  description: string;
  emoji?: string;
  memberCount: number;
  ownerId: string;
  ownerName?: string;
  entryFee: number;
  createdAt?: any;
}

interface ClubPost {
  id: string;
  userId: string;
  displayName: string;
  photoURL?: string;
  content: string;
  createdAt: any;
  likes: number;
}

interface ClubMember {
  userId: string;
  displayName: string;
  photoURL?: string;
  role: string;
  joinedAt: any;
}

export default function ClubDetailPage() {
  const { user } = useAuth();
  const params = useParams();
  const router = useRouter();
  const clubId = params?.clubId as string;

  const [club, setClub] = useState<ClubDetails | null>(null);
  const [posts, setPosts] = useState<ClubPost[]>([]);
  const [members, setMembers] = useState<ClubMember[]>([]);
  const [tab, setTab] = useState<'posts' | 'members' | 'about'>('posts');
  const [postInput, setPostInput] = useState('');
  const [posting, setPosting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clubId) return;

    const loadClub = async () => {
      setLoading(true);
      try {
        const detailsResult = await httpsCallable(functions, 'getClubDetails')({ clubId });
        const data = detailsResult.data as any;
        setClub(data?.club || data || null);
        setMembers(data?.members || []);
      } catch (e) {
        console.error('[ClubDetail] Failed to load club:', e);
      }

      try {
        const postsResult = await httpsCallable(functions, 'getClubPosts')({ clubId });
        const postsData = postsResult.data as any;
        setPosts(postsData?.posts || []);
      } catch (e) {
        console.error('[ClubDetail] Failed to load posts:', e);
      }

      setLoading(false);
    };

    loadClub();
  }, [clubId]);

  const handlePostToClub = async () => {
    if (!postInput.trim() || !clubId) return;
    setPosting(true);
    try {
      await httpsCallable(functions, 'postToClub')({ clubId, content: postInput.trim() });
      setPostInput('');
      // Refresh posts
      const postsResult = await httpsCallable(functions, 'getClubPosts')({ clubId });
      const postsData = postsResult.data as any;
      setPosts(postsData?.posts || []);
    } catch (e) {
      console.error('[ClubDetail] Failed to post:', e);
      alert('Failed to post');
    }
    setPosting(false);
  };

  const handleLeaveClub = async () => {
    if (!confirm('Are you sure you want to leave this club?')) return;
    try {
      await httpsCallable(functions, 'leaveClub')({ clubId });
      router.push('/clubs');
    } catch (e) {
      console.error('[ClubDetail] Failed to leave:', e);
      alert('Failed to leave club');
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto p-4 pb-24">
        <div className="animate-pulse space-y-4">
          <div className="h-32 bg-gray-200 rounded-xl" />
          <div className="h-6 bg-gray-200 rounded w-1/2" />
          <div className="h-4 bg-gray-200 rounded w-3/4" />
        </div>
      </div>
    );
  }

  if (!club) {
    return (
      <div className="max-w-2xl mx-auto p-4 pb-24 text-center">
        <p className="text-gray-500 py-12">Club not found</p>
        <a href="/clubs" className="text-[#E4458F] underline text-sm">
          Back to Clubs
        </a>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 pb-24">
      {/* Club header */}
      <div className="h-32 bg-gradient-to-br from-[#E8593C] to-[#8B5CF6] rounded-xl flex items-center justify-center text-white text-5xl mb-4">
        {club.emoji || '🏠'}
      </div>

      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">{club.name}</h1>
          <p className="text-sm text-gray-500 mt-1">{club.memberCount} members</p>
        </div>
        <button
          onClick={handleLeaveClub}
          className="text-xs text-red-500 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50"
        >
          Leave
        </button>
      </div>

      {club.description && (
        <p className="text-sm text-gray-600 mb-4">{club.description}</p>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b mb-4">
        {[
          { id: 'posts', label: 'Posts' },
          { id: 'members', label: 'Members' },
          { id: 'about', label: 'About' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as 'posts' | 'members' | 'about')}
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

      {/* Posts tab */}
      {tab === 'posts' && (
        <div className="space-y-4">
          {/* Post input */}
          <div className="border rounded-xl p-3">
            <textarea
              value={postInput}
              onChange={(e) => setPostInput(e.target.value)}
              placeholder="Share something with the club..."
              className="w-full border-0 outline-none resize-none text-sm"
              rows={2}
            />
            <div className="flex justify-end mt-2">
              <button
                onClick={handlePostToClub}
                disabled={!postInput.trim() || posting}
                className="px-4 py-1.5 bg-[#E4458F] text-white rounded-lg text-xs font-medium disabled:opacity-50"
              >
                {posting ? 'Posting...' : 'Post'}
              </button>
            </div>
          </div>

          {/* Posts feed */}
          {posts.map((post) => (
            <div key={post.id} className="border rounded-xl p-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
                  {post.photoURL ? (
                    <img
                      src={post.photoURL}
                      alt={post.displayName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-[#E8593C] to-[#8B5CF6] flex items-center justify-center text-white text-xs font-bold">
                      {post.displayName?.charAt(0)}
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium">{post.displayName}</p>
                  <p className="text-[10px] text-gray-400">
                    {post.createdAt?.toDate
                      ? post.createdAt.toDate().toLocaleDateString()
                      : ''}
                  </p>
                </div>
              </div>
              <p className="text-sm text-gray-700">{post.content}</p>
              {post.likes > 0 && (
                <p className="text-xs text-gray-400 mt-2">❤️ {post.likes}</p>
              )}
            </div>
          ))}

          {posts.length === 0 && (
            <p className="text-center text-gray-400 py-8">
              No posts yet. Be the first to share!
            </p>
          )}
        </div>
      )}

      {/* Members tab */}
      {tab === 'members' && (
        <div className="space-y-2">
          {members.map((m) => (
            <a
              href={`/profile/${m.userId}`}
              key={m.userId}
              className="flex items-center gap-3 p-3 border rounded-xl hover:bg-gray-50"
            >
              <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
                {m.photoURL ? (
                  <img
                    src={m.photoURL}
                    alt={m.displayName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-[#E8593C] to-[#8B5CF6] flex items-center justify-center text-white text-sm font-bold">
                    {m.displayName?.charAt(0)}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{m.displayName}</p>
                {m.role && m.role !== 'member' && (
                  <span className="text-[10px] text-[#E4458F] font-medium uppercase">
                    {m.role}
                  </span>
                )}
              </div>
            </a>
          ))}

          {members.length === 0 && (
            <p className="text-center text-gray-400 py-8">No members found</p>
          )}
        </div>
      )}

      {/* About tab */}
      {tab === 'about' && (
        <div className="space-y-4">
          <div className="border rounded-xl p-4">
            <h3 className="font-semibold text-sm mb-2">About this Club</h3>
            <p className="text-sm text-gray-600">
              {club.description || 'No description provided.'}
            </p>
          </div>
          <div className="border rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Members</span>
              <span className="font-medium">{club.memberCount}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Entry fee</span>
              <span className="font-medium">
                {club.entryFee > 0 ? `${club.entryFee} tokens` : 'Free'}
              </span>
            </div>
            {club.ownerName && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Created by</span>
                <span className="font-medium">{club.ownerName}</span>
              </div>
            )}
          </div>
          <p className="text-[10px] text-gray-400 text-center">
            Club monetization: entry fee split 65% creator / 35% platform
          </p>
        </div>
      )}
    </div>
  );
}
