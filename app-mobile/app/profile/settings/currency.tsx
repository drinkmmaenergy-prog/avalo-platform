import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { getFunctions, httpsCallable } from 'firebase/functions';

/**
 * PACK 106 — Select Currency Screen
 * 
 * Allows users to select their preferred display currency
 * Enforces 90-day cooldown between changes
 * 
 * Features:
 * - List all supported currencies
 * - Display current selection
 * - Show cooldown status
 * - Tax information display
 */

interface CurrencyProfile {
  code: string;
  symbol: string;
  name: string;
  fxRate: number;
  taxIncluded: boolean;
  taxRate: number;
  decimalPlaces: number;
  enabled: boolean;
  metadata?: {
    countries?: string[];
    notes?: string;
  };
}

interface UserCurrencyPreference {
  userId: string;
  currency: string;
  setAt: { seconds: number };
  lastChangedAt?: { seconds: number };
  canChangeAfter?: { seconds: number };
  autoDetected: boolean;
  countryCode?: string;
}

export default function SelectCurrencyScreen() {
  const [currencies, setCurrencies] = useState<CurrencyProfile[]>([]);
  const [currentPreference, setCurrentPreference] = useState<UserCurrencyPreference | null>(null);
  const [loading, setLoading] = useState(true);
  const [changing, setChanging] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState<string>('');

  useEffect(() => {
    loadCurrencies();
    loadCurrentPreference();
  }, []);

  const loadCurrencies = async () => {
    try {
      const functions = getFunctions();
      const getSupportedCurrencies = httpsCallable<void, CurrencyProfile[]>(
        functions,
        'getSupportedCurrencies'
      );

      const result = await getSupportedCurrencies();
      setCurrencies(result.data);
    } catch (error: any) {
      console.error('Error loading currencies:', error);
      Alert.alert('Error', 'Failed to load currencies. Please try again.');
    }
  };

  const loadCurrentPreference = async () => {
    try {
      const functions = getFunctions();
      const getUserCurrencyPreference = httpsCallable<void, UserCurrencyPreference>(
        functions,
        'getUserCurrencyPreference'
      );

      const result = await getUserCurrencyPreference();
      setCurrentPreference(result.data);
      setSelectedCurrency(result.data.currency);
    } catch (error: any) {
      console.error('Error loading preference:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCurrencySelect = async (currencyCode: string) => {
    // Check if currency is already selected
    if (currencyCode === currentPreference?.currency) {
      Alert.alert('Already Selected', `${currencyCode} is already your active currency.`);
      return;
    }

    // Check cooldown
    if (currentPreference?.canChangeAfter) {
      const now = Date.now();
      const cooldownExpiry = currentPreference.canChangeAfter.seconds * 1000;
      
      if (now < cooldownExpiry) {
        const daysRemaining = Math.ceil((cooldownExpiry - now) / (1000 * 60 * 60 * 24));
        Alert.alert(
          'Change Restricted',
          `Currency can only be changed once every 90 days. You can change again in ${daysRemaining} days.`,
          [{ text: 'OK' }]
        );
        return;
      }
    }

    // Confirm change
    Alert.alert(
      'Change Currency',
      `Change display currency to ${currencyCode}?\n\nNote: You can only change this once every 90 days. Token prices remain the same across all currencies.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: () => confirmCurrencyChange(currencyCode),
        },
      ]
    );
  };

  const confirmCurrencyChange = async (currencyCode: string) => {
    setChanging(true);

    try {
      const functions = getFunctions();
      const setUserCurrency = httpsCallable<
        { currencyCode: string },
        { success: boolean; nextChangeAllowedAt?: string }
      >(functions, 'setUserCurrency');

      const result = await setUserCurrency({ currencyCode });

      if (result.data.success) {
        Alert.alert(
          'Currency Updated',
          `Your display currency has been changed to ${currencyCode}. All prices will now be shown in ${currencyCode}.`,
          [
            {
              text: 'OK',
              onPress: () => {
                router.back();
              },
            },
          ]
        );
      }
    } catch (error: any) {
      console.error('Error changing currency:', error);
      
      let errorMessage = 'Failed to change currency. Please try again.';
      
      if (error.code === 'functions/failed-precondition') {
        errorMessage = error.message;
      }
      
      Alert.alert('Error', errorMessage);
    } finally {
      setChanging(false);
    }
  };

  const renderCurrencyItem = ({ item }: { item: CurrencyProfile }) => {
    const isSelected = item.code === currentPreference?.currency;
    const currency = currencies.find(c => c.code === item.code);

    return (
      <TouchableOpacity
        style={[styles.currencyItem, isSelected && styles.selectedItem]}
        onPress={() => handleCurrencySelect(item.code)}
        disabled={changing}
      >
        <View style={styles.currencyInfo}>
          <Text style={[styles.currencyCode, isSelected && styles.selectedText]}>
            {item.symbol} {item.code}
          </Text>
          <Text style={[styles.currencyName, isSelected && styles.selectedText]}>
            {item.name}
          </Text>
          {item.taxIncluded && (
            <Text style={styles.taxInfo}>
              {item.metadata?.notes || `Tax included: ${(item.taxRate * 100).toFixed(0)}%`}
            </Text>
          )}
        </View>

        {isSelected && (
          <View style={styles.checkmark}>
            <Text style={styles.checkmarkText}>✓</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading currencies...</Text>
        </View>
      </View>
    );
  }

  const cooldownInfo = currentPreference?.canChangeAfter
    ? new Date(currentPreference.canChangeAfter.seconds * 1000)
    : null;
  
  const canChangeNow = cooldownInfo ? Date.now() >= cooldownInfo.getTime() : true;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Display Currency</Text>
      </View>

      {/* Info Banner */}
      <View style={styles.infoBanner}>
        <Text style={styles.infoBannerTitle}>ℹ️ Currency Information</Text>
        <Text style={styles.infoBannerText}>
          Select your preferred currency for displaying prices. Token values remain the same across all currencies.
        </Text>
        <Text style={styles.infoBannerText}>
          • Current: {currentPreference?.currency}{'\n'}
          • Can change: {canChangeNow ? 'Now' : cooldownInfo?.toLocaleDateString()}{'\n'}
          • No discounts or special pricing per currency
        </Text>
      </View>

      {/* Currency List */}
      <FlatList
        data={currencies}
        renderItem={renderCurrencyItem}
        keyExtractor={(item) => item.code}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      {/* Loading Overlay */}
      {changing && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingOverlayText}>Updating currency...</Text>
          </View>
        </View>
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
    backgroundColor: '#FFFFFF',
    paddingTop: 50,
    paddingBottom: 15,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  backButton: {
    marginBottom: 10,
  },
  backButtonText: {
    fontSize: 16,
    color: '#007AFF',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000',
  },
  infoBanner: {
    backgroundColor: '#E3F2FD',
    padding: 15,
    margin: 15,
    borderRadius: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#2196F3',
  },
  infoBannerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1976D2',
    marginBottom: 8,
  },
  infoBannerText: {
    fontSize: 14,
    color: '#424242',
    lineHeight: 20,
    marginBottom: 5,
  },
  listContent: {
    padding: 15,
  },
  currencyItem: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 10,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E0E0E0',
  },
  selectedItem: {
    borderColor: '#007AFF',
    backgroundColor: '#F0F8FF',
  },
  currencyInfo: {
    flex: 1,
  },
  currencyCode: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  currencyName: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  taxInfo: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
  },
  selectedText: {
    color: '#007AFF',
  },
  checkmark: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmarkText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 15,
    fontSize: 16,
    color: '#666',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingBox: {
    backgroundColor: '#FFFFFF',
    padding: 30,
    borderRadius: 15,
    alignItems: 'center',
  },
  loadingOverlayText: {
    marginTop: 15,
    fontSize: 16,
    color: '#000',
  },
});
