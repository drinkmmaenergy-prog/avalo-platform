/**
 * AI Avatar Studio Screen
 * Phase 4: SFW avatar generation (no real AI, placeholder implementation)
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from "@/contexts/AuthContext";
import { TokenBadge } from "@/components/TokenBadge";
import {
  generateAIAvatar,
  getUserAvatars,
  getAvatarGenerationStats,
} from "@/services/aiAvatarService";
import { getTokenBalance } from "@/services/tokenService";
import { AIAvatarGeneration, AvatarGender, AvatarStyle } from "@/types/aiAvatar";
import { AI_AVATAR_CONFIG } from "@/config/monetization";

export default function AvatarStudioScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'generate' | 'gallery'>('generate');
  const [selectedGender, setSelectedGender] = useState<AvatarGender>('female');
  const [selectedStyle, setSelectedStyle] = useState<AvatarStyle>('casual');
  const [generating, setGenerating] = useState(false);
  const [balance, setBalance] = useState(0);
  const [myAvatars, setMyAvatars] = useState<AIAvatarGeneration[]>([]);
  const [stats, setStats] = useState({ totalGenerated: 0, totalTokensSpent: 0 });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user?.uid) {
      loadData();
    }
  }, [user?.uid]);

  const loadData = async () => {
    if (!user?.uid) return;
    
    setLoading(true);
    try {
      const [userBalance, avatars, userStats] = await Promise.all([
        getTokenBalance(user.uid),
        getUserAvatars(user.uid),
        getAvatarGenerationStats(user.uid),
      ]);
      
      setBalance(userBalance);
      setMyAvatars(avatars);
      setStats(userStats);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!user?.uid) {
      Alert.alert('Error', 'Please sign in to generate avatars');
      return;
    }

    const cost = AI_AVATAR_CONFIG.AVATAR_GENERATION_COST;
    
    if (balance < cost) {
      Alert.alert(
        'Insufficient Balance',
        `You need ${cost} tokens to generate an avatar. You have ${balance} tokens.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Buy Tokens', onPress: () => router.push('/(tabs)/wallet') },
        ]
      );
      return;
    }

    Alert.alert(
      'Generate Avatar?',
      `Generate ${selectedGender} avatar in ${selectedStyle} style for ${cost} tokens?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Generate',
          onPress: async () => {
            setGenerating(true);
            
            const result = await generateAIAvatar(user.uid, {
              gender: selectedGender,
              style: selectedStyle,
            });
            
            setGenerating(false);
            
            if (result.success) {
              Alert.alert('Success! 🎉', 'Your avatar has been generated!');
              await loadData(); // Refresh data
              setActiveTab('gallery'); // Switch to gallery
            } else {
              Alert.alert('Error', result.error || 'Failed to generate avatar');
            }
          },
        },
      ]
    );
  };

  const renderGenerateTab = () => (
    <ScrollView style={styles.tabContent}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>AI Avatar Studio (SFW)</Text>
        <Text style={styles.sectionSubtitle}>
          Generate custom avatars for {AI_AVATAR_CONFIG.AVATAR_GENERATION_COST} tokens each
        </Text>
      </View>

      {/* Gender Selection */}
      <View style={styles.section}>
        <Text style={styles.optionLabel}>Gender Style</Text>
        <View style={styles.optionRow}>
          {AI_AVATAR_CONFIG.AVAILABLE_GENDERS.map((gender) => (
            <TouchableOpacity
              key={gender}
              style={[
                styles.optionButton,
                selectedGender === gender && styles.optionButtonActive,
              ]}
              onPress={() => setSelectedGender(gender)}
            >
              <Text
                style={[
                  styles.optionButtonText,
                  selectedGender === gender && styles.optionButtonTextActive,
                ]}
              >
                {gender.charAt(0).toUpperCase() + gender.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Style Selection */}
      <View style={styles.section}>
        <Text style={styles.optionLabel}>Vibe</Text>
        <View style={styles.optionGrid}>
          {AI_AVATAR_CONFIG.AVAILABLE_STYLES.map((style) => (
            <TouchableOpacity
              key={style}
              style={[
                styles.styleButton,
                selectedStyle === style && styles.styleButtonActive,
              ]}
              onPress={() => setSelectedStyle(style)}
            >
              <Text
                style={[
                  styles.styleButtonText,
                  selectedStyle === style && styles.styleButtonTextActive,
                ]}
              >
                {style.charAt(0).toUpperCase() + style.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Generate Button */}
      <View style={styles.section}>
        <TouchableOpacity
          style={[styles.generateButton, generating && styles.generateButtonDisabled]}
          onPress={handleGenerate}
          disabled={generating}
        >
          {generating ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={styles.generateButtonText}>
                Generate Avatar
              </Text>
              <Text style={styles.generateButtonCost}>
                {AI_AVATAR_CONFIG.AVATAR_GENERATION_COST} tokens
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Info Box */}
      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>ℹ️ About AI Avatars</Text>
        <Text style={styles.infoText}>
          • SFW content only
        </Text>
        <Text style={styles.infoText}>
          • Placeholder implementation (real AI in Phase 5)
        </Text>
        <Text style={styles.infoText}>
          • All avatars saved to your gallery
        </Text>
        <Text style={styles.infoText}>
          • 100% revenue to Avalo
        </Text>
      </View>
    </ScrollView>
  );

  const renderAvatarItem = ({ item }: { item: AIAvatarGeneration }) => (
    <View style={styles.avatarCard}>
      <View style={styles.avatarPlaceholder}>
        <Text style={styles.avatarEmoji}>
          {item.imageUrl.startsWith('placeholder:') 
            ? item.imageUrl.split(':')[1] 
            : '👤'}
        </Text>
      </View>
      <View style={styles.avatarInfo}>
        <Text style={styles.avatarStyle}>
          {item.style.charAt(0).toUpperCase() + item.style.slice(1)}
        </Text>
        <Text style={styles.avatarGender}>
          {item.gender.charAt(0).toUpperCase() + item.gender.slice(1)}
        </Text>
      </View>
    </View>
  );

  const renderGalleryTab = () => (
    <View style={styles.tabContent}>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#FF6B6B" />
        </View>
      ) : myAvatars.length === 0 ? (
        <View style={styles.emptyGallery}>
          <Text style={styles.emptyEmoji}>🎨</Text>
          <Text style={styles.emptyText}>No avatars yet</Text>
          <Text style={styles.emptySubtext}>
            Generate your first AI avatar to see it here
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.statsBar}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats.totalGenerated}</Text>
              <Text style={styles.statLabel}>Generated</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats.totalTokensSpent}</Text>
              <Text style={styles.statLabel}>Tokens Spent</Text>
            </View>
          </View>
          
          <FlatList
            data={myAvatars}
            renderItem={renderAvatarItem}
            keyExtractor={(item) => item.id || ''}
            numColumns={2}
            contentContainerStyle={styles.galleryGrid}
          />
        </>
      )}
    </View>
  );

  if (!user) {
    return (
      <View style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>Please sign in to use AI Avatar Studio</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Avatar Studio</Text>
        <TokenBadge />
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'generate' && styles.activeTab]}
          onPress={() => setActiveTab('generate')}
        >
          <Text style={[styles.tabText, activeTab === 'generate' && styles.activeTabText]}>
            Generate
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'gallery' && styles.activeTab]}
          onPress={() => setActiveTab('gallery')}
        >
          <Text style={[styles.tabText, activeTab === 'gallery' && styles.activeTabText]}>
            My Gallery
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {activeTab === 'generate' ? renderGenerateTab() : renderGalleryTab()}
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
  backButton: {
    padding: 8,
  },
  backText: {
    color: '#FF6B6B',
    fontSize: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
  },
  tabs: {
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
    fontSize: 14,
    color: '#666',
  },
  activeTabText: {
    color: '#FF6B6B',
    fontWeight: '600',
  },
  tabContent: {
    flex: 1,
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 12,
  },
  optionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  optionButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    alignItems: 'center',
  },
  optionButtonActive: {
    backgroundColor: '#FF6B6B',
  },
  optionButtonText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
  },
  optionButtonTextActive: {
    color: '#fff',
  },
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  styleButton: {
    width: '48%',
    paddingVertical: 12,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    alignItems: 'center',
  },
  styleButtonActive: {
    backgroundColor: '#FF6B6B',
  },
  styleButtonText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
  },
  styleButtonTextActive: {
    color: '#fff',
  },
  generateButton: {
    backgroundColor: '#FF6B6B',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  generateButtonDisabled: {
    opacity: 0.6,
  },
  generateButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  generateButtonCost: {
    color: '#fff',
    fontSize: 12,
    marginTop: 4,
  },
  infoBox: {
    margin: 16,
    padding: 16,
    backgroundColor: '#F3E5F5',
    borderRadius: 12,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#7B1FA2',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 12,
    color: '#6A1B9A',
    marginBottom: 4,
  },
  statsBar: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#f9f9f9',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FF6B6B',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  galleryGrid: {
    padding: 16,
  },
  avatarCard: {
    flex: 1,
    margin: 8,
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  avatarPlaceholder: {
    width: 120,
    height: 120,
    backgroundColor: '#e0e0e0',
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  avatarEmoji: {
    fontSize: 64,
  },
  avatarInfo: {
    alignItems: 'center',
  },
  avatarStyle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  avatarGender: {
    fontSize: 12,
    color: '#666',
  },
  emptyGallery: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyEmoji: {
    fontSize: 64,
    marginBottom: 16,
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
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
});
