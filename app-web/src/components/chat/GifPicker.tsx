'use client';

/**
 * GifPicker — FIX 134: GIF support in chat via Giphy API (free tier)
 *
 * Provides a search-based GIF picker with trending defaults.
 * Uses Giphy API (free tier: 42M+ GIFs, PG-13 rating filter).
 *
 * Usage:
 *   <GifPicker
 *     open={showGifPicker}
 *     onSelect={(gifUrl) => handleSendGif(gifUrl)}
 *     onClose={() => setShowGifPicker(false)}
 *   />
 *
 * The GIPHY_API_KEY must be set in environment:
 *   NEXT_PUBLIC_GIPHY_API_KEY=your_key_here
 *
 * Get a free key from: https://developers.giphy.com
 *
 * INVARIANTS:
 *   - Does NOT write to Firestore directly; delegates via onSelect callback.
 *   - PG-13 rating filter is applied to all requests.
 *   - Attribution: "Powered by GIPHY" is displayed per Giphy TOS.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

interface GiphyGif {
  id: string;
  images: {
    fixed_width: { url: string };
    original: { url: string };
  };
  title: string;
}

interface GifPickerProps {
  /** Whether the picker is open */
  open: boolean;
  /** Called when a GIF is selected, with the original-size URL */
  onSelect: (gifUrl: string) => void;
  /** Called to close the picker */
  onClose: () => void;
}

const GIPHY_KEY = process.env.NEXT_PUBLIC_GIPHY_API_KEY || '';

export default function GifPicker({ open, onSelect, onClose }: GifPickerProps) {
  const [search, setSearch] = useState('');
  const [gifs, setGifs] = useState<GiphyGif[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const fetchGifs = useCallback(async (query: string) => {
    if (!GIPHY_KEY) {
      console.warn('[GifPicker] NEXT_PUBLIC_GIPHY_API_KEY not configured');
      return;
    }

    setLoading(true);
    try {
      const endpoint = query
        ? `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(query)}&limit=20&rating=pg-13`
        : `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_KEY}&limit=20&rating=pg-13`;
      const res = await fetch(endpoint);
      const data = await res.json();
      setGifs(data.data || []);
    } catch (err) {
      console.error('[GifPicker] Fetch error:', err);
      setGifs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch trending on open
  useEffect(() => {
    if (open) {
      fetchGifs('');
    }
  }, [open, fetchGifs]);

  // Debounced search
  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchGifs(value);
    }, 300);
  };

  if (!open) return null;

  return (
    <div className="absolute bottom-16 left-0 right-0 bg-white dark:bg-gray-800 shadow-xl rounded-t-2xl border dark:border-gray-700 z-10 h-72">
      {/* Search bar */}
      <div className="p-2 border-b dark:border-gray-700">
        <input
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search GIFs..."
          className="w-full px-3 py-1.5 bg-gray-100 dark:bg-gray-700 rounded-full text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#E4458F]"
          autoFocus
        />
      </div>

      {/* GIF grid */}
      <div className="grid grid-cols-2 gap-1 p-2 overflow-y-auto h-48">
        {loading ? (
          <div className="col-span-2 flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#E4458F]" />
          </div>
        ) : gifs.length === 0 ? (
          <p className="col-span-2 text-center text-sm text-gray-400 py-8">
            {search ? 'No GIFs found' : 'Enter search or loading trending...'}
          </p>
        ) : (
          gifs.map((gif) => (
            <img
              key={gif.id}
              src={gif.images.fixed_width.url}
              alt={gif.title || 'GIF'}
              className="w-full rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => {
                onSelect(gif.images.original.url);
                onClose();
              }}
              loading="lazy"
            />
          ))
        )}
      </div>

      {/* Giphy attribution (required by TOS) */}
      <p className="text-[9px] text-center text-gray-400 dark:text-gray-500 py-1 border-t dark:border-gray-700">
        Powered by GIPHY
      </p>
    </div>
  );
}

/**
 * GifMessage — Renders a GIF message bubble in the chat.
 *
 * Usage in message rendering:
 *   {msg.type === 'gif' && <GifMessage url={msg.gifURL} />}
 */
export function GifMessage({ url }: { url: string }) {
  return (
    <img
      src={url}
      alt="GIF"
      className="w-48 rounded-xl"
      loading="lazy"
    />
  );
}
