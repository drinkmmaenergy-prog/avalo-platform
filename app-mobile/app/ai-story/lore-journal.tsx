/**
 * PACK 188 - AI Narrative & Fantasy Engine
 * Lore Journal - Track story memories and outcomes
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db, auth } from "@/lib/firebase";

interface StoryOutcome {
  id: string;
  arcId: string;
  arcTitle?: string;
  outcomeType: string;
  choiceHistory: string[];
  completedAt: any;
}

interface StoryBookmark {
  id: string;
  arcId: string;
  arcTitle?: string;
  chapterId: string;
  chapterTitle?: string;
  createdAt: any;
}

const OUTCOME_EMOJIS: Record<string, string> = {
  passionate_kiss: '💋',
  promise_reunion: '🤝',
  tournament_win: '🏆',
  case_solved: '🔍',
  sunset_beach: '🌅',
  friendship_triumph: '👫',
  career_success: '💼'
};

export default function LoreJournal() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [outcomes, setOutcomes] = useState<StoryOutcome[]>([]);
  const [bookmarks, setBookmarks] = useState<StoryBookmark[]>([]);
  const [activeTab, setActiveTab] = useState<'completed' | 'bookmarks'>('completed');

  useEffect(() => {
    loadJournalData();
  }, []);

  const loadJournalData = async () => {
    try {
      setLoading(true);
      const user = auth.currentUser;
      if (!user) return;

      await Promise.all([
        loadOutcomes(user.uid),
        loadBookmarks(user.uid)
      ]);
    } catch (error) {
      console.error('Error loading journal:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadOutcomes = async (userId: string) => {
    try {
      const outcomesRef = collection(db, 'ai_story_outcomes');
      const q = query(
        outcomesRef,
        where('userId', '==', userId),
        orderBy('completedAt', 'desc'),
        limit(50)
      );

      const snapshot = await getDocs(q);
      const outcomesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as StoryOutcome[];

      for (const outcome of outcomesData) {
        try {
          const arcDoc = await getDocs(
            query(collection(db, 'ai_story_arcs'), where('arcId', '==', outcome.arcId), limit(1))
          );
          if (!arcDoc.empty) {
            outcome.arcTitle = arcDoc.docs[0].data().title;
          }
        } catch (err) {
          console.error('Error loading arc title:', err);
        }
      }

      setOutcomes(outcomesData);
    } catch (error) {
      console.error('Error loading outcomes:', error);
    }
  };

  const loadBookmarks = async (userId: string) => {
    try {
      const bookmarksRef = collection(db, 'user_story_bookmarks');
      const q = query(
        bookmarksRef,
        where('userId', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(50)
      );

      const snapshot = await getDocs(q);
      const bookmarksData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as StoryBookmark[];

      setBookmarks(bookmarksData);
    } catch (error) {
      console.error('Error loading bookmarks:', error);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadJournalData();
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'Unknown';
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return 'Unknown';
    }
  };

  const replayStory = (arcId: string) => {
    router.push(`/ai-story/arc/${arcId}` as any);
  };

  const renderCompletedStory = (outcome: StoryOutcome) => (
    <View key={outcome.id} style={styles.journalCard}>
      <View style={styles.cardHeader}>
        <View style={styles.outcomeIcon}>
          <Text style={styles.outcomeEmoji}>
            {OUTCOME_EMOJIS[outcome.outcomeType] || '✨'}
          </Text>
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle}>
            {outcome.arcTitle || 'Untitled Story'}
          </Text>
          <Text style={styles.cardSubtitle}>
            {outcome.outcomeType.replace('_', ' ')}
          </Text>
        </View>
      </View>

      <View style={styles.cardMeta}>
        <View style={styles.metaItem}>
          <Ionicons name="calendar-outline" size={14} color="#666" />
          <Text style={styles.metaText}>
            {formatDate(outcome.completedAt)}
          </Text>
        </View>
        <View style={styles.metaItem}>
          <Ionicons name="git-branch-outline" size={14} color="#666" />
          <Text style={styles.metaText}>
            {outcome.choiceHistory.length} choices made
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.replayButton}
        onPress={() => replayStory(outcome.arcId)}
      >
        <Ionicons name="refresh-outline" size={16} color="#9B59B6" />
        <Text style={styles.replayButtonText}>Replay Story</Text>
      </TouchableOpacity>
    </View>
  );

  const renderBookmark = (bookmark: StoryBookmark) => (
    <View key={bookmark.id} style={styles.journalCard}>
      <View style={styles.cardHeader}>
        <View style={[styles.outcomeIcon, { backgroundColor: '#3498DB' }]}>
          <Ionicons name="bookmark" size={24} color="#FFF" />
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle}>
            {bookmark.arcTitle || 'Bookmarked Story'}
          </Text>
          <Text style={styles.cardSubtitle}>
            {bookmark.chapterTitle || 'Chapter saved'}
          </Text>
        </View>
      </View>

      <View style={styles.cardMeta}>
        <View style={styles.metaItem}>
          <Ionicons name="calendar-outline" size={14} color="#666" />
          <Text style={styles.metaText}>
            {formatDate(bookmark.createdAt)}
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.replayButton}
        onPress={() => replayStory(bookmark.arcId)}
      >
        <Ionicons name="play-outline" size={16} color="#3498DB" />
        <Text style={[styles.replayButtonText, { color: '#3498DB' }]}>
          Continue
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Lore Journal</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'completed' && styles.tabActive]}
          onPress={() => setActiveTab('completed')}
        >
          <Ionicons
            name="checkmark-circle"
            size={20}
            color={activeTab === 'completed' ? '#9B59B6' : '#999'}
          />
          <Text
            style={[
              styles.tabText,
              activeTab === 'completed' && styles.tabTextActive
            ]}
          >
            Completed ({outcomes.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'bookmarks' && styles.tabActive]}
          onPress={() => setActiveTab('bookmarks')}
        >
          <Ionicons
            name="bookmark"
            size={20}
            color={activeTab === 'bookmarks' ? '#3498DB' : '#999'}
          />
          <Text
            style={[
              styles.tabText,
              activeTab === 'bookmarks' && styles.tabTextActive
            ]}
          >
            Bookmarks ({bookmarks.length})
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#9B59B6" />
          <Text style={styles.loadingText}>Loading journal...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {activeTab === 'completed' ? (
            outcomes.length > 0 ? (
              outcomes.map(renderCompletedStory)
            ) : (
              <View style={styles.emptyContainer}>
                <Ionicons name="book-outline" size={64} color="#CCC" />
                <Text style={styles.emptyText}>No completed stories yet</Text>
                <Text style={styles.emptySubtext}>
                  Start a story and complete it to see it here!
                </Text>
              </View>
            )
          ) : (
            bookmarks.length > 0 ? (
              bookmarks.map(renderBookmark)
            ) : (
              <View style={styles.emptyContainer}>
                <Ionicons name="bookmark-outline" size={64} color="#CCC" />
                <Text style={styles.emptyText}>No bookmarks yet</Text>
                <Text style={styles.emptySubtext}>
                  Bookmark your favorite moments to find them easily!
                </Text>
              </View>
            )
          )}

          <View style={styles.encouragement}>
            <Text style={styles.encouragementText}>
              💫 Every story you complete becomes part of your journey
            </Text>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA'
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0'
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333'
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0'
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent'
  },
  tabActive: {
    borderBottomColor: '#9B59B6'
  },
  tabText: {
    fontSize: 14,
    color: '#999',
    marginLeft: 8,
    fontWeight: '500'
  },
  tabTextActive: {
    color: '#333',
    fontWeight: '600'
  },
  content: {
    flex: 1
  },
  contentContainer: {
    padding: 16
  },
  journalCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  cardHeader: {
    flexDirection: 'row',
    marginBottom: 12
  },
  outcomeIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#9B59B6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12
  },
  outcomeEmoji: {
    fontSize: 24
  },
  cardInfo: {
    flex: 1,
    justifyContent: 'center'
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4
  },
  cardSubtitle: {
    fontSize: 13,
    color: '#666',
    textTransform: 'capitalize'
  },
  cardMeta: {
    flexDirection: 'row',
    marginBottom: 12
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16
  },
  metaText: {
    fontSize: 12,
    color: '#666',
    marginLeft: 4
  },
  replayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#9B59B6'
  },
  replayButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9B59B6',
    marginLeft: 6
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666'
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 16
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 40
  },
  encouragement: {
    backgroundColor: '#FFF3E0',
    padding: 16,
    borderRadius: 8,
    marginTop: 20,
    marginBottom: 20
  },
  encouragementText: {
    fontSize: 13,
    color: '#E65100',
    textAlign: 'center',
    fontStyle: 'italic'
  }
});
