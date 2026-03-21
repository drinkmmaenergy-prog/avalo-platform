'use client';

/**
 * PACK 343 — Profile Edit Page
 * Route: /account/profile
 * Renders the ProfileEditor component within AccountLayout.
 *
 * Enhanced with:
 * - Photo gallery manager (drag-to-reorder, X remove, captions)
 * - Unlimited file count, 500MB per file
 * - First photo = cover photo
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import { AccountLayout } from '../../../components/account/AccountLayout';
import ProfileEditor from '../../../components/profile/ProfileEditor';
import { useAuth } from '@/components/providers/AuthProvider';
import { toast } from '@/components/ui/Toaster';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { requireStorage, requireDb } from '@/lib/firebase';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PhotoItem {
  url: string;
  caption: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_SIZE_MB = 500;
const MAX_CAPTION_LENGTH = 100;
const ACCEPT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// ---------------------------------------------------------------------------
// PhotoGalleryManager — drag-to-reorder, X remove, captions
// ---------------------------------------------------------------------------

function PhotoGalleryManager({ uid }: { uid: string }) {
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Load photos from Firestore ──────────────────────────────────────
  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const userRef = doc(requireDb(), 'users', uid);
        const snap = await getDoc(userRef);
        const data = snap.data();

        if (data?.photos && Array.isArray(data.photos)) {
          const loaded: PhotoItem[] = data.photos.map((p: any) => {
            if (typeof p === 'string') {
              return { url: p, caption: '' };
            }
            return { url: p.url ?? '', caption: p.caption ?? '' };
          });
          if (active) setPhotos(loaded);
        }
      } catch (err) {
        console.error('[PhotoGalleryManager] Failed to load photos:', err);
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => { active = false; };
  }, [uid]);

  // ── Save photos to Firestore ────────────────────────────────────────
  const persistPhotos = useCallback(async (updated: PhotoItem[]) => {
    setSaving(true);
    try {
      const userRef = doc(requireDb(), 'users', uid);
      await updateDoc(userRef, {
        photos: updated.map((p) => ({ url: p.url, caption: p.caption })),
        lastActiveAt: serverTimestamp(),
      });
    } catch (err) {
      console.error('[PhotoGalleryManager] Failed to save photos:', err);
      toast({
        type: 'error',
        title: 'Save failed',
        description: 'Failed to save photo changes. Please try again.',
      });
      throw err;
    } finally {
      setSaving(false);
    }
  }, [uid]);

  // ── Remove photo ────────────────────────────────────────────────────
  const handleRemove = async (index: number) => {
    const prev = [...photos];
    const updated = photos.filter((_, i) => i !== index);
    setPhotos(updated);

    try {
      await persistPhotos(updated);
      toast({ type: 'success', title: 'Photo removed' });
    } catch {
      setPhotos(prev); // rollback
    }
  };

  // ── Caption change ──────────────────────────────────────────────────
  const handleCaptionChange = (index: number, caption: string) => {
    if (caption.length > MAX_CAPTION_LENGTH) return;
    const updated = [...photos];
    updated[index] = { ...updated[index], caption };
    setPhotos(updated);
  };

  const handleCaptionBlur = async (index: number) => {
    try {
      await persistPhotos(photos);
    } catch {
      // already handled in persistPhotos via toast
    }
  };

  // ── Drag-to-reorder ─────────────────────────────────────────────────
  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDragEnd = async () => {
    if (dragIndex === null || dragOverIndex === null || dragIndex === dragOverIndex) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }

    const prev = [...photos];
    const updated = [...photos];
    const [moved] = updated.splice(dragIndex, 1);
    updated.splice(dragOverIndex, 0, moved);

    setPhotos(updated);
    setDragIndex(null);
    setDragOverIndex(null);

    try {
      await persistPhotos(updated);
      toast({ type: 'success', title: 'Photo order updated' });
    } catch {
      setPhotos(prev); // rollback
    }
  };

  // ── Upload new photos ───────────────────────────────────────────────
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);

    // Validate
    for (const file of fileArray) {
      if (!ACCEPT_TYPES.includes(file.type)) {
        toast({
          type: 'error',
          title: 'Invalid file type',
          description: `${file.name}: Only JPEG, PNG, WebP allowed.`,
        });
        return;
      }
      if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        toast({
          type: 'error',
          title: 'File too large',
          description: `${file.name}: Max ${MAX_SIZE_MB}MB per file.`,
        });
        return;
      }
    }

    setUploading(true);
    const prev = [...photos];

    try {
      const storage = requireStorage();
      const newPhotos: PhotoItem[] = [];

      for (const file of fileArray) {
        const path = `users/${uid}/photos/${Date.now()}_${file.name}`;
        const storageRef = ref(storage, path);
        const snapshot = await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(snapshot.ref);
        newPhotos.push({ url: downloadURL, caption: '' });
      }

      const updated = [...photos, ...newPhotos];
      setPhotos(updated);
      await persistPhotos(updated);

      toast({
        type: 'success',
        title: 'Photos uploaded',
        description: `${newPhotos.length} photo(s) added.`,
      });
    } catch (err) {
      console.error('[PhotoGalleryManager] Upload failed:', err);
      setPhotos(prev); // rollback
      toast({
        type: 'error',
        title: 'Upload failed',
        description: 'One or more photos failed to upload.',
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // ── Loading state ───────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold mb-4">Photo Gallery</h2>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500" />
        </div>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold">Photo Gallery</h2>
          <p className="text-sm text-gray-500 mt-1">
            Drag photos to reorder. First photo is your cover photo.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saving && (
            <span className="text-xs text-gray-400">Saving...</span>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT_TYPES.join(',')}
            multiple
            onChange={handleFileSelect}
            className="hidden"
            disabled={uploading}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="px-4 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? 'Uploading...' : '+ Add Photos'}
          </button>
        </div>
      </div>

      {photos.length === 0 ? (
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center">
          <div className="text-4xl mb-2">📷</div>
          <p className="text-gray-500 mb-1">No photos yet</p>
          <p className="text-gray-400 text-sm">
            Upload photos to create your gallery. JPEG, PNG, WebP &middot; No limit &middot; Max {MAX_SIZE_MB}MB per file.
          </p>
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm text-amber-800">
              📸 Treat Avalo like Instagram — creators with 20+ photos get 3x more messages. No upload limit!
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {photos.map((photo, index) => (
            <div
              key={`${photo.url}-${index}`}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              className={`relative group rounded-lg overflow-hidden border-2 transition-all cursor-grab active:cursor-grabbing ${
                dragOverIndex === index
                  ? 'border-pink-500 scale-105'
                  : index === 0
                  ? 'border-pink-300'
                  : 'border-gray-200'
              }`}
            >
              {/* Cover photo badge */}
              {index === 0 && (
                <div className="absolute top-2 left-2 z-10 bg-pink-500 text-white text-xs px-2 py-0.5 rounded-full font-medium">
                  Cover
                </div>
              )}

              {/* X remove button */}
              <button
                type="button"
                onClick={() => handleRemove(index)}
                className="absolute top-2 right-2 z-10 w-7 h-7 bg-black/60 hover:bg-red-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label={`Remove photo ${index + 1}`}
              >
                ✕
              </button>

              {/* Photo thumbnail */}
              <div className="aspect-square">
                <Image
                  src={photo.url}
                  alt={photo.caption || `Photo ${index + 1}`}
                  width={300}
                  height={300}
                  className="w-full h-full object-cover"
                  unoptimized
                />
              </div>

              {/* Caption field */}
              <div className="p-2 bg-white">
                <input
                  type="text"
                  value={photo.caption}
                  onChange={(e) => handleCaptionChange(index, e.target.value)}
                  onBlur={() => handleCaptionBlur(index)}
                  placeholder="Add caption..."
                  maxLength={MAX_CAPTION_LENGTH}
                  className="w-full text-xs px-2 py-1 border border-gray-200 rounded focus:ring-1 focus:ring-pink-500 focus:border-pink-500 placeholder-gray-400"
                />
                <span className="text-[10px] text-gray-400 mt-0.5 block text-right">
                  {photo.caption.length}/{MAX_CAPTION_LENGTH}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProfileStrengthBar — horizontal progress bar with completion tips
