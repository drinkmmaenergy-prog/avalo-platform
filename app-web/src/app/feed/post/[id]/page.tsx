/**
 * PACK 323 - Post Viewer Page (Web)
 * Single post view with comments
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
  doc, 
  getDoc, 
  collection, 
  query, 
  where, 
  orderBy, 
  limit as firestoreLimit, 
  getDocs 
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db } from '@/lib/firebase';
import Image from 'next/image';

interface Post {
  id: string;
  ownerUserId: string;
  mediaUrls: string[];
  caption: string;
  createdAt: any;
  allowComments: boolean;
}

interface Comment {
  id: string;
  userId: string;
  text: string;
  createdAt: any;
}

export default function PostViewerPage() {
  const params = useParams();
  const router = useRouter();
  const postId = params.id as string;

  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);

  useEffect(() => {
    loadPost();
    loadComments();
  }, [postId]);

  const loadPost = async () => {
    try {
      setLoading(true);
      const postDoc = await getDoc(doc(db, 'feedPosts', postId));
      
      if (postDoc.exists()) {
        setPost({ id: postDoc.id, ...postDoc.data() } as Post);
        
        // Load aggregate data
        const aggDoc = await getDoc(doc(db, 'feedAggregates', postId));
        if (aggDoc.exists()) {
          setLikeCount(aggDoc.data()?.likes || 0);
        }
      }
    } catch (error) {
      console.error('Error loading post:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadComments = async () => {
    try {
      const commentsQuery = query(
        collection(db, 'feedComments'),
        where('contentId', '==', postId),
        where('isDeleted', '==', false),
        orderBy('createdAt', 'asc'),
        firestoreLimit(50)
      );

      const commentsSnap = await getDocs(commentsQuery);
      const commentsData = commentsSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Comment[];

      setComments(commentsData);
    } catch (error) {
      console.error('Error loading comments:', error);
    }
  };

  const handleLike = async () => {
    const newLiked = !liked;
    setLiked(newLiked);
    setLikeCount(prev => newLiked ? prev + 1 : prev - 1);

    try {
      // Note: Replace with actual firebase functions import when available
      // const likeContent = httpsCallable(functions, 'pack323_likeContent');
      // await likeContent({ contentId: postId, contentType: 'FEED_POST' });
    } catch (error) {
      console.error('Error liking post:', error);
      setLiked(!newLiked);
      setLikeCount(prev => newLiked ? prev - 1 : prev + 1);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;

    setSubmitting(true);
    try {
      // Note: Replace with actual firebase functions import when available
      // const addComment = httpsCallable(functions, 'pack323_addComment');
      // await addComment({
      //   contentId: postId,
      //   contentType: 'FEED_POST',
      //   text: commentText.trim(),
      // });

      setCommentText('');
      loadComments();
      alert('Comment added');
    } catch (error: any) {
      console.error('Error adding comment:', error);
      alert(error.message || 'Failed to add comment');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <p className="text-gray-500 mb-4">Post not found</p>
        <button
          onClick={() => router.push('/feed')}
          className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
        >
          Back to Feed
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <button
          onClick={() => router.back()}
          className="mb-4 text-purple-600 hover:text-purple-700"
        >
          ← Back
        </button>

        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          {/* Post Content */}
          <div className="p-6">
            <p className="text-gray-800 text-lg mb-4">{post.caption}</p>
            
            {post.mediaUrls.length > 0 && (
              <div className="grid grid-cols-1 gap-4 mb-6">
                {post.mediaUrls.map((url, index) => (
                  <div key={index} className="relative aspect-square">
                    <Image
                      src={url}
                      alt={`Post image ${index + 1}`}
                      fill
                      className="object-cover rounded-lg"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-6 py-4 border-t border-gray-200">
              <button
                onClick={handleLike}
                className="flex items-center gap-2 text-gray-700 hover:text-red-500 transition-colors"
              >
                <span className="text-xl">{liked ? '❤️' : '🤍'}</span>
                <span>{likeCount}</span>
              </button>
              <button className="flex items-center gap-2 text-gray-700 hover:text-purple-600 transition-colors">
                <span className="text-xl">📤</span>
                <span>Share</span>
              </button>
            </div>
          </div>

          {/* Comments Section */}
          <div className="border-t border-gray-200 p-6">
            <h3 className="text-xl font-bold mb-4">
              Comments ({comments.length})
            </h3>

            {/* Comment List */}
            <div className="space-y-4 mb-6">
              {comments.map(comment => (
                <div key={comment.id} className="border-b border-gray-100 pb-4">
                  <p className="text-gray-800 mb-1">{comment.text}</p>
                  <p className="text-xs text-gray-500">
                    {comment.createdAt?.toDate?.().toLocaleString() || 'Just now'}
                  </p>
                </div>
              ))}

              {comments.length === 0 && (
                <p className="text-gray-500 text-center py-8">
                  No comments yet. Be the first!
                </p>
              )}
            </div>

            {/* Comment Input */}
            {post.allowComments && (
              <form onSubmit={handleAddComment} className="flex gap-3">
                <input
                  type="text"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Add a comment..."
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600"
                  maxLength={2000}
                />
                <button
                  type="submit"
                  disabled={!commentText.trim() || submitting}
                  className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Sending...' : 'Send'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}