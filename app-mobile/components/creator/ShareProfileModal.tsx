/**
 * PACK 102 — Share Profile Modal
 * 
 * Modal for sharing creator profile with Smart Links and QR code.
 * Provides platform-specific links and native share functionality.
 * 
 * CRITICAL: No incentives or bonuses displayed.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Share,
  Clipboard,
  Image,
} from 'react-native';
import { auth } from '../../lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';
import {
  ShareData,
  SocialPlatform,
  PLATFORM_NAMES,
  PLATFORM_COLORS,
} from '../../types/audienceGrowth';

interface ShareProfileModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function ShareProfileModal({ visible, onClose }: ShareProfileModalProps) {
  const [shareData, setShareData] = useState<ShareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  const userId = auth.currentUser?.uid;

  useEffect(() => {
    if (visible && userId) {
      loadShareData();
    }
  }, [visible, userId]);

  const loadShareData = async () => {
    if (!userId) return;

    try {
      setLoading(true);
      const generateSmartLinks = httpsCallable(functions, 'pack102_generateSmartLinks');
      const result = await generateSmartLinks({});
      
      const data = result.data as { success: boolean; smartLinks: any; qrCodeUrl: string; shareText: string };
      
      if (data.success) {
        setShareData({
          smartLinks: data.smartLinks,
          qrCodeUrl: data.qrCodeUrl,
          shareText: data.shareText,
        });
      }
    } catch (error) {
      console.error('[ShareProfileModal] Error loading share data:', error);
      Alert.alert('Error', 'Failed to load share links. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const copyLink = async (platform: SocialPlatform) => {
    if (!shareData) return;

    const link = shareData.smartLinks[platform];
    if (!link) return;

    try {
      await Clipboard.setString(link);
      setCopiedLink(platform);
      setTimeout(() => setCopiedLink(null), 2000);
    } catch (error) {
      Alert.alert('Error', 'Failed to copy link');
    }
  };

  const shareNative = async () => {
    if (!shareData) return;

    try {
      await Share.share({
        message: shareData.shareText,
        url: shareData.smartLinks.other,
      });
    } catch (error: any) {
      if (error.message !== 'User did not share') {
        Alert.alert('Error', 'Failed to share');
      }
    }
  };

  const platforms: SocialPlatform[] = [
    'tiktok',
    'instagram',
    'youtube',
    'twitch',
    'snapchat',
    'x',
    'facebook',
  ];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Share Your Profile</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>Generating share links...</Text>
          </View>
        ) : shareData ? (
          <ScrollView style={styles.content}>
            {/* QR Code */}
            <View style={styles.qrSection}>
              <Text style={styles.qrTitle}>Scan to Follow</Text>
              <Image
                source={{ uri: shareData.qrCodeUrl }}
                style={styles.qrCode}
                resizeMode="contain"
              />
              <Text style={styles.qrSubtitle}>Anyone can scan this QR code to find you</Text>
            </View>

            {/* Native Share Button */}
            <TouchableOpacity style={styles.nativeShareButton} onPress={shareNative}>
              <Text style={styles.nativeShareButtonText}>📤 Share via...</Text>
            </TouchableOpacity>

            {/* Platform-Specific Links */}
            <View style={styles.platformSection}>
              <Text style={styles.platformSectionTitle}>Platform-Specific Links</Text>
              <Text style={styles.platformSectionSubtitle}>
                Copy and paste these links in your social media bios
              </Text>

              {platforms.map((platform) => (
                <View key={platform} style={styles.platformRow}>
                  <View style={styles.platformInfo}>
                    <View
                      style={[
                        styles.platformDot,
                        { backgroundColor: PLATFORM_COLORS[platform] },
                      ]}
                    />
                    <Text style={styles.platformName}>{PLATFORM_NAMES[platform]}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.copyButton}
                    onPress={() => copyLink(platform)}
                  >
                    <Text style={styles.copyButtonText}>
                      {copiedLink === platform ? '✓ Copied' : 'Copy Link'}
                    </Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>

            {/* Info Notice */}
            <View style={styles.infoNotice}>
              <Text style={styles.infoNoticeTitle}>💡 How It Works</Text>
              <Text style={styles.infoNoticeText}>
                Share these links on your social media to track organic growth from external platforms.
                {'\n\n'}
                • Each link is unique to the platform{'\n'}
                • Analytics are updated daily{'\n'}
                • No bonuses or incentives - pure organic tracking
              </Text>
            </View>
          </ScrollView>
        ) : (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>Failed to load share data</Text>
            <TouchableOpacity style={styles.retryButton} onPress={loadShareData}>
              <Text style={styles.retryButtonText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000000',
  },
  closeButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 24,
    color: '#666666',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666666',
  },
  content: {
    flex: 1,
  },
  qrSection: {
    padding: 24,
    alignItems: 'center',
    backgroundColor: '#F8F8F8',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
  },
  qrTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 16,
  },
  qrCode: {
    width: 200,
    height: 200,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
  },
  qrSubtitle: {
    marginTop: 12,
    fontSize: 14,
    color: '#666666',
    textAlign: 'center',
  },
  nativeShareButton: {
    margin: 16,
    padding: 16,
    backgroundColor: '#007AFF',
    borderRadius: 12,
    alignItems: 'center',
  },
  nativeShareButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  platformSection: {
    padding: 16,
  },
  platformSectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 8,
  },
  platformSectionSubtitle: {
    fontSize: 14,
    color: '#666666',
    marginBottom: 16,
  },
  platformRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#F8F8F8',
    borderRadius: 8,
    marginBottom: 8,
  },
  platformInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  platformDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  platformName: {
    fontSize: 16,
    color: '#000000',
  },
  copyButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#007AFF',
    borderRadius: 6,
  },
  copyButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  infoNotice: {
    margin: 16,
    padding: 16,
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#2196F3',
  },
  infoNoticeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1976D2',
    marginBottom: 8,
  },
  infoNoticeText: {
    fontSize: 14,
    color: '#424242',
    lineHeight: 20,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#FF3B30',
    marginBottom: 16,
  },
  retryButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
