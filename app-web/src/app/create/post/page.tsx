'use client';

/**
 * Create Post Page — FIX 37
 * Upload photos + caption, publish as a post.
 * Saves to 'posts' collection in Firestore.
 */

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { requireDb, requireStorage } from '@/lib/firebase';

/**
 * FIX 99: Extract hashtags from caption text.
 * Returns lowercase array of hashtag strings (e.g. ['#summer', '#fitness']).
 */
function extractHashtags(text: string): string[] {
  const matches = text.match(/#\w+/g);
  return matches ? matches.map(h => h.toLowerCase()) : [];
}

export default function CreatePostPage() {
  const { user, firebaseUser } = useAuth();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length === 0) return;
    setFiles(prev => [...prev, ...selected]);
    const newPreviews = selected.map(f => URL.createObjectURL(f));
    setPreviews(prev => [...prev, ...newPreviews]);
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    setPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    const uid = firebaseUser?.uid;
    if (!uid || files.length === 0) return;
    setUploading(true);
    try {
      const storage = requireStorage();
      const db = requireDb();

      // Upload all files
      const mediaUrls: string[] = [];
      for (const file of files) {
        const storageRef = ref(storage, `posts/${uid}/photos/${Date.now()}_${file.name}`);
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);
        mediaUrls.push(url);
      }

      await addDoc(collection(db, 'posts'), {
        authorId: uid,
        userId: uid,
        caption: caption || '',
        hashtags: extractHashtags(caption), // FIX 99: Store hashtags for search
        mediaUrl: mediaUrls[0] || '',
        mediaUrls,
        mediaType: files[0]?.type.startsWith('video') ? 'video' : 'image',
        likes: 0,
        comments: 0,
        views: 0,
        isPremium: false,
        createdAt: serverTimestamp(),
      });
      router.push('/feed');
    } catch (err) {
      console.error('Failed to create post:', err);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Create Post</h1>

      {/* Photo grid preview */}
      {previews.length > 0 ? (
        <div className="grid grid-cols-3 gap-2 mb-4">
          {previews.map((url, i) => (
            <div key={i} className="relative aspect-square rounded-lg overflow-hidden">
              <img src={url} alt="" className="w-full h-full object-cover" />
              <button
                onClick={() => removeFile(i)}
                className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs"
              >
                ×
              </button>
            </div>
          ))}
          <button
            onClick={() => fileRef.current?.click()}
            className="aspect-square rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:border-purple-400"
          >
            +
          </button>
        </div>
      ) : (
        <div onClick={() => fileRef.current?.click()}
          className="aspect-square rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer hover:border-purple-400 mb-4">
          <span className="text-4xl text-gray-400">📷</span>
          <p className="text-gray-500 mt-2">Tap to add photos</p>
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleFileChange} />

      <textarea value={caption} onChange={e => setCaption(e.target.value)}
        placeholder="Write a caption..."
        className="w-full p-3 border rounded-lg mb-4 resize-none" rows={3} />

      <button onClick={handleSubmit} disabled={files.length === 0 || uploading}
        className="w-full py-3 bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-lg font-medium disabled:opacity-50">
        {uploading ? 'Publishing...' : 'Share Post'}
      </button>
    </div>
  );
}
