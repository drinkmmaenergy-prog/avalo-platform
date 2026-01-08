/**
 * PACK 76 - Geoshare Payment Modal
 * Modal for purchasing location sharing session
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { GEOSHARE_CONFIG, calculateGeosharePrice, formatDuration } from '../../config/geoshare';
import { getGeosharePricing } from '../../services/geoshareService';
import { GeosharePricing } from '../../types/geoshare';

interface GeosharePaymentModalProps {
  visible: boolean;
  partnerId: string;
  partnerName: string;
  onClose: () => void;
  onSuccess: (sessionId: string, durationMinutes: number) => void;
  onError: (error: string) => void;
}

export default function GeosharePaymentModal({
  visible,
  partnerId,
  partnerName,
  onClose,
  onSuccess,
  onError,
}: GeosharePaymentModalProps) {
  const [selectedDuration, setSelectedDuration] = useState<number>(
    GEOSHARE_CONFIG.DURATION_OPTIONS[0]
  );
  const [pricing, setPricing] = useState<GeosharePricing | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchingPricing, setFetchingPricing] = useState(false);

  // Fetch pricing when duration changes
  useEffect(() => {
    if (visible && selectedDuration) {
      fetchPricing();
    }
  }, [visible, selectedDuration]);

  const fetchPricing = async () => {
    setFetchingPricing(true);
    try {
      const pricingData = await getGeosharePricing(selectedDuration);
      setPricing(pricingData);
    } catch (error: any) {
      console.error('Error fetching pricing:', error);
      onError(error.message || 'Failed to load pricing');
    } finally {
      setFetchingPricing(false);
    }
  };

  const handleConfirm = async () => {
    if (!pricing) return;

    setLoading(true);
    try {
      // This will be handled by the parent component
      // which will call startGeoshareSession
      onSuccess(partnerId, selectedDuration);
    } catch (error: any) {
      onError(error.message || 'Failed to start location sharing');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>Share Location</Text>
              <Text style={styles.subtitle}>
                Share your real-time location with {partnerName}
              </Text>
            </View>

            {/* Duration Selection */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Choose Duration</Text>
              <View style={styles.durationOptions}>
                {GEOSHARE_CONFIG.DURATION_OPTIONS.map((duration) => (
                  <TouchableOpacity
                    key={duration}
                    style={[
                      styles.durationOption,
                      selectedDuration === duration && styles.durationOptionSelected,
                    ]}
                    onPress={() => setSelectedDuration(duration)}
                    disabled={loading}
                  >
                    <Text
                      style={[
                        styles.durationOptionText,
                        selectedDuration === duration && styles.durationOptionTextSelected,
                      ]}
                    >
                      {formatDuration(duration)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Pricing Information */}
            {fetchingPricing ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#007AFF" />
                <Text style={styles.loadingText}>Loading pricing...</Text>
              </View>
            ) : pricing ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Pricing</Text>
                
                <View style={styles.pricingRow}>
                  <Text style={styles.pricingLabel}>Duration:</Text>
                  <Text style={styles.pricingValue}>{formatDuration(pricing.durationMinutes)}</Text>
                </View>

                <View style={styles.pricingRow}>
                  <Text style={styles.pricingLabel}>Price per minute:</Text>
                  <Text style={styles.pricingValue}>{pricing.pricePerMinute} tokens</Text>
                </View>

                <View style={styles.pricingRow}>
                  <Text style={styles.pricingLabel}>Total cost:</Text>
                  <Text style={styles.pricingValue}>{pricing.totalTokens} tokens</Text>
                </View>

                <View style={styles.pricingRow}>
                  <Text style={styles.pricingLabelSmall}>Platform fee (35%):</Text>
                  <Text style={styles.pricingValueSmall}>{pricing.avaloFee} tokens</Text>
                </View>

                <View style={styles.divider} />

                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>You pay:</Text>
                  <Text style={styles.totalValue}>{pricing.totalTokens} tokens</Text>
                </View>
              </View>
            ) : null}

            {/* Important Information */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Important</Text>
              <View style={styles.infoBox}>
                <Text style={styles.infoText}>
                  • Location updates every 10 seconds{'\n'}
                  • Session ends automatically after paid time{'\n'}
                  • Payment is non-refundable{'\n'}
                  • No location history is stored{'\n'}
                  • Battery usage may increase
                </Text>
              </View>
            </View>

            {/* Action Buttons */}
            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={handleClose}
                disabled={loading}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.confirmButton, loading && styles.confirmButtonDisabled]}
                onPress={handleConfirm}
                disabled={loading || !pricing}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.confirmButtonText}>
                    Start Sharing ({pricing?.totalTokens || 0} tokens)
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#666666',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 12,
  },
  durationOptions: {
    flexDirection: 'row',
    gap: 12,
  },
  durationOption: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
    borderWidth: 2,
    borderColor: '#F5F5F5',
    alignItems: 'center',
  },
  durationOptionSelected: {
    backgroundColor: '#E3F2FD',
    borderColor: '#007AFF',
  },
  durationOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666666',
  },
  durationOptionTextSelected: {
    color: '#007AFF',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#666666',
  },
  pricingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  pricingLabel: {
    fontSize: 14,
    color: '#666666',
  },
  pricingValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
  },
  pricingLabelSmall: {
    fontSize: 12,
    color: '#999999',
  },
  pricingValueSmall: {
    fontSize: 12,
    color: '#999999',
  },
  divider: {
    height: 1,
    backgroundColor: '#E0E0E0',
    marginVertical: 12,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000000',
  },
  totalValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  infoBox: {
    backgroundColor: '#FFF9E6',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFE082',
  },
  infoText: {
    fontSize: 13,
    color: '#856404',
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666666',
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#007AFF',
    alignItems: 'center',
  },
  confirmButtonDisabled: {
    backgroundColor: '#CCCCCC',
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