// ---------------------------------------------------------------------------

function ProfileStrengthBar({ uid }: { uid: string }) {
  const [strength, setStrength] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;

    async function compute() {
      try {
        const userRef = doc(requireDb(), 'users', uid);
        const snap = await getDoc(userRef);
        const data = snap.data();
        if (!data || !active) return;

        let pct = 0;

        // bio = 20%
        if (data.bio && typeof data.bio === 'string' && data.bio.trim().length > 0) {
          pct += 20;
        }

        // name = 10%
        if (data.displayName && typeof data.displayName === 'string' && data.displayName.trim().length > 0) {
          pct += 10;
        }

        // avatar = 20%
        if (data.avatarUrl || data.photoURL) {
          pct += 20;
        }

        // 5+ photos = 25%
        const photos = Array.isArray(data.photos) ? data.photos : [];
        if (photos.length >= 5) {
          pct += 25;
        }

        // earn_on = 25%
        if (data.earn_on === true) {
          pct += 25;
        }

        if (active) {
          setStrength(pct);
          setLoaded(true);
        }
      } catch (err) {
        console.error('[ProfileStrengthBar] Failed to compute strength:', err);
        if (active) setLoaded(true);
      }
    }

    void compute();
    return () => { active = false; };
  }, [uid]);

  if (!loaded) return null;

  const barColor =
    strength >= 80
      ? 'bg-green-500'
      : strength >= 50
      ? 'bg-yellow-500'
      : 'bg-red-500';

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-gray-700">
          Profile strength: {strength}%
        </span>
      </div>
      <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${strength}%` }}
        />
      </div>
      {strength < 80 && (
        <p className="text-xs text-gray-500 mt-2">
          Complete your profile to appear in more searches
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ProfileEditPage() {
  const { firebaseUser, loading } = useAuth();

  if (loading) {
    return (
      <AccountLayout>
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading profile...</p>
          </div>
        </div>
      </AccountLayout>
    );
  }

  if (!firebaseUser) {
    return (
      <AccountLayout>
        <div className="bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="text-6xl mb-4">🔒</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Sign In Required</h2>
          <p className="text-gray-600 mb-6">Please sign in to edit your profile.</p>
        </div>
      </AccountLayout>
    );
  }

  return (
    <AccountLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Profile Strength Bar */}
        <ProfileStrengthBar uid={firebaseUser.uid} />

        {/* Profile Editor (name, bio, avatar) */}
        <ProfileEditor />

        {/* Photo Gallery Manager (drag-to-reorder, captions, remove) */}
        <PhotoGalleryManager uid={firebaseUser.uid} />
      </div>
    </AccountLayout>
  );
}
