/**
 * Boost Purchase Modal
 * Modal for purchasing Discovery Boosts
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import {
  BOOST_CONFIG,
  DiscoveryTier,
  createDiscoveryBoost,
} from '../services/boostService';
import { getTokenBalance } from '../services/tokenService';
import { useToast } from '../hooks/useToast';

interface BoostPurchaseModalProps {
  visible: boolean;
  onClose: () => void;
  userId: string;
  onSuccess?: (boostId: string, expiresAt: Date) => void;
  onError?: (error: string) => void;
  onNeedTokens?: () => void;
}

interface BoostOption {
  tier: DiscoveryTier;
  name: string;
  tokens: number;
  durationMinutes: number;
  description: string;
  popular?: boolean;
}

const BOOST_OPTIONS: BoostOption[] = [
  {
    tier: 'basic',
    name: 'Basic',
    tokens: 80,
    durationMinutes: 30,
    description: '30 minut widoczności',
  },
  {
    tier: 'plus',
    name: 'Plus',
    tokens: 180,
    durationMinutes: 90,
    description: '90 minut widoczności',
    popular: true,
  },
  {
    tier: 'max',
    name: 'Max',
    tokens: 400,
    durationMinutes: 240,
    description: '4 godziny widoczności',
  },
];

export function BoostPurchaseModal({
  visible,
  onClose,
  userId,
  onSuccess,
  onError,
  onNeedTokens,
}: BoostPurchaseModalProps) {
  const [loading, setLoading] = useState(false);
  const [selectedTier, setSelectedTier] = useState<DiscoveryTier | null>(null);
  const { showToast } = useToast();

  const handlePurchase = async (option: BoostOption) => {
    setSelectedTier(option.tier);
    setLoading(true);

    try {
      // Check if user has enough tokens
      const balance = await getTokenBalance(userId);
      
      if (balance < option.tokens) {
        setLoading(false);
        setSelectedTier(null);
        
        showToast('Za mało tokenów — doładuj portfel', 'error');
        
        if (onNeedTokens) {
          setTimeout(() => onNeedTokens(), 500);
        } else if (onError) {
          onError('Niewystarczająca ilość tokenów');
        }
        return;
      }

      // Create boost
      const result = await createDiscoveryBoost(userId, option.tier);
      
      if (result.success) {
        if (onSuccess) {
          onSuccess(result.boostId, result.expiresAt);
        }
        onClose();
      }
    } catch (error: any) {
      console.error('Boost purchase error:', error);
      
      if (onError) {
        onError(error.message || 'Nie udało się utworzyć boosta');
      }
    } finally {
      setLoading(false);
      setSelectedTier(null);
    }
  };

  const renderBoostOption = (option: BoostOption) => {
    const isSelected = selectedTier === option.tier;
    const isLoading = loading && isSelected;

    return (
      <TouchableOpacity
        key={option.tier}
        style={[
          styles.boostCard,
          option.popular && styles.popularCard,
          isSelected && styles.selectedCard,
        ]}
        onPress={() => !loading && handlePurchase(option)}
        disabled={loading}
      >
        {option.popular && (
          <View style={styles.popularBadge}>
            <Text style={styles.popularText}>POPULARNE</Text>
          </View>
        )}

        <Text style={styles.boostName}>{option.name}</Text>
        <Text style={styles.boostDuration}>
          {option.durationMinutes < 60
            ? `${option.durationMinutes} min`
            : `${Math.floor(option.durationMinutes / 60)}h`}
        </Text>
        
        <Text style={styles.boostDescription}>{option.description}</Text>

        <View style={styles.boostPriceContainer}>
          <Text style={styles.boostPrice}>{option.tokens}</Text>
          <Text style={styles.boostPriceLabel}>tokenów</Text>
        </View>

        {isLoading ? (
          <ActivityIndicator size="small" color="#40E0D0" style={styles.loader} />
        ) : (
          <View style={styles.selectButton}>
            <Text style={styles.selectButtonText}>Wybierz</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>⚡ Boostuj profil</Text>
              <Text style={styles.subtitle}>Zwiększ swoją widoczność</Text>
            </View>
            <TouchableOpacity onPress={onClose} disabled={loading}>
              <Text style={styles.closeButton}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.optionsContainer}
          >
            {BOOST_OPTIONS.map(renderBoostOption)}
          </ScrollView>

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              ⚡ Boost priorytetyzuje Twój profil w Discovery i Swipe
            </Text>
            <Text style={styles.footerSubtext}>
              Płatność jednorazowa • Bez zwrotów
            </Text>
          </View>
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
  modalContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 24,
    paddingBottom: 40,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 24,
    marginBottom: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#000',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  closeButton: {
    fontSize: 28,
    color: '#999',
    fontWeight: '300',
  },
  scrollView: {
    maxHeight: 500,
  },
  optionsContainer: {
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  boostCard: {
    padding: 20,
    backgroundColor: '#F9F9F9',
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#E5E5E5',
    marginBottom: 16,
    position: 'relative',
  },
  popularCard: {
    borderColor: '#FFB74D',
    backgroundColor: '#FFF8E1',
  },
  selectedCard: {
    borderColor: '#40E0D0',
    backgroundColor: '#F0FFFF',
  },
  popularBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: '#FFB74D',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  popularText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  boostName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  boostDuration: {
    fontSize: 16,
    fontWeight: '600',
    color: '#40E0D0',
    marginBottom: 8,
  },
  boostDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  boostPriceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 16,
  },
  boostPrice: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FF6B6B',
    marginRight: 8,
  },
  boostPriceLabel: {
    fontSize: 14,
    color: '#666',
  },
  selectButton: {
    backgroundColor: '#40E0D0',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  selectButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  loader: {
    paddingVertical: 14,
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
  },
  footerText: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    marginBottom: 4,
  },
  footerSubtext: {
    fontSize: 11,
    color: '#999',
    textAlign: 'center',
  },
});
