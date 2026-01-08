/**
 * PACK 323 - Reel Viewer Page (Web)
 * Full-screen reel player with auto-play
 */

'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface Reel {
  id: string;
  ownerUserId: string;
  videoUrl: string;
  thumbnailUrl?: string;
  caption?: string;
  durationSec: number;
  createdAt: any;
}

export default function ReelViewerPage() {
  const params = useParams();
  const router = useRouter();
  const reelId = params.id as string;
  const videoRef = useRef<HTMLVideoElement>(null);

  const [reel, setReel] = useState<Reel | null>(null);
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [commentCount, setCommentCount] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    loadReel();
  }, [reelId]);

  const loadReel = async () => {
    try {
      setLoading(true);
      const reelDoc = await getDoc(doc(db, 'feedReels', reelId));
      
      if (reelDoc.exists()) {
        setReel({ id: reelDoc.id, ...reelDoc.data() } as Reel);
        
        // Load aggregate data
        const aggDoc = await getDoc(doc(db, 'feedAggregates', reelId));
        if (aggDoc.exists()) {
          const aggData = aggDoc.data();
          setLikeCount(aggData?.likes || 0);
          setCommentCount(aggData?.comments || 0);
        }
      }
    } catch (error) {
      console.error('Error loading reel:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLike = async () => {
    const newLiked = !liked;
    setLiked(newLiked);
    setLikeCount(prev => newLiked ? prev + 1 : prev - 1);

    try {
      // Note: Replace with actual firebase functions import when available
      // const likeContent = httpsCallable(functions, 'pack323_likeContent');
      // await likeContent({ contentId: reelId, contentType: 'FEED_REEL' });
    } catch (error) {
      console.error('Error liking reel:', error);
      setLiked(!newLiked);
      setLikeCount(prev => newLiked ? prev - 1 : prev + 1);
    }
  };

  const togglePlayPause = () => {
    if (!videoRef.current) return;

    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
      </div>
    );
  }

  if (!reel) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white">
        <p className="mb-4">Reel not found</p>
        <button
          onClick={() => router.push('/feed')}
          className="px-6 py-2 bg-purple-600 rounded-lg hover:bg-purple-700"
        >
          Back to Feed
        </button>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-black flex items-center justify-center">
      {/* Video Player */}
      <div className="relative w-full max-w-md aspect-[9/16]">
        <video
          ref={videoRef}
          src={reel.videoUrl}
          className="w-full h-full object-cover"
          loop
          autoPlay
          playsInline
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onClick={togglePlayPause}
        />

        {/* Overlay UI */}
        <div className="absolute inset-0 pointer-events-none">
          {/* Top Bar */}
          <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center pointer-events-auto">
            <button
              onClick={() => router.back()}
              className="w-10 h-10 rounded-full bg-black bg-opacity-50 flex items-center justify-center text-white hover:bg-opacity-70"
            >
              ✕
            </button>
          </div>

          {/* Bottom Info */}
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black to-transparent pointer-events-auto">
            {reel.caption && (
              <p className="text-white text-sm mb-4">{reel.caption}</p>
            )}

            {/* Actions */}
            <div className="flex items-center gap-6 text-white">
              <button
                onClick={handleLike}
                className="flex items-center gap-2 hover:scale-110 transition-transform"
              >
                <span className="text-2xl">{liked ? '❤️' : '🤍'}</span>
                <span className="text-sm">{likeCount}</span>
              </button>
              <button className="flex items-center gap-2 hover:scale-110 transition-transform">
                <span className="text-2xl">💬</span>
                <span className="text-sm">{commentCount}</span>
              </button>
              <button className="flex items-center gap-2 hover:scale-110 transition-transform">
                <span className="text-2xl">📤</span>
              </button>
            </div>
          </div>

          {/* Play/Pause Overlay */}
          {!isPlaying && (
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30 pointer-events-auto">
              <button
                onClick={togglePlayPause}
                className="text-6xl hover:scale-110 transition-transform"
              >
                ▶️
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}