'use client';

/**
 * Creator AI Companion Management — /creator/ai
 *
 * Allows creators to create and manage their AI bot companions.
 * Saves to Firestore collection: ai_avatars/{avatarId}
 *
 * Features:
 *   - "Create AI Companion" button at top
 *   - Creation form with all profile fields
 *   - My AI Companions grid showing creator's bots
 *   - Photo upload (profile photo + gallery)
 *   - Platform bot note
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { requireDb, requireStorage } from '@/lib/firebase';
import { useAuth } from '@/components/providers/AuthProvider';
import {
  AI_PERSONALITY_TRAITS,
  AI_ETHNICITY_OPTIONS,
  AI_BODY_TYPE_OPTIONS,
  AI_HAIR_COLOR_OPTIONS,
  AI_EYE_COLOR_OPTIONS,
  AI_INTEREST_OPTIONS,
} from '@/lib/aiEconomyConfig';
import type { AIAvatar } from '@/lib/types/aiAvatar';
import {
  Bot,
  Plus,
  X,
  Upload,
  Loader2,
  AlertTriangle,
  Sparkles,
  Trash2,
  Image as ImageIcon,
} from 'lucide-react';
import { PROFESSIONS } from '@/lib/constants/aiProfessions';

// ============================================================================
// CONSTANTS
// ============================================================================

const GENDER_OPTIONS = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'non-binary', label: 'Non-binary' },
  { value: 'other', label: 'Other' },
];

const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024; // 500MB per file

// ============================================================================
// FORM STATE TYPE
// ============================================================================

interface AICompanionFormState {
  name: string;
  age: number;
  gender: string;
  ethnicity: string;
  bodyType: string;
  hairColor: string;
  eyeColor: string;
  personalityTraits: string[];
  bio: string;
  backstory: string;
  interests: string[];
  voiceType: string;
  profilePhotoFile: File | null;
  coverPhotoFile: File | null;
  galleryPhotoFiles: File[];
}

const INITIAL_FORM_STATE: AICompanionFormState = {
  name: '',
  age: 25,
  gender: 'female',
  ethnicity: '',
  bodyType: '',
  hairColor: '',
  eyeColor: '',
  personalityTraits: [],
  bio: '',
  backstory: '',
  interests: [],
  voiceType: '',
  profilePhotoFile: null,
  coverPhotoFile: null,
  galleryPhotoFiles: [],
};

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/** Multi-select chip component */
function ChipSelector({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: readonly string[];
  selected: string[];
  onChange: (selected: string[]) => void;
}) {
  const toggle = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter((s) => s !== option));
    } else {
      onChange([...selected, option]);
    }
  };

  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
        {label}
      </label>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => toggle(option)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              selected.includes(option)
                ? 'bg-purple-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Bot card in the "My AI Companions" grid */
