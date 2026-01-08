/**
 * PACK 170 — Avalo Universal Search 3.0
 * Search History Management Screen
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  SafeAreaView,
  ActivityIndicator
} from 'react-native';
import { SearchSDK, SearchHistoryEntry } from "@/lib/search.sdk";
import { useRouter } from 'expo-router';

export default function SearchHistoryScreen() {
  const [history, setHistory] = useState<SearchHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      setLoading(true);
      const response = await SearchSDK.getSearchHistory(50);
      setHistory(response.history);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to load search history');
    } finally {
      setLoading(false);
    }
  };

  const handleClearAll = () => {
    Alert.alert(
      'Clear Search History',
      'Are you sure you want to clear all your search history? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await SearchSDK.clearSearchHistory();
              setHistory([]);
              Alert.alert('Success', 'Search history cleared');
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to clear history');
            }
          }
        }
      ]
    );
  };

  const handleDeleteEntry = (entryId: string) => {
    Alert.alert(
      'Delete Entry',
      'Are you sure you want to delete this search entry?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await SearchSDK.deleteSearchHistoryEntry(entryId);
              setHistory(history.filter(h => `${h.userId}_${h.timestamp.getTime()}` !== entryId));
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to delete entry');
            }
          }
        }
      ]
    );
  };

  const handleSearchAgain = (entry: SearchHistoryEntry) => {
    router.push({
      pathname: '/search/universal',
      params: {
        query: entry.query,
        category: entry.category || ''
      }
    });
  };

  const formatTimestamp = (timestamp: Date): string => {
    const now = new Date();
    const date = new Date(timestamp);
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    
    return date.toLocaleDateString();
  };

  const renderHistoryItem = ({ item }: { item: SearchHistoryEntry }) => (
    <View style={styles.historyItem}>
      <TouchableOpacity
        style={styles.historyContent}
        onPress={() => handleSearchAgain(item)}
      >
        <View style={styles.historyHeader}>
          <Text style={styles.queryText} numberOfLines={1}>
            🔍 {item.query}
          </Text>
          <Text style={styles.timestampText}>
            {formatTimestamp(item.timestamp)}
          </Text>
        </View>

        <View style={styles.historyMeta}>
          {item.category && (
            <Text style={styles.categoryText}>
              in {item.category.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
            </Text>
          )}
          <Text style={styles.resultsText}>
            {item.resultCount} results
          </Text>
        </View>

        {Object.keys(item.filters).length > 1 && (
          <Text style={styles.filtersText}>
            🎯 {Object.keys(item.filters).length - 1} filters applied
          </Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => handleDeleteEntry(`${item.userId}_${new Date(item.timestamp).getTime()}`)}
      >
        <Text style={styles.deleteButtonText}>🗑️</Text>
      </TouchableOpacity>
    </View>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>🔍</Text>
      <Text style={styles.emptyText}>No Search History</Text>
      <Text style={styles.emptySubtext}>
        Your search history will appear here
      </Text>
      <TouchableOpacity
        style={styles.searchButton}
        onPress={() => router.push('/search/universal')}
      >
        <Text style={styles.searchButtonText}>Start Searching</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading history...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Search History</Text>
        {history.length > 0 && (
          <TouchableOpacity
            style={styles.clearAllButton}
            onPress={handleClearAll}
          >
            <Text style={styles.clearAllText}>Clear All</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.privacyNotice}>
        <Text style={styles.privacyText}>
          🔒 Your search history is private and only visible to you
        </Text>
      </View>

      <FlatList
        data={history}
        keyExtractor={(item, index) => `${item.userId}_${new Date(item.timestamp).getTime()}_${index}`}
        renderItem={renderHistoryItem}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={history.length === 0 ? styles.emptyList : undefined}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000000',
  },
  clearAllButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#FF3B30',
  },
  clearAllText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  privacyNotice: {
    backgroundColor: '#E8F5E9',
    padding: 12,
    marginTop: 8,
    marginHorizontal: 12,
    borderRadius: 8,
  },
  privacyText: {
    fontSize: 12,
    color: '#2E7D32',
    textAlign: 'center',
  },
  historyItem: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 12,
    marginVertical: 6,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  historyContent: {
    flex: 1,
    padding: 16,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  queryText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    marginRight: 8,
  },
  timestampText: {
    fontSize: 12,
    color: '#999999',
  },
  historyMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  categoryText: {
    fontSize: 12,
    color: '#666666',
    marginRight: 12,
  },
  resultsText: {
    fontSize: 12,
    color: '#999999',
  },
  filtersText: {
    fontSize: 11,
    color: '#007AFF',
    marginTop: 4,
  },
  deleteButton: {
    width: 60,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFE5E5',
  },
  deleteButtonText: {
    fontSize: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666666',
  },
  emptyList: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#666666',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999999',
    textAlign: 'center',
    marginBottom: 24,
  },
  searchButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  searchButtonText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
