/**
 * VIP Vault Screen
 * 
 * Private storage for VIP members
 * Save bookmarks, memories, and notes
 * All data is private and only visible to the owner
 */

import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';

interface VaultItem {
  itemId: string;
  type: 'bookmarked_profile' | 'purchased_content' | 'chat_memory' | 'challenge_memory' | 'call_note' | 'custom_note';
  data: any;
  userNote?: string;
  tags: string[];
  starred: boolean;
  createdAt: string;
}

interface VaultSummary {
  totalItems: number;
  storageUsed: number;
  storageLimit: number;
}

const ITEM_TYPE_LABELS: Record<string, { icon: string; label: string }> = {
  bookmarked_profile: { icon: '👤', label: 'Bookmarked Profile' },
  purchased_content: { icon: '🎬', label: 'Purchased Content' },
  chat_memory: { icon: '💬', label: 'Chat Memory' },
  challenge_memory: { icon: '🎯', label: 'Challenge Memory' },
  call_note: { icon: '📞', label: 'Call Note' },
  custom_note: { icon: '📝', label: 'Custom Note' },
};

export default function VIPVaultScreen() {
  const router = useRouter();
  const [items, setItems] = useState<VaultItem[]>([]);
  const [summary, setSummary] = useState<VaultSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddNote, setShowAddNote] = useState(false);

  useEffect(() => {
    loadVaultItems();
  }, [selectedType]);

  const loadVaultItems = async () => {
    try {
      setLoading(true);
      
      // TODO: Call Cloud Function
      // const result = await getVaultItems({
      //   type: selectedType || undefined,
      //   limit: 50,
      // });
      
      // setItems(result.items);
      // setSummary(result.summary);
      
      // Mock data for demo
      setItems([
        {
          itemId: '1',
          type: 'bookmarked_profile',
          data: {
            profileId: 'user123',
            profileName: 'Sarah',
            profilePhotoUrl: 'https://via.placeholder.com/100',
          },
          userNote: 'Met at summer event',
          tags: ['summer', 'event'],
          starred: true,
          createdAt: new Date().toISOString(),
        },
        {
          itemId: '2',
          type: 'chat_memory',
          data: {
            chatId: 'chat456',
            otherUserId: 'user789',
            messageText: 'Great conversation about travel',
          },
          userNote: 'Paris recommendations',
          tags: ['travel'],
          starred: false,
          createdAt: new Date().toISOString(),
        },
        {
          itemId: '3',
          type: 'custom_note',
          data: {
            customTitle: 'Ideas',
            customNote: 'Remember to plan weekend trip',
          },
          tags: ['personal'],
          starred: false,
          createdAt: new Date().toISOString(),
        },
      ]);
      
      setSummary({
        totalItems: 3,
        storageUsed: 1024 * 1024 * 5, // 5 MB
        storageLimit: 1024 * 1024 * 1024 * 10, // 10 GB
      });
    } catch (error) {
      console.error('Failed to load vault items:', error);
      Alert.alert('Error', 'Failed to load vault items. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const deleteItem = async (itemId: string) => {
    Alert.alert(
      'Delete Item',
      'Are you sure you want to remove this item from your vault?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // TODO: Call Cloud Function
              // await removeVaultItem({ itemId });
              
              setItems(items.filter(item => item.itemId !== itemId));
              Alert.alert('Success', 'Item removed from vault');
            } catch (error) {
              console.error('Failed to delete item:', error);
              Alert.alert('Error', 'Failed to delete item. Please try again.');
            }
          },
        },
      ]
    );
  };

  const addCustomNote = async () => {
    Alert.prompt(
      'Add Custom Note',
      'Enter your note',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save',
          onPress: async (text) => {
            if (!text?.trim()) return;
            
            try {
              // TODO: Call Cloud Function
              // await addVaultItem({
              //   type: 'custom_note',
              //   data: {
              //     customTitle: 'Note',
              //     customNote: text,
              //   },
              //   tags: [],
              // });
              
              Alert.alert('Success', 'Note added to vault');
              loadVaultItems();
            } catch (error) {
              console.error('Failed to add note:', error);
              Alert.alert('Error', 'Failed to add note. Please try again.');
            }
          },
        },
      ],
      'plain-text'
    );
  };

  const formatStorageSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const filteredItems = items.filter(item => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        item.userNote?.toLowerCase().includes(query) ||
        item.tags.some(tag => tag.toLowerCase().includes(query)) ||
        JSON.stringify(item.data).toLowerCase().includes(query)
      );
    }
    return true;
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>VIP Vault</Text>
        <Text style={styles.subtitle}>Your Private Storage</Text>
      </View>

      {/* Storage Summary */}
      {summary && (
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total Items</Text>
            <Text style={styles.summaryValue}>{summary.totalItems}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Storage Used</Text>
            <Text style={styles.summaryValue}>
              {formatStorageSize(summary.storageUsed)} / {formatStorageSize(summary.storageLimit)}
            </Text>
          </View>
          <View style={styles.storageBar}>
            <View
              style={[
                styles.storageBarFill,
                { width: `${(summary.storageUsed / summary.storageLimit) * 100}%` },
              ]}
            />
          </View>
        </View>
      )}

      {/* Search */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search vault..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Type Filters */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filtersContainer}
        contentContainerStyle={styles.filtersContent}
      >
        <TouchableOpacity
          style={[styles.filterButton, !selectedType && styles.filterButtonActive]}
          onPress={() => setSelectedType(null)}
        >
          <Text style={[styles.filterButtonText, !selectedType && styles.filterButtonTextActive]}>
            All
          </Text>
        </TouchableOpacity>
        {Object.entries(ITEM_TYPE_LABELS).map(([type, config]) => (
          <TouchableOpacity
            key={type}
            style={[styles.filterButton, selectedType === type && styles.filterButtonActive]}
            onPress={() => setSelectedType(type)}
          >
            <Text style={styles.filterIcon}>{config.icon}</Text>
            <Text
              style={[
                styles.filterButtonText,
                selectedType === type && styles.filterButtonTextActive,
              ]}
            >
              {config.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Items List */}
      <ScrollView style={styles.content}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#4ECDC4" />
            <Text style={styles.loadingText}>Loading vault...</Text>
          </View>
        ) : filteredItems.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🔒</Text>
            <Text style={styles.emptyTitle}>Your vault is empty</Text>
            <Text style={styles.emptyText}>
              Save bookmarks, memories, and notes here
            </Text>
            <TouchableOpacity style={styles.addFirstButton} onPress={addCustomNote}>
              <Text style={styles.addFirstButtonText}>Add Your First Note</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.itemsList}>
            {filteredItems.map((item) => {
              const typeConfig = ITEM_TYPE_LABELS[item.type];
              
              return (
                <View key={item.itemId} style={styles.itemCard}>
                  <View style={styles.itemHeader}>
                    <View style={styles.itemTypeContainer}>
                      <Text style={styles.itemIcon}>{typeConfig.icon}</Text>
                      <Text style={styles.itemType}>{typeConfig.label}</Text>
                    </View>
                    {item.starred && <Text style={styles.starIcon}>⭐</Text>}
                  </View>

                  <View style={styles.itemContent}>
                    {item.data.profileName && (
                      <Text style={styles.itemTitle}>{item.data.profileName}</Text>
                    )}
                    {item.data.messageText && (
                      <Text style={styles.itemText}>{item.data.messageText}</Text>
                    )}
                    {item.data.customTitle && (
                      <Text style={styles.itemTitle}>{item.data.customTitle}</Text>
                    )}
                    {item.data.customNote && (
                      <Text style={styles.itemText}>{item.data.customNote}</Text>
                    )}
                    {item.userNote && (
                      <Text style={styles.itemNote}>Note: {item.userNote}</Text>
                    )}
                  </View>

                  {item.tags.length > 0 && (
                    <View style={styles.tagsContainer}>
                      {item.tags.map((tag, index) => (
                        <View key={index} style={styles.tag}>
                          <Text style={styles.tagText}>{tag}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  <View style={styles.itemActions}>
                    <Text style={styles.itemDate}>
                      {new Date(item.createdAt).toLocaleDateString()}
                    </Text>
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => deleteItem(item.itemId)}
                    >
                      <Text style={styles.deleteButtonText}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <View style={styles.spacer} />
      </ScrollView>

      {/* Add Button */}
      <TouchableOpacity style={styles.fab} onPress={addCustomNote}>
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    backgroundColor: '#fff',
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  backButton: {
    marginBottom: 10,
  },
  backButtonText: {
    fontSize: 16,
    color: '#FF6B6B',
    fontWeight: '600',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginTop: 4,
  },
  summaryCard: {
    backgroundColor: '#fff',
    margin: 20,
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#666',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  storageBar: {
    height: 8,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 10,
  },
  storageBarFill: {
    height: '100%',
    backgroundColor: '#4ECDC4',
  },
  searchContainer: {
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  searchInput: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  filtersContainer: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  filtersContent: {
    paddingHorizontal: 20,
    paddingVertical: 15,
    gap: 10,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
    marginRight: 10,
  },
  filterButtonActive: {
    backgroundColor: '#4ECDC4',
  },
  filterIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  filterButtonTextActive: {
    color: '#fff',
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 100,
  },
  loadingText: {
    marginTop: 15,
    fontSize: 16,
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 100,
    paddingHorizontal: 40,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 30,
  },
  addFirstButton: {
    backgroundColor: '#4ECDC4',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  addFirstButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  itemsList: {
    padding: 20,
    gap: 15,
  },
  itemCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  itemTypeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  itemType: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
  starIcon: {
    fontSize: 20,
  },
  itemContent: {
    marginBottom: 12,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 6,
  },
  itemText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 6,
  },
  itemNote: {
    fontSize: 13,
    color: '#4ECDC4',
    fontStyle: 'italic',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  tag: {
    backgroundColor: '#E0E0E0',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  tagText: {
    fontSize: 12,
    color: '#666',
  },
  itemActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  itemDate: {
    fontSize: 12,
    color: '#999',
  },
  deleteButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  deleteButtonText: {
    fontSize: 14,
    color: '#FF5252',
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#4ECDC4',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  fabIcon: {
    fontSize: 32,
    color: '#fff',
    fontWeight: 'bold',
  },
  spacer: {
    height: 80,
  },
});
