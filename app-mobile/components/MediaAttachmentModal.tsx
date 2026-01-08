/**
 * MediaAttachmentModal Component - PACK 42
 * Modal for attaching paid media to chat messages
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useTranslation } from '../hooks/useTranslation';
import { calculateMediaPriceAuto, MediaType } from '../services/mediaPricingService';

interface MediaAttachmentModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (mediaType: MediaType, mediaUri: string, price: number) => void;
  senderId: string;
  receiverId: string;
}

export const MediaAttachmentModal: React.FC<MediaAttachmentModalProps> = ({
  visible,
  onClose,
  onConfirm,
  senderId,
  receiverId,
}) => {
  const { t } = useTranslation();
  const [selectedType, setSelectedType] = useState<MediaType | null>(null);
  const [calculatedPrice, setCalculatedPrice] = useState<number | null>(null);
  const [calculating, setCalculating] = useState(false);
  
  const mediaTypes: { type: MediaType; icon: string; label: string }[] = [
    { type: 'photo', icon: '📷', label: t('ppm.attachPhoto') },
    { type: 'audio', icon: '🎵', label: t('ppm.attachAudio') },
    { type: 'video', icon: '🎬', label: t('ppm.attachVideo') },
  ];
  
  // Calculate price when media type is selected
  useEffect(() => {
    if (selectedType) {
      calculatePrice(selectedType);
    }
  }, [selectedType]);
  
  const calculatePrice = async (type: MediaType) => {
    setCalculating(true);
    try {
      const result = await calculateMediaPriceAuto(senderId, receiverId, type);
      setCalculatedPrice(result.tokenCost);
      
      if (__DEV__) {
        console.log('[MediaAttachment] Price:', result);
      }
    } catch (error) {
      console.error('Error calculating media price:', error);
      Alert.alert(t('common.error'), 'Failed to calculate price');
      setSelectedType(null);
    } finally {
      setCalculating(false);
    }
  };
  
  const handleMediaTypeSelect = (type: MediaType) => {
    setSelectedType(type);
  };
  
  const handleConfirm = () => {
    if (!selectedType || !calculatedPrice) return;
    
    // In a real app, this would open media picker
    // For now, we'll use a placeholder URI
    const mockUri = `${selectedType}://placeholder_${Date.now()}`;
    
    onConfirm(selectedType, mockUri, calculatedPrice);
    handleClose();
  };
  
  const handleClose = () => {
    setSelectedType(null);
    setCalculatedPrice(null);
    onClose();
  };
  
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          <Text style={styles.title}>{t('ppm.sendPaidMedia')}</Text>
          <Text style={styles.subtitle}>{t('ppm.setUnlockPrice')}</Text>
          
          {/* Media Type Selection */}
          {!selectedType && (
            <View style={styles.mediaTypeGrid}>
              {mediaTypes.map((item) => (
                <TouchableOpacity
                  key={item.type}
                  style={styles.mediaTypeButton}
                  onPress={() => handleMediaTypeSelect(item.type)}
                >
                  <Text style={styles.mediaTypeIcon}>{item.icon}</Text>
                  <Text style={styles.mediaTypeLabel}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          
          {/* Price Confirmation */}
          {selectedType && (
            <View style={styles.confirmationContainer}>
              <View style={styles.selectedMedia}>
                <Text style={styles.selectedMediaIcon}>
                  {mediaTypes.find((m) => m.type === selectedType)?.icon}
                </Text>
                <Text style={styles.selectedMediaLabel}>
                  {mediaTypes.find((m) => m.type === selectedType)?.label}
                </Text>
              </View>
              
              {calculating ? (
                <ActivityIndicator size="large" color="#FF6B6B" />
              ) : (
                <>
                  <View style={styles.priceDisplay}>
                    <Text style={styles.priceLabel}>
                      {t('ppm.unlockFor')}:
                    </Text>
                    <Text style={styles.priceValue}>
                      {calculatedPrice} 💰
                    </Text>
                  </View>
                  
                  <View style={styles.buttonRow}>
                    <TouchableOpacity
                      style={[styles.button, styles.cancelButton]}
                      onPress={handleClose}
                    >
                      <Text style={styles.cancelButtonText}>
                        {t('common.cancel')}
                      </Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity
                      style={[styles.button, styles.confirmButton]}
                      onPress={handleConfirm}
                    >
                      <Text style={styles.confirmButtonText}>
                        {t('common.send')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    minHeight: 300,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 24,
    textAlign: 'center',
  },
  mediaTypeGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 12,
  },
  mediaTypeButton: {
    flex: 1,
    backgroundColor: '#f8f8f8',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    gap: 8,
    borderWidth: 2,
    borderColor: '#f0f0f0',
  },
  mediaTypeIcon: {
    fontSize: 48,
  },
  mediaTypeLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  confirmationContainer: {
    gap: 24,
  },
  selectedMedia: {
    alignItems: 'center',
    gap: 8,
  },
  selectedMediaIcon: {
    fontSize: 64,
  },
  selectedMediaLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  priceDisplay: {
    backgroundColor: '#FFF5F5',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    gap: 8,
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  priceLabel: {
    fontSize: 14,
    color: '#666',
  },
  priceValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FF6B6B',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f0f0f0',
  },
  confirmButton: {
    backgroundColor: '#FF6B6B',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
