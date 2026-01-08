/**
 * PACK 139: Clubs Library Screen
 * Browse and discover social clubs
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  listClubs,
  getMyClubs,
  Club,
  ClubMember,
  ClubCategory,
  formatClubCategory,
  getCategoryIcon,
  getCategoryColor,
  formatMemberCount,
  formatAccessType,
} from "@/services/clubsService";

export default function ClubsLibraryScreen() {
  const router = useRouter();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [myClubs, setMyClubs] = useState<ClubMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'discover' | 'my-clubs'>('discover');
  const [selectedCategory, setSelectedCategory] = useState<ClubCategory | undefined>();
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadClubs();
    loadMyClubs();
  }, [selectedCategory]);

  const loadClubs = async () => {
    try {
      setLoading(true);
      const data = await listClubs({ category: selectedCategory, limit: 50 });
      setClubs(data);
    } catch (error) {
      console.error('Error loading clubs:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMyClubs = async () => {
    try {
      const data = await getMyClubs();
      setMyClubs(data);
    } catch (error) {
      console.error('Error loading my clubs:', error);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadClubs();
    await loadMyClubs();
    setRefreshing(false);
  };

  const handleClubPress = (clubId: string) => {
    router.push(`/clubs/${clubId}`);
  };

  const handleCreateClub = () => {
    router.push('/clubs/create');
  };

  const filteredClubs = clubs.filter((club) =>
    club.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    club.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const categories = Object.values(ClubCategory);

  const renderClubCard = ({ item }: { item: Club }) => {
    const categoryColor = getCategoryColor(item.category);
    const categoryIcon = getCategoryIcon(item.category);

    return (
      <TouchableOpacity
        style={styles.clubCard}
        onPress={() => handleClubPress(item.clubId)}
        activeOpacity={0.7}
      >
        <View style={[styles.clubHeader, { backgroundColor: categoryColor + '20' }]}>
          <Text style={styles.categoryIcon}>{categoryIcon}</Text>
          <View style={styles.clubHeaderInfo}>
            <Text style={styles.clubName} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.categoryLabel}>
              {formatClubCategory(item.category)}
            </Text>
          </View>
          {item.accessType === 'TOKEN_GATED' && (
            <View style={styles.priceBadge}>
              <Text style={styles.priceText}>{item.entryTokens} 🪙</Text>
            </View>
          )}
        </View>

        <Text style={styles.clubDescription} numberOfLines={2}>
          {item.description}
        </Text>

        <View style={styles.clubFooter}>
          <View style={styles.clubStats}>
            <Text style={styles.statText}>
              👥 {formatMemberCount(item.memberCount)} members
            </Text>
            {item.maxMembers && (
              <Text style={styles.statText}>
                • {item.memberCount}/{item.maxMembers}
              </Text>
            )}
          </View>
          <View style={styles.accessBadge}>
            <Text style={styles.accessText}>{formatAccessType(item.accessType)}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderMyClubCard = ({ item }: { item: ClubMember }) => (
    <TouchableOpacity
      style={styles.myClubCard}
      onPress={() => handleClubPress(item.clubId)}
      activeOpacity={0.7}
    >
      <View style={styles.myClubHeader}>
        <Text style={styles.myClubName}>{item.clubName}</Text>
        <View style={[styles.roleBadge, { backgroundColor: item.role === 'OWNER' ? '#FFD700' : '#4ECDC4' }]}>
          <Text style={styles.roleText}>{item.role}</Text>
        </View>
      </View>
      <Text style={styles.joinedDate}>
        Joined {new Date(item.joinedAt.seconds * 1000).toLocaleDateString()}
      </Text>
    </TouchableOpacity>
  );

  const renderCategoryFilter = () => (
    <View style={styles.categoryFilter}>
      <FlatList
        horizontal
        data={['all', ...categories]}
        keyExtractor={(item) => item}
        showsHorizontalScrollIndicator={false}
        renderItem={({ item }) => {
          const isAll = item === 'all';
          const category = isAll ? undefined : (item as ClubCategory);
          const isSelected = selectedCategory === category;

          return (
            <TouchableOpacity
              style={[
                styles.categoryChip,
                isSelected && styles.categoryChipSelected,
              ]}
              onPress={() => setSelectedCategory(category)}
            >
              <Text style={[styles.categoryChipText, isSelected && styles.categoryChipTextSelected]}>
                {isAll ? '✨ All' : `${getCategoryIcon(category as ClubCategory)} ${formatClubCategory(category as ClubCategory)}`}
              </Text>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Social Clubs</Text>
        <TouchableOpacity style={styles.createButton} onPress={handleCreateClub}>
          <Text style={styles.createButtonText}>+ Create Club</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'discover' && styles.tabActive]}
          onPress={() => setActiveTab('discover')}
        >
          <Text style={[styles.tabText, activeTab === 'discover' && styles.tabTextActive]}>
            Discover
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'my-clubs' && styles.tabActive]}
          onPress={() => setActiveTab('my-clubs')}
        >
          <Text style={[styles.tabText, activeTab === 'my-clubs' && styles.tabTextActive]}>
            My Clubs ({myClubs.length})
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'discover' ? (
        <>
          {/* Search Bar */}
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search clubs..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholderTextColor="#999"
            />
          </View>

          {/* Category Filter */}
          {renderCategoryFilter()}

          {/* Safety Notice */}
          <View style={styles.safetyNotice}>
            <Text style={styles.safetyText}>
              🛡️ All clubs are SAFE spaces. No dating, NSFW, or escort content allowed.
            </Text>
          </View>

          {/* Clubs List */}
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#007AFF" />
            </View>
          ) : (
            <FlatList
              data={filteredClubs}
              keyExtractor={(item) => item.clubId}
              renderItem={renderClubCard}
              contentContainerStyle={styles.listContent}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
              }
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>No clubs found</Text>
                  <Text style={styles.emptySubtext}>
                    {selectedCategory ? 'Try a different category' : 'Be the first to create one!'}
                  </Text>
                </View>
              }
            />
          )}
        </>
      ) : (
        <FlatList
          data={myClubs}
          keyExtractor={(item) => item.memberId}
          renderItem={renderMyClubCard}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No clubs yet</Text>
              <Text style={styles.emptySubtext}>
                Join or create a club to get started
              </Text>
            </View>
          }
        />
      )}
    </View>
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
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
  },
  createButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  createButtonText: {
    color: '#FFF',
    fontWeight: '600',
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#007AFF',
  },
  tabText: {
    fontSize: 16,
    color: '#666',
  },
  tabTextActive: {
    color: '#007AFF',
    fontWeight: '600',
  },
  searchContainer: {
    padding: 16,
    backgroundColor: '#FFF',
  },
  searchInput: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  categoryFilter: {
    backgroundColor: '#FFF',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
    marginHorizontal: 4,
  },
  categoryChipSelected: {
    backgroundColor: '#007AFF',
  },
  categoryChipText: {
    fontSize: 14,
    color: '#666',
  },
  categoryChipTextSelected: {
    color: '#FFF',
    fontWeight: '600',
  },
  safetyNotice: {
    backgroundColor: '#E3F2FD',
    padding: 12,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 8,
  },
  safetyText: {
    fontSize: 12,
    color: '#1976D2',
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
  },
  clubCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  clubHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    padding: 8,
    borderRadius: 8,
  },
  categoryIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  clubHeaderInfo: {
    flex: 1,
  },
  clubName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 4,
  },
  categoryLabel: {
    fontSize: 12,
    color: '#666',
  },
  priceBadge: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  priceText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#000',
  },
  clubDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
    lineHeight: 20,
  },
  clubFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  clubStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statText: {
    fontSize: 12,
    color: '#999',
    marginRight: 8,
  },
  accessBadge: {
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  accessText: {
    fontSize: 10,
    color: '#666',
    fontWeight: '600',
  },
  myClubCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  myClubHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  myClubName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
    flex: 1,
  },
  roleBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  roleText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFF',
  },
  joinedDate: {
    fontSize: 12,
    color: '#999',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#999',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#BBB',
  },
});
