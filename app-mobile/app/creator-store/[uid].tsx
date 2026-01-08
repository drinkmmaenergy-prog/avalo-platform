/**
 * Creator Store Screen
 * Phase 4: Display creator store options (actualpayments on web)
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Linking,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import {
  CREATOR_SUBSCRIPTIONS,
  CREATOR_PPV,
  CREATOR_CUSTOM_REQUESTS,
} from '../../config/monetization';

export default function CreatorStoreScreen() {
  const { uid } = useLocalSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'subscriptions' | 'ppv' | 'requests'>('subscriptions');

  const handleWebRedirect = (feature: string) => {
    // Placeholder web URL - should be configured per creator
    const webStoreUrl = `https://avalo.app/creator/${uid}/store`;
    
    Alert.alert(
      'Complete on Web',
      `${feature} purchases are processed on our web platform for secure payments.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open Web',
          onPress: () => {
            // In production, this would open the actual web store URL
            Alert.alert('Coming Soon', 'Web store integration in development');
            // Linking.openURL(webStoreUrl);
          },
        },
      ]
    );
  };

  const renderSubscriptions = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Subscription Tiers</Text>
      <Text style={styles.sectionSubtitle}>
        ${CREATOR_SUBSCRIPTIONS.MIN_PRICE_USD} - ${CREATOR_SUBSCRIPTIONS.MAX_PRICE_USD}/month
      </Text>
      
      <View style={styles.card}>
        <Text style={styles.cardTitle}>💎 Premium</Text>
        <Text style={styles.cardPrice}>$9.99/month</Text>
        <View style={styles.benefitsList}>
          <Text style={styles.benefit}>✓ Exclusive content</Text>
          <Text style={styles.benefit}>✓ Direct messaging</Text>
          <Text style={styles.benefit}>✓ Priority responses</Text>
          <Text style={styles.benefit}>✓ Monthly bonus content</Text>
        </View>
        <TouchableOpacity
          style={styles.purchaseButton}
          onPress={() => handleWebRedirect('Subscription')}
        >
          <Text style={styles.purchaseButtonText}>Subscribe on Web</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          💳 Subscriptions are managed via Stripe on our web platform
        </Text>
        <Text style={styles.infoSubtext}>
          {CREATOR_SUBSCRIPTIONS.CREATOR_SPLIT * 100}% goes to creator
        </Text>
      </View>
    </View>
  );

  const renderPPV = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Pay-Per-View Content</Text>
      <Text style={styles.sectionSubtitle}>
        ${CREATOR_PPV.MIN_PRICE_USD} - ${CREATOR_PPV.MAX_PRICE_USD} per item
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>📸 Exclusive Photoset</Text>
        <Text style={styles.cardPrice}>$15.00</Text>
        <Text style={styles.cardDescription}>
          Premium photo collection with 20+ images
        </Text>
        <TouchableOpacity
          style={styles.purchaseButton}
          onPress={() => handleWebRedirect('PPV Content')}
        >
          <Text style={styles.purchaseButtonText}>Unlock on Web</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>🎥 Behind the Scenes</Text>
        <Text style={styles.cardPrice}>$25.00</Text>
        <Text style={styles.cardDescription}>
          Exclusive video content, 15 minutes
        </Text>
        <TouchableOpacity
          style={styles.purchaseButton}
          onPress={() => handleWebRedirect('PPV Content')}
        >
          <Text style={styles.purchaseButtonText}>Unlock on Web</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          🔒 One-time purchases unlock content permanently
        </Text>
        <Text style={styles.infoSubtext}>
          {CREATOR_PPV.CREATOR_SPLIT * 100}% goes to creator
        </Text>
      </View>
    </View>
  );

  const renderCustomRequests = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Custom Requests</Text>
      <Text style={styles.sectionSubtitle}>
        ${CREATOR_CUSTOM_REQUESTS.MIN_PRICE_USD} - ${CREATOR_CUSTOM_REQUESTS.MAX_PRICE_USD}
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>✨ Request Custom Content</Text>
        <Text style={styles.cardDescription}>
          Request personalized content tailored to your preferences. Creator will review and provide a quote.
        </Text>
        
        <View style={styles.benefitsList}>
          <Text style={styles.benefit}>✓ Personalized content</Text>
          <Text style={styles.benefit}>✓ Direct communication</Text>
          <Text style={styles.benefit}>✓ 7-14 day turnaround</Text>
        </View>

        <TouchableOpacity
          style={styles.purchaseButton}
          onPress={() => handleWebRedirect('Custom Request')}
        >
          <Text style={styles.purchaseButtonText}>Request on Web</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          💬 Submit your request and the creator will respond with details
        </Text>
        <Text style={styles.infoSubtext}>
          {CREATOR_CUSTOM_REQUESTS.CREATOR_SPLIT * 100}% goes to creator
        </Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Creator Store</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'subscriptions' && styles.activeTab]}
          onPress={() => setActiveTab('subscriptions')}
        >
          <Text style={[styles.tabText, activeTab === 'subscriptions' && styles.activeTabText]}>
            Subscriptions
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'ppv' && styles.activeTab]}
          onPress={() => setActiveTab('ppv')}
        >
          <Text style={[styles.tabText, activeTab === 'ppv' && styles.activeTabText]}>
            PPV
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'requests' && styles.activeTab]}
          onPress={() => setActiveTab('requests')}
        >
          <Text style={[styles.tabText, activeTab === 'requests' && styles.activeTabText]}>
            Requests
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView style={styles.content}>
        {activeTab === 'subscriptions' && renderSubscriptions()}
        {activeTab === 'ppv' && renderPPV()}
        {activeTab === 'requests' && renderCustomRequests()}
      </ScrollView>
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
  placeholder: {
    width: 50,
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
  content: {
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
    marginBottom: 16,
  },
  card: {
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  cardPrice: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FF6B6B',
    marginBottom: 12,
  },
  cardDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  benefitsList: {
    marginBottom: 16,
  },
  benefit: {
    fontSize: 14,
    color: '#333',
    marginBottom: 6,
  },
  purchaseButton: {
    backgroundColor: '#FF6B6B',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
  },
  purchaseButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  infoBox: {
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  infoText: {
    fontSize: 12,
    color: '#1976D2',
    marginBottom: 4,
  },
  infoSubtext: {
    fontSize: 11,
    color: '#1565C0',
  },
});