'use client';

/**
 * Profile Editor Component
 * Wired to Firebase Auth + Firestore for editing name, bio, and avatar.
 * Uses MediaUpload component for photo changes.
 */
import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useAuth } from '@/components/providers/AuthProvider';
import { toast } from '@/components/ui/Toaster';
import { updateUserProfile } from '@/lib/services/accountService';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { requireStorage } from '@/lib/firebase';

const MAX_DISPLAY_NAME_LENGTH = 50;
const MAX_BIO_LENGTH = 500;
const MAX_PHOTO_SIZE_MB = 5;
const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export default function ProfileEditor() {
  const { user, firebaseUser, refreshUser } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [photoURL, setPhotoURL] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Populate form with current user data
  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || '');
      setBio(user.bio || '');
      setPhotoURL(user.photoURL || null);
    } else if (firebaseUser) {
      setDisplayName(firebaseUser.displayName || '');
      setPhotoURL(firebaseUser.photoURL || null);
    }
  }, [user, firebaseUser]);

  // Validate form fields
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!displayName.trim()) {
      newErrors.displayName = 'Display name is required.';
    } else if (displayName.trim().length < 2) {
      newErrors.displayName = 'Display name must be at least 2 characters.';
    } else if (displayName.trim().length > MAX_DISPLAY_NAME_LENGTH) {
      newErrors.displayName = `Display name must be ${MAX_DISPLAY_NAME_LENGTH} characters or less.`;
    }

    if (bio.length > MAX_BIO_LENGTH) {
      newErrors.bio = `Bio must be ${MAX_BIO_LENGTH} characters or less.`;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle photo file selection
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
      toast({
        type: 'error',
        title: 'Invalid file type',
        description: 'Please upload a JPEG, PNG, WebP, or GIF image.',
      });
      return;
    }

    // Validate file size
    if (file.size > MAX_PHOTO_SIZE_MB * 1024 * 1024) {
      toast({
        type: 'error',
        title: 'File too large',
        description: `Photo must be under ${MAX_PHOTO_SIZE_MB}MB.`,
      });
      return;
    }

    setPhotoFile(file);

    // Generate preview
    const reader = new FileReader();
    reader.onload = (ev) => {
      setPhotoPreview(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Upload photo to Firebase Storage
  const uploadPhoto = async (): Promise<string | null> => {
    if (!photoFile || !firebaseUser) return null;

    setUploading(true);
    try {
      const storage = requireStorage();
      const storageRef = ref(
        storage,
        `users/${firebaseUser.uid}/avatar/${Date.now()}_${photoFile.name}`,
      );
      const snapshot = await uploadBytes(storageRef, photoFile);
      const downloadURL = await getDownloadURL(snapshot.ref);
      return downloadURL;
    } catch (err) {
      console.error('[ProfileEditor] Photo upload failed:', err);
      throw new Error('Failed to upload photo. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  // Remove photo
  const handleRemovePhoto = () => {
    setPhotoFile(null);
    setPhotoPreview(null);
    setPhotoURL(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Save profile changes
  const handleSave = async () => {
    if (!validate()) return;

    setSaving(true);
    try {
      let finalPhotoURL = photoURL;

      // Upload new photo if selected
      if (photoFile) {
        finalPhotoURL = await uploadPhoto();
      }

      await updateUserProfile({
        displayName: displayName.trim(),
        bio: bio.trim(),
        photoURL: finalPhotoURL || undefined,
      });

      // Refresh auth context to reflect changes
      await refreshUser();

      // Clear file selection state
      setPhotoFile(null);
      setPhotoPreview(null);

      toast({
        type: 'success',
        title: 'Profile updated',
        description: 'Your changes have been saved.',
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save profile.';
      toast({
        type: 'error',
        title: 'Update failed',
        description: message,
      });
    } finally {
      setSaving(false);
    }
  };

  const currentPhoto = photoPreview || photoURL;
  const isLoading = saving || uploading;

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h1 className="text-2xl font-bold mb-6">Edit Profile</h1>
      <div className="space-y-6">
        {/* Avatar Section */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Profile Photo
          </label>
          <div className="flex items-center gap-4">
            {currentPhoto ? (
              <Image
                src={currentPhoto}
                alt="Profile photo"
                width={96}
                height={96}
                className="w-24 h-24 rounded-full object-cover border-2 border-gray-200"
                unoptimized
              />
            ) : (
              <div className="w-24 h-24 bg-gradient-to-br from-purple-400 to-purple-600 rounded-full flex items-center justify-center text-white text-3xl">
                {displayName?.charAt(0)?.toUpperCase() || '👤'}
              </div>
            )}
            <div className="flex flex-col gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept={ALLOWED_PHOTO_TYPES.join(',')}
                onChange={handlePhotoSelect}
                className="hidden"
                id="photo-upload"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? 'Uploading...' : 'Change Photo'}
              </button>
              {currentPhoto && (
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  disabled={isLoading}
                  className="px-4 py-2 text-red-600 hover:text-red-700 text-sm disabled:opacity-50"
                >
                  Remove Photo
                </button>
              )}
              <p className="text-xs text-gray-400">
                JPEG, PNG, WebP or GIF. Max {MAX_PHOTO_SIZE_MB}MB.
              </p>
            </div>
          </div>
        </div>

        {/* Display Name */}
        <div>
          <label
            htmlFor="displayName"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Display Name
          </label>
          <input
            id="displayName"
            type="text"
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value);
              if (errors.displayName) {
                setErrors((prev) => ({ ...prev, displayName: '' }));
              }
            }}
            maxLength={MAX_DISPLAY_NAME_LENGTH}
            disabled={isLoading}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 disabled:bg-gray-50 disabled:cursor-not-allowed ${
              errors.displayName ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="Your name"
          />
          <div className="flex justify-between mt-1">
            {errors.displayName ? (
              <p className="text-sm text-red-600">{errors.displayName}</p>
            ) : (
              <span />
            )}
            <span className="text-xs text-gray-400">
              {displayName.length}/{MAX_DISPLAY_NAME_LENGTH}
            </span>
          </div>
        </div>

        {/* Email (read-only) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            type="email"
            value={user?.email || firebaseUser?.email || ''}
            disabled
            className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
          />
          <p className="text-xs text-gray-400 mt-1">
            Email cannot be changed here. Contact support for email changes.
          </p>
        </div>

        {/* Bio */}
        <div>
          <label
            htmlFor="bio"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Bio
          </label>
          <textarea
            id="bio"
            value={bio}
            onChange={(e) => {
              setBio(e.target.value);
              if (errors.bio) {
                setErrors((prev) => ({ ...prev, bio: '' }));
              }
            }}
            maxLength={MAX_BIO_LENGTH}
            disabled={isLoading}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 disabled:bg-gray-50 disabled:cursor-not-allowed ${
              errors.bio ? 'border-red-500' : 'border-gray-300'
            }`}
            rows={4}
            placeholder="Tell us about yourself"
          />
          <div className="flex justify-between mt-1">
            {errors.bio ? (
              <p className="text-sm text-red-600">{errors.bio}</p>
            ) : (
              <span />
            )}
            <span className="text-xs text-gray-400">
              {bio.length}/{MAX_BIO_LENGTH}
            </span>
          </div>
        </div>

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={isLoading}
          className="w-full py-3 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              {uploading ? 'Uploading photo...' : 'Saving...'}
            </>
          ) : (
            'Save Changes'
          )}
        </button>
      </div>
    </div>
  );
}
