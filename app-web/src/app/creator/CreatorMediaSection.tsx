'use client';

/**
 * Creator Media Section — Photo Management
 *
 * Displays all creator photos from public_profiles/{uid}.photos array.
 * Supports:
 *   - Grid display of photos
 *   - Hover-to-show red X remove button
 *   - Remove photo from Firestore array
 *   - Add photos via file picker (no file count limit, 100MB max per file)
 *   - Upload via existing uploadImage Firebase callable function
 *   - Drag-to-reorder (first photo = cover/profile photo)
 *   - Optional caption per photo (max 100 characters)
 *
 * Firestore schema: public_profiles/{uid}.photos = Array<{ url: string; caption?: string }>
 */
import React, { useState, useRef, useCallback } from 'react';
import { requireDb, requireFunctions } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

// ============================================================================
// TYPES
// ============================================================================

export interface CreatorPhoto {
  url: string;
  caption?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100MB
const MAX_CAPTION_LENGTH = 100;

// ============================================================================
// COMPONENT
// ============================================================================

export default function CreatorMediaSection({
  userId,
  photos,
  onPhotosChange,
}: {
  userId: string;
  photos: CreatorPhoto[];
  onPhotosChange: (photos: CreatorPhoto[]) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [editingCaptionIndex, setEditingCaptionIndex] = useState<number | null>(null);
  const [captionDraft, setCaptionDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Save photos to Firestore ──────────────────────────────────────
  const persistPhotos = useCallback(
    async (updatedPhotos: CreatorPhoto[]) => {
      try {
        const profileRef = doc(requireDb(), 'public_profiles', userId);
        await updateDoc(profileRef, { photos: updatedPhotos });
        onPhotosChange(updatedPhotos);
      } catch (err: any) {
        console.error('Error saving photos:', err);
        setError('Failed to save photos. Please try again.');
      }
    },
    [userId, onPhotosChange],
  );

  // ── Remove photo ──────────────────────────────────────────────────
  const handleRemovePhoto = useCallback(
    async (index: number) => {
      const updated = photos.filter((_, i) => i !== index);
      await persistPhotos(updated);
    },
    [photos, persistPhotos],
  );

  // ── Upload photos ─────────────────────────────────────────────────
  const handleAddPhotos = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      setError(null);
      setUploading(true);

      const newPhotos: CreatorPhoto[] = [...photos];
      const uploadFn = httpsCallable<
        { imageData: string; type: string; userId: string },
        { url: string; assetId: string }
      >(requireFunctions(), 'uploadImage');

      let uploaded = 0;
      const total = files.length;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // Validate file size
        if (file.size > MAX_FILE_SIZE_BYTES) {
          setError(`File "${file.name}" exceeds 100MB limit. Skipping.`);
          continue;
        }

        // Validate file type
        if (!file.type.startsWith('image/')) {
          setError(`File "${file.name}" is not an image. Skipping.`);
          continue;
        }

        try {
          setUploadProgress(`Uploading ${uploaded + 1} of ${total}...`);

          // Convert file to base64
          const base64 = await fileToBase64(file);

          // Call uploadImage Firebase function
          const result = await uploadFn({
            imageData: base64,
            type: 'profile',
            userId,
          });

          newPhotos.push({
            url: result.data.url,
            caption: '',
          });

          uploaded++;
        } catch (err: any) {
          console.error(`Error uploading ${file.name}:`, err);
          setError(`Failed to upload "${file.name}". ${err.message || ''}`);
        }
      }

      if (uploaded > 0) {
        await persistPhotos(newPhotos);
      }

      setUploading(false);
      setUploadProgress(null);

      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [photos, userId, persistPhotos],
  );

  // ── Drag and drop reorder ─────────────────────────────────────────
  const handleDragStart = useCallback((index: number) => {
    setDraggedIndex(index);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      if (draggedIndex !== null && draggedIndex !== index) {
        setDragOverIndex(index);
      }
    },
    [draggedIndex],
  );

  const handleDragLeave = useCallback(() => {
    setDragOverIndex(null);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent, dropIndex: number) => {
      e.preventDefault();
      setDragOverIndex(null);

      if (draggedIndex === null || draggedIndex === dropIndex) {
        setDraggedIndex(null);
        return;
      }

      const updated = [...photos];
      const [moved] = updated.splice(draggedIndex, 1);
      updated.splice(dropIndex, 0, moved);

      setDraggedIndex(null);
      await persistPhotos(updated);
    },
    [draggedIndex, photos, persistPhotos],
  );

  const handleDragEnd = useCallback(() => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  }, []);

