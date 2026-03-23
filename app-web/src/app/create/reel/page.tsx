'use client';

/**
 * FIX 64A — Create Reel Page
 * Allows users to upload a video file and publish a short-form reel.
 * Writes to Firestore 'reels' collection and uploads video to Firebase Storage.
 */

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { requireDb, requireStorage } from '@/lib/firebase';

export default function CreateReelPage() {
  const { user } = useAuth();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f && f.type.startsWith('video/')) {
      setFile(f);
      setPreview(URL.createObjectURL(f));
      setError(null);
    } else {
      setError('Please select a video file.');
    }
  };

  const handleSubmit = async () => {
    if (!user || !file) return;
    setUploading(true);
    setError(null);
    try {
      const storage = requireStorage();
      const storageRefPath = ref(storage, `reels/${user.uid}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRefPath, file);
      const videoURL = await getDownloadURL(storageRefPath);

      const db = requireDb();
      await addDoc(collection(db, 'reels'), {
        userId: user.uid,
        authorName: user.displayName || '',
        authorPhotoURL: user.photoURL || '',
        videoUrl: videoURL,
        thumbnailUrl: '',
        caption,
        likes: 0,
        comments: 0,
        views: 0,
        duration: 0,
        isNSFW: false,
        isPremium: false,
        createdAt: serverTimestamp(),
      });
      router.push('/reels');
    } catch (err: any) {
      console.error('Failed to create reel:', err);
      setError(err?.message || 'Failed to publish reel. Please try again.');
    }
    setUploading(false);
  };

  if (!user) {
    return (
      <div className="max-w-lg mx-auto p-6 text-center">
        <p className="text-gray-500">Please sign in to create a reel.</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">Create Reel</h1>

      {preview ? (
        <div className="aspect-[9/16] rounded-2xl overflow-hidden bg-black mb-4">
          <video src={preview} controls className="w-full h-full object-contain" />
        </div>
      ) : (
        <div
          onClick={() => fileRef.current?.click()}
          className="aspect-[9/16] rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-600 flex flex-col items-center justify-center cursor-pointer hover:border-[#E4458F] mb-4 bg-gray-50 dark:bg-gray-800 transition-colors"
        >
          <span className="text-4xl mb-2">🎬</span>
          <p className="text-gray-500 dark:text-gray-400">Tap to select video</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Vertical format recommended (9:16)</p>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {file && (
        <button
          onClick={() => {
            setFile(null);
            setPreview('');
            if (fileRef.current) fileRef.current.value = '';
          }}
          className="mb-3 text-sm text-gray-500 hover:text-red-500 transition-colors"
        >
          Remove video
        </button>
      )}

      <textarea
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        placeholder="Add a caption..."
        className="w-full p-3 border border-gray-200 dark:border-gray-700 rounded-lg mb-4 resize-none bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
        rows={2}
      />

      {error && (
        <p className="text-sm text-red-500 mb-3">{error}</p>
      )}

      <button
        onClick={handleSubmit}
        disabled={!file || uploading}
        className="w-full py-3 bg-gradient-to-r from-[#E8593C] via-[#E4458F] to-[#8B5CF6] text-white rounded-lg font-medium disabled:opacity-50 transition-opacity"
      >
        {uploading ? 'Uploading...' : 'Publish Reel'}
      </button>
    </div>
  );
}
