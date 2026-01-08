import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { Post } from '@/shared/types/feed';

interface FeedPostProps {
  post: Post;
  onLike?: () => void;
  onSave?: () => void;
  onReport?: () => void;
}

export function FeedPost({ post }: FeedPostProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.author}>{post.authorName}</Text>
      <Text style={styles.content}>{post.content}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#020617',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  author: {
    color: '#e5e7eb',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  content: {
    color: '#f8fafc',
    fontSize: 14,
    lineHeight: 20,
  },
});
