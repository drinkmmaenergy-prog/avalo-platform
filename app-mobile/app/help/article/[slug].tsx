/**
 * PACK 98 — IN-APP HELP CENTER, GUIDED ONBOARDING & CONTEXTUAL EDUCATION
 * Help article viewer screen
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { functions } from '../../../lib/firebase';
import { httpsCallable } from 'firebase/functions';

interface HelpArticle {
  id: string;
  slug: string;
  title: string;
  content: string;
  tags: string[];
}

export default function HelpArticleScreen() {
  const router = useRouter();
  const { slug } = useLocalSearchParams();
  const [article, setArticle] = useState<HelpArticle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (slug) {
      loadArticle(slug as string);
    }
  }, [slug]);

  const loadArticle = async (articleSlug: string) => {
    try {
      setLoading(true);
      setError(null);

      const getArticle = httpsCallable(functions, 'help_getArticleBySlug');
      const result = await getArticle({
        slug: articleSlug,
        language: 'en',
      });
      const data = result.data as { article: HelpArticle | null };

      if (data.article) {
        setArticle(data.article);
      } else {
        setError('Article not found');
      }
    } catch (err) {
      console.error('[HelpArticle] Error loading article:', err);
      setError('Failed to load article');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  if (error || !article) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle" size={64} color="#EF4444" />
        <Text style={styles.errorText}>{error || 'Article not found'}</Text>
        <TouchableOpacity style={styles.errorButton} onPress={() => router.back()}>
          <Text style={styles.errorButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Help</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Article Content */}
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <Text style={styles.title}>{article.title}</Text>

        {/* Tags */}
        {article.tags.length > 0 && (
          <View style={styles.tagsContainer}>
            {article.tags.map((tag, index) => (
              <View key={index} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Article Body - Simple markdown-like rendering */}
        <View style={styles.articleBody}>
          {article.content.split('\n').map((paragraph, index) => {
            const trimmedParagraph = paragraph.trim();

            // Skip empty lines
            if (!trimmedParagraph) {
              return <View key={index} style={{ height: 16 }} />;
            }

            // Headers (lines starting with #)
            if (trimmedParagraph.startsWith('# ')) {
              return (
                <Text key={index} style={styles.h1}>
                  {trimmedParagraph.replace(/^# /, '')}
                </Text>
              );
            }
            if (trimmedParagraph.startsWith('## ')) {
              return (
                <Text key={index} style={styles.h2}>
                  {trimmedParagraph.replace(/^## /, '')}
                </Text>
              );
            }
            if (trimmedParagraph.startsWith('### ')) {
              return (
                <Text key={index} style={styles.h3}>
                  {trimmedParagraph.replace(/^### /, '')}
                </Text>
              );
            }

            // Bullet points
            if (trimmedParagraph.startsWith('- ')) {
              return (
                <View key={index} style={styles.bulletPoint}>
                  <Text style={styles.bullet}>•</Text>
                  <Text style={styles.bulletText}>
                    {trimmedParagraph.replace(/^- /, '')}
                  </Text>
                </View>
              );
            }

            // Bold text (wrapped in **)
            if (trimmedParagraph.includes('**')) {
              return (
                <Text key={index} style={styles.paragraph}>
                  {trimmedParagraph.split(/(\*\*[^*]+\*\*)/).map((part, i) => {
                    if (part.startsWith('**') && part.endsWith('**')) {
                      return (
                        <Text key={i} style={styles.bold}>
                          {part.replace(/\*\*/g, '')}
                        </Text>
                      );
                    }
                    return part;
                  })}
                </Text>
              );
            }

            // Regular paragraph
            return (
              <Text key={index} style={styles.paragraph}>
                {trimmedParagraph}
              </Text>
            );
          })}
        </View>

        {/* Footer - Helpful prompt */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Was this article helpful?</Text>
          <View style={styles.feedbackButtons}>
            <TouchableOpacity style={styles.feedbackButton}>
              <Ionicons name="thumbs-up-outline" size={20} color="#6B7280" />
              <Text style={styles.feedbackButtonText}>Yes</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.feedbackButton}>
              <Ionicons name="thumbs-down-outline" size={20} color="#6B7280" />
              <Text style={styles.feedbackButtonText}>No</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 40,
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginTop: 20,
    marginBottom: 24,
  },
  errorButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  errorButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 16,
    lineHeight: 36,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 24,
  },
  tag: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    marginBottom: 8,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#3B82F6',
  },
  articleBody: {
    marginBottom: 32,
  },
  h1: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
    marginTop: 24,
    marginBottom: 12,
  },
  h2: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1F2937',
    marginTop: 20,
    marginBottom: 10,
  },
  h3: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginTop: 16,
    marginBottom: 8,
  },
  paragraph: {
    fontSize: 16,
    color: '#4B5563',
    lineHeight: 24,
    marginBottom: 12,
  },
  bold: {
    fontWeight: '600',
    color: '#1F2937',
  },
  bulletPoint: {
    flexDirection: 'row',
    marginBottom: 8,
    paddingLeft: 8,
  },
  bullet: {
    fontSize: 16,
    color: '#3B82F6',
    marginRight: 8,
    fontWeight: 'bold',
  },
  bulletText: {
    flex: 1,
    fontSize: 16,
    color: '#4B5563',
    lineHeight: 24,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 24,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1F2937',
    marginBottom: 16,
  },
  feedbackButtons: {
    flexDirection: 'row',
    gap: 16,
  },
  feedbackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  feedbackButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
    marginLeft: 8,
  },
});