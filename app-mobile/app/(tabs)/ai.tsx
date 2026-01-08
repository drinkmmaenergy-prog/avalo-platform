import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from "@/contexts/AuthContext";
import {
  AI_COMPANIONS,
  AICompanion,
  getCompanionsByTier,
  getUserAIChats,
  AIChat,
} from "@/services/aiChatService";
import { AICompanionTier, getAIMessageCost } from "@/config/monetization";
import { TokenBadge } from "@/components/TokenBadge";

export default function AIScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'companions' | 'chats'>('companions');
  const [selectedTier, setSelectedTier] = useState<AICompanionTier>('basic');
  const [myChats, setMyChats] = useState<AIChat[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user?.uid && activeTab === 'chats') {
      loadMyChats();
    }
  }, [user?.uid, activeTab]);

  const loadMyChats = async () => {
    if (!user?.uid) return;
    
    setLoading(true);
    try {
      const chats = await getUserAIChats(user.uid);
      setMyChats(chats);
    } catch (error) {
      console.error('Error loading AI chats:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCompanionPress = (companion: AICompanion) => {
    // Navigate to individual AI chat screen
    router.push(`/ai/${companion.id}` as any);
  };

  const handleChatPress = (chat: AIChat) => {
    // Navigate to individual AI chat screen using companionId
    router.push(`/ai/${chat.companionId}` as any);
  };

  const renderCompanion = ({ item }: { item: AICompanion }) => {
    const cost = getAIMessageCost(item.tier);
    
    return (
      <TouchableOpacity
        style={styles.companionCard}
        onPress={() => handleCompanionPress(item)}
      >
        <Text style={styles.companionAvatar}>{item.avatar}</Text>
        <View style={styles.companionInfo}>
          <Text style={styles.companionName}>{item.name}</Text>
          <Text style={styles.companionDescription}>{item.description}</Text>
          <View style={styles.companionFooter}>
            <View style={styles.tierBadge}>
              <Text style={styles.tierText}>{item.tier.toUpperCase()}</Text>
            </View>
            <Text style={styles.costText}>{cost} token{cost > 1 ? 's' : ''}/msg</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderChat = ({ item }: { item: AIChat }) => {
    const companion = AI_COMPANIONS.find(c => c.id === item.companionId);
    
    return (
      <TouchableOpacity
        style={styles.chatCard}
        onPress={() => handleChatPress(item)}
      >
        <Text style={styles.chatAvatar}>{companion?.avatar || '🤖'}</Text>
        <View style={styles.chatInfo}>
          <Text style={styles.chatName}>{companion?.name || 'AI Companion'}</Text>
          <Text style={styles.chatLastMessage} numberOfLines={1}>
            {item.lastMessage}
          </Text>
          <Text style={styles.chatStats}>
            {item.messageCount} messages • {item.totalTokensSpent} tokens spent
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const filteredCompanions = getCompanionsByTier(selectedTier);

  if (!user) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Please sign in to chat with AI companions</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>AI Companions</Text>
        <TokenBadge />
      </View>

      {/* AI Avatar Studio Entry */}
      <TouchableOpacity
        style={styles.avatarStudioBanner}
        onPress={() => router.push('/ai/avatar-studio' as any)}
      >
        <Text style={styles.bannerEmoji}>🎨</Text>
        <View style={styles.bannerContent}>
          <Text style={styles.bannerTitle}>AI Avatar Studio</Text>
          <Text style={styles.bannerSubtitle}>Generate custom avatars (SFW)</Text>
        </View>
        <Text style={styles.bannerArrow}>→</Text>
      </TouchableOpacity>

      {/* Tab Selector */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'companions' && styles.activeTab]}
          onPress={() => setActiveTab('companions')}
        >
          <Text style={[styles.tabText, activeTab === 'companions' && styles.activeTabText]}>
            Companions
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'chats' && styles.activeTab]}
          onPress={() => setActiveTab('chats')}
        >
          <Text style={[styles.tabText, activeTab === 'chats' && styles.activeTabText]}>
            My Chats
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'companions' ? (
        <>
          {/* Tier Filter */}
          <View style={styles.tierFilter}>
            <TouchableOpacity
              style={[styles.tierButton, selectedTier === 'basic' && styles.activeTierButton]}
              onPress={() => setSelectedTier('basic')}
            >
              <Text style={[styles.tierButtonText, selectedTier === 'basic' && styles.activeTierButtonText]}>
                Basic (1 token)
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tierButton, selectedTier === 'premium' && styles.activeTierButton]}
              onPress={() => setSelectedTier('premium')}
            >
              <Text style={[styles.tierButtonText, selectedTier === 'premium' && styles.activeTierButtonText]}>
                Premium (2 tokens)
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tierButton, selectedTier === 'nsfw' && styles.activeTierButton]}
              onPress={() => setSelectedTier('nsfw')}
            >
              <Text style={[styles.tierButtonText, selectedTier === 'nsfw' && styles.activeTierButtonText]}>
                NSFW (4 tokens)
              </Text>
            </TouchableOpacity>
          </View>

          {/* Companions List */}
          <FlatList
            data={filteredCompanions}
            renderItem={renderCompanion}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
          />
        </>
      ) : (
        <>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#FF6B6B" />
            </View>
          ) : myChats.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No AI chats yet</Text>
              <Text style={styles.emptySubtext}>
                Start a conversation with an AI companion
              </Text>
            </View>
          ) : (
            <FlatList
              data={myChats}
              renderItem={renderChat}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
            />
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
  },
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#FF6B6B',
  },
  tabText: {
    fontSize: 16,
    color: '#666',
  },
  activeTabText: {
    color: '#FF6B6B',
    fontWeight: '600',
  },
  tierFilter: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
  },
  tierButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  activeTierButton: {
    backgroundColor: '#FF6B6B',
    borderColor: '#FF6B6B',
  },
  tierButtonText: {
    fontSize: 12,
    color: '#666',
  },
  activeTierButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
  },
  companionCard: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    marginBottom: 12,
  },
  companionAvatar: {
    fontSize: 48,
    marginRight: 16,
  },
  companionInfo: {
    flex: 1,
  },
  companionName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  companionDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  companionFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tierBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#FF6B6B',
    borderRadius: 4,
  },
  tierText: {
    fontSize: 10,
    color: '#fff',
    fontWeight: '600',
  },
  costText: {
    fontSize: 12,
    color: '#FF6B6B',
    fontWeight: '600',
  },
  chatCard: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    marginBottom: 12,
  },
  chatAvatar: {
    fontSize: 40,
    marginRight: 16,
  },
  chatInfo: {
    flex: 1,
  },
  chatName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  chatLastMessage: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  chatStats: {
    fontSize: 12,
    color: '#999',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  avatarStudioBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3E5F5',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    padding: 16,
    borderRadius: 12,
  },
  bannerEmoji: {
    fontSize: 32,
    marginRight: 12,
  },
  bannerContent: {
    flex: 1,
  },
  bannerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#7B1FA2',
    marginBottom: 2,
  },
  bannerSubtitle: {
    fontSize: 12,
    color: '#9C27B0',
  },
  bannerArrow: {
    fontSize: 24,
    color: '#7B1FA2',
  },
});
