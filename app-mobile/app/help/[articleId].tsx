/**
 * PACK 300 - Help Article Detail
 * Display full article content with markdown rendering
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { doc, getDoc, collection, addDoc } from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';
import { HelpArticle } from '../../../shared/types/support';
import { Ionicons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';

export default function HelpArticleDetail() {
  const { articleId, slug } = useLocalSearchParams();
  const [article, setArticle] = useState<HelpArticle | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedbackGiven, setFeedbackGiven] = useState(false);

  useEffect(() => {
    loadArticle();
  }, [articleId]);

  const loadArticle = async () => {
    try {
      setLoading(true);
      
      if (!articleId) return;

      const docRef = doc(db, 'helpArticles', articleId as string);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        setArticle(docSnap.data() as HelpArticle);
      }
    } catch (error) {
      console.error('Error loading article:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFeedback = async (helpful: boolean) => {
    try {
      if (!article || !auth.currentUser) return;

      await addDoc(collection(db, 'helpArticleFeedback'), {
        feedbackId: `${auth.currentUser.uid}_${article.articleId}_${Date.now()}`,
        articleId: article.articleId,
        userId: auth.currentUser.uid,
        helpful,
        createdAt: new Date().toISOString(),
      });

      setFeedbackGiven(true);
    } catch (error) {
      console.error('Error submitting feedback:', error);
    }
  };

  const handleContactSupport = () => {
    router.push('/support/tickets/create' as any);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  if (!article) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={64} color="#ef4444" />
        <Text style={styles.errorText}>Article not found</Text>
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
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{article.title}</Text>
        <Text style={styles.meta}>
          Last updated: {new Date(article.updatedAt).toLocaleDateString()}
        </Text>
      </View>

      {/* Content */}
      <View style={styles.content}>
        <Markdown style={markdownStyles}>
          {article.bodyMarkdown}
        </Markdown>
      </View>

      {/* Feedback Section */}
      {!feedbackGiven ? (
        <View style={styles.feedbackSection}>
          <Text style={styles.feedbackTitle}>Was this helpful?</Text>
          <View style={styles.feedbackButtons}>
            <TouchableOpacity
              style={styles.feedbackButton}
              onPress={() => handleFeedback(true)}
            >
              <Ionicons name="thumbs-up-outline" size={24} color="#10b981" />
              <Text style={styles.feedbackButtonText}>Yes</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.feedbackButton}
              onPress={() => handleFeedback(false)}
            >
              <Ionicons name="thumbs-down-outline" size={24} color="#ef4444" />
              <Text style={styles.feedbackButtonText}>No</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.feedbackThanks}>
          <Ionicons name="checkmark-circle" size={24} color="#10b981" />
          <Text style={styles.feedbackThanksText}>Thanks for your feedback!</Text>
        </View>
      )}

      {/* Contact Support */}
      <View style={styles.supportSection}>
        <Text style={styles.supportTitle}>Need more help?</Text>
        <TouchableOpacity
          style={styles.contactButton}
          onPress={handleContactSupport}
        >
          <Ionicons name="mail-outline" size={20} color="#fff" />
          <Text style={styles.contactButtonText}>Contact Support</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    padding: 32,
  },
  errorText: {
    fontSize: 18,
    color: '#6b7280',
    marginTop: 16,
    marginBottom: 24,
  },
  backButton: {
    backgroundColor: '#6366f1',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  meta: {
    fontSize: 14,
    color: '#6b7280',
  },
  content: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  feedbackSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  feedbackTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
    textAlign: 'center',
  },
  feedbackButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
  },
  feedbackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  feedbackButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#374151',
  },
  feedbackThanks: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    gap: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  feedbackThanksText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#10b981',
  },
  supportSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  supportTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  contactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366f1',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  contactButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

const markdownStyles = {
  body: {
    fontSize: 16,
    lineHeight: 24,
    color: '#374151',
  },
  heading1: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginTop: 16,
    marginBottom: 8,
  },
  heading2: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    marginTop: 16,
    marginBottom: 8,
  },
  heading3: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginTop: 12,
    marginBottom: 6,
  },
  paragraph: {
    marginBottom: 12,
  },
  bullet_list: {
    marginBottom: 12,
  },
  ordered_list: {
    marginBottom: 12,
  },
  list_item: {
    marginBottom: 4,
  },
  code_inline: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  code_block: {
    backgroundColor: '#f3f4f6',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  link: {
    color: '#6366f1',
    textDecorationLine: 'underline',
  },
  strong: {
    fontWeight: 'bold',
  },
  em: {
    fontStyle: 'italic',
  },
};