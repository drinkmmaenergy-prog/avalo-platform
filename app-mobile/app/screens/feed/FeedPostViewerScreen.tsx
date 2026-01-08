/**
 * PACK 323 - Feed Post Viewer Screen
 * Full-screen post view with like, comments, share, report
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Text,
  Image,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { httpsCallable } from 'firebase/functions';
import { functions, db } from "@/lib/firebase";
import { doc, getDoc, collection, query, where, orderBy, limit as firestoreLimit, getDocs } from 'firebase/firestore';

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

export default function FeedPostViewerScreen() {
  const router = useRouter();
  const { postId } = useLocalSearchParams();
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);

  // Load post
  useEffect(() => {
    loadPost();
    loadComments();
  }, [postId]);

  const loadPost = async () => {
    try {
      setLoading(true);
      const postDoc = await getDoc(doc(db, 'feedPosts', postId as string));
      
      if (postDoc.exists()) {
        setPost({ id: postDoc.id, ...postDoc.data() } as Post);
        
        // Load aggregate data
        const aggDoc = await getDoc(doc(db, 'feedAggregates', postId as string));
        if (aggDoc.exists()) {
          setLikeCount(aggDoc.data()?.likes || 0);
        }
      }
    } catch (error) {
      console.error('Error loading post:', error);
      Alert.alert('Error', 'Failed to load post');
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

  const handleLike = useCallback(async () => {
    const newLiked = !liked;
    setLiked(newLiked);
    setLikeCount(prev => newLiked ? prev + 1 : prev - 1);

    try {
      const likeContent = httpsCallable(functions, 'pack323_likeContent');
      await likeContent({
        contentId: postId,
        contentType: 'FEED_POST',
      });
    } catch (error) {
      console.error('Error liking post:', error);
      // Revert on error
      setLiked(!newLiked);
      setLikeCount(prev => newLiked ? prev - 1 : prev + 1);
    }
  }, [liked, postId]);

  const handleAddComment = useCallback(async () => {
    if (!commentText.trim()) return;

    setSubmitting(true);
    try {
      const addComment = httpsCallable(functions, 'pack323_addComment');
      await addComment({
        contentId: postId,
        contentType: 'FEED_POST',
        text: commentText.trim(),
      });

      setCommentText('');
      loadComments();
      Alert.alert('Success', 'Comment added');
    } catch (error: any) {
      console.error('Error adding comment:', error);
      Alert.alert('Error', error.message || 'Failed to add comment');
    } finally {
      setSubmitting(false);
    }
  }, [commentText, postId]);

  const handleShare = useCallback(() => {
    Alert.alert('Share', 'Share functionality coming soon!');
  }, []);

  const handleReport = useCallback(() => {
    Alert.alert(
      'Report Post',
      'Select a reason',
      [
        {
          text: 'Spam',
          onPress: () => submitReport('spam'),
        },
        {
          text: 'Harassment',
          onPress: () => submitReport('harassment'),
        },
        {
          text: 'Inappropriate Content',
          onPress: () => submitReport('nudity'),
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]
    );
  }, []);

  const submitReport = async (reason: string) => {
    try {
      const reportContent = httpsCallable(functions, 'pack323_reportContent');
      await reportContent({
        contentId: postId,
        contentType: 'FEED_POST',
        reason,
      });

      Alert.alert('Reported', 'Thank you for helping keep Avalo safe');
    } catch (error) {
      console.error('Error reporting post:', error);
      Alert.alert('Error', 'Failed to submit report');
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#6C63FF" />
      </View>
    );
  }

  if (!post) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Post not found</Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.scrollView}>
        {/* Post Content */}
        <View style={styles.postContainer}>
          <Text style={styles.caption}>{post.caption}</Text>
          
          {post.mediaUrls.length > 0 && (
            <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
              {post.mediaUrls.map((url, index) => (
                <Image
                  key={index}
                  source={{ uri: url }}
                  style={styles.postImage}
                  resizeMode="cover"
                />
              ))}
            </ScrollView>
          )}

          {/* Action Buttons */}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.actionButton} onPress={handleLike}>
              <Text style={styles.actionText}>
                {liked ? '❤️' : '🤍'} {likeCount}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={handleShare}>
              <Text style={styles.actionText}>📤 Share</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={handleReport}>
              <Text style={styles.actionText}>⚠️ Report</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Comments Section */}
        <View style={styles.commentsContainer}>
          <Text style={styles.commentsTitle}>
            Comments ({comments.length})
          </Text>

          {comments.map(comment => (
            <View key={comment.id} style={styles.commentItem}>
              <Text style={styles.commentText}>{comment.text}</Text>
              <Text style={styles.commentTime}>
                {comment.createdAt?.toDate?.().toLocaleString() || 'Just now'}
              </Text>
            </View>
          ))}

          {comments.length === 0 && (
            <Text style={styles.noComments}>No comments yet. Be the first!</Text>
          )}
        </View>
      </ScrollView>

      {/* Comment Input */}
      {post.allowComments && (
        <View style={styles.commentInputContainer}>
          <TextInput
            style={styles.commentInput}
            placeholder="Add a comment..."
            value={commentText}
            onChangeText={setCommentText}
            multiline
            maxLength={2000}
          />
          <TouchableOpacity
            style={[styles.sendButton, !commentText.trim() && styles.sendButtonDisabled]}
            onPress={handleAddComment}
            disabled={!commentText.trim() || submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={styles.sendButtonText}>Send</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  postContainer: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    marginBottom: 12,
  },
  caption: {
    fontSize: 15,
    color: '#333',
    marginBottom: 12,
  },
  postImage: {
    width: 350,
    height: 350,
    borderRadius: 8,
    marginBottom: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionText: {
    fontSize: 14,
    color: '#666',
  },
  commentsContainer: {
    backgroundColor: '#FFFFFF',
    padding: 16,
  },
  commentsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  commentItem: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  commentText: {
    fontSize: 14,
    color: '#333',
    marginBottom: 4,
  },
  commentTime: {
    fontSize: 12,
    color: '#999',
  },
  noComments: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    paddingVertical: 24,
  },
  commentInputContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    gap: 8,
  },
  commentInput: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 14,
    maxHeight: 100,
  },
  sendButton: {
    backgroundColor: '#6C63FF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#CCC',
  },
  sendButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  errorText: {
    fontSize: 16,
    color: '#999',
    marginBottom: 16,
  },
  backButton: {
    backgroundColor: '#6C63FF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