function BotCard({
  avatar,
  onClick,
  onDelete,
}: {
  avatar: AIAvatar;
  onClick: () => void;
  onDelete: (avatarId: string) => void;
}) {
  const primaryPhoto =
    avatar.photos && avatar.photos.length > 0 ? avatar.photos[0] : null;

  return (
    <div className="card overflow-hidden hover:ring-2 hover:ring-purple-500/50 transition-all duration-200 group text-left w-full relative">
      <button
        onClick={onClick}
        className="w-full text-left"
      >
        <div className="relative w-full aspect-[3/4] bg-gray-100 dark:bg-gray-800 overflow-hidden">
          {primaryPhoto ? (
            <img
              src={primaryPhoto}
              alt={avatar.name}
              className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400">
              <Bot className="w-12 h-12" />
            </div>
          )}
          <span className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold bg-purple-600 text-white rounded-full shadow-lg">
            <Bot className="w-3 h-3" />
            AI
          </span>
        </div>
        <div className="p-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
            {avatar.name}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {avatar.totalConversations} conversations · ⭐{' '}
            {avatar.averageRating > 0 ? avatar.averageRating.toFixed(1) : '—'}
          </p>
        </div>
      </button>
      {/* BUG 8: Delete Bot button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(avatar.id);
        }}
        className="absolute bottom-2 right-2 w-7 h-7 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
        aria-label={`Delete ${avatar.name}`}
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function CreatorAIPage() {
  const router = useRouter();
  const { user } = useAuth();

  // ── State ────────────────────────────────────────────────────────────
  const [myBots, setMyBots] = useState<AIAvatar[]>([]);
  const [loadingBots, setLoadingBots] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [form, setForm] = useState<AICompanionFormState>(INITIAL_FORM_STATE);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // BUG 8: Delete bot confirmation state
  const [deletingBotId, setDeletingBotId] = useState<string | null>(null);
  const [showDeleteBotConfirm, setShowDeleteBotConfirm] = useState(false);
  const [deletingBot, setDeletingBot] = useState(false);
  const [profilePhotoPreview, setProfilePhotoPreview] = useState<string | null>(null);
  const [coverPhotoPreview, setCoverPhotoPreview] = useState<string | null>(null);
  const [galleryPhotoPreviews, setGalleryPhotoPreviews] = useState<string[]>([]);
  // FIX 46: Personality intensity sliders
  const [personality, setPersonality] = useState<Record<string, number>>({
    humor: 5, flirt: 5, intellect: 5, energy: 5, empathy: 5,
  });
  // FIX 52: Profession preset state
  const [profession, setProfession] = useState('custom');
  const [basePrompt, setBasePrompt] = useState('');

  // ── Load creator's bots ──────────────────────────────────────────────
  useEffect(() => {
    if (!user?.uid) return;
    loadMyBots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  const loadMyBots = async () => {
    if (!user?.uid) return;

    try {
      setLoadingBots(true);
      const avatarsRef = collection(requireDb(), 'ai_avatars');
      const q = query(
        avatarsRef,
        where('creatorId', '==', user.uid),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);

      const bots: AIAvatar[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          name: d.name || 'AI Companion',
          age: d.age || 0,
          gender: d.gender || 'other',
          ethnicity: d.ethnicity || '',
          bodyType: d.bodyType || '',
          hairColor: d.hairColor || '',
          eyeColor: d.eyeColor || '',
          personalityTraits: d.personalityTraits || [],
          bio: d.bio || '',
          backstory: d.backstory || '',
          interests: d.interests || [],
          photos: d.photos || [],
          voiceType: d.voiceType || '',
          creatorId: d.creatorId || null,
          creatorDisplayName: d.creatorDisplayName || null,
          isAvaloPlatform: d.isAvaloPlatform === true,
          totalConversations: d.totalConversations || 0,
          averageRating: d.averageRating || 0,
          ratingCount: d.ratingCount || 0,
          conversationCount: d.conversationCount || d.totalConversations || 0,
          totalRatings: d.totalRatings || d.ratingCount || 0,
          profession: d.profession || '',
          basePrompt: d.basePrompt || '',
          createdAt: d.createdAt || null,
          updatedAt: d.updatedAt || null,
        };
      });

      setMyBots(bots);
    } catch (err) {
      console.error('[CreatorAI] Error loading bots:', err);
    } finally {
      setLoadingBots(false);
    }
  };

  // ── BUG 8: Delete bot handlers ────────────────────────────────────────
  const handleRequestDeleteBot = (avatarId: string) => {
    setDeletingBotId(avatarId);
    setShowDeleteBotConfirm(true);
  };

  const handleConfirmDeleteBot = async () => {
    if (!deletingBotId) return;
    setDeletingBot(true);
    try {
      await deleteDoc(doc(requireDb(), 'ai_avatars', deletingBotId));
      setMyBots((prev) => prev.filter((b) => b.id !== deletingBotId));
      setShowDeleteBotConfirm(false);
      setDeletingBotId(null);
    } catch (err) {
      console.error('[CreatorAI] Failed to delete bot:', err);
      setSaveError('Failed to delete bot. Please try again.');
    } finally {
      setDeletingBot(false);
    }
  };

  const handleCancelDeleteBot = () => {
    setShowDeleteBotConfirm(false);
    setDeletingBotId(null);
  };

  // ── Form handlers ────────────────────────────────────────────────────
  const updateForm = useCallback(
    <K extends keyof AICompanionFormState>(
      field: K,
      value: AICompanionFormState[K]
    ) => {
      setForm((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  const handleProfilePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE_BYTES) {
      alert('File too large. Maximum 500MB per file.');
      return;
    }
    updateForm('profilePhotoFile', file);
    setProfilePhotoPreview(URL.createObjectURL(file));
  };

  const handleCoverPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE_BYTES) {
      alert('File too large. Maximum 500MB per file.');
      return;
    }
    updateForm('coverPhotoFile', file);
    setCoverPhotoPreview(URL.createObjectURL(file));
  };

  const handleGalleryPhotosChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const oversized = files.filter((f) => f.size > MAX_FILE_SIZE_BYTES);
    if (oversized.length > 0) {
      alert(`${oversized.length} file(s) exceed 500MB limit and were skipped.`);
    }
    const validFiles = files.filter((f) => f.size <= MAX_FILE_SIZE_BYTES);
    updateForm('galleryPhotoFiles', [...form.galleryPhotoFiles, ...validFiles]);
    const previews = validFiles.map((f) => URL.createObjectURL(f));
    setGalleryPhotoPreviews((prev) => [...prev, ...previews]);
  };

  const removeGalleryPhoto = (index: number) => {
    const newFiles = [...form.galleryPhotoFiles];
    newFiles.splice(index, 1);
    updateForm('galleryPhotoFiles', newFiles);
    const newPreviews = [...galleryPhotoPreviews];
    newPreviews.splice(index, 1);
    setGalleryPhotoPreviews(newPreviews);
  };

  // ── Upload file to Firebase Storage ──────────────────────────────────
  const uploadFile = async (file: File, path: string): Promise<string> => {
    const storageRef = ref(requireStorage(), path);
    await uploadBytes(storageRef, file);
    return getDownloadURL(storageRef);
  };

  // ── Save companion to Firestore ──────────────────────────────────────
  const handleSave = async () => {
    if (!user?.uid) {
      setSaveError('You must be logged in to create an AI companion.');
      return;
    }

    // Validation
    if (!form.name.trim()) {
      setSaveError('Name is required.');
      return;
    }
    if (form.age < 18 || form.age > 99) {
      setSaveError('Age must be between 18 and 99.');
      return;
    }

    try {
      setSaving(true);
      setSaveError(null);

      // Upload photos
      const photoUrls: string[] = [];
      const timestamp = Date.now();

      // BUG 6: Upload profile photo separately (saves to aiAvatar.profilePhoto)
      let profilePhotoUrl: string | null = null;
      if (form.profilePhotoFile) {
        profilePhotoUrl = await uploadFile(
          form.profilePhotoFile,
          `ai_avatars/${user.uid}/${timestamp}_profile_${form.profilePhotoFile.name}`
        );
        photoUrls.push(profilePhotoUrl);
      }

      // BUG 6: Upload cover photo separately (saves to aiAvatar.coverPhoto)
      let coverPhotoUrl: string | null = null;
      if (form.coverPhotoFile) {
        coverPhotoUrl = await uploadFile(
          form.coverPhotoFile,
          `ai_avatars/${user.uid}/${timestamp}_cover_${form.coverPhotoFile.name}`
        );
      }

      // Upload gallery photos
      for (let i = 0; i < form.galleryPhotoFiles.length; i++) {
        const file = form.galleryPhotoFiles[i];
        const url = await uploadFile(
          file,
          `ai_avatars/${user.uid}/${timestamp}_gallery_${i}_${file.name}`
        );
        photoUrls.push(url);
      }

      // BUG 6: coverPhoto fallback: first gallery photo, then profilePhoto
      const resolvedCoverPhoto =
        coverPhotoUrl ?? (photoUrls.length > 1 ? photoUrls[1] : null) ?? profilePhotoUrl;

      // Get creator display name
      const creatorDisplayName =
        user.displayName || user.email?.split('@')[0] || 'Creator';

      // Save to Firestore
      const avatarData = {
        name: form.name.trim(),
        age: form.age,
        gender: form.gender,
        ethnicity: form.ethnicity,
        bodyType: form.bodyType,
        hairColor: form.hairColor,
        eyeColor: form.eyeColor,
        personalityTraits: form.personalityTraits,
        bio: form.bio.trim(),
        backstory: form.backstory.trim(),
        interests: form.interests,
        photos: photoUrls,
        // BUG 6: separate profilePhoto and coverPhoto fields
        profilePhoto: profilePhotoUrl ?? null,
        coverPhoto: resolvedCoverPhoto ?? null,
        voiceType: form.voiceType.trim(),
        // FIX 46: Personality intensity sliders
        personalitySliders: { ...personality },
        // FIX 52: Profession preset and base prompt
        profession,
        basePrompt,
        creatorId: user.uid,
        creatorDisplayName,
        isAvaloPlatform: false,
        totalConversations: 0,
        conversationCount: 0,
        averageRating: 0,
        ratingCount: 0,
        totalRatings: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await addDoc(collection(requireDb(), 'ai_avatars'), avatarData);

      // Reset form and reload
      setForm(INITIAL_FORM_STATE);
      setProfession('custom');
      setBasePrompt('');
      setProfilePhotoPreview(null);
      setCoverPhotoPreview(null);
      setGalleryPhotoPreviews([]);
      setShowCreateForm(false);
      await loadMyBots();
    } catch (err: any) {
      console.error('[CreatorAI] Save error:', err);
      setSaveError(err.message || 'Failed to create AI companion. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="w-6 h-6 text-purple-500" />
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                AI Companion Creator
              </h1>
            </div>
            {!showCreateForm && (
              <button
                onClick={() => setShowCreateForm(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold transition-colors"
              >
                <Plus className="w-4 h-4" />
                Create AI Companion
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Platform bot note */}
        <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-2">
            <Sparkles className="w-5 h-5 text-purple-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-purple-700 dark:text-purple-300">
              Avalo has platform AI companions — create yours to stand out!
              Your bots appear in the AI discovery feed for all users.
            </p>
          </div>
        </div>

        {/* ================================================================
            CREATE FORM
            ================================================================ */}
        {showCreateForm && (
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6 mb-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                Create AI Companion
              </h2>
              <button
                onClick={() => {
                  setShowCreateForm(false);
                  setForm(INITIAL_FORM_STATE);
                  setProfilePhotoPreview(null);
                  setGalleryPhotoPreviews([]);
                  setSaveError(null);
                }}
                className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-5">
              {/* Row: Name + Age */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => updateForm('name', e.target.value)}
                    placeholder="e.g. Luna"
                    className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Age <span className="text-red-500">*</span> (18-99)
                  </label>
                  <input
                    type="number"
                    min={18}
                    max={99}
                    value={form.age}
                    onChange={(e) => updateForm('age', Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              {/* Row: Gender + Ethnicity */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Gender
                  </label>
                  <select
                    value={form.gender}
                    onChange={(e) => updateForm('gender', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    {GENDER_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Ethnicity / Race
                  </label>
                  <select
                    value={form.ethnicity}
                    onChange={(e) => updateForm('ethnicity', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="">Select...</option>
                    {AI_ETHNICITY_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row: Body Type */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Body Type
                </label>
                <div className="flex flex-wrap gap-2">
                  {AI_BODY_TYPE_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => updateForm('bodyType', form.bodyType === opt ? '' : opt)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                        form.bodyType === opt
                          ? 'bg-purple-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Row: Hair Color + Eye Color */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Hair Color
                  </label>
                  <select
                    value={form.hairColor}
                    onChange={(e) => updateForm('hairColor', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="">Select...</option>
                    {AI_HAIR_COLOR_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Eye Color
                  </label>
                  <select
                    value={form.eyeColor}
                    onChange={(e) => updateForm('eyeColor', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="">Select...</option>
                    {AI_EYE_COLOR_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Personality Traits */}
              <ChipSelector
                label="Personality Traits"
                options={AI_PERSONALITY_TRAITS}
                selected={form.personalityTraits}
                onChange={(selected) => updateForm('personalityTraits', selected)}
              />

              {/* FIX 46: Personality Intensity Sliders */}
              <div className="mt-4 space-y-3">
                <h4 className="font-medium text-sm text-gray-700 dark:text-gray-300">Personality Intensity</h4>

                {[
                  { id: 'humor', label: 'Humor', desc: 'Serious ← → Funny' },
                  { id: 'flirt', label: 'Flirt', desc: 'Reserved ← → Playful' },
                  { id: 'intellect', label: 'Intellect', desc: 'Casual ← → Deep' },
                  { id: 'energy', label: 'Energy', desc: 'Calm ← → Energetic' },
                  { id: 'empathy', label: 'Empathy', desc: 'Neutral ← → Caring' },
                ].map(slider => (
                  <div key={slider.id} className="flex items-center gap-3">
                    <label className="w-20 text-sm text-gray-600 dark:text-gray-400">{slider.label}</label>
                    <input type="range" min="0" max="10"
                      value={personality[slider.id] || 5}
                      onChange={e => setPersonality(prev => ({ ...prev, [slider.id]: Number(e.target.value) }))}
                      className="flex-1 accent-purple-500" />
                    <span className="w-8 text-center text-sm text-gray-700 dark:text-gray-300">{personality[slider.id] || 5}</span>
                  </div>
                ))}
                <p className="text-xs text-gray-400">These values shape how the AI responds in conversations.</p>
              </div>

              {/* FIX 52: Profession / Personality Type Selector */}
              <div className="mb-4">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">Personality Type</label>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {PROFESSIONS.map(p => (
                    <button key={p.id} type="button" onClick={() => {
                      setProfession(p.id);
                      if (p.id !== 'custom') setBasePrompt(p.prompt);
                    }}
                      className={`p-2 rounded-xl text-center text-sm border-2 transition ${
                        profession === p.id
                          ? 'border-[#E4458F] bg-pink-50 dark:bg-pink-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* FIX 52: Custom prompt textarea (only shown when Custom is selected) */}
              {profession === 'custom' && (
                <textarea value={basePrompt} onChange={e => setBasePrompt(e.target.value)}
                  placeholder="Describe your bot's personality and expertise..."
                  className="w-full p-3 border border-gray-300 dark:border-gray-700 rounded-lg resize-none bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" rows={4} />
              )}

              {/* Bio */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Bio (one-liner shown on cards)
                </label>
                <input
                  type="text"
                  value={form.bio}
                  onChange={(e) => updateForm('bio', e.target.value)}
                  placeholder="e.g. A dreamy romantic soul who loves stargazing..."
                  maxLength={200}
                  className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              {/* Backstory */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Backstory
                </label>
                <textarea
                  value={form.backstory}
                  onChange={(e) => updateForm('backstory', e.target.value)}
                  placeholder="Detailed backstory and personality description..."
                  rows={4}
                  className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-y"
                />
              </div>

              {/* Interests */}
              <ChipSelector
                label="Interests & Hobbies"
                options={AI_INTEREST_OPTIONS}
                selected={form.interests}
                onChange={(selected) => updateForm('interests', selected)}
              />

              {/* Voice Type */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Voice Type <span className="text-xs text-gray-400">(for future use)</span>
                </label>
                <input
                  type="text"
                  value={form.voiceType}
                  onChange={(e) => updateForm('voiceType', e.target.value)}
                  placeholder="e.g. Soft, Warm, Deep"
                  className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              {/* Profile Photo Upload */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Profile Photo
                </label>
                <div className="flex items-center gap-4">
                  {profilePhotoPreview ? (
                    <div className="relative">
                      <img
                        src={profilePhotoPreview}
                        alt="Profile preview"
                        className="w-20 h-20 rounded-full object-cover ring-2 ring-purple-500"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          updateForm('profilePhotoFile', null);
                          setProfilePhotoPreview(null);
                        }}
                        className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-700">
                      <ImageIcon className="w-8 h-8 text-gray-400" />
                    </div>
                  )}
                  <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                    <Upload className="w-4 h-4" />
                    Upload Photo
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleProfilePhotoChange}
                    />
                  </label>
                </div>
              </div>

              {/* Cover Photo Upload — BUG 6 */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Cover Photo
                  <span className="text-xs text-gray-400 ml-1">(wide rectangle preview)</span>
                </label>
                <div className="flex items-center gap-4">
                  {coverPhotoPreview ? (
                    <div className="relative">
                      <img
                        src={coverPhotoPreview}
                        alt="Cover preview"
                        className="w-40 h-20 rounded-lg object-cover ring-2 ring-purple-500"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          updateForm('coverPhotoFile', null);
                          setCoverPhotoPreview(null);
                        }}
                        className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="w-40 h-20 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-700">
                      <ImageIcon className="w-8 h-8 text-gray-400" />
                    </div>
                  )}
                  <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                    <Upload className="w-4 h-4" />
                    Upload Cover
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleCoverPhotoChange}
                    />
                  </label>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  If not set, the first gallery photo will be used. If no gallery, the profile photo is used.
                </p>
              </div>

              {/* Gallery Photos Upload */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Gallery Photos{' '}
                  <span className="text-xs text-gray-400">(no limit, 500MB per file)</span>
                </label>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 mb-3">
                  {galleryPhotoPreviews.map((preview, index) => (
                    <div key={index} className="relative aspect-square">
                      <img
                        src={preview}
                        alt={`Gallery ${index + 1}`}
                        className="w-full h-full object-cover rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={() => removeGalleryPhoto(index)}
                        className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <label className="aspect-square rounded-lg bg-gray-100 dark:bg-gray-800 border-2 border-dashed border-gray-300 dark:border-gray-700 flex items-center justify-center cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                    <Plus className="w-6 h-6 text-gray-400" />
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={handleGalleryPhotosChange}
                    />
                  </label>
                </div>
              </div>

              {/* Error */}
              {saveError && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                  <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <p className="text-sm text-red-700 dark:text-red-300">{saveError}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Create Companion
                    </>
                  )}
                </button>
                <button
                  onClick={() => {
                    setShowCreateForm(false);
                    setForm(INITIAL_FORM_STATE);
                    setProfilePhotoPreview(null);
                    setGalleryPhotoPreviews([]);
                    setSaveError(null);
                  }}
                  disabled={saving}
                  className="px-6 py-2.5 rounded-xl bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-semibold text-sm hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================
            MY AI COMPANIONS GRID
            ================================================================ */}
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
            My AI Companions
          </h2>

          {loadingBots ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="card p-4 animate-pulse">
                  <div className="w-full aspect-[3/4] rounded-lg bg-gray-200 dark:bg-gray-700 mb-3" />
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3 mb-2" />
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : myBots.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 rounded-full bg-purple-50 dark:bg-purple-900/30 mx-auto mb-4 flex items-center justify-center">
                <Bot className="w-8 h-8 text-purple-500" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                No AI companions yet
              </h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">
                Create your first AI companion to get started.
              </p>
              <button
                onClick={() => setShowCreateForm(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold transition-colors"
              >
                <Plus className="w-4 h-4" />
                Create AI Companion
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {myBots.map((bot) => (
                <BotCard
                  key={bot.id}
                  avatar={bot}
                  onClick={() => router.push(`/ai/profile/${bot.id}`)}
                  onDelete={handleRequestDeleteBot}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* BUG 8: Delete Bot Confirmation Modal */}
      {showDeleteBotConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-sm mx-4 shadow-2xl">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white">Delete AI Companion?</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  This will permanently delete this AI companion and all its data.
                  This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={handleCancelDeleteBot}
                disabled={deletingBot}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDeleteBot}
                disabled={deletingBot}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition disabled:opacity-50 flex items-center gap-2"
              >
                {deletingBot ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  'Delete Bot'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
