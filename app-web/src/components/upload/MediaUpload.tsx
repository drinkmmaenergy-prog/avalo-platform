'use client';

/**
 * Media Upload Component
 * Handles file upload with preview, validation, and Firebase Storage integration.
 * Used by ProfileEditor and other components for media management.
 */
import React, { useState, useRef, useCallback } from 'react';
import Image from 'next/image';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { requireStorage } from '@/lib/firebase';
import { auth } from '@/lib/firebase';
import { toast } from '@/components/ui/Toaster';

export interface MediaUploadProps {
  /** Storage path prefix (e.g., 'users/uid/photos') */
  storagePath?: string;
  /** Callback when upload completes with the download URL */
  onUploadComplete?: (url: string) => void;
  /** Callback when upload fails */
  onUploadError?: (error: Error) => void;
  /** Allowed MIME types. Defaults to common image types. */
  acceptTypes?: string[];
  /** Maximum file size in MB. Defaults to 10. */
  maxSizeMB?: number;
  /** Maximum number of files. Defaults to 1. */
  maxFiles?: number;
  /** Whether upload is disabled */
  disabled?: boolean;
  /** Custom class name */
  className?: string;
}

interface UploadedFile {
  name: string;
  url: string;
  size: number;
  type: string;
}

const DEFAULT_ACCEPT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const DEFAULT_MAX_SIZE_MB = 10;

export default function MediaUpload({
  storagePath,
  onUploadComplete,
  onUploadError,
  acceptTypes = DEFAULT_ACCEPT_TYPES,
  maxSizeMB = DEFAULT_MAX_SIZE_MB,
  maxFiles = 1,
  disabled = false,
  className = '',
}: MediaUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getStoragePath = useCallback(() => {
    if (storagePath) return storagePath;
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('Not authenticated');
    return `users/${uid}/uploads`;
  }, [storagePath]);

  const validateFile = (file: File): string | null => {
    if (!acceptTypes.includes(file.type)) {
      return `Invalid file type: ${file.type}. Allowed: ${acceptTypes.join(', ')}`;
    }
    if (file.size > maxSizeMB * 1024 * 1024) {
      return `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max: ${maxSizeMB}MB`;
    }
    return null;
  };

  const uploadFile = async (file: File): Promise<UploadedFile> => {
    const storage = requireStorage();
    const path = `${getStoragePath()}/${Date.now()}_${file.name}`;
    const storageRef = ref(storage, path);

    const snapshot = await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(snapshot.ref);

    return {
      name: file.name,
      url: downloadURL,
      size: file.size,
      type: file.type,
    };
  };

  const handleFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files).slice(0, maxFiles - uploadedFiles.length);

    if (fileArray.length === 0) {
      toast({
        type: 'warning',
        title: 'Maximum files reached',
        description: `You can upload up to ${maxFiles} file(s).`,
      });
      return;
    }

    // Validate all files first
    for (const file of fileArray) {
      const error = validateFile(file);
      if (error) {
        toast({ type: 'error', title: 'Upload error', description: error });
        onUploadError?.(new Error(error));
        return;
      }
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      const results: UploadedFile[] = [];

      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i];
        setUploadProgress(Math.round(((i) / fileArray.length) * 100));

        const uploaded = await uploadFile(file);
        results.push(uploaded);
        onUploadComplete?.(uploaded.url);
      }

      setUploadedFiles((prev) => [...prev, ...results]);
      setUploadProgress(100);

      toast({
        type: 'success',
        title: 'Upload complete',
        description: `${results.length} file(s) uploaded successfully.`,
      });
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error('Upload failed');
      console.error('[MediaUpload] Upload failed:', error);
      toast({
        type: 'error',
        title: 'Upload failed',
        description: error.message,
      });
      onUploadError?.(error);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
    // Reset input so same file can be re-selected
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (disabled || uploading) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const removeFile = (index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className={`bg-white rounded-lg shadow p-6 ${className}`}>
      <h2 className="text-xl font-bold mb-4">Upload Media</h2>

      {/* Drop zone */}
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          dragActive
            ? 'border-pink-500 bg-pink-50'
            : disabled || uploading
            ? 'border-gray-200 bg-gray-50'
            : 'border-gray-300 hover:border-pink-400 hover:bg-pink-50 cursor-pointer'
        }`}
        onClick={() => {
          if (!disabled && !uploading) {
            fileInputRef.current?.click();
          }
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={acceptTypes.join(',')}
          multiple={maxFiles > 1}
          onChange={handleInputChange}
          className="hidden"
          disabled={disabled || uploading}
        />

        {uploading ? (
          <div>
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-pink-500 mx-auto mb-3" />
            <p className="text-gray-600 font-medium">Uploading...</p>
            <div className="mt-3 w-full max-w-xs mx-auto bg-gray-200 rounded-full h-2">
              <div
                className="bg-pink-500 h-2 rounded-full transition-all"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">{uploadProgress}%</p>
          </div>
        ) : (
          <div>
            <div className="text-4xl mb-2">📁</div>
            <p className="text-gray-600">Drag and drop files here</p>
            <p className="text-gray-400 text-sm mt-1">or click to browse</p>
            <button
              type="button"
              disabled={disabled}
              className="mt-4 px-4 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
            >
              Select Files
            </button>
            <p className="text-xs text-gray-400 mt-3">
              {acceptTypes.map((t) => t.split('/')[1].toUpperCase()).join(', ')} &middot; Max {maxSizeMB}MB
              {maxFiles > 1 && ` · Up to ${maxFiles} files`}
            </p>
          </div>
        )}
      </div>

      {/* Uploaded files preview */}
      {uploadedFiles.length > 0 && (
        <div className="mt-4 space-y-3">
          <h3 className="text-sm font-medium text-gray-700">
            Uploaded ({uploadedFiles.length})
          </h3>
          {uploadedFiles.map((file, index) => (
            <div
              key={`${file.name}-${index}`}
              className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
            >
              {file.type.startsWith('image/') ? (
                <Image
                  src={file.url}
                  alt={file.name}
                  width={48}
                  height={48}
                  className="w-12 h-12 rounded object-cover"
                  unoptimized
                />
              ) : (
                <div className="w-12 h-12 bg-gray-200 rounded flex items-center justify-center text-gray-500 text-lg">
                  📄
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {file.name}
                </p>
                <p className="text-xs text-gray-400">
                  {(file.size / 1024).toFixed(0)} KB
                </p>
              </div>
              <button
                type="button"
                onClick={() => removeFile(index)}
                className="text-red-500 hover:text-red-700 text-sm"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
