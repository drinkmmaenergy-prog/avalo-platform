/**
 * Collection Modal Component
 * Phase 33-10: View collection content with tabs
 * 
 * Tabs:
 * - Media (photos/videos)
 * - Voice Notes
 * - LIVE Replay
 * - AI Prompts
 * - About
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Collection, CollectionMedia } from '../services/creatorCollectionsService';

const GOLD = '#D4AF37';
const TURQUOISE = '#40E0D0';
const BACKGROUND = '#0F0F0F';
const CARD_BG = '#1A1A1A';

const { width } = Dimensions.get('window');

interface CollectionModalProps {
  visible: boolean;
  collection: Collection | null;
  hasAccess: boolean;
  onClose: () => void;
  onUnlock?: () => void;
}

type TabType = 'media' | 'voice' | 'live' | 'ai' | 'about';

// Temporary: i18n strings will be loaded from strings.json via proper i18n system
const t = (key: string) => key; // Placeholder function

export default function CollectionModal({
  visible,
  collection,
  hasAccess,
  onClose,
  onUnlock,
}: CollectionModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('media');

  if (!collection) return null;

  // Filter media by type
  const mediaItems = collection.media.filter(
    m => m.type === 'photo' || m.type === 'video'
  );
  const voiceItems = collection.media.filter(m => m.type === 'voice');
  const liveItems = collection.media.filter(m => m.type === 'live_replay');
  const aiItems = collection.media.filter(m => m.type === 'ai_prompt');

  const tabs: { id: TabType; icon: string; label: string; count: number }[] = [
    {
      id: 'media',
      icon: 'images',
      label: t('creatorCollections.media'),
      count: mediaItems.length,
    },
    {
      id: 'voice',
      icon: 'mic',
      label: t('creatorCollections.voiceNotes'),
      count: voiceItems.length,
    },
    {
      id: 'live',
      icon: 'play-circle',
      label: t('creatorCollections.liveReplay'),
      count: liveItems.length,
    },
    {
      id: 'ai',
      icon: 'sparkles',
      label: t('creatorCollections.aiPrompts'),
      count: aiItems.length,
    },
    {
      id: 'about',
      icon: 'information-circle',
      label: t('creatorCollections.about'),
      count: 0,
    },
  ];

  const renderMediaGrid = () => {
    if (!hasAccess) {
      return renderLockedContent();
    }

    if (mediaItems.length === 0) {
      return renderEmptyState(t('creatorCollections.noMediaItems'));
    }

    return (
      <View style={styles.mediaGrid}>
        {mediaItems.map((item, index) => (
          <View key={item.mediaId} style={styles.mediaItem}>
            <View style={styles.mediaPlaceholder}>
              <Ionicons
                name={item.type === 'video' ? 'play-circle' : 'image'}
                size={32}
                color={TURQUOISE}
              />
            </View>
            {item.title && (
              <Text style={styles.mediaTitle} numberOfLines={2}>
                {item.title}
              </Text>
            )}
          </View>
        ))}
      </View>
    );
  };

  const renderVoiceNotes = () => {
    if (!hasAccess) {
      return renderLockedContent();
    }

    if (voiceItems.length === 0) {
      return renderEmptyState(t('creatorCollections.noVoiceNotes'));
    }

    return (
      <View style={styles.listContainer}>
        {voiceItems.map((item, index) => (
          <View key={item.mediaId} style={styles.voiceItem}>
            <View style={styles.voiceIcon}>
              <Ionicons name="mic" size={24} color={TURQUOISE} />
            </View>
            <View style={styles.voiceInfo}>
              <Text style={styles.voiceTitle}>
                {item.title || `${t('creatorCollections.voiceNote')} ${index + 1}`}
              </Text>
              <Text style={styles.voiceDuration}>
                {t('creatorCollections.tapToPlay')}
              </Text>
            </View>
            <TouchableOpacity style={styles.playButton}>
              <Ionicons name="play" size={20} color={GOLD} />
            </TouchableOpacity>
          </View>
        ))}
      </View>
    );
  };

  const renderLiveReplays = () => {
    if (!hasAccess) {
      return renderLockedContent();
    }

    if (liveItems.length === 0) {
      return renderEmptyState(t('creatorCollections.noLiveReplays'));
    }

    return (
      <View style={styles.listContainer}>
        {liveItems.map((item, index) => (
          <View key={item.mediaId} style={styles.liveItem}>
            <View style={styles.liveThumbnail}>
              <Ionicons name="play-circle" size={48} color={TURQUOISE} />
              <View style={styles.liveBadge}>
                <Text style={styles.liveBadgeText}>REPLAY</Text>
              </View>
            </View>
            <Text style={styles.liveTitle}>
              {item.title || `${t('creatorCollections.liveStream')} ${index + 1}`}
            </Text>
          </View>
        ))}
      </View>
    );
  };

  const renderAIPrompts = () => {
    if (!hasAccess) {
      return renderLockedContent();
    }

    if (aiItems.length === 0) {
      return renderEmptyState(t('creatorCollections.noAIPrompts'));
    }

    return (
      <View style={styles.listContainer}>
        {aiItems.map((item, index) => (
          <View key={item.mediaId} style={styles.aiItem}>
            <View style={styles.aiIcon}>
              <Ionicons name="sparkles" size={24} color={GOLD} />
            </View>
            <View style={styles.aiContent}>
              <Text style={styles.aiTitle}>
                {item.title || `${t('creatorCollections.aiPrompt')} ${index + 1}`}
              </Text>
              <Text style={styles.aiDescription}>
                {t('creatorCollections.exclusiveAIPrompt')}
              </Text>
            </View>
          </View>
        ))}
      </View>
    );
  };

  const renderAbout = () => (
    <View style={styles.aboutContainer}>
      <View style={styles.aboutSection}>
        <Text style={styles.aboutTitle}>{collection.name}</Text>
        <Text style={styles.aboutDescription}>{collection.description}</Text>
      </View>

      <View style={styles.aboutSection}>
        <Text style={styles.aboutSectionTitle}>
          {t('creatorCollections.collectionDetails')}
        </Text>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>{t('creatorCollections.price')}</Text>
          <Text style={styles.detailValue}>
            {collection.price} {t('common.tokens')}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>{t('creatorCollections.totalItems')}</Text>
          <Text style={styles.detailValue}>{collection.media.length}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>{t('creatorCollections.status')}</Text>
          <Text style={[styles.detailValue, { color: collection.active ? TURQUOISE : '#FF4444' }]}>
            {collection.active ? t('creatorCollections.active') : t('creatorCollections.inactive')}
          </Text>
        </View>
      </View>

      <View style={styles.aboutSection}>
        <Text style={styles.aboutSectionTitle}>
          {t('creatorCollections.contentBreakdown')}
        </Text>
        {mediaItems.length > 0 && (
          <View style={styles.contentRow}>
            <Ionicons name="images" size={20} color={TURQUOISE} />
            <Text style={styles.contentText}>
              {mediaItems.length} {t('creatorCollections.mediaItems')}
            </Text>
          </View>
        )}
        {voiceItems.length > 0 && (
          <View style={styles.contentRow}>
            <Ionicons name="mic" size={20} color={TURQUOISE} />
            <Text style={styles.contentText}>
              {voiceItems.length} {t('creatorCollections.voiceNotes')}
            </Text>
          </View>
        )}
        {liveItems.length > 0 && (
          <View style={styles.contentRow}>
            <Ionicons name="play-circle" size={20} color={TURQUOISE} />
            <Text style={styles.contentText}>
              {liveItems.length} {t('creatorCollections.liveReplays')}
            </Text>
          </View>
        )}
        {aiItems.length > 0 && (
          <View style={styles.contentRow}>
            <Ionicons name="sparkles" size={20} color={GOLD} />
            <Text style={styles.contentText}>
              {aiItems.length} {t('creatorCollections.aiPrompts')}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.infoCard}>
        <Ionicons name="information-circle" size={24} color={GOLD} />
        <Text style={styles.infoText}>
          {t('creatorCollections.revenueSplit')}: 65% {t('creatorCollections.creator')} / 35% Avalo
        </Text>
      </View>
    </View>
  );

  const renderLockedContent = () => (
    <View style={styles.lockedContainer}>
      <View style={styles.lockedIcon}>
        <Ionicons name="lock-closed" size={48} color={GOLD} />
      </View>
      <Text style={styles.lockedTitle}>{t('creatorCollections.contentLocked')}</Text>
      <Text style={styles.lockedDescription}>
        {t('creatorCollections.unlockToViewContent')}
      </Text>
      {onUnlock && (
        <TouchableOpacity style={styles.unlockButtonSmall} onPress={onUnlock}>
          <Ionicons name="lock-open" size={20} color={BACKGROUND} />
          <Text style={styles.unlockButtonSmallText}>
            {t('creatorCollections.unlockNow')}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const renderEmptyState = (message: string) => (
    <View style={styles.emptyContainer}>
      <Ionicons name="folder-open-outline" size={48} color="#444" />
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'media':
        return renderMediaGrid();
      case 'voice':
        return renderVoiceNotes();
      case 'live':
        return renderLiveReplays();
      case 'ai':
        return renderAIPrompts();
      case 'about':
        return renderAbout();
      default:
        return null;
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={28} color={GOLD} />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {collection.name}
          </Text>
          <View style={{ width: 28 }} />
        </View>

        {/* Tabs */}
        <View style={styles.tabsContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsContent}
          >
            {tabs.map(tab => (
              <TouchableOpacity
                key={tab.id}
                style={[styles.tab, activeTab === tab.id && styles.tabActive]}
                onPress={() => setActiveTab(tab.id)}
              >
                <Ionicons
                  name={tab.icon as any}
                  size={20}
                  color={activeTab === tab.id ? BACKGROUND : '#AAA'}
                />
                <Text
                  style={[
                    styles.tabLabel,
                    activeTab === tab.id && styles.tabLabelActive,
                  ]}
                >
                  {tab.label}
                </Text>
                {tab.count > 0 && (
                  <View style={styles.tabBadge}>
                    <Text style={styles.tabBadgeText}>{tab.count}</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Content */}
        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.contentContainer}
        >
          {renderTabContent()}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BACKGROUND,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  closeButton: {
    padding: 4,
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: 'bold',
    color: GOLD,
    textAlign: 'center',
    marginHorizontal: 10,
  },
  tabsContainer: {
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  tabsContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD_BG,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 18,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: '#333',
  },
  tabActive: {
    backgroundColor: GOLD,
    borderColor: GOLD,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#AAA',
    marginLeft: 8,
  },
  tabLabelActive: {
    color: BACKGROUND,
  },
  tabBadge: {
    backgroundColor: TURQUOISE,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    paddingHorizontal: 6,
  },
  tabBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: BACKGROUND,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  mediaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  mediaItem: {
    width: (width - 52) / 2,
    backgroundColor: CARD_BG,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#333',
  },
  mediaPlaceholder: {
    width: '100%',
    height: 120,
    backgroundColor: '#2A2A2A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaTitle: {
    fontSize: 12,
    color: '#FFF',
    padding: 12,
  },
  listContainer: {
    gap: 12,
  },
  voiceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD_BG,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#333',
  },
  voiceIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#2A2A2A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  voiceInfo: {
    flex: 1,
    marginLeft: 16,
  },
  voiceTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 4,
  },
  voiceDuration: {
    fontSize: 12,
    color: '#AAA',
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2A2416',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: GOLD,
  },
  liveItem: {
    backgroundColor: CARD_BG,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#333',
  },
  liveThumbnail: {
    width: '100%',
    height: 160,
    backgroundColor: '#2A2A2A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  liveBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: '#FF4444',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  liveBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#FFF',
  },
  liveTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
    padding: 16,
  },
  aiItem: {
    flexDirection: 'row',
    backgroundColor: CARD_BG,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: GOLD,
  },
  aiIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#2A2416',
    justifyContent: 'center',
    alignItems: 'center',
  },
  aiContent: {
    flex: 1,
    marginLeft: 16,
  },
  aiTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: GOLD,
    marginBottom: 4,
  },
  aiDescription: {
    fontSize: 12,
    color: '#AAA',
  },
  aboutContainer: {
    gap: 24,
  },
  aboutSection: {
    gap: 12,
  },
  aboutTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: GOLD,
  },
  aboutDescription: {
    fontSize: 14,
    color: '#AAA',
    lineHeight: 22,
  },
  aboutSectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFF',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  detailLabel: {
    fontSize: 14,
    color: '#AAA',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: TURQUOISE,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  contentText: {
    fontSize: 14,
    color: '#FFF',
    marginLeft: 12,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2416',
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: GOLD,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: GOLD,
    marginLeft: 12,
  },
  lockedContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  lockedIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#2A2416',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 2,
    borderColor: GOLD,
  },
  lockedTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 8,
  },
  lockedDescription: {
    fontSize: 14,
    color: '#AAA',
    textAlign: 'center',
    marginBottom: 24,
  },
  unlockButtonSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: GOLD,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 18,
  },
  unlockButtonSmallText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: BACKGROUND,
    marginLeft: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 14,
    color: '#AAA',
    marginTop: 16,
  },
});
