import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { TOKEN_PACKS, TokenPack, getTotalTokensForPack } from '../config/monetization';

interface TokenPurchaseModalProps {
  visible: boolean;
  onClose: () => void;
  onPurchase?: (packId: string) => void;
  reason?: string;
}

export function TokenPurchaseModal({
  visible,
  onClose,
  onPurchase,
  reason = 'Potrzebujesz więcej tokenów, aby kontynuować',
}: TokenPurchaseModalProps) {
  const [loading, setLoading] = useState(false);
  const [selectedPack, setSelectedPack] = useState<string | null>(null);

  const handlePurchase = async (pack: TokenPack) => {
    setSelectedPack(pack.packId);
    setLoading(true);

    try {
      // TODO: Integrate with actual payment provider (Stripe, etc.)
      // For now, just simulate purchase
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      if (onPurchase) {
        onPurchase(pack.packId);
      }
      
      alert(`Zakupiono ${getTotalTokensForPack(pack)} tokenów!`);
      onClose();
    } catch (error) {
      console.error('Purchase error:', error);
      alert('Zakup nie powiódł się. Spróbuj ponownie.');
    } finally {
      setLoading(false);
      setSelectedPack(null);
    }
  };

  const renderPack = ({ item }: { item: TokenPack }) => {
    const totalTokens = getTotalTokensForPack(item);
    const isSelected = selectedPack === item.packId;
    const isLoading = loading && isSelected;

    return (
      <TouchableOpacity
        style={[
          styles.packCard,
          item.popular && styles.popularPack,
          isSelected && styles.selectedPack,
        ]}
        onPress={() => !loading && handlePurchase(item)}
        disabled={loading}
      >
        {item.popular && (
          <View style={styles.popularBadge}>
            <Text style={styles.popularText}>POPULAR</Text>
          </View>
        )}
        
        <Text style={styles.packTokens}>{totalTokens}</Text>
        <Text style={styles.packTokensLabel}>Tokens</Text>
        
        {item.bonus && item.bonus > 0 && (
          <View style={styles.bonusBadge}>
            <Text style={styles.bonusText}>+{item.bonus} BONUS</Text>
          </View>
        )}
        
        <Text style={styles.packPrice}>${item.price.toFixed(2)}</Text>
        
        {isLoading ? (
          <ActivityIndicator size="small" color="#FF6B6B" style={styles.loader} />
        ) : (
          <View style={styles.buyButton}>
            <Text style={styles.buyButtonText}>Buy Now</Text>
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
            <Text style={styles.title}>Kup tokeny</Text>
            <TouchableOpacity onPress={onClose} disabled={loading}>
              <Text style={styles.closeButton}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.reason}>{reason}</Text>

          <FlatList
            data={TOKEN_PACKS}
            renderItem={renderPack}
            keyExtractor={(item) => item.packId}
            numColumns={2}
            contentContainerStyle={styles.packsList}
            scrollEnabled={false}
          />

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              💰 Tokeny nie wygasają • 🔒 Bezpieczna płatność
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
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
  },
  closeButton: {
    fontSize: 28,
    color: '#999',
    fontWeight: '300',
  },
  reason: {
    fontSize: 14,
    color: '#666',
    paddingHorizontal: 20,
    marginBottom: 20,
    textAlign: 'center',
  },
  packsList: {
    paddingHorizontal: 12,
  },
  packCard: {
    flex: 1,
    margin: 8,
    padding: 20,
    backgroundColor: '#f9f9f9',
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#f0f0f0',
    alignItems: 'center',
    position: 'relative',
  },
  popularPack: {
    borderColor: '#FFB74D',
    backgroundColor: '#FFF8E1',
  },
  selectedPack: {
    borderColor: '#FF6B6B',
  },
  popularBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#FFB74D',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 18,
  },
  popularText: {
   fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  packTokens: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#FF6B6B',
    marginTop: 8,
  },
  packTokensLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  bonusBadge: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 18,
    marginBottom: 8,
  },
  bonusText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
  },
  packPrice: {
    fontSize: 20,
    fontWeight: '600',
    color: '#000',
    marginBottom: 12,
  },
  buyButton: {
    backgroundColor: '#40E0D0',
    paddingHorizontal: 24,
    paddingVertical: 8,
    borderRadius: 18,
  },
  buyButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  loader: {
    marginVertical: 8,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 20,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
  },
});
