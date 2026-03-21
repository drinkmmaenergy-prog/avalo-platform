'use client';

/**
 * Create Story Page — FIX 37
 * Upload a photo/video + optional text overlay, publish as 24h story.
 * Saves to 'stories' collection in Firestore.
 */

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { requireDb, requireStorage } from '@/lib/firebase';

export default function CreateStoryPage() {
  const { user, firebaseUser } = useAuth();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setPreview(URL.createObjectURL(f));
    }
  };

  const handleSubmit = async () => {
    const uid = firebaseUser?.uid;
    if (!uid || !file) return;
    setUploading(true);
    try {
      const storage = requireStorage();
      const db = requireDb();
      const storageRef = ref(storage, `posts/${uid}/stories/${Date.now()}`);
      await uploadBytes(storageRef, file);
      const mediaURL = await getDownloadURL(storageRef);

      await addDoc(collection(db, 'stories'), {
        userId: uid,
        mediaURL,
        text: text || '',
        createdAt: serverTimestamp(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
      router.push('/feed');
    } catch (err) {
      console.error('Failed to create story:', err);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Create Story</h1>

      {preview ? (
        <div className="relative aspect-[9/16] rounded-xl overflow-hidden mb-4">
          <img src={preview} alt="" className="w-full h-full object-cover" />
        </div>
      ) : (
        <div onClick={() => fileRef.current?.click()}
          className="aspect-[9/16] rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer hover:border-purple-400 mb-4">
          <span className="text-4xl text-gray-400">📷</span>
          <p className="text-gray-500 mt-2">Tap to add photo or video</p>
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFileChange} />

      <textarea value={text} onChange={e => setText(e.target.value)}
        placeholder="Add text to your story..."
        className="w-full p-3 border rounded-lg mb-4 resize-none" rows={2} />

      <button onClick={handleSubmit} disabled={!file || uploading}
        className="w-full py-3 bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-lg font-medium disabled:opacity-50">
        {uploading ? 'Publishing...' : 'Share Story'}
      </button>
    </div>
  );
}
