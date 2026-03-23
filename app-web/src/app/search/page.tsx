'use client';

/**
 * Global Search Page — FIX 98
 * Route: /search
 *
 * Unified search across: People, Posts, Reels, Events, Clubs, AI Bots.
 * Supports query param `?q=` for deep-linking from hashtag clicks.
 *
 * Backend: pack294-discovery-search, pack294-profile-search.
 * PACK domain: discovery-search.
 */

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';

import { useAuth } from '@/components/providers/AuthProvider';
import { requireDb } from '@/lib/firebase';
import EmptyState from '@/components/ui/EmptyState';

const TABS = ['People', 'Posts', 'Reels', 'Events', 'Clubs', 'AI'] as const;
type SearchTab = (typeof TABS)[number];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SearchResult = Record<string, any> & { type: string; id: string };

function SearchPageContent() {
  const { firebaseUser } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [searchText, setSearchText] = useState('');
  const [tab, setTab] = useState<SearchTab>('People');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [trending, setTrending] = useState<string[]>([]);

  // FIX 101: Debounce search input
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load trending searches
  useEffect(() => {
    setTrending([
      '#summer', '#fitness', '#travel', '#cooking',
      '#fashion', '#dating', '#music', '#art',
    ]);
  }, []);

  // Handle ?q= query param on mount
  useEffect(() => {
    const qParam = searchParams?.get('q');
    if (qParam && qParam.length >= 2) {
      setSearchText(qParam);
      handleSearch(qParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleSearch = useCallback(async (text?: string) => {
    const q = (text || searchText).toLowerCase().trim();
    if (q.length < 2) return;
    setLoading(true);

    try {
      const db = requireDb();

      switch (tab) {
        case 'People': {
          const snap = await getDocs(query(
            collection(db, 'public_profiles'),
            where('discoverable', '==', true),
            limit(50),
          ));
          setResults(
            snap.docs
              .map(d => ({ type: 'profile', id: d.id, ...d.data() } as SearchResult))
              .filter((p: SearchResult) =>
                p.displayName?.toLowerCase().includes(q) ||
                p.city?.toLowerCase().includes(q) ||
                p.bio?.toLowerCase().includes(q)
              ),
          );
          break;
        }

        case 'Posts': {
          const snap = await getDocs(query(
            collection(db, 'posts'),
            orderBy('createdAt', 'desc'),
            limit(100),
          ));
          setResults(
            snap.docs
              .map(d => ({ type: 'post', id: d.id, ...d.data() } as SearchResult))
              .filter((p: SearchResult) =>
                p.caption?.toLowerCase().includes(q) ||
                p.hashtags?.some((h: string) => h.includes(q))
              ),
          );
          break;
        }

        case 'Reels': {
          const snap = await getDocs(query(
            collection(db, 'reels'),
            orderBy('createdAt', 'desc'),
            limit(100),
          ));
          setResults(
            snap.docs
              .map(d => ({ type: 'reel', id: d.id, ...d.data() } as SearchResult))
              .filter((r: SearchResult) =>
                r.caption?.toLowerCase().includes(q) ||
                r.hashtags?.some((h: string) => h.includes(q))
              ),
          );
          break;
        }

        case 'Events': {
          const snap = await getDocs(query(
            collection(db, 'events'),
            where('status', '==', 'published'),
            limit(50),
          ));
          setResults(
            snap.docs
              .map(d => ({ type: 'event', id: d.id, ...d.data() } as SearchResult))
              .filter((e: SearchResult) =>
                e.title?.toLowerCase().includes(q) ||
                e.description?.toLowerCase().includes(q)
              ),
          );
          break;
        }

        case 'Clubs': {
          const snap = await getDocs(query(
            collection(db, 'clubs'),
            where('isPublic', '==', true),
            limit(50),
          ));
          setResults(
            snap.docs
              .map(d => ({ type: 'club', id: d.id, ...d.data() } as SearchResult))
              .filter((c: SearchResult) =>
                c.name?.toLowerCase().includes(q) ||
                c.description?.toLowerCase().includes(q)
              ),
          );
          break;
        }

        case 'AI': {
          const snap = await getDocs(query(
            collection(db, 'ai_avatars'),
            limit(50),
          ));
          setResults(
            snap.docs
              .map(d => ({ type: 'ai', id: d.id, ...d.data() } as SearchResult))
              .filter((a: SearchResult) =>
                a.displayName?.toLowerCase().includes(q) ||
                a.bio?.toLowerCase().includes(q)
              ),
          );
          break;
        }

        default:
          setResults([]);
      }
    } catch {
      setResults([]);
    }

    setLoading(false);
  }, [searchText, tab]);

  // FIX 101: Debounced search on input change
  const debouncedSearch = useCallback((text: string) => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => {
      if (text.trim().length >= 2) {
        handleSearch(text);
      }
    }, 300);
  }, [handleSearch]);

  const handleTabChange = (t: SearchTab) => {
    setTab(t);
    if (searchText.trim().length >= 2) {
      // Re-search with new tab after state update
      setTimeout(() => handleSearch(searchText), 0);
    }
  };

  const handleTrendingClick = (tag: string) => {
    setSearchText(tag);
    handleSearch(tag);
  };

  const getResultHref = (r: SearchResult): string => {
    switch (r.type) {
      case 'profile': return `/profile/${r.uid || r.id}`;
      case 'post': return `/feed/post/${r.id}`;
      case 'reel': return `/feed/reel/${r.id}`;
      case 'event': return '/calendar';
      case 'club': return `/clubs/${r.id}`;
      case 'ai': return `/ai/profile/${r.id}`;
      default: return '#';
    }
  };

  const getResultAvatar = (r: SearchResult): string | null => {
    return r.photoURL || r.mediaUrls?.[0] || r.mediaUrl || r.coverURL || r.imageURL || null;
  };

  const getResultTitle = (r: SearchResult): string => {
    return r.displayName || r.title || r.name || r.authorName || 'Unknown';
  };

  const getResultSubtitle = (r: SearchResult): string => {
    return r.bio || r.caption || r.description || r.city || '';
  };

  return (
    <div className="max-w-2xl mx-auto p-4 pb-24">
      {/* Search input */}
      <div className="relative mb-4">
        <input
          value={searchText}
          onChange={e => {
            setSearchText(e.target.value);
            debouncedSearch(e.target.value);
          }}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder="Search people, posts, events, AI..."
          className="w-full p-3 pl-10 border-2 rounded-2xl text-sm focus:border-[#E4458F] outline-none"
        />
        <span className="absolute left-3 top-3.5 text-gray-400">🔍</span>
        {searchText && (
          <button
            onClick={() => { setSearchText(''); setResults([]); }}
            className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto mb-4">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => handleTabChange(t)}
            className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap ${
              tab === t ? 'bg-[#E4458F] text-white' : 'bg-gray-100'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Trending (before search) */}
      {!searchText && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-500 mb-3">Trending</h3>
          <div className="flex flex-wrap gap-2">
            {trending.map(tag => (
              <button
                key={tag}
                onClick={() => handleTrendingClick(tag)}
                className="px-3 py-1.5 bg-gradient-to-r from-pink-50 to-purple-50 border border-pink-200 rounded-full text-sm text-[#E4458F] hover:bg-pink-100"
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {loading ? (
        <p className="text-center py-8 text-gray-400">Searching...</p>
      ) : results.length === 0 && searchText ? (
        <EmptyState
          icon="🔍"
          title="No results"
          description="Try different keywords or browse trending topics."
        />
      ) : (
        <div className="space-y-2">
          {results.map(r => (
            <a
              key={r.id}
              href={getResultHref(r)}
              className="flex items-center gap-3 p-3 border rounded-xl hover:bg-gray-50"
            >
              <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
                {getResultAvatar(r) ? (
                  <img
                    src={getResultAvatar(r)!}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-[#E8593C] to-[#8B5CF6] flex items-center justify-center text-white font-bold">
                    {getResultTitle(r).charAt(0)}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{getResultTitle(r)}</p>
                <p className="text-xs text-gray-500 truncate">{getResultSubtitle(r)}</p>
              </div>
              <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                {r.type}
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * SearchPage wrapped in Suspense for useSearchParams().
 * Next.js 14+ requires Suspense boundary for client components using useSearchParams.
 */
export default function SearchPage() {
  return (
    <Suspense fallback={<div className="max-w-2xl mx-auto p-4 text-center text-gray-400">Loading search...</div>}>
      <SearchPageContent />
    </Suspense>
  );
}
