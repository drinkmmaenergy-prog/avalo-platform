'use client';

import { MONETIZATION_SPLITS } from "@constants/monetization";
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
import { requireDb, requireStorage } from '@/lib/firebase';
import { doc, onSnapshot, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { toast } from '@/components/ui/Toaster';
import ProfileEditor from '../../components/profile/ProfileEditor';

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
// Main Account Page
// ---------------------------------------------------------------------------

export default function AccountPage() {
  const { user, firebaseUser, loading: authLoading } = useAuth();

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

  // BUG 4 fix: real-time listener for wallet balance
  useEffect(() => {
    if (!firebaseUser) return;
    const walletRef = doc(requireDb(), 'wallets', firebaseUser.uid);
    const unsubscribe = onSnapshot(walletRef, (snap) => {
      const data = snap.data();
      setWalletBalance(data?.tokenBalance ?? data?.balance ?? 0);
    }, (err) => {
      console.warn('[Account] Wallet listener error:', err);
    });
    return () => unsubscribe();
  }, [firebaseUser]);

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
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading account...</p>
          </div>
        </div>
      </AccountLayout>
    );
  }

  if (error) {
    return (
      <AccountLayout>
        <div className="bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="text-6xl mb-4">&#x26A0;&#xFE0F;</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Error Loading Account</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={loadData}
            className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 transition"
          >
            Retry
          </button>
        </div>
      </AccountLayout>
    );
  }

  const getFiatEquivalent = (tokens: number) => {
    return (tokens * MONETIZATION_SPLITS.EVENT_TICKET.avalo).toFixed(2);
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

  return (
    <AccountLayout>
      {/* Profile Summary — wired to Firebase Auth + Firestore */}
      <section className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Profile Summary</h2>
        </div>
        <div className="flex items-start gap-6">
          {/* Avatar */}
          <div className="relative">
            {user?.photoURL || firebaseUser?.photoURL ? (
              <Image
                src={user?.photoURL || firebaseUser?.photoURL || ''}
                alt={user?.displayName || 'User avatar'}
                width={80}
                height={80}
                className="w-20 h-20 rounded-full object-cover border-2 border-purple-200"
                unoptimized
              />
            ) : (
              <div className="w-20 h-20 bg-gradient-to-br from-purple-400 to-purple-600 rounded-full flex items-center justify-center text-white text-3xl">
                {user?.displayName?.charAt(0)?.toUpperCase() || '👤'}
              </div>
            )}
            {user?.isVerified && (
              <div className="absolute -bottom-1 -right-1 bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs">
                ✓
              </div>
            )}
          </div>

          {/* User Info */}
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              {user?.displayName || firebaseUser?.displayName || 'No Name Set'}
            </h3>
            <p className="text-sm text-gray-500 mb-2">
              {user?.email || firebaseUser?.email || 'No email'}
            </p>
            {user?.bio && (
              <p className="text-sm text-gray-700 mb-3 line-clamp-2">{user.bio}</p>
            )}
            {user?.handle && (
              <p className="text-sm text-purple-600 font-medium mb-2">@{user.handle}</p>
            )}

            {/* Badges row */}
            <div className="flex flex-wrap gap-2 mt-2">
              {user?.isCreator && (
                <span className="inline-flex items-center gap-1 bg-pink-100 text-pink-800 px-3 py-1 rounded-full text-xs font-medium">
                  ✨ Creator
                </span>
              )}
              {compliance?.selfieVerified && (
                <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-medium">
                  ✓ Selfie Verified
                </span>
              )}
              {compliance?.kycVerified && (
                <span className="inline-flex items-center gap-1 bg-green-100 text-green-800 px-3 py-1 rounded-full text-xs font-medium">
                  ✓ KYC Verified
                </span>
              )}
              {compliance?.ageVerified && (
                <span className="inline-flex items-center gap-1 bg-purple-100 text-purple-800 px-3 py-1 rounded-full text-xs font-medium">
                  ✓ Age Verified
                </span>
              )}
            </div>

            {/* Account metadata */}
            <div className="mt-3 text-xs text-gray-400 space-y-1">
              {firebaseUser?.metadata?.creationTime && (
                <p>Member since: {new Date(firebaseUser.metadata.creationTime).toLocaleDateString()}</p>
              )}
              {firebaseUser?.metadata?.lastSignInTime && (
                <p>Last sign-in: {new Date(firebaseUser.metadata.lastSignInTime).toLocaleDateString()}</p>
              )}
              {compliance?.country && (
                <p>Country: {compliance.country}</p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Profile Editor Section (merged from /account/profile) ────── */}
      {firebaseUser && (
        <section className="mb-6">
          <div className="max-w-2xl mx-auto space-y-6">
            {/* Profile Strength Bar */}
            <ProfileStrengthBar uid={firebaseUser.uid} />

            {/* Profile Editor (name, bio, avatar, city, gender, interests, etc.) */}
            <ProfileEditor />

            {/* Photo Gallery Manager (drag-to-reorder, captions, remove) */}
            <PhotoGalleryManager uid={firebaseUser.uid} />
          </div>
        </section>
      )}

      {/* Subscription Status */}
      <section className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Subscription Status</h2>
          <Link
            href="/account/billing"
            className="text-purple-600 hover:text-purple-700 font-medium text-sm"
          >
            Manage &rarr;
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
                  Managed via{' '}
                  {subscription.source === 'IOS_STORE' ? 'App Store' : 'Google Play'}
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
                    <div className="text-purple-700">
                      -{subscription.benefits.voiceCallDiscount}% calls
                    </div>
                  )}
                  {subscription.benefits.prioritySupport && (
                    <div className="text-purple-700">Priority support</div>
                  )}
                  {subscription.benefits.profileBoost && (
                    <div className="text-purple-700">Profile boost</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Discovery & Privacy */}
      {discovery && (
        <section className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">Discovery &amp; Privacy</h2>
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
                      ? 'bg-white text-purple-700 shadow-sm'
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
                      className="px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
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

      {/* Wallet Overview */}
      <section className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Wallet Overview</h2>
          <Link
            href="/account/tokens"
            className="text-purple-600 hover:text-purple-700 font-medium text-sm"
          >
            Buy Tokens &rarr;
          </Link>
        </div>
        <div className="bg-gradient-to-br from-purple-600 to-purple-800 rounded-lg p-6 text-white mb-4">
          <p className="text-purple-200 text-sm mb-2">Current Balance</p>
          <div className="flex items-baseline gap-3 mb-3">
            <h3 className="text-4xl font-bold">
              {walletBalance.toLocaleString()}
            </h3>
            <span className="text-xl text-purple-200">tokens</span>
          </div>
          <div className="pt-4 border-t border-purple-400">
            <p className="text-lg font-semibold">
              ≈ {getFiatEquivalent(walletBalance)} PLN
            </p>
            <p className="text-sm text-purple-200">Estimated payout value</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Link
            href="/wallet/transactions"
            className="flex items-center justify-center gap-2 bg-gray-50 hover:bg-gray-100 p-4 rounded-lg transition"
          >
            <span>📜</span>
            <span className="font-medium text-gray-900">History</span>
          </Link>
          <Link
            href="/wallet/payouts"
            className="flex items-center justify-center gap-2 bg-gray-50 hover:bg-gray-100 p-4 rounded-lg transition"
          >
            <span>💰</span>
            <span className="font-medium text-gray-900">Payouts</span>
          </Link>
        </div>
      </section>

      {/* Security Summary */}
      <section className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Security & Verification</h2>
          <Link
            href="/account/security"
            className="text-purple-600 hover:text-purple-700 font-medium text-sm"
          >
            View Details &rarr;
          </Link>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-3 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <span className="text-2xl">
                {compliance?.ageVerified ? '✅' : '⚠️'}
              </span>
              <div>
                <p className="font-medium text-gray-900">Age Verification</p>
                <p className="text-sm text-gray-600">
                  {compliance?.ageVerified ? 'Verified' : 'Required for payments'}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between py-3 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <span className="text-2xl">
                {compliance?.kycVerified ? '✅' : 'ℹ️'}
              </span>
              <div>
                <p className="font-medium text-gray-900">KYC Verification</p>
                <p className="text-sm text-gray-600">
                  {compliance?.kycVerified ? 'Verified' : 'Required for payouts'}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🔒</span>
              <div>
                <p className="font-medium text-gray-900">Account Security</p>
                <p className="text-sm text-gray-600">
                  {compliance?.legalHold || compliance?.regulatorLock
                    ? 'Restricted'
                    : 'Active'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Warnings */}
      {(compliance?.legalHold || compliance?.regulatorLock) && (
        <div className="mt-6 bg-red-50 border-l-4 border-red-500 rounded-lg p-6">
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

      {/* FIX 23: Cover Photo Upload Section */}
      {firebaseUser && (
        <section className="bg-white rounded-lg shadow-md p-6 mb-6 mt-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Cover Photo</h2>
          <p className="text-sm text-gray-500 mb-3">Upload a cover photo for your profile banner (4:1 aspect ratio recommended).</p>
          <div className="relative w-full aspect-[4/1] rounded-lg overflow-hidden bg-gray-100 border border-gray-200 mb-3">
            {/* Cover photo preview would be loaded from user doc */}
            <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
              Cover photo preview
            </div>
          </div>
          <div className="flex gap-2">
            <label className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm cursor-pointer hover:bg-purple-700">
              Change Cover
              <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file || !firebaseUser) return;
                try {
                  const storage = requireStorage();
                  const storageRef = ref(storage, `users/${firebaseUser.uid}/cover/photo`);
                  await uploadBytes(storageRef, file);
                  const url = await getDownloadURL(storageRef);
                  const db = requireDb();
                  await updateDoc(doc(db, 'users', firebaseUser.uid), { coverURL: url });
                  await updateDoc(doc(db, 'public_profiles', firebaseUser.uid), { coverURL: url }).catch(() => {});
                  toast({ type: 'success', title: 'Cover photo updated!' });
                } catch (err) {
                  console.error('[Account] Cover upload error:', err);
                  toast({ type: 'error', title: 'Failed to upload cover photo' });
                }
              }} />
            </label>
            <button onClick={async () => {
              if (!firebaseUser) return;
              try {
                const db = requireDb();
                await updateDoc(doc(db, 'users', firebaseUser.uid), { coverURL: '' });
                await updateDoc(doc(db, 'public_profiles', firebaseUser.uid), { coverURL: '' }).catch(() => {});
                toast({ type: 'success', title: 'Cover photo removed' });
              } catch (err) {
                console.error('[Account] Cover remove error:', err);
              }
            }} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
              Remove Cover
            </button>
          </div>
        </section>
      )}

      {/* FIX 29: Delete Account Section */}
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
    </AccountLayout>
  );
}