  // ── Caption editing ───────────────────────────────────────────────
  const handleStartEditCaption = useCallback(
    (index: number) => {
      setEditingCaptionIndex(index);
      setCaptionDraft(photos[index]?.caption || '');
    },
    [photos],
  );

  const handleSaveCaption = useCallback(
    async (index: number) => {
      const updated = [...photos];
      updated[index] = { ...updated[index], caption: captionDraft.slice(0, MAX_CAPTION_LENGTH) };
      setEditingCaptionIndex(null);
      setCaptionDraft('');
      await persistPhotos(updated);
    },
    [photos, captionDraft, persistPhotos],
  );

  const handleCancelEditCaption = useCallback(() => {
    setEditingCaptionIndex(null);
    setCaptionDraft('');
  }, []);

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-gray-900 text-lg">Media</h3>
          <p className="text-sm text-gray-500">
            Drag to reorder. First photo is your cover/profile photo.
          </p>
        </div>
        <button
          onClick={handleAddPhotos}
          disabled={uploading}
          className="inline-flex items-center px-4 py-2 bg-pink-600 hover:bg-pink-700
                     disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium
                     rounded-lg transition text-sm"
        >
          {uploading ? '⏳ Uploading…' : '📷 Add Photos'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 text-red-500 hover:text-red-800 font-medium"
          >
            ✕
          </button>
        </div>
      )}

      {uploadProgress && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
          {uploadProgress}
        </div>
      )}

      {photos.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl">
          <div className="text-4xl mb-3">📷</div>
          <p className="text-gray-500 text-sm">No photos yet. Add photos to your profile.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {photos.map((photo, index) => (
            <div
              key={`photo-${index}-${photo.url}`}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              className={`group relative rounded-xl overflow-hidden border-2 transition-all cursor-grab active:cursor-grabbing
                ${dragOverIndex === index ? 'border-pink-400 scale-105' : 'border-gray-200'}
                ${draggedIndex === index ? 'opacity-50' : ''}
                ${index === 0 ? 'ring-2 ring-pink-500 ring-offset-2' : ''}`}
            >
              {/* Cover badge */}
              {index === 0 && (
                <div className="absolute top-2 left-2 z-10 bg-pink-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                  COVER
                </div>
              )}

              {/* Remove button */}
              <button
                onClick={() => handleRemovePhoto(index)}
                className="absolute top-2 right-2 z-10 h-7 w-7 bg-red-600 hover:bg-red-700
                           text-white rounded-full flex items-center justify-center text-sm font-bold
                           opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                aria-label={`Remove photo ${index + 1}`}
              >
                ✕
              </button>

              {/* Photo */}
              <div className="aspect-square bg-gray-100">
                <img
                  src={photo.url}
                  alt={photo.caption || `Photo ${index + 1}`}
                  className="w-full h-full object-cover"
                  draggable={false}
                />
              </div>

              {/* Caption */}
              <div className="p-2 bg-white">
                {editingCaptionIndex === index ? (
                  <div className="flex flex-col gap-1">
                    <input
                      type="text"
                      value={captionDraft}
                      onChange={(e) => setCaptionDraft(e.target.value.slice(0, MAX_CAPTION_LENGTH))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveCaption(index);
                        if (e.key === 'Escape') handleCancelEditCaption();
                      }}
                      className="w-full text-xs px-2 py-1 border border-gray-300 rounded focus:ring-1 focus:ring-pink-500 focus:border-transparent"
                      placeholder="Add caption..."
                      maxLength={MAX_CAPTION_LENGTH}
                      autoFocus
                    />
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-gray-400">
                        {captionDraft.length}/{MAX_CAPTION_LENGTH}
                      </span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleSaveCaption(index)}
                          className="text-[10px] text-pink-600 hover:text-pink-800 font-medium"
                        >
                          Save
                        </button>
                        <button
                          onClick={handleCancelEditCaption}
                          className="text-[10px] text-gray-400 hover:text-gray-600"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => handleStartEditCaption(index)}
                    className="w-full text-left text-xs text-gray-500 hover:text-gray-700 truncate"
                    title={photo.caption || 'Click to add caption'}
                  >
                    {photo.caption || 'Add caption…'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// HELPER — Convert File to base64 (without data URL prefix)
// ============================================================================

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data URL prefix (e.g., "data:image/jpeg;base64,")
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
