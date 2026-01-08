/**
 * Support Center Screen
 * 
 * Main entry point for support - shows categories and access to tickets.
 * Part of PACK 68 - In-App Support Center & Ticketing.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import {
  SupportCategory,
  getAllCategories,
  getCategoryDisplayName,
  getCategoryIcon,
  getHelpArticles,
  HelpArticle,
} from '../../services/supportService';

const SupportCenterScreen: React.FC = () => {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(false);
  const [featuredArticles, setFeaturedArticles] = useState<HelpArticle[]>([]);
  const locale = 'en'; // TODO: Get from user settings

  useEffect(() => {
    loadFeaturedArticles();
  }, []);

  const loadFeaturedArticles = async () => {
    try {
      setLoading(true);
      const articles = await getHelpArticles(locale);
      setFeaturedArticles(articles.slice(0, 3));
    } catch (error) {
      console.error('[SupportCenter] Error loading articles:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCategoryPress = (category: SupportCategory) => {
    navigation.navigate('SupportNewTicket' as never, { category } as never);
  };

  const handleViewTickets = () => {
    navigation.navigate('SupportTicketList' as never);
  };

  const categories = getAllCategories();

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Help & Support</Text>
          <Text style={styles.description}>
            We're here to help you with your account, payments, safety and technical issues.
          </Text>
        </View>

        {/* My Tickets Button */}
        <TouchableOpacity
          style={styles.myTicketsButton}
          onPress={handleViewTickets}
          activeOpacity={0.7}
        >
          <View style={styles.myTicketsContent}>
            <Ionicons name="folder-open" size={24} color="#007AFF" />
            <Text style={styles.myTicketsText}>My support tickets</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#007AFF" />
        </TouchableOpacity>

        {/* Featured Help Articles */}
        {featuredArticles.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Popular Help Topics</Text>
            {featuredArticles.map((article) => (
              <TouchableOpacity
                key={article.articleId}
                style={styles.articleCard}
                activeOpacity={0.7}
              >
                <Text style={styles.articleTitle}>{article.title}</Text>
                <Ionicons name="chevron-forward" size={16} color="#8E8E93" />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Contact Support Categories */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contact Support</Text>
          <Text style={styles.sectionSubtitle}>
            Choose a category for your issue
          </Text>

          <View style={styles.categoriesGrid}>
            {categories.map((category) => (
              <TouchableOpacity
                key={category}
                style={styles.categoryCard}
                onPress={() => handleCategoryPress(category)}
                activeOpacity={0.7}
              >
                <View style={styles.categoryIcon}>
                  <Ionicons
                    name={getCategoryIcon(category) as any}
                    size={28}
                    color="#007AFF"
                  />
                </View>
                <Text style={styles.categoryText}>
                  {getCategoryDisplayName(category, locale)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Footer Info */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Our support team typically responds within 24 hours.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  header: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 8,
  },
  description: {
    fontSize: 15,
    color: '#8E8E93',
    lineHeight: 20,
  },
  myTicketsButton: {
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
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
  myTicketsContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  myTicketsText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#007AFF',
    marginLeft: 12,
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 16,
  },
  articleCard: {
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  articleTitle: {
    fontSize: 15,
    color: '#000000',
    flex: 1,
  },
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
  },
  categoryCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    margin: '1%',
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
  categoryIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  categoryText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000000',
    textAlign: 'center',
  },
  footer: {
    marginTop: 32,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 13,
    color: '#8E8E93',
    textAlign: 'center',
  },
});

export default SupportCenterScreen;
