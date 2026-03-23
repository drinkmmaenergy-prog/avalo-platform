'use client';

/**
 * Locked Media Section — Creator PPV (Pay-Per-View) Media Management
 *
 * Allows creators to upload locked photos/videos that fans can unlock with tokens.
 *
 * Firestore collections:
 *   - locked_media/{mediaId}  — media metadata (creatorId, title, mediaURL, price, status, etc.)
 *
 * Firebase Storage path:
 *   - creator/{uid}/locked/{timestamp}_{filename}
 *
 * CANONICAL: This component is additive. Does NOT modify existing creator page logic.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Loader2, Trash2, Upload, Lock } from 'lucide-react';
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { requireDb, requireStorage } from '@/lib/firebase';
import { toast } from '@/components/ui/Toaster';

// ============================================================================
// TYPES
// ============================================================================

export interface LockedMediaItem {
  id: string;
  creatorId: string;
  creatorName: string;
  title: string;
  mediaURL: string;
  thumbnailURL?: string;
  price: number;
  purchaseCount: number;
  status: 'published' | 'draft' | 'deleted';
  createdAt: any;
}

interface LockedMediaSectionProps {
  userId: string;
  displayName: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function LockedMediaSection({
  userId,
  displayName,
}: LockedMediaSectionProps) {
  // ── State ──────────────────────────────────────────────────────────
  const [lockedMedia, setLockedMedia] = useState<LockedMediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Upload form state
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState('');
  const [mediaTitle, setMediaTitle] = useState('');
  const [mediaPrice, setMediaPrice] = useState(5);

  const mediaFileRef = useRef<HTMLInputElement>(null);

  // ── Load locked media ──────────────────────────────────────────────
  const loadLockedMedia = useCallback(async () => {
    try {
      const db = requireDb();
      const q = query(
        collection(db, 'locked_media'),
        where('creatorId', '==', userId),
        where('status', '==', 'published'),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      const items = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as LockedMediaItem[];
      setLockedMedia(items);
    } catch (err) {
      console.error('[LockedMediaSection] Load error:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      void loadLockedMedia();
    }
  }, [userId, loadLockedMedia]);

  // ── File selection handler ─────────────────────────────────────────
  const handleMediaSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Validate file type
      if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
        toast({ type: 'error', title: 'Invalid file type', description: 'Please select an image or video file.' });
        return;
      }

      // Validate file size (50MB max)
      if (file.size > 50 * 1024 * 1024) {
        toast({ type: 'error', title: 'File too large', description: 'Maximum file size is 50MB.' });
        return;
      }

      setMediaFile(file);

      // Generate preview
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => setMediaPreview(reader.result as string);
        reader.readAsDataURL(file);
      } else {
        // Video — use a placeholder preview
        setMediaPreview('');
      }
    },
    []
  );

  // ── Upload handler ─────────────────────────────────────────────────
  const handleUploadLockedMedia = useCallback(async () => {
    if (!mediaFile || !mediaTitle.trim() || mediaPrice < 1) {
      toast({ type: 'error', title: 'Missing fields', description: 'Please provide a file, title, and price.' });
      return;
    }

    setUploading(true);
    try {
      // Upload to Firebase Storage (locked path)
      const storage = requireStorage();
      const storageRef = ref(
        storage,
        `creator/${userId}/locked/${Date.now()}_${mediaFile.name}`
      );
      await uploadBytes(storageRef, mediaFile);
      const mediaURL = await getDownloadURL(storageRef);

      // Save to Firestore
      const db = requireDb();
      await addDoc(collection(db, 'locked_media'), {
        creatorId: userId,
        creatorName: displayName || '',
        title: mediaTitle.trim(),
        mediaURL,
        price: mediaPrice,
        purchaseCount: 0,
        status: 'published',
        createdAt: serverTimestamp(),
      });

      // Reset form
      setMediaFile(null);
      setMediaPreview('');
      setMediaTitle('');
      setMediaPrice(5);
      if (mediaFileRef.current) mediaFileRef.current.value = '';

      toast({ type: 'success', title: 'Locked media published!' });

      // Reload list
      await loadLockedMedia();
    } catch (err) {
      console.error('[LockedMediaSection] Upload failed:', err);
      toast({ type: 'error', title: 'Upload failed', description: 'Please try again.' });
    } finally {
      setUploading(false);
    }
  }, [mediaFile, mediaTitle, mediaPrice, userId, displayName, loadLockedMedia]);

  // ── Delete handler ─────────────────────────────────────────────────
  const handleDeleteMedia = useCallback(
    async (item: LockedMediaItem) => {
      if (!confirm(`Delete "${item.title}"? This cannot be undone.`)) return;

      setDeleting(item.id);
      try {
        const db = requireDb();
        await deleteDoc(doc(db, 'locked_media', item.id));

        // Attempt to delete the file from Storage
        try {
          const storage = requireStorage();
          const fileRef = ref(storage, item.mediaURL);
          await deleteObject(fileRef);
        } catch {
          // Storage deletion is non-critical (URL may be absolute)
        }

        toast({ type: 'success', title: 'Locked media deleted.' });
        await loadLockedMedia();
      } catch (err) {
        console.error('[LockedMediaSection] Delete failed:', err);
        toast({ type: 'error', title: 'Delete failed', description: 'Please try again.' });
      } finally {
        setDeleting(null);
      }
    },
    [loadLockedMedia]
  );

  // ── Cancel upload form ─────────────────────────────────────────────
  const handleCancelUpload = useCallback(() => {
    setMediaFile(null);
    setMediaPreview('');
    setMediaTitle('');
    setMediaPrice(5);
    if (mediaFileRef.current) mediaFileRef.current.value = '';
  }, []);

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-gray-900 text-lg">Locked Media (PPV)</h3>
        <Lock className="w-5 h-5 text-gray-400" />
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Upload photos/videos that fans can unlock with tokens.
      </p>

      {/* Upload trigger */}
      <div className="flex gap-3 mb-4">
        <input
          type="file"
          accept="image/*,video/*"
          ref={mediaFileRef}
          className="hidden"
          onChange={handleMediaSelect}
        />
        <button
          onClick={() => mediaFileRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-2 px-4 py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-[#E4458F] hover:text-[#E4458F] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Upload className="w-4 h-4" />
          + Upload Media
        </button>
      </div>

      {/* Preview + price before upload */}
      {mediaFile && (
        <div className="border border-gray-200 rounded-xl p-4 mb-4">
          {/* Preview */}
          {mediaPreview ? (
            <img
              src={mediaPreview}
              alt="Preview"
              className="w-full h-48 object-cover rounded-lg mb-3"
            />
          ) : (
            <div className="w-full h-48 bg-gray-100 dark:bg-gray-800 rounded-lg mb-3 flex items-center justify-center text-gray-400">
              <div className="text-center">
                <span className="text-3xl">🎬</span>
                <p className="text-xs mt-1">{mediaFile.name}</p>
              </div>
            </div>
          )}

          {/* Title */}
          <input
            type="text"
            value={mediaTitle}
            onChange={(e) => setMediaTitle(e.target.value)}
            placeholder="Title (e.g., Beach photoshoot)"
            className="w-full p-2 border border-gray-300 rounded-lg mb-2 text-sm focus:ring-2 focus:ring-pink-500 focus:border-transparent"
          />

          {/* Price */}
          <div className="flex items-center gap-2 mb-3">
            <input
              type="number"
              value={mediaPrice}
              onChange={(e) => setMediaPrice(Number(e.target.value))}
              min={1}
              max={10000}
              className="w-24 p-2 border border-gray-300 rounded-lg text-sm text-center focus:ring-2 focus:ring-pink-500 focus:border-transparent"
            />
            <span className="text-sm text-gray-600">tokens to unlock</span>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              onClick={handleUploadLockedMedia}
              disabled={uploading || !mediaTitle.trim() || mediaPrice < 1}
              className="flex-1 py-2 bg-[#E4458F] hover:bg-[#d13a80] text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                'Publish Locked Media'
              )}
            </button>
            <button
              onClick={handleCancelUpload}
              disabled={uploading}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* List of existing locked media */}
      {loading ? (
        <div className="py-6 text-center">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400 mx-auto" />
        </div>
      ) : lockedMedia.length === 0 ? (
        <div className="py-6 text-center">
          <Lock className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-400">No locked media yet. Upload your first!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {lockedMedia.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 p-3 border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors"
            >
              {/* Thumbnail — blurred */}
              <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-100 relative flex-shrink-0">
                <img
                  src={item.thumbnailURL || item.mediaURL}
                  alt=""
                  className="w-full h-full object-cover blur-lg"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-white text-lg drop-shadow-lg">🔒</span>
                </div>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {item.title}
                </p>
                <p className="text-xs text-gray-500">
                  {item.price} tokens · {item.purchaseCount || 0} unlock
                  {(item.purchaseCount || 0) !== 1 ? 's' : ''}
                </p>
              </div>

              {/* Delete */}
              <button
                onClick={() => handleDeleteMedia(item)}
                disabled={deleting === item.id}
                className="p-2 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                title="Delete"
              >
                {deleting === item.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
