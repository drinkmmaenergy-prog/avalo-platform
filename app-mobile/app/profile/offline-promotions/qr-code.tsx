/**
 * PACK 135: QR Code Screen
 * View, download, and share QR code
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  getQRProfile,
  getQRVariations,
  downloadQRCode,
  shareQRCode,
  type QRProfileData,
  type QRVariations,
} from "@/lib/offline-presence";

export default function QRCodeScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [qrProfile, setQrProfile] = useState<QRProfileData | null>(null);
  const [variations, setVariations] = useState<QRVariations | null>(null);

  useEffect(() => {
    loadQRData();
  }, []);

  const loadQRData = async () => {
    try {
      setLoading(true);
      const [profileData, variationsData] = await Promise.all([
        getQRProfile(),
        getQRVariations(),
      ]);
      setQrProfile(profileData);
      setVariations(variationsData);
    } catch (error) {
      console.error('Error loading QR data:', error);
      Alert.alert('Error', 'Failed to load QR code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (url: string, filename: string) => {
    try {
      await downloadQRCode(url, filename);
      Alert.alert('Success', 'QR code downloaded successfully!');
    } catch (error) {
      Alert.alert('Error', 'Failed to download QR code.');
    }
  };

  const handleShare = async () => {
    if (!qrProfile) return;
    try {
      await shareQRCode(
        qrProfile.staticQrUrl,
        `Check out my Avalo profile: ${qrProfile.displayName}`
      );
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6C5CE7" />
      </View>
    );
  }

  if (!qrProfile || !variations) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load QR code</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadQRData}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Your QR Code</Text>
      </View>

      <View style={styles.mainQRSection}>
        <Image
          source={{ uri: variations.medium }}
          style={styles.mainQR}
          resizeMode="contain"
        />
        <Text style={styles.profileName}>{qrProfile.displayName}</Text>
        {qrProfile.tagline && (
          <Text style={styles.tagline}>{qrProfile.tagline}</Text>
        )}
        <Text style={styles.profileLink}>{qrProfile.dynamicLink}</Text>
      </View>

      <View style={styles.actionsSection}>
        <TouchableOpacity style={styles.primaryButton} onPress={handleShare}>
          <Text style={styles.primaryButtonText}>Share QR Code</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Download Sizes</Text>
        
        <TouchableOpacity
          style={styles.downloadItem}
          onPress={() => handleDownload(variations.small, 'avalo-qr-small.png')}
        >
          <View style={styles.downloadInfo}>
            <Text style={styles.downloadTitle}>Small (150x150)</Text>
            <Text style={styles.downloadDesc}>Perfect for social media</Text>
          </View>
          <Text style={styles.downloadIcon}>↓</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.downloadItem}
          onPress={() => handleDownload(variations.medium, 'avalo-qr-medium.png')}
        >
          <View style={styles.downloadInfo}>
            <Text style={styles.downloadTitle}>Medium (300x300)</Text>
            <Text style={styles.downloadDesc}>General purpose</Text>
          </View>
          <Text style={styles.downloadIcon}>↓</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.downloadItem}
          onPress={() => handleDownload(variations.large, 'avalo-qr-large.png')}
        >
          <View style={styles.downloadInfo}>
            <Text style={styles.downloadTitle}>Large (500x500)</Text>
            <Text style={styles.downloadDesc}>High resolution</Text>
          </View>
          <Text style={styles.downloadIcon}>↓</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.downloadItem}
          onPress={() => handleDownload(variations.printReady, 'avalo-qr-print.png')}
        >
          <View style={styles.downloadInfo}>
            <Text style={styles.downloadTitle}>Print Ready (1000x1000)</Text>
            <Text style={styles.downloadDesc}>300 DPI, best quality</Text>
          </View>
          <Text style={styles.downloadIcon}>↓</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.downloadItem}
          onPress={() => handleDownload(variations.svg, 'avalo-qr.svg')}
        >
          <View style={styles.downloadInfo}>
            <Text style={styles.downloadTitle}>Vector (SVG)</Text>
            <Text style={styles.downloadDesc}>Scalable format</Text>
          </View>
          <Text style={styles.downloadIcon}>↓</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>💡 Usage Tips</Text>
          <Text style={styles.infoText}>
            • Use print-ready size for physical materials{'\n'}
            • SVG format is best for large prints{'\n'}
            • QR code links directly to your profile{'\n'}
            • No boost to feed ranking from scans
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#666666',
    marginBottom: 20,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#6C5CE7',
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    padding: 20,
    backgroundColor: '#F8F9FA',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  backButton: {
    marginBottom: 12,
  },
  backButtonText: {
    fontSize: 16,
    color: '#6C5CE7',
    fontWeight: '600',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1A1A1A',
  },
  mainQRSection: {
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#FFFFFF',
  },
  mainQR: {
    width: 250,
    height: 250,
    marginBottom: 24,
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 16,
  },
  profileName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  tagline: {
    fontSize: 16,
    color: '#666666',
    marginBottom: 8,
    textAlign: 'center',
  },
  profileLink: {
    fontSize: 14,
    color: '#6C5CE7',
    marginTop: 8,
  },
  actionsSection: {
    padding: 20,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E5E5E5',
  },
  primaryButton: {
    backgroundColor: '#6C5CE7',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  section: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 16,
  },
  downloadItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  downloadInfo: {
    flex: 1,
  },
  downloadTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  downloadDesc: {
    fontSize: 14,
    color: '#666666',
  },
  downloadIcon: {
    fontSize: 24,
    color: '#6C5CE7',
    fontWeight: 'bold',
  },
  infoBox: {
    padding: 16,
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#A5D6A7',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#666666',
    lineHeight: 20,
  },
});
