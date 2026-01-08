/**
 * PACK 300 - Help Center Home
 * Main help center screen with search and categories
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from "@/lib/firebase";
import { HelpArticle, ArticleCategory, ARTICLE_CATEGORY_LABELS } from "@/shared/types/support";
import { Ionicons } from '@expo/vector-icons';

const FEATURED_CATEGORIES: ArticleCategory[] = [
  'GETTING_STARTED',
  'PAID_CHAT',
  'SAFETY_AND_REPORTING',
  'CALENDAR_AND_MEETINGS',
];

export default function HelpCenterHome() {
  const [searchQuery, setSearchQuery] = useState('');
  const [topArticles, setTopArticles] = useState<HelpArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [locale] = useState('en-US'); // TODO: Get from user preferences

  useEffect(() => {
    loadTopArticles();
  }, []);

  const loadTopArticles = async () => {
    try {
      setLoading(true);
      
      // Load featured articles
      const q = query(
        collection(db, 'helpArticles'),
        where('locale', '==', locale),
        where('isSearchable', '==', true),
        where('isFeatured', '==', true),
        orderBy('updatedAt', 'desc'),
        limit(5)
      );

      const snapshot = await getDocs(q);
      const articles = snapshot.docs.map(doc => doc.data() as HelpArticle);
      setTopArticles(articles);
    } catch (error) {
      console.error('Error loading top articles:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    if (searchQuery.trim()) {
      router.push({
        pathname: '/help/search',
        params: { query: searchQuery },
      });
    }
  };

  const handleCategoryPress = (category: ArticleCategory) => {
    router.push({
      pathname: '/help/category',
      params: { category },
    });
  };

  const handleArticlePress = (article: HelpArticle) => {
    router.push({
      pathname: `/help/${article.articleId}`,
      params: { slug: article.slug },
    });
  };

  const getCategoryIcon = (category: ArticleCategory): keyof typeof Ionicons.glyphMap => {
    const iconMap: Record<ArticleCategory, keyof typeof Ionicons.glyphMap> = {
      GETTING_STARTED: 'rocket-outline',
      PROFILE: 'person-outline',
      DISCOVERY_AND_SWIPE: 'heart-outline',
      PAID_CHAT: 'chatbubbles-outline',
      CALLS: 'call-outline',
      CALENDAR_AND_MEETINGS: 'calendar-outline',
      EVENTS: 'beer-outline',
      TOKENS_AND_WALLET: 'wallet-outline',
      PAYOUTS: 'cash-outline',
      SAFETY_AND_REPORTING: 'shield-checkmark-outline',
      ACCOUNT_AND_PRIVACY: 'lock-closed-outline',
      TECHNICAL_ISSUES: 'construct-outline',
    };
    return iconMap[category];
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Help Center</Text>
        <Text style={styles.subtitle}>How can we help you today?</Text>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search-outline" size={20} color="#666" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search help articles..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color="#666" />
          </TouchableOpacity>
        )}
      </View>

      {/* Featured Categories */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Browse by Category</Text>
        <View style={styles.categoriesGrid}>
          {FEATURED_CATEGORIES.map((category) => (
            <TouchableOpacity
              key={category}
              style={styles.categoryCard}
              onPress={() => handleCategoryPress(category)}
            >
              <View style={styles.categoryIconContainer}>
                <Ionicons
                  name={getCategoryIcon(category)}
                  size={28}
                  color="#6366f1"
                />
              </View>
              <Text style={styles.categoryTitle}>
                {ARTICLE_CATEGORY_LABELS[category].en}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Top Articles */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Featured Articles</Text>
        {loading ? (
          <ActivityIndicator size="large" color="#6366f1" style={styles.loader} />
        ) : topArticles.length > 0 ? (
          <View style={styles.articlesList}>
            {topArticles.map((article) => (
              <TouchableOpacity
                key={article.articleId}
                style={styles.articleCard}
                onPress={() => handleArticlePress(article)}
              >
                <View style={styles.articleContent}>
                  <Text style={styles.articleTitle}>{article.title}</Text>
                  <Text style={styles.articleSummary} numberOfLines={2}>
                    {article.shortSummary}
                  </Text>
                </View>
                <Ionicons name="chevron-forward-outline" size={20} color="#666" />
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyText}>No articles available</Text>
        )}
      </View>

      {/* Contact Support */}
      <TouchableOpacity
        style={styles.contactButton}
        onPress={() => router.push('/support/tickets/create')}
      >
        <Ionicons name="mail-outline" size={20} color="#6366f1" />
        <Text style={styles.contactButtonText}>Contact Support</Text>
      </TouchableOpacity>
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
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
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
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#111827',
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -8,
  },
  categoryCard: {
    width: '50%',
    padding: 8,
  },
  categoryIconContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
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
  categoryTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    textAlign: 'center',
  },
  articlesList: {
    gap: 12,
  },
  articleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
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
  articleContent: {
    flex: 1,
    marginRight: 12,
  },
  articleTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  articleSummary: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
  },
  contactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#6366f1',
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
  contactButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6366f1',
    marginLeft: 8,
  },
  loader: {
    marginVertical: 32,
  },
  emptyText: {
    textAlign: 'center',
    color: '#9ca3af',
    fontSize: 14,
    marginVertical: 32,
  },
});
