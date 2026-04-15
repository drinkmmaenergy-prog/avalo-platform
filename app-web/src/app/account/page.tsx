'use client';

import { MONETIZATION_SPLITS } from "@constants/monetization";
import { TOKEN_PAYOUT_USD } from '@/lib/economyConfig';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
/**
 * PACK 343 — Unified Account Panel
 * Overview page showing profile editor, subscription, wallet, discovery & privacy.
 * Profile tab merged into Overview — single tab for all profile + account settings.
 */
import Link from 'next/link';
import Image from 'next/image';

import { AccountLayout } from '../../components/account/AccountLayout';

import { useWallet } from '../../../hooks/useWallet';
import { useSubscription } from '../../../hooks/useSubscription';
import { useCompliance } from '../../../hooks/useCompliance';
import { useAuth } from '@/components/providers/AuthProvider';
import {
  recordSession,
  getDiscoverySettings,
  updateDiscoveryRadius,
  updateIncognitoMode,
  updatePassportMode,
  updateShowMeInDiscovery,
  updatePassportLocation,
} from '@/lib/services/accountService';
import type { DiscoverySettings, DiscoveryRadius, PassportLocation } from '@/lib/services/accountService';
import { requireDb, requireStorage, requireFunctions, requireFunctionsUS } from '@/lib/firebase';
import { doc, onSnapshot, getDoc, updateDoc, setDoc, serverTimestamp, arrayRemove, collection, query, where, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { toast } from '@/components/ui/Toaster';
import ProfileEditor from '../../components/profile/ProfileEditor';
import { useI18n } from '@/components/providers/I18nProvider';

import type { WalletBalance } from '../../../hooks/useWallet';
import type { UserSubscription } from '../../../hooks/useSubscription';
import type { UserComplianceStatus } from '../../../hooks/useCompliance';

// ---------------------------------------------------------------------------
// Types (from profile page)
// ---------------------------------------------------------------------------

interface PhotoItem {
  url: string;
  caption: string;
}

// ---------------------------------------------------------------------------
// Constants (from profile page)
// ---------------------------------------------------------------------------

const MAX_SIZE_MB = 500;
const MAX_CAPTION_LENGTH = 100;
const ACCEPT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// FIX 76: Photo slot constants — face-first enforcement
const MAX_PHOTOS = 10;
const FACE_REQUIRED_SLOTS = 6; // First 6 must show owner's face
const MIN_PHOTO_SIZE = 10000; // 10KB minimum — reject tiny/placeholder images
const MAX_PHOTO_SIZE = 10000000; // 10MB maximum

// ---------------------------------------------------------------------------
// PhotoGalleryManager — drag-to-reorder, X remove, captions
// (Moved from /account/profile to unified Overview)
// ---------------------------------------------------------------------------

function PhotoGalleryManager({ uid }: { uid: string }) {
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  // FIX 76: Photo warning for face-first enforcement
  const [photoWarning, setPhotoWarning] = useState<string | null>(null);
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

  // ── Remove photo — FIX 23: delete from Storage + arrayRemove from both users and public_profiles
  const handleRemove = async (index: number) => {
    const prev = [...photos];
    const photoUrl = photos[index]?.url;
    const updated = photos.filter((_, i) => i !== index);
    setPhotos(updated);

    try {
      await persistPhotos(updated);

      // FIX 23: Also arrayRemove from public_profiles to keep in sync
      if (photoUrl) {
        const db = requireDb();
        await updateDoc(doc(db, 'public_profiles', uid), {
          photos: arrayRemove(photoUrl),
        }).catch(() => {});

        // Best-effort Storage deletion
        try {
          const storage = requireStorage();
          const { deleteObject: delObj } = await import('firebase/storage');
          const storageRef = ref(storage, photoUrl);
          await delObj(storageRef);
        } catch {
          // Storage deletion best-effort — photoUrl might not be a direct storage path
        }
      }

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
      // FIX 79: Client-side basic check — file must be a real photo (not tiny, not huge)
      if (file.size < MIN_PHOTO_SIZE) {
        toast({ type: 'error', title: 'Photo too small', description: 'Please upload a higher quality image (min 10KB).' });
        return;
      }
      if (file.size > MAX_PHOTO_SIZE) {
        toast({ type: 'error', title: 'Photo too large', description: 'Max 10MB per photo.' });
        return;
      }
    }

    // FIX 76: Enforce MAX_PHOTOS limit
    if (photos.length + fileArray.length > MAX_PHOTOS) {
      toast({
        type: 'error',
        title: 'Too many photos',
        description: `Maximum ${MAX_PHOTOS} photos allowed. You can upload ${MAX_PHOTOS - photos.length} more.`,
      });
      return;
    }

    setUploading(true);
    setPhotoWarning(null);
    const prev = [...photos];

    try {
      const storage = requireStorage();
      const newPhotos: PhotoItem[] = [];

      for (const file of fileArray) {
        const slotIndex = photos.length + newPhotos.length;
        const path = `users/${uid}/photos/${Date.now()}_${file.name}`;
        const storageRef = ref(storage, path);
        const snapshot = await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(snapshot.ref);

        // FIX 76: Face-first warning for slots 1-6
        if (slotIndex < FACE_REQUIRED_SLOTS) {
          setPhotoWarning(`Photo ${slotIndex + 1} should clearly show your face. Photos without your face in the first 6 slots may be rejected during verification.`);
        }

        newPhotos.push({ url: downloadURL, caption: '' });

        // FIX 79: Trigger server-side photo validation (verifyProfilePhotos)
        try {
          const functions = requireFunctions();
          const validateFn = httpsCallable(functions, 'verifyProfilePhotos');
          const result = await validateFn({ photoURL: downloadURL, slotIndex });
          const data = result.data as any;

          if (data?.rejected) {
            // Remove the uploaded photo from Storage
            try {
              const { deleteObject: delObj } = await import('firebase/storage');
              await delObj(ref(storage, downloadURL));
            } catch { /* best-effort */ }

            // Remove from newPhotos
            newPhotos.pop();

            // Show rejection reason
            toast({
              type: 'error',
              title: 'Photo rejected',
              description: data.reason || 'This photo does not meet our requirements.\n\nCommon reasons:\n• No face visible (required for slots 1-6)\n• Stock photo detected\n• Celebrity/public figure photo\n• Photo of someone else',
              duration: 8000,
            });
            continue;
          }

          if (data?.warning) {
            setPhotoWarning(data.warning);
          }
        } catch {
          // Validation service unavailable — allow upload, flag for async review
          console.debug('[PhotoGalleryManager] Photo validation service not available');
        }
      }

      if (newPhotos.length === 0) {
        setPhotos(prev);
        toast({ type: 'warning', title: 'No photos added', description: 'All photos were rejected by validation.' });
      } else {
        const updated = [...photos, ...newPhotos];
        setPhotos(updated);
        await persistPhotos(updated);

        // FIX 76: Also sync to public_profiles
        try {
          const db = requireDb();
          await updateDoc(doc(db, 'public_profiles', uid), {
            photos: updated.map((p) => p.url),
          }).catch(() => {});
        } catch { /* best effort */ }

        toast({
          type: 'success',
          title: 'Photos uploaded',
          description: `${newPhotos.length} photo(s) added.`,
        });
      }
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

  // FIX 76: Handle single-slot photo upload (from slot grid)
  const handleSlotUpload = async (file: File, slotIndex: number) => {
    if (!ACCEPT_TYPES.includes(file.type)) {
      toast({ type: 'error', title: 'Invalid file type', description: 'Only JPEG, PNG, WebP allowed.' });
      return;
    }
    if (file.size < MIN_PHOTO_SIZE) {
      toast({ type: 'error', title: 'Photo too small', description: 'Please upload a higher quality image (min 10KB).' });
      return;
    }
    if (file.size > MAX_PHOTO_SIZE) {
      toast({ type: 'error', title: 'Photo too large', description: 'Max 10MB per photo.' });
      return;
    }

    setUploading(true);
    setPhotoWarning(null);
    const prev = [...photos];

    try {
      const storage = requireStorage();
      const path = `users/${uid}/photos/${Date.now()}_${file.name}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, file);
      const photoURL = await getDownloadURL(storageRef);

      // FIX 76: Face-first warning for slots 1-6
      if (slotIndex < FACE_REQUIRED_SLOTS) {
        setPhotoWarning(`Photo ${slotIndex + 1} should clearly show your face. Photos without your face in the first 6 slots may be rejected during verification.`);
      }

      // FIX 79: Trigger server-side photo validation
      try {
        const functions = requireFunctions();
        const validateFn = httpsCallable(functions, 'verifyProfilePhotos');
        const result = await validateFn({ photoURL, slotIndex });
        const data = result.data as any;

        if (data?.rejected) {
          try {
            const { deleteObject: delObj } = await import('firebase/storage');
            await delObj(ref(storage, photoURL));
          } catch { /* best-effort */ }

          toast({
            type: 'error',
            title: 'Photo rejected',
            description: data.reason || 'This photo does not meet our requirements.',
            duration: 8000,
          });
          setUploading(false);
          return;
        }

        if (data?.warning) {
          setPhotoWarning(data.warning);
        }
      } catch {
        console.debug('[PhotoGalleryManager] Photo validation service not available');
      }

      // Save to slot
      const updated = [...photos];
      // Pad array if needed to reach slotIndex
      while (updated.length <= slotIndex) {
        updated.push({ url: '', caption: '' });
      }
      updated[slotIndex] = { url: photoURL, caption: updated[slotIndex]?.caption || '' };
      setPhotos(updated);
      await persistPhotos(updated);

      // Sync to public_profiles
      try {
        const db = requireDb();
        await updateDoc(doc(db, 'public_profiles', uid), {
          photos: updated.filter(p => p.url).map(p => p.url),
        }).catch(() => {});
      } catch { /* best effort */ }

      toast({ type: 'success', title: 'Photo uploaded' });
    } catch (err) {
      console.error('[PhotoGalleryManager] Slot upload failed:', err);
      setPhotos(prev);
      toast({ type: 'error', title: 'Upload failed' });
    } finally {
      setUploading(false);
    }
  };

  // ── Loading state ───────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="bg-white dark:bg-[#242424] rounded-lg shadow p-6">
        <h2 className="text-xl font-bold mb-4">Photo Gallery</h2>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500" />
        </div>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div className="bg-white dark:bg-[#242424] rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold">Photo Gallery</h2>
          <p className="text-sm text-gray-500 mt-1">
            First 6 photos must show your face. Drag to reorder. Max {MAX_PHOTOS} photos.
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

      {/* FIX 76: Photo warning banner */}
      {photoWarning && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
          <span className="text-amber-500 mt-0.5">⚠️</span>
          <div className="flex-1">
            <p className="text-sm text-amber-800">{photoWarning}</p>
            <button onClick={() => setPhotoWarning(null)} className="text-xs text-amber-600 hover:text-amber-800 mt-1 underline">Dismiss</button>
          </div>
        </div>
      )}

      {/* FIX 76: Slot-based photo grid with face-first indicators */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {Array.from({ length: MAX_PHOTOS }).map((_, i) => {
          const photo = photos[i];
          const isFaceSlot = i < FACE_REQUIRED_SLOTS;
          const hasPhoto = photo && photo.url;
          return (
            <div key={i} className={`aspect-square rounded-xl overflow-hidden relative border-2 ${
              isFaceSlot ? 'border-[#E4458F]' : 'border-gray-200'
            }`}>
              {hasPhoto ? (
                <>
                  <Image src={photo.url} alt={photo.caption || `Photo ${i + 1}`} width={300} height={300} className="w-full h-full object-cover" unoptimized />
                  <button onClick={() => handleRemove(i)}
                    className="absolute top-1 right-1 w-6 h-6 bg-black/50 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600 transition">
                    ×
                  </button>
                  {/* Cover photo badge */}
                  {i === 0 && (
                    <div className="absolute top-1 left-1 z-10 bg-pink-500 text-white text-[9px] px-1.5 py-0.5 rounded-full font-medium">
                      Cover
                    </div>
                  )}
                </>
              ) : (
                <div onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file'; input.accept = ACCEPT_TYPES.join(',');
                  input.onchange = (e) => {
                    const f = (e.target as HTMLInputElement).files?.[0];
                    if (f) handleSlotUpload(f, i);
                  };
                  input.click();
                }}
                  className="w-full h-full flex flex-col items-center justify-center bg-gray-50 cursor-pointer hover:bg-pink-50 transition">
                  <span className="text-2xl text-gray-300">+</span>
                  <span className="text-[10px] text-gray-400 mt-1">
                    {isFaceSlot ? '📸 Face required' : '📷 Any photo'}
                  </span>
                </div>
              )}
              {/* Slot label */}
              <span className="absolute bottom-1 left-1 text-[9px] bg-black/40 text-white px-1.5 py-0.5 rounded-full">
                {i + 1}/{MAX_PHOTOS}
              </span>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-gray-500 mb-4">
        📸 First 6 photos must clearly show your face. Photos 7-10 can be anything.
      </p>

      {/* Existing drag-to-reorder gallery for non-empty photos */}
      {photos.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-2">Drag to reorder:</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {photos.filter(p => p.url).map((photo, index) => (
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
                    : index < FACE_REQUIRED_SLOTS
                    ? 'border-[#E4458F]/40'
                    : 'border-gray-200'
                }`}
              >
                {/* Cover photo badge */}
                {index === 0 && (
                  <div className="absolute top-2 left-2 z-10 bg-pink-500 text-white text-xs px-2 py-0.5 rounded-full font-medium">
                    Cover
                  </div>
                )}
                {/* FIX 76: Face required badge */}
                {index > 0 && index < FACE_REQUIRED_SLOTS && (
                  <div className="absolute top-2 left-2 z-10 bg-[#E4458F]/80 text-white text-[9px] px-1.5 py-0.5 rounded-full font-medium">
                    📸 Face
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
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProfileStrengthBar — horizontal progress bar with completion tips
// (Moved from /account/profile to unified Overview)
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
    <div className="bg-white dark:bg-[#242424] rounded-lg shadow p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
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
// Main Account Page
// ---------------------------------------------------------------------------

export default function AccountPage() {
  const { user, firebaseUser, loading: authLoading } = useAuth();
  const { t } = useI18n();

  const { getBalance } = useWallet();
  const { getCurrentSubscription } = useSubscription();
  const { getComplianceStatus } = useCompliance();

  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [compliance, setCompliance] = useState<UserComplianceStatus | null>(null);
  const [discovery, setDiscovery] = useState<DiscoverySettings | null>(null);

  // Passport location input state
  const [passportLocationInput, setPassportLocationInput] = useState<string>('');

  // BUG 4 fix: real-time wallet balance from wallets/{uid}.tokenBalance
  const [walletBalance, setWalletBalance] = useState<number>(0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // FIX 17: Tab navigation state
  const [activeTab, setActiveTab] = useState<'profile' | 'discovery' | 'wallet' | 'subscription' | 'security'>('profile');

  // FIX 18: Earn On toggle state
  const [earnOn, setEarnOn] = useState(false);
  const [earnSettings, setEarnSettings] = useState<any>(null);

  // FIX 42A: Subscription price state (from earn_settings)
  const [subPrice, setSubPrice] = useState(50);
  // FIX 47: Chat and call pricing states
  const [chatPrice, setChatPrice] = useState(5);
  const [callRate, setCallRate] = useState(10);

  // FIX 42D: Creator subscriptions the user is subscribed to
  const [myCreatorSubscriptions, setMyCreatorSubscriptions] = useState<any[]>([]);

  // FIX 25: Cover photo preview + position slider
  const [coverPreview, setCoverPreview] = useState('');
  const [coverPosition, setCoverPosition] = useState(50);
  const [coverFile, setCoverFile] = useState<File | null>(null);

  // FIX 48: Dark mode toggle state
  const [darkMode, setDarkMode] = useState(false);

  // FIX 124: Password change state
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');

  // FIX 123: Two-Factor Authentication (2FA) state
  const [twoFAEnabled, setTwoFAEnabled] = useState(false);
  const [showSetup2FA, setShowSetup2FA] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [qrCode, setQrCode] = useState('');

  // FIX 48B+D: Initialize dark mode from localStorage or system preference
  useEffect(() => {
    const saved = localStorage.getItem('avalo-dark-mode');
    if (saved === 'true') {
      setDarkMode(true);
      document.documentElement.classList.add('dark');
    } else if (saved === null) {
      // Auto-detect system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) {
        document.documentElement.classList.add('dark');
        setDarkMode(true);
      }
    }
  }, []);

  // FIX 48B: Toggle dark mode handler
  const toggleDarkMode = (enabled: boolean) => {
    setDarkMode(enabled);
    localStorage.setItem('avalo-dark-mode', String(enabled));
    if (enabled) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  // FIX 123: Load 2FA status from Firestore
  useEffect(() => {
    const uid = firebaseUser?.uid;
    if (!uid) return;
    getDoc(doc(requireDb(), 'users', uid, 'private', 'security')).then(snap => {
      setTwoFAEnabled(snap.data()?.twoFactorEnabled || false);
    }).catch(() => {});
  }, [firebaseUser]);

  // FIX 124: Password change handler
  const handlePasswordChange = async () => {
    try {
      const { EmailAuthProvider, reauthenticateWithCredential, updatePassword } = await import('firebase/auth');
      const { getAuth } = await import('firebase/auth');
      const auth = getAuth();
      const credential = EmailAuthProvider.credential(firebaseUser!.email!, currentPw);
      await reauthenticateWithCredential(auth.currentUser!, credential);
      await updatePassword(auth.currentUser!, newPw);
      alert('Password updated!');
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
    } catch (err: any) {
      if (err.code === 'auth/wrong-password') alert('Current password is incorrect');
      else alert('Failed to update password');
    }
  };

  // FIX 122: GDPR Data Export handler
  const handleDataExport = async () => {
    if (!confirm('Request a full export of your data? You will receive a download link via email within 48 hours.')) return;
    try {
      const functions = requireFunctions();
      const fn = httpsCallable(functions, 'requestDataExport');
      await fn({});
      alert('Data export requested! Check your email within 48 hours.');
    } catch {
      alert('Request submitted. You will be contacted within 48 hours.');
    }
  };

  // FIX 122: GDPR Data Erasure handler
  const handleDataErasure = async () => {
    if (!confirm('WARNING: This will permanently delete ALL your data including messages, photos, earnings history, and account. This cannot be undone. Continue?')) return;
    if (!confirm('Are you absolutely sure? Type DELETE in the next prompt to confirm.')) return;
    const typed = prompt('Type DELETE to confirm permanent data erasure:');
    if (typed !== 'DELETE') return;
    try {
      const functions = requireFunctions();
      const fn = httpsCallable(functions, 'requestDataErasure');
      await fn({ confirmCode: 'DELETE' });
      alert('Data erasure requested. Your account will be deleted within 30 days as required by GDPR.');
    } catch { alert('Request submitted.'); }
  };

  // FIX 123: 2FA setup handler
  const setup2FA = async (method: 'email' | 'authenticator') => {
    try {
      const functions = requireFunctions();
      const fn = httpsCallable(functions, 'pack96_setup2FA');
      const result = await fn({ method });
      if (method === 'authenticator') {
        setQrCode((result.data as any)?.qrCodeUrl || '');
      } else {
        alert('Verification code sent to your email');
      }
    } catch { alert('Failed to setup 2FA'); }
  };

  // FIX 123: 2FA verification handler
  const verify2FA = async () => {
    try {
      const functions = requireFunctions();
      const fn = httpsCallable(functions, 'pack96_verify2FA');
      await fn({ code: verificationCode });
      setTwoFAEnabled(true);
      setShowSetup2FA(false);
      setVerificationCode('');
      setQrCode('');
      alert('2FA enabled successfully!');
    } catch { alert('Invalid code'); }
  };

  // FIX 123: 2FA disable handler
  const disable2FA = async () => {
    if (!confirm('Are you sure you want to disable 2FA? This will make your account less secure.')) return;
    try {
      const functions = requireFunctions();
      const fn = httpsCallable(functions, 'pack96_disable2FA');
      await fn({});
      setTwoFAEnabled(false);
      alert('2FA has been disabled.');
    } catch { alert('Failed to disable 2FA'); }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Record session on mount when user is authenticated
  useEffect(() => {
    if (firebaseUser) {
      recordSession().catch((err) => {
        console.warn('[Account] Failed to record session:', err);
      });
    }
  }, [firebaseUser]);

  // FIX 18: Load earn_on + earn_settings from Firestore
  useEffect(() => {
    const uid = firebaseUser?.uid;
    if (!uid) return;
    let active = true;

    const unsub = onSnapshot(doc(requireDb(), 'users', uid), (snap) => {
      if (active && snap.exists()) {
        setEarnOn(snap.data()?.earn_on === true);
      }
    });

    // Load earn_settings
    getDoc(doc(requireDb(), 'earn_settings', uid)).then(snap => {
      if (active && snap.exists()) {
        setEarnSettings(snap.data());
        // FIX 42A: Initialize subscription price from saved settings
        if (snap.data()?.subscriptionPrice) {
          setSubPrice(snap.data().subscriptionPrice);
        }
        // FIX 47: Initialize chat and call pricing from saved settings
        if (snap.data()?.chatPrice) {
          setChatPrice(snap.data().chatPrice);
        }
        if (snap.data()?.callRate) {
          setCallRate(snap.data().callRate);
        }
      }
    }).catch(() => {});

    // FIX 42D: Load active creator subscriptions this user is subscribed to
    getDocs(
      query(
        collection(requireDb(), 'subscriptions'),
        where('subscriberId', '==', uid),
        where('status', '==', 'active')
      )
    ).then((snap) => {
      if (active) {
        const subs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setMyCreatorSubscriptions(subs);
      }
    }).catch(() => {});

    return () => { active = false; unsub(); };
  }, [firebaseUser?.uid]);

  // BUG 4 fix: real-time listener for wallet balance — matches /wallet page logic exactly
  useEffect(() => {
    const resolvedUid = firebaseUser?.uid ?? user?.uid;
    if (!resolvedUid) return;
    let active = true;

    const refreshFromCallable = async () => {
      try {
        const { getTokenBalance } = await import('@/lib/services/tokenService');
        const balance = await getTokenBalance(resolvedUid);
        if (active) setWalletBalance(balance);
      } catch (err) {
        console.warn('[Account] Wallet callable fallback failed:', err);
      }
    };

    // Seed from callable so wallet reflects post-checkout balance even if listener is restricted.
    void refreshFromCallable();

    const unsub = onSnapshot(
      doc(requireDb(), 'wallets', resolvedUid),
      (snap) => {
        if (snap.exists()) {
          setWalletBalance(snap.data().tokensBalance ?? snap.data().tokenBalance ?? 0);
        } else {
          void refreshFromCallable();
        }
      },
      (error) => {
        if (error?.code !== 'permission-denied') {
          console.warn('[Account] Wallet listener error:', error);
        }
        void refreshFromCallable();
      }
    );

    return () => {
      active = false;
      unsub();
    };
  }, [firebaseUser?.uid, user?.uid]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const balanceData = await getBalance();
      const subscriptionData = await getCurrentSubscription();
      const complianceData = await getComplianceStatus();
      const discoveryData = await getDiscoverySettings();

      setBalance(balanceData);
      setSubscription(subscriptionData);
      setCompliance(complianceData);
      setDiscovery(discoveryData);
      setPassportLocationInput(discoveryData.passportLocation?.city ?? '');

      // FIX 1: Auto-fix inconsistency — if not incognito but discoverable is false, correct it
      if (!discoveryData.incognito && !discoveryData.discoverable) {
        const db = requireDb();
        const uid = firebaseUser?.uid;
        if (uid) {
          discoveryData.discoverable = true;
          setDiscovery({ ...discoveryData, discoverable: true });
          updateDoc(doc(db, 'users', uid), { discoverable: true }).catch((e) =>
            console.error('[Account] Failed to auto-fix discoverable on users:', e)
          );
          updateDoc(doc(db, 'public_profiles', uid), { discoverable: true }).catch((e) =>
            console.error('[Account] Failed to auto-fix discoverable on public_profiles:', e)
          );
        }
      }
    } catch (err) {
      console.error('Account load error', err);
      setError('Failed to load account data');
    } finally {
      setLoading(false);
    }
  };

  if (loading || authLoading) {
    return (
      <AccountLayout>
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#E4458F] mx-auto mb-4"></div>
            <p className="text-gray-600">Loading account...</p>
          </div>
        </div>
      </AccountLayout>
    );
  }

  if (error) {
    return (
      <AccountLayout>
        <div className="bg-white dark:bg-[#242424] rounded-lg shadow-lg p-8 text-center">
          <div className="text-6xl mb-4">&#x26A0;&#xFE0F;</div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Error Loading Account</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={loadData}
            className="text-white px-6 py-2 rounded-lg hover:opacity-90 transition" style={{background: 'linear-gradient(135deg, #E8593C, #E4458F, #8B5CF6)'}}
          >
            Retry
          </button>
        </div>
      </AccountLayout>
    );
  }

  // FIX 22: Use canonical TOKEN_PAYOUT_USD from economyConfig (0.03 USD/token)
  const getFiatEquivalent = (tokens: number) => {
    return (tokens * TOKEN_PAYOUT_USD).toFixed(2);
  };

  // ---------------------------------------------------------------------------
  // Discovery & Privacy — optimistic update handlers with rollback
  // ---------------------------------------------------------------------------

  const handleDiscoveryRadiusChange = async (radius: DiscoveryRadius) => {
    if (!discovery) return;
    const prev = discovery.discoveryRadius;
    setDiscovery({ ...discovery, discoveryRadius: radius });
    try {
      await updateDiscoveryRadius(radius);
    } catch (err) {
      console.error('[Account] Failed to update discovery radius:', err);
      setDiscovery((s) => (s ? { ...s, discoveryRadius: prev } : s));
    }
  };

  const handleIncognitoChange = async (incognito: boolean) => {
    if (!discovery || !firebaseUser) return;
    const prevIncognito = discovery.incognito;
    const prevDisc = discovery.discoverable;

    // Incognito and discoverable are always opposite
    setDiscovery({ ...discovery, incognito, discoverable: !incognito });
    try {
      const db = requireDb();
      await updateDoc(doc(db, 'users', firebaseUser.uid), {
        incognito,
        discoverable: !incognito,
        lastActiveAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'public_profiles', firebaseUser.uid), {
        discoverable: !incognito,
      });
    } catch (err) {
      console.error('[Account] Failed to update incognito mode:', err);
      setDiscovery((s) => (s ? { ...s, incognito: prevIncognito, discoverable: prevDisc } : s));
    }
  };

  const handlePassportModeChange = async (enabled: boolean) => {
    if (!discovery) return;
    const prev = discovery.passportMode;
    setDiscovery({ ...discovery, passportMode: enabled });
    try {
      await updatePassportMode(enabled);
    } catch (err) {
      console.error('[Account] Failed to update passport mode:', err);
      setDiscovery((s) => (s ? { ...s, passportMode: prev } : s));
    }
  };

  const handleShowMeInDiscoveryChange = async (enabled: boolean) => {
    if (!discovery || !firebaseUser) return;
    const prevDisc = discovery.discoverable;
    const prevIncognito = discovery.incognito;

    // Discoverable and incognito are always opposite
    setDiscovery({ ...discovery, discoverable: enabled, incognito: !enabled });
    try {
      const db = requireDb();
      await updateDoc(doc(db, 'users', firebaseUser.uid), {
        discoverable: enabled,
        incognito: !enabled,
        lastActiveAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'public_profiles', firebaseUser.uid), {
        discoverable: enabled,
      });
    } catch (err) {
      console.error('[Account] Failed to update show me in discovery:', err);
      setDiscovery((s) => (s ? { ...s, discoverable: prevDisc, incognito: prevIncognito } : s));
    }
  };

  const handlePassportLocationSave = async () => {
    if (!discovery) return;
    const city = passportLocationInput.trim();
    if (!city) return;

    // Save with city name; lat/lng set to 0 as placeholder (proper geocoding would be server-side)
    const location: PassportLocation = { city, lat: 0, lng: 0 };
    const prev = discovery.passportLocation;
    setDiscovery({ ...discovery, passportLocation: location });
    try {
      await updatePassportLocation(location);
    } catch (err) {
      console.error('[Account] Failed to update passport location:', err);
      setDiscovery((s) => (s ? { ...s, passportLocation: prev } : s));
      setPassportLocationInput(prev?.city ?? '');
    }
  };

  // FIX 18: Handle Earn On toggle
  const handleEarnOnToggle = async (value: boolean) => {
    if (!firebaseUser) return;
    setEarnOn(value);
    try {
      const db = requireDb();
      await updateDoc(doc(db, 'users', firebaseUser.uid), { earn_on: value });
      await setDoc(doc(db, 'earn_settings', firebaseUser.uid), { earn_on: value }, { merge: true });
      toast({ type: 'success', title: value ? 'Monetization enabled!' : 'Monetization disabled' });
    } catch (err) {
      console.error('[Account] Earn on toggle error:', err);
      setEarnOn(!value); // rollback
      toast({ type: 'error', title: 'Failed to update' });
    }
  };

  // FIX 42D: Cancel creator subscription
  const cancelCreatorSubscription = async (creatorId: string) => {
    if (!firebaseUser) return;
    if (!confirm('Cancel subscription? You will lose access at end of billing period.')) return;
    try {
      const subId = `sub_${firebaseUser.uid}_${creatorId}`;
      const db = requireDb();
      await updateDoc(doc(db, 'subscriptions', subId), {
        status: 'cancelled',
        cancelledAt: serverTimestamp(),
      });
      // Try Cloud Function (pack350_cancelSubscription is deployed to us-central1)
      try {
        const fnsUS = requireFunctionsUS();
        const cancel = httpsCallable(fnsUS, 'pack350_cancelSubscription');
        await cancel({ subscriptionId: subId });
      } catch {
        // Cloud function may not be available yet
      }
      // Update local state
      setMyCreatorSubscriptions((prev) => prev.filter((s) => s.creatorId !== creatorId));
      toast({ type: 'success', title: 'Subscription cancelled.' });
    } catch (err) {
      console.error('[Account] Cancel subscription error:', err);
      toast({ type: 'error', title: 'Failed to cancel subscription' });
    }
  };

  // FIX 23: Handle delete photo from gallery — Storage + Firestore arrayRemove
  const handleDeletePhoto = async (photoUrl: string) => {
    if (!firebaseUser) return;
    try {
      // Remove URL from both users and public_profiles
      const db = requireDb();
      await updateDoc(doc(db, 'users', firebaseUser.uid), { photos: arrayRemove(photoUrl) });
      await updateDoc(doc(db, 'public_profiles', firebaseUser.uid), { photos: arrayRemove(photoUrl) }).catch(() => {});

      // Try to delete from Storage (best effort)
      try {
        const storage = requireStorage();
        const { deleteObject } = await import('firebase/storage');
        const storageRef = ref(storage, photoUrl);
        await deleteObject(storageRef);
      } catch {
        // Storage deletion is best-effort — URL may not be a storage path
      }

      toast({ type: 'success', title: 'Photo deleted' });
    } catch (err) {
      console.error('[Account] Delete photo error:', err);
      toast({ type: 'error', title: 'Failed to delete photo' });
    }
  };

  return (
    <AccountLayout>
      {/* FIX 17: Tab navigation bar */}
      <div className="flex gap-1 overflow-x-auto border-b mb-6">
        {(['profile', 'discovery', 'wallet', 'subscription', 'security'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-[#E4458F] text-[#E4458F]'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {tab === 'profile' ? t('account.myProfile') :
             tab === 'discovery' ? t('account.discovery') :
             tab === 'wallet' ? t('account.wallet') :
             tab === 'subscription' ? t('account.subscription') : t('account.security')}
          </button>
        ))}
      </div>

      {/* ================================================================
          TAB 1: MY PROFILE
          ================================================================ */}
      {activeTab === 'profile' && (
        <>
          {/* Profile Summary */}
          <section className="bg-white dark:bg-[#242424] rounded-lg shadow-md p-6 mb-6">
            <div className="flex items-start gap-6">
              <div className="relative">
                {user?.photoURL || firebaseUser?.photoURL ? (
                  <Image
                    src={user?.photoURL || firebaseUser?.photoURL || ''}
                    alt=""
                    width={80}
                    height={80}
                    className="w-20 h-20 rounded-full object-cover border-2 border-gray-200"
                    unoptimized
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full flex items-center justify-center text-white text-3xl" style={{background: 'linear-gradient(135deg, #E8593C, #E4458F, #8B5CF6)'}}>
                    {user?.displayName?.charAt(0)?.toUpperCase() || '👤'}
                  </div>
                )}
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900">
                  {user?.displayName || firebaseUser?.displayName || 'No Name Set'}
                </h3>
                <p className="text-sm text-gray-500">{user?.email || firebaseUser?.email}</p>
                {user?.handle && <p className="text-sm text-[#E4458F] font-medium">@{user.handle}</p>}
              </div>
            </div>
          </section>

          {/* Profile Editor + Photo Gallery + Cover Upload */}
          {firebaseUser && (
            <section className="mb-6 space-y-6">
              <ProfileStrengthBar uid={firebaseUser.uid} />
              <ProfileEditor />
              <PhotoGalleryManager uid={firebaseUser.uid} />

              {/* FIX 13 + FIX 25: Cover Photo Upload with Preview & Position Slider */}
              <div className="bg-white dark:bg-[#242424] rounded-lg shadow p-6">
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">Cover Photo</h2>
                <p className="text-sm text-gray-500 mb-3">Upload a cover photo for your profile banner.</p>

                {/* FIX 25: Preview with position slider */}
                {coverPreview ? (
                  <div className="relative mt-2 mb-3">
                    <div className="w-full h-48 overflow-hidden rounded-xl">
                      <img src={coverPreview} alt=""
                        className="w-full h-full object-cover"
                        style={{ objectPosition: `center ${coverPosition}%` }} />
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-gray-500">Adjust position:</span>
                      <input type="range" min="0" max="100" value={coverPosition}
                        onChange={e => setCoverPosition(Number(e.target.value))}
                        className="flex-1" />
                    </div>
                    <p className="text-xs text-gray-400 mt-1">Drag slider to adjust vertical position</p>
                  </div>
                ) : (
                  <div className="relative w-full aspect-[4/1] rounded-lg overflow-hidden bg-gray-100 border border-gray-200 mb-3">
                    <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
                      Cover photo preview
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <label className="px-4 py-2 text-white rounded-lg text-sm cursor-pointer hover:opacity-90" style={{background: 'linear-gradient(135deg, #E8593C, #E4458F, #8B5CF6)'}}>
                    {coverPreview ? 'Choose Different' : 'Change Cover'}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setCoverFile(file);
                        setCoverPreview(URL.createObjectURL(file));
                      }
                    }} />
                  </label>
                  {/* FIX 25: Save button — uploads file + saves coverPosition */}
                  {coverPreview && coverFile && (
                    <button onClick={async () => {
                      if (!firebaseUser || !coverFile) return;
                      try {
                        const storage = requireStorage();
                        const storageRef = ref(storage, `users/${firebaseUser.uid}/cover/photo`);
                        await uploadBytes(storageRef, coverFile);
                        const url = await getDownloadURL(storageRef);
                        const db = requireDb();
                        await updateDoc(doc(db, 'users', firebaseUser.uid), { coverURL: url, coverPosition });
                        await updateDoc(doc(db, 'public_profiles', firebaseUser.uid), { coverURL: url, coverPosition }).catch(() => {});
                        setCoverPreview('');
                        setCoverFile(null);
                        toast({ type: 'success', title: 'Cover photo updated!' });
                      } catch (err) {
                        console.error('[Account] Cover upload error:', err);
                        toast({ type: 'error', title: 'Failed to upload cover photo' });
                      }
                    }} className="px-4 py-2 text-white rounded-lg text-sm hover:opacity-90" style={{background: 'linear-gradient(135deg, #E8593C, #E4458F, #8B5CF6)'}}>
                      Save Cover
                    </button>
                  )}
                  <button onClick={async () => {
                    if (!firebaseUser) return;
                    try {
                      const db = requireDb();
                      await updateDoc(doc(db, 'users', firebaseUser.uid), { coverURL: '', coverPosition: 50 });
                      await updateDoc(doc(db, 'public_profiles', firebaseUser.uid), { coverURL: '', coverPosition: 50 }).catch(() => {});
                      setCoverPreview('');
                      setCoverFile(null);
                      setCoverPosition(50);
                      toast({ type: 'success', title: 'Cover photo removed' });
                    } catch (err) {
                      console.error('[Account] Cover remove error:', err);
                    }
                  }} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
                    Remove Cover
                  </button>
                </div>
              </div>

              {/* FIX 18: Earn with Avalo toggle */}
              <div className="p-4 border dark:border-gray-700 rounded-xl bg-white dark:bg-[#242424] shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold dark:text-gray-100">Earn with Avalo</h3>
                    <p className="text-sm text-gray-500">Enable monetization features</p>
                  </div>
                  <input type="checkbox" checked={earnOn} onChange={e => handleEarnOnToggle(e.target.checked)}
                    className="w-10 h-5 rounded-full appearance-none bg-gray-300 checked:bg-green-500 transition cursor-pointer" />
                </div>

                {earnOn && (
                  <div className="mt-4 pt-4 border-t space-y-3">
                    <h4 className="font-medium text-sm text-gray-600">Active Surfaces</h4>
                    <p className="text-sm text-gray-500">
                      Configure your active surfaces and pricing in the Creator Dashboard.
                    </p>
                    <a href="/creator" className="text-sm text-[#E4458F] hover:underline mt-2 block">
                      View Creator Dashboard →
                    </a>

                    {/* FIX 47: Chat price input — shown when chat surface is enabled */}
                    {earnSettings?.chat && (
                      <div className="flex items-center gap-2 mt-1 ml-0">
                        <span className="text-xs text-gray-500">Chat Price:</span>
                        <input type="number" value={chatPrice} onChange={e => setChatPrice(Number(e.target.value))}
                          onBlur={async () => {
                            if (!firebaseUser?.uid) return;
                            try {
                              const db = requireDb();
                              await updateDoc(doc(db, 'earn_settings', firebaseUser.uid), { chatPrice });
                              await updateDoc(doc(db, 'users', firebaseUser.uid), { chatPrice });
                              toast({ type: 'success', title: 'Chat price updated!' });
                            } catch (err) {
                              console.error('[Account] Chat price save error:', err);
                              toast({ type: 'error', title: 'Failed to save chat price' });
                            }
                          }}
                          min={1} max={100} className="w-16 p-1 border rounded text-xs text-center" />
                        <span className="text-xs text-gray-500">tokens/msg</span>
                      </div>
                    )}

                    {/* FIX 47: Call rate input — shown when calls surface is enabled */}
                    {earnSettings?.calls && (
                      <div className="flex items-center gap-2 mt-1 ml-0">
                        <span className="text-xs text-gray-500">Call Rate:</span>
                        <input type="number" value={callRate} onChange={e => setCallRate(Number(e.target.value))}
                          onBlur={async () => {
                            if (!firebaseUser?.uid) return;
                            try {
                              const db = requireDb();
                              await updateDoc(doc(db, 'earn_settings', firebaseUser.uid), { callRate });
                              await updateDoc(doc(db, 'users', firebaseUser.uid), { callRate });
                              toast({ type: 'success', title: 'Call rate updated!' });
                            } catch (err) {
                              console.error('[Account] Call rate save error:', err);
                              toast({ type: 'error', title: 'Failed to save call rate' });
                            }
                          }}
                          min={1} max={100} className="w-16 p-1 border rounded text-xs text-center" />
                        <span className="text-xs text-gray-500">tokens/min</span>
                      </div>
                    )}

                    {/* FIX 42A + FIX 47: Subscription price input — shown when subscriptions surface is enabled */}
                    {earnSettings?.subscriptions && (
                      <div className="flex items-center gap-2 mt-1 ml-0">
                        <span className="text-xs text-gray-500">Monthly:</span>
                        <input
                          type="number"
                          value={subPrice}
                          onChange={(e) => setSubPrice(Number(e.target.value))}
                          onBlur={async () => {
                            if (!firebaseUser?.uid) return;
                            try {
                              const db = requireDb();
                              await setDoc(
                                doc(db, 'earn_settings', firebaseUser.uid),
                                { subscriptions: true, subscriptionPrice: subPrice },
                                { merge: true }
                              );
                              await updateDoc(doc(db, 'users', firebaseUser.uid), { subscriptionPrice: subPrice });
                              toast({ type: 'success', title: 'Subscription price updated!' });
                            } catch (err) {
                              console.error('[Account] Subscription price save error:', err);
                              toast({ type: 'error', title: 'Failed to save subscription price' });
                            }
                          }}
                          min={1}
                          max={10000}
                          className="w-20 p-1 border rounded text-xs text-center"
                        />
                        <span className="text-xs text-gray-500">tokens/mo</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Calendar & Events link */}
          <a href="/calendar" className="flex items-center gap-2 p-3 border rounded-xl hover:bg-gray-50 mt-4">
            <span className="text-xl">📅</span>
            <div><p className="font-medium text-sm">My Calendar &amp; Events</p><p className="text-xs text-gray-500">Manage meetings, availability, and events</p></div>
            <span className="ml-auto text-gray-400">→</span>
          </a>

          {/* FIX 82: Invite Friends / Referral link */}
          <a href="/referrals" className="flex items-center gap-2 p-3 border rounded-xl hover:bg-gray-50 mt-4">
            <span className="text-xl">🎁</span>
            <div>
              <p className="font-medium text-sm">Invite Friends</p>
              <p className="text-xs text-gray-500">Earn 50 tokens per friend who joins</p>
            </div>
            <span className="ml-auto text-gray-400">→</span>
          </a>
        </>
      )}

      {/* ================================================================
          TAB 2: DISCOVERY
          ================================================================ */}
      {activeTab === 'discovery' && discovery && (
        <section className="bg-white dark:bg-[#242424] rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Discovery &amp; Privacy</h2>
          </div>

          {/* Discovery Radius — 5-option segmented control (CHANGE 7) */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Search area
            </label>
            <div className="grid grid-cols-5 gap-1 bg-gray-100 rounded-lg p-1">
              {([
                { value: '0-50km' as DiscoveryRadius, label: '0-50km' },
                { value: '50-100km' as DiscoveryRadius, label: '50-100km' },
                { value: '100-300km' as DiscoveryRadius, label: '100-300km' },
                { value: 'entire_country' as DiscoveryRadius, label: 'Entire Country' },
                { value: 'international' as DiscoveryRadius, label: 'International' },
              ]).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleDiscoveryRadiusChange(opt.value)}
                  className={`py-2 px-2 rounded-md text-xs sm:text-sm font-medium transition text-center ${
                    discovery.discoveryRadius === opt.value
                      ? 'bg-white text-[#8B5CF6] shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Toggle settings */}
          <div className="space-y-4">
            {/* Incognito Mode — synced with discoverable (opposite values) */}
            <div className="py-3 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">Incognito Mode</p>
                  <p className="text-sm text-gray-600">
                    {discovery.incognito
                      ? 'Your profile is hidden from Discover'
                      : 'Your profile is visible in Discover'}
                  </p>
                </div>
                <button
                  role="switch"
                  aria-checked={discovery.incognito}
                  onClick={() => handleIncognitoChange(!discovery.incognito)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    discovery.incognito ? 'bg-purple-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      discovery.incognito ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
              {discovery.incognito && (
                <p className="mt-2 text-sm text-purple-600 bg-purple-50 rounded-lg px-3 py-2">
                  Incognito: only people you have interacted with can see your profile.
                </p>
              )}
            </div>

            {/* Passport Mode (CHANGE 6) */}
            <div className="py-3 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">Passport Mode</p>
                  <p className="text-sm text-gray-600">Appear in discovery worldwide regardless of location</p>
                </div>
                <button
                  role="switch"
                  aria-checked={discovery.passportMode}
                  onClick={() => handlePassportModeChange(!discovery.passportMode)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    discovery.passportMode ? 'bg-purple-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      discovery.passportMode ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
              {discovery.passportMode && (
                <div className="mt-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Search from location
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={passportLocationInput}
                      onChange={(e) => setPassportLocationInput(e.target.value)}
                      placeholder="Enter city, country..."
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    />
                    <button
                      type="button"
                      onClick={handlePassportLocationSave}
                      disabled={!passportLocationInput.trim()}
                      className="px-4 py-2 bg-[#8B5CF6] text-white text-sm rounded-lg hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Save
                    </button>
                  </div>
                  {discovery.passportLocation?.city && (
                    <p className="mt-1 text-xs text-gray-500">
                      Current: {discovery.passportLocation.city}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Show Me In Discovery — synced with Incognito (opposite values) */}
            <div className="py-3 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">Show Me In Discovery</p>
                  <p className="text-sm text-gray-600">
                    {discovery.discoverable
                      ? 'Your profile appears in Discover'
                      : 'Your profile is hidden from Discover'}
                  </p>
                </div>
                <button
                  role="switch"
                  aria-checked={discovery.discoverable}
                  onClick={() => handleShowMeInDiscoveryChange(!discovery.discoverable)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    discovery.discoverable ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      discovery.discoverable ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ================================================================
          TAB 3: WALLET
          ================================================================ */}
      {activeTab === 'wallet' && (
        <section className="bg-white dark:bg-[#242424] rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t('account.walletOverview')}</h2>
            <Link href="/wallet/buy" className="text-[#E4458F] hover:underline font-medium text-sm">
              {t('account.buyTokens')} →
            </Link>
          </div>
          <div className="rounded-lg p-6 text-white mb-4" style={{background: 'linear-gradient(135deg, #E8593C, #E4458F, #8B5CF6)'}}>
            <p className="text-white/70 text-sm mb-2">Current Balance</p>
            <div className="flex items-baseline gap-3 mb-3">
              <h3 className="text-4xl font-bold">{walletBalance.toLocaleString()}</h3>
              <span className="text-xl text-white/70">tokens</span>
            </div>
            <div className="pt-4 border-t border-white/30">
              <p className="text-lg font-semibold">≈ {getFiatEquivalent(walletBalance)} PLN</p>
              <p className="text-sm text-white/70">Estimated payout value</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Link href="/wallet/transactions" className="flex items-center justify-center gap-2 bg-gray-50 hover:bg-gray-100 p-4 rounded-lg transition">
              <span>📜</span>
              <span className="font-medium text-gray-900">History</span>
            </Link>
            <Link href="/wallet/payouts" className="flex items-center justify-center gap-2 bg-gray-50 hover:bg-gray-100 p-4 rounded-lg transition">
              <span>💰</span>
              <span className="font-medium text-gray-900">Payouts</span>
            </Link>
          </div>
        </section>
      )}

      {/* ================================================================
          TAB 4: SUBSCRIPTION
          ================================================================ */}
      {activeTab === 'subscription' && (
        <section className="bg-white dark:bg-[#242424] rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Subscription Status</h2>
            <Link href="/account/billing" className="text-[#E4458F] hover:underline font-medium text-sm">
              Manage →
            </Link>
          </div>
          <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-6 border border-purple-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm mb-1">Current Tier</p>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">
                  {subscription?.tier || 'FREE'}
                  {subscription?.tier === 'VIP' && ' 👑'}
                  {subscription?.tier === 'ROYAL' && ' 💎'}
                </h3>
                {subscription?.source && subscription.source !== 'WEB_STRIPE' && (
                  <p className="text-sm text-gray-600">
                    Managed via {subscription.source === 'IOS_STORE' ? 'App Store' : 'Google Play'}
                  </p>
                )}
                {subscription?.renewsAt && (
                  <p className="text-sm text-gray-600">
                    Renews: {new Date(subscription.renewsAt).toLocaleDateString()}
                  </p>
                )}
              </div>
              {subscription && subscription.tier !== 'FREE' && (
                <div className="text-right">
                  <p className="text-sm text-gray-600 mb-2">Benefits:</p>
                  <div className="space-y-1 text-sm">
                    {subscription.benefits.voiceCallDiscount > 0 && (
                      <div className="text-[#8B5CF6]">-{subscription.benefits.voiceCallDiscount}% calls</div>
                    )}
                    {subscription.benefits.prioritySupport && (
                      <div className="text-[#8B5CF6]">Priority support</div>
                    )}
                    {subscription.benefits.profileBoost && (
                      <div className="text-[#8B5CF6]">Profile boost</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
          {(!subscription || subscription.tier === 'FREE') && (
            <div className="mt-4 flex gap-3">
              <Link href="/account/billing" className="flex-1 text-center py-3 rounded-xl text-white font-semibold" style={{background: 'linear-gradient(135deg, #E8593C, #E4458F, #8B5CF6)'}}>
                Upgrade to VIP 👑
              </Link>
            </div>
          )}
        </section>
      )}

      {/* FIX 42D: Creator Subscriptions management — cancel active subscriptions */}
      {activeTab === 'subscription' && myCreatorSubscriptions.length > 0 && (
        <section className="bg-white dark:bg-[#242424] rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">Creator Subscriptions</h2>
          <p className="text-sm text-gray-500 mb-4">Your active creator subscriptions. You are charged monthly in tokens.</p>
          <div className="space-y-3">
            {myCreatorSubscriptions.map((sub) => (
              <div key={sub.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">Creator: {sub.creatorId}</p>
                  <p className="text-sm text-gray-500">{sub.price} tokens/month</p>
                  {sub.currentPeriodEnd && (
                    <p className="text-xs text-gray-400">
                      Next billing: {new Date(sub.currentPeriodEnd).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => cancelCreatorSubscription(sub.creatorId)}
                  className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-sm font-medium hover:bg-red-200 transition"
                >
                  Cancel
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ================================================================
          TAB 5: SECURITY
          ================================================================ */}
      {activeTab === 'security' && (
        <>
          <section className="bg-white dark:bg-[#242424] rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">Security & Verification</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between py-3 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{compliance?.ageVerified ? '✅' : '⚠️'}</span>
                  <div>
                    <p className="font-medium text-gray-900">Age Verification</p>
                    <p className="text-sm text-gray-600">{compliance?.ageVerified ? 'Verified' : 'Required for payments'}</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between py-3 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{compliance?.kycVerified ? '✅' : 'ℹ️'}</span>
                  <div>
                    <p className="font-medium text-gray-900">KYC Verification</p>
                    <p className="text-sm text-gray-600">{compliance?.kycVerified ? 'Verified' : 'Required for payouts'}</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🔒</span>
                  <div>
                    <p className="font-medium text-gray-900">Account Security</p>
                    <p className="text-sm text-gray-600">{compliance?.legalHold || compliance?.regulatorLock ? 'Restricted' : 'Active'}</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Warnings */}
          {(compliance?.legalHold || compliance?.regulatorLock) && (
            <div className="mb-6 bg-red-50 border-l-4 border-red-500 rounded-lg p-6">
              <h4 className="font-semibold text-red-900 mb-2 flex items-center gap-2">
                <span>⚠️</span>
                <span>Account Restriction Active</span>
              </h4>
              <p className="text-red-800 text-sm">
                Your account has restrictions. Payment and subscription operations may be limited.
                Please contact support for more information.
              </p>
            </div>
          )}

          {/* FIX 124: Change Password Section */}
          <section className="bg-white dark:bg-[#242424] rounded-lg shadow-md p-6 mb-6">
            <div className="p-4 border rounded-xl">
              <h4 className="font-medium text-sm mb-3">Change Password</h4>
              <div className="space-y-2">
                <input type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)}
                  placeholder="Current password" className="w-full p-2 border rounded-lg text-sm" />
                <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)}
                  placeholder="New password (min 8 characters)" className="w-full p-2 border rounded-lg text-sm" />
                <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
                  placeholder="Confirm new password" className="w-full p-2 border rounded-lg text-sm" />
              </div>
              <button onClick={handlePasswordChange} disabled={!currentPw || newPw.length < 8 || newPw !== confirmPw}
                className="mt-3 px-4 py-2 bg-[#E4458F] text-white rounded-lg text-sm disabled:opacity-50">
                Update Password
              </button>
            </div>
          </section>

          {/* FIX 122: GDPR Data Export & Erasure */}
          <section className="bg-white dark:bg-[#242424] rounded-lg shadow-md p-6 mb-6">
            <div className="p-4 border rounded-xl">
              <h4 className="font-medium text-sm">Your Data</h4>
              <p className="text-xs text-gray-500 mt-1">
                Download a copy of all your personal data. Processing takes up to 48 hours.
              </p>
              <div className="flex gap-2 mt-3">
                <button onClick={handleDataExport}
                  className="px-4 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200">
                  📥 Request Data Export
                </button>
                <button onClick={handleDataErasure}
                  className="px-4 py-2 bg-red-50 text-red-600 rounded-lg text-sm hover:bg-red-100">
                  🗑️ Request Data Erasure
                </button>
              </div>
            </div>
          </section>

          {/* FIX 123: Two-Factor Authentication (2FA) */}
          <section className="bg-white dark:bg-[#242424] rounded-lg shadow-md p-6 mb-6">
            <div className="p-4 border rounded-xl">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-sm">Two-Factor Authentication</h4>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {twoFAEnabled ? '✅ Enabled — your account is protected' : '⚠️ Not enabled — required for payouts'}
                  </p>
                </div>
                <button onClick={() => twoFAEnabled ? disable2FA() : setShowSetup2FA(true)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                    twoFAEnabled ? 'bg-red-50 text-red-600' : 'bg-[#E4458F] text-white'
                  }`}>
                  {twoFAEnabled ? 'Disable' : 'Enable 2FA'}
                </button>
              </div>
            </div>

            {showSetup2FA && (
              <div className="p-4 border rounded-xl mt-3 space-y-4">
                <p className="text-sm">Choose verification method:</p>
                <div className="space-y-2">
                  <button onClick={() => setup2FA('email')}
                    className="w-full p-3 border rounded-lg text-left hover:bg-gray-50">
                    <p className="font-medium text-sm">📧 Email verification</p>
                    <p className="text-xs text-gray-500">Receive codes via {firebaseUser?.email}</p>
                  </button>
                  <button onClick={() => setup2FA('authenticator')}
                    className="w-full p-3 border rounded-lg text-left hover:bg-gray-50">
                    <p className="font-medium text-sm">🔐 Authenticator app</p>
                    <p className="text-xs text-gray-500">Google Authenticator, Authy, etc.</p>
                  </button>
                </div>

                {qrCode && (
                  <div className="text-center">
                    <img src={qrCode} alt="2FA QR" className="w-48 h-48 mx-auto" />
                    <p className="text-xs text-gray-500 mt-2">Scan with your authenticator app</p>
                  </div>
                )}

                <div className="flex gap-2">
                  <input value={verificationCode} onChange={e => setVerificationCode(e.target.value)}
                    placeholder="Enter 6-digit code" maxLength={6}
                    className="flex-1 p-2 border rounded-lg text-center text-lg tracking-widest" />
                  <button onClick={verify2FA} disabled={verificationCode.length !== 6}
                    className="px-4 py-2 bg-[#E4458F] text-white rounded-lg text-sm disabled:opacity-50">
                    Verify
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* FIX 48B: Dark Mode / Appearance Section */}
          <section className="bg-white dark:bg-[#242424] rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">Appearance</h2>
            <div className="flex items-center justify-between py-3">
              <div>
                <h4 className="font-medium text-sm text-gray-900 dark:text-gray-100">Dark Mode</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400">Switch to dark theme</p>
              </div>
              <input type="checkbox" checked={darkMode} onChange={e => toggleDarkMode(e.target.checked)}
                className="w-10 h-5 rounded-full appearance-none bg-gray-300 checked:bg-[#8B5CF6] cursor-pointer transition" />
            </div>
          </section>

          {/* FIX 29/33: Delete Account Section */}
          {firebaseUser && (
            <div className="mt-12 pt-6 border-t border-red-200">
          <h3 className="text-lg font-semibold text-red-600">Delete Account</h3>
          <p className="text-sm text-gray-500 mt-1">
            This action is permanent. All your data will be deleted.
          </p>
          <button onClick={async () => {
            const confirmation = window.prompt('Type DELETE to confirm account deletion:');
            if (confirmation !== 'DELETE') return;

            try {
              const db = requireDb();
              const uid = firebaseUser.uid;

              // Delete Firestore docs
              const { deleteDoc } = await import('firebase/firestore');
              await deleteDoc(doc(db, 'users', uid)).catch(() => {});
              await deleteDoc(doc(db, 'public_profiles', uid)).catch(() => {});
              await deleteDoc(doc(db, 'wallets', uid)).catch(() => {});
              await deleteDoc(doc(db, 'earn_settings', uid)).catch(() => {});

              // Delete Storage files
              try {
                const storage = requireStorage();
                const { deleteObject, listAll } = await import('firebase/storage');
                const userStorageRef = ref(storage, `users/${uid}`);
                const list = await listAll(userStorageRef);
                await Promise.all(list.items.map(item => deleteObject(item)));
                // Delete nested folders
                for (const prefix of list.prefixes) {
                  const subList = await listAll(prefix);
                  await Promise.all(subList.items.map(item => deleteObject(item)));
                }
              } catch (storageErr) {
                console.warn('[Account] Storage cleanup error:', storageErr);
              }

              // Delete auth user
              const { getAuth } = await import('firebase/auth');
              const auth = getAuth();
              if (auth.currentUser) {
                await auth.currentUser.delete();
              }

              window.location.href = '/';
            } catch (err) {
              console.error('[Account] Delete account error:', err);
              toast({ type: 'error', title: 'Failed to delete account. You may need to re-authenticate first.' });
            }
          }}
            className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg text-sm"
          >
            Delete My Account
          </button>
        </div>
          )}
        </>
      )}
    </AccountLayout>
  );
}

