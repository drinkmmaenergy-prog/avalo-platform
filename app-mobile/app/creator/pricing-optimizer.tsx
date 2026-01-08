/**
 * AI Auto-Pricing Optimizer Screen
 * PACK 33-8: Dynamic pricing suggestions UI
 * 
 * Dark premium theme with turquoise + gold accents
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "@/hooks/useTranslation";
import * as autoPricingService from "@/services/autoPricingService";

export default function PricingOptimizer() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [suggestions, setSuggestions] = useState<autoPricingService.PriceSuggestion[]>([]);
  const [history, setHistory] = useState<autoPricingService.PricingHistory[]>([]);
  const [autoApplyEnabled, setAutoApplyEnabled] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    loadData();
  }, [user?.uid]);

  const loadData = async () => {
    if (!user?.uid) return;

    try {
      setLoading(true);

      // Load suggestions
      const sug = await autoPricingService.evaluatePricing(user.uid);
      setSuggestions(sug);

      // Load history
      const hist = await autoPricingService.getHistory(user.uid);
      setHistory(hist);

      // Load auto-apply settings
      const settings = await autoPricingService.getAutoApplySettings(user.uid);
      setAutoApplyEnabled(settings.autoApplyEnabled);
    } catch (error) {
      console.error('Error loading pricing data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!user?.uid) return;

    Alert.alert(
      t('autoPricing.confirmApplyTitle'),
      t('autoPricing.confirmApplyMessage'),
      [
        {
          text: t('common.cancel'),
          style: 'cancel',
        },
        {
          text: t('autoPricing.applyButton'),
          style: 'default',
          onPress: async () => {
            try {
              setApplying(true);
              const success = await autoPricingService.applySuggestedPrices(user.uid);
              
              if (success) {
                Alert.alert(
                  t('autoPricing.appliedTitle'),
                  t('autoPricing.appliedMessage')
                );
                // Reload data
                await loadData();
              } else {
                Alert.alert(t('common.error'), t('autoPricing.applyFailed'));
              }
            } catch (error) {
              console.error('Error applying prices:', error);
              Alert.alert(t('common.error'), t('autoPricing.applyFailed'));
            } finally {
              setApplying(false);
            }
          },
        },
      ]
    );
  };

  const handleDecline = () => {
    Alert.alert(
      t('autoPricing.declineTitle'),
      t('autoPricing.declineMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('autoPricing.declineButton'),
          style: 'destructive',
          onPress: () => router.back(),
        },
      ]
    );
  };

  const handleToggleAutoApply = async (value: boolean) => {
    if (!user?.uid) return;

    try {
      setAutoApplyEnabled(value);
      
      const settings: autoPricingService.AutoPricingSettings = {
        creatorId: user.uid,
        autoApplyEnabled: value,
        autoApplyInterval: 7,
      };

      await autoPricingService.updateAutoApplySettings(settings);
      
      Alert.alert(
        t('common.success'),
        value 
          ? t('autoPricing.autoApplyEnabled') 
          : t('autoPricing.autoApplyDisabled')
      );
    } catch (error) {
      console.error('Error updating auto-apply:', error);
      setAutoApplyEnabled(!value);
    }
  };

  const handleRecalculate = async () => {
    if (!user?.uid) return;

    try {
      setLoading(true);
      const newSuggestions = await autoPricingService.forceRecalculate(user.uid);
      setSuggestions(newSuggestions);
      
      if (newSuggestions.length === 0) {
        Alert.alert(
          t('autoPricing.noSuggestionsTitle'),
          t('autoPricing.noSuggestionsMessage')
        );
      }
    } catch (error) {
      console.error('Error recalculating:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTypeLabel = (type: string): string => {
    switch (type) {
      case 'PAID_CHAT': return t('autoPricing.typePaidChat');
      case 'SUBSCRIPTION': return t('autoPricing.typeSubscription');
      case 'PPV': return t('autoPricing.typePPV');
      case 'LIVE_ENTRY': return t('autoPricing.typeLiveEntry');
      case 'CREATOR_OFFERS': return t('autoPricing.typeCreatorOffers');
      default: return type;
    }
  };

  const getConfidenceColor = (confidence: string): string => {
    switch (confidence) {
      case 'high': return '#40E0D0';
      case 'medium': return '#D4AF37';
      case 'low': return '#FF6B6B';
      default: return '#999999';
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#40E0D0" />
        <Text style={styles.loadingText}>{t('autoPricing.analyzing')}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('autoPricing.title')}</Text>
        <TouchableOpacity onPress={handleRecalculate} style={styles.refreshButton}>
          <Text style={styles.refreshButtonText}>⟳</Text>
        </TouchableOpacity>
      </View>

      {/* Hero Card */}
      <View style={styles.heroCard}>
        <Text style={styles.heroEmoji}>💰</Text>
        <Text style={styles.heroTitle}>{t('autoPricing.heroTitle')}</Text>
        <Text style={styles.heroSubtitle}>{t('autoPricing.heroSubtitle')}</Text>
      </View>

      {/* Suggestions */}
      {suggestions.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>{t('autoPricing.suggestionsTitle')}</Text>
          
          {suggestions.map((suggestion, index) => (
            <View key={index} style={styles.suggestionCard}>
              <View style={styles.suggestionHeader}>
                <Text style={styles.suggestionType}>{getTypeLabel(suggestion.type)}</Text>
                <View style={[styles.confidenceBadge, { 
                  backgroundColor: getConfidenceColor(suggestion.confidence) + '20',
                  borderColor: getConfidenceColor(suggestion.confidence),
                }]}>
                  <Text style={[styles.confidenceText, { 
                    color: getConfidenceColor(suggestion.confidence) 
                  }]}>
                    {suggestion.confidence.toUpperCase()}
                  </Text>
                </View>
              </View>

              <View style={styles.priceComparison}>
                <View style={styles.priceColumn}>
                  <Text style={styles.priceLabel}>{t('autoPricing.oldPrice')}</Text>
                  <Text style={styles.oldPrice}>{suggestion.currentPrice} 💎</Text>
                </View>

                <Text style={styles.arrow}>→</Text>

                <View style={styles.priceColumn}>
                  <Text style={styles.priceLabel}>{t('autoPricing.suggestedPrice')}</Text>
                  <Text style={styles.newPrice}>{suggestion.suggestedPrice} 💎</Text>
                </View>
              </View>

              <View style={styles.suggestionDetails}>
                <Text style={styles.reasonLabel}>{t('autoPricing.reason')}</Text>
                <Text style={styles.reasonText}>{suggestion.reason}</Text>
                
                <View style={styles.estimateRow}>
                  <Text style={styles.estimateLabel}>
                    {t('autoPricing.estimatedIncrease')}
                  </Text>
                  <Text style={styles.estimateValue}>
                    +{suggestion.estimatedRevenueIncrease}%
                  </Text>
                </View>
              </View>
            </View>
          ))}

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={styles.applyButton}
              onPress={handleApply}
              disabled={applying}
            >
              {applying ? (
                <ActivityIndicator color="#000000" />
              ) : (
                <Text style={styles.applyButtonText}>{t('autoPricing.applyButton')}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.declineButton}
              onPress={handleDecline}
              disabled={applying}
            >
              <Text style={styles.declineButtonText}>{t('autoPricing.declineButton')}</Text>
            </TouchableOpacity>
          </View>

          {/* Auto-Apply Toggle */}
          <View style={styles.autoApplyCard}>
            <View style={styles.autoApplyContent}>
              <View>
                <Text style={styles.autoApplyTitle}>
                  {t('autoPricing.autoApplyTitle')}
                </Text>
                <Text style={styles.autoApplySubtitle}>
                  {t('autoPricing.autoApplySubtitle')}
                </Text>
              </View>
              <Switch
                value={autoApplyEnabled}
                onValueChange={handleToggleAutoApply}
                trackColor={{ false: '#333333', true: '#40E0D080' }}
                thumbColor={autoApplyEnabled ? '#40E0D0' : '#666666'}
              />
            </View>
          </View>
        </>
      ) : (
        <View style={styles.noSuggestionsCard}>
          <Text style={styles.noSuggestionsEmoji}>✅</Text>
          <Text style={styles.noSuggestionsTitle}>
            {t('autoPricing.noSuggestionsTitle')}
          </Text>
          <Text style={styles.noSuggestionsText}>
            {t('autoPricing.noSuggestionsMessage')}
          </Text>
        </View>
      )}

      {/* History Section */}
      <TouchableOpacity
        style={styles.historyToggle}
        onPress={() => setShowHistory(!showHistory)}
      >
        <Text style={styles.historyToggleText}>
          {showHistory ? '▼' : '▶'} {t('autoPricing.historyTitle')}
        </Text>
        <Text style={styles.historyCount}>
          {history.length} {t('autoPricing.changes')}
        </Text>
      </TouchableOpacity>

      {showHistory && history.length > 0 && (
        <View style={styles.historyList}>
          {history.slice(0, 10).map((entry, index) => (
            <View key={index} style={styles.historyCard}>
              <Text style={styles.historyDate}>
                {new Date(entry.timestamp).toLocaleDateString()}
              </Text>
              {entry.changes.map((change, changeIndex) => (
                <View key={changeIndex} style={styles.historyChange}>
                  <Text style={styles.historyChangeType}>
                    {getTypeLabel(change.type)}
                  </Text>
                  <Text style={styles.historyChangePrice}>
                    {change.oldPrice} → {change.newPrice} 💎
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      )}

      {/* Info Footer */}
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>ℹ️ {t('autoPricing.howItWorks')}</Text>
        <Text style={styles.infoText}>{t('autoPricing.info1')}</Text>
        <Text style={styles.infoText}>{t('autoPricing.info2')}</Text>
        <Text style={styles.infoText}>{t('autoPricing.info3')}</Text>
      </View>

      <View style={styles.bottomPadding} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F0F',
  },
  content: {
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0F0F0F',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#40E0D0',
    fontSize: 16,
    marginTop: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 60,
    marginBottom: 24,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 24,
  },
  headerTitle: {
    flex: 1,
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginHorizontal: 16,
  },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  refreshButtonText: {
    color: '#40E0D0',
    fontSize: 24,
  },
  heroCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#D4AF3730',
  },
  heroEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#D4AF37',
    marginBottom: 8,
    textAlign: 'center',
  },
  heroSubtitle: {
    fontSize: 14,
    color: '#999999',
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  suggestionCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 18,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#40E0D030',
  },
  suggestionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  suggestionType: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  confidenceBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  confidenceText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  priceComparison: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingVertical: 12,
    backgroundColor: '#15151580',
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  priceColumn: {
    flex: 1,
  },
  priceLabel: {
    fontSize: 12,
    color: '#999999',
    marginBottom: 4,
  },
  oldPrice: {
    fontSize: 20,
    color: '#666666',
    textDecorationLine: 'line-through',
  },
  newPrice: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#40E0D0',
  },
  arrow: {
    fontSize: 24,
    color: '#D4AF37',
    marginHorizontal: 12,
  },
  suggestionDetails: {
    borderTopWidth: 1,
    borderTopColor: '#333333',
    paddingTop: 12,
  },
  reasonLabel: {
    fontSize: 12,
    color: '#999999',
    marginBottom: 4,
  },
  reasonText: {
    fontSize: 14,
    color: '#FFFFFF',
    marginBottom: 12,
    lineHeight: 20,
  },
  estimateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#D4AF3720',
    padding: 10,
    borderRadius: 8,
  },
  estimateLabel: {
    fontSize: 13,
    color: '#D4AF37',
  },
  estimateValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#D4AF37',
  },
  actionButtons: {
    gap: 12,
    marginBottom: 24,
  },
  applyButton: {
    backgroundColor: '#D4AF37',
    borderRadius: 18,
    padding: 18,
    alignItems: 'center',
  },
  applyButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000000',
  },
  declineButton: {
    backgroundColor: '#1A1A1A',
    borderRadius: 18,
    padding: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333333',
  },
  declineButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#999999',
  },
  autoApplyCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 18,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#40E0D030',
  },
  autoApplyContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  autoApplyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  autoApplySubtitle: {
    fontSize: 13,
    color: '#999999',
    maxWidth: '80%',
  },
  noSuggestionsCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 18,
    padding: 32,
    alignItems: 'center',
    marginBottom: 24,
  },
  noSuggestionsEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  noSuggestionsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  noSuggestionsText: {
    fontSize: 14,
    color: '#999999',
    textAlign: 'center',
  },
  historyToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
  },
  historyToggleText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  historyCount: {
    fontSize: 14,
    color: '#999999',
  },
  historyList: {
    gap: 12,
    marginBottom: 24,
  },
  historyCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#333333',
  },
  historyDate: {
    fontSize: 12,
    color: '#999999',
    marginBottom: 12,
  },
  historyChange: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#252525',
  },
  historyChangeType: {
    fontSize: 14,
    color: '#FFFFFF',
  },
  historyChangePrice: {
    fontSize: 14,
    color: '#40E0D0',
    fontWeight: 'bold',
  },
  infoCard: {
    backgroundColor: '#1A161080',
    borderRadius: 18,
    padding: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#40E0D0',
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 13,
    color: '#999999',
    marginBottom: 8,
    lineHeight: 20,
  },
  bottomPadding: {
    height: 40,
  },
});
