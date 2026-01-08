import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from "@/contexts/AuthContext";
import { TokenPurchaseModal } from "@/components/TokenPurchaseModal";
import { getOrCreateChatAndSendMessage, findExistingChat } from "@/services/chatService";
import {
  calculateMessageCost,
  hasEnoughTokens,
  processMessageTransaction,
  subscribeToTokenBalance,
} from "@/services/tokenService";

interface IcebreakerModalProps {
  visible: boolean;
  onClose: () => void;
  receiverId: string;
  receiverName?: string;
}

const ICEBREAKERS = [
  "Hey! What's your favorite way to spend a weekend? 😊",
  "Hi! I noticed we have similar interests. What's something you're passionate about?",
  "Hello! If you could travel anywhere right now, where would you go? ✈️",
  "Hey there! What's the best book or movie you've experienced lately? 📚",
  "Hi! What's something that always makes you smile? 😄",
  "Hello! If you could have dinner with anyone, who would it be and why?",
  "Hey! What's your go-to comfort food? 🍕",
  "Hi there! What's something you've always wanted to learn? 🎯",
  "Hello! What's your favorite way to unwind after a long day?",
  "Hey! If you could have any superpower, what would it be? 🦸",
];

export default function IcebreakerModal({
  visible,
  onClose,
  receiverId,
  receiverName,
}: IcebreakerModalProps) {
  const router = useRouter();
  const { user } = useAuth();
  const [sending, setSending] = useState(false);
  const [selectedIcebreaker, setSelectedIcebreaker] = useState<string | null>(null);
  const [tokenBalance, setTokenBalance] = useState(0);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);

  // Subscribe to token balance
  useEffect(() => {
    if (!user?.uid || !visible) return;

    const unsubscribe = subscribeToTokenBalance(
      user.uid,
      (balance) => {
        setTokenBalance(balance);
      },
      (error) => {
        console.error('Error subscribing to token balance:', error);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [user?.uid, visible]);

  const handleSelectIcebreaker = async (icebreaker: string) => {
    if (!user?.uid || sending) {
      return;
    }

    setSelectedIcebreaker(icebreaker);
    setSending(true);

    try {
      // Check if chat already exists to determine message count
      const existingChatId = await findExistingChat(user.uid, receiverId);
      
      let shouldCharge = false;
      let cost = 0;

      if (existingChatId) {
        // Calculate cost for existing chat
        const costInfo = await calculateMessageCost(existingChatId, user.uid);
        shouldCharge = costInfo.shouldCharge;
        cost = costInfo.cost;

        // Check tokens if needed
        if (shouldCharge) {
          const hasTokens = await hasEnoughTokens(user.uid, cost);
          
          if (!hasTokens) {
            setSending(false);
            setSelectedIcebreaker(null);
            Alert.alert(
              'Insufficient Tokens',
              `You need ${cost} tokens to send this message. Your current balance is ${tokenBalance} tokens.`,
              [
                {
                  text: 'Buy Tokens',
                  onPress: () => setShowPurchaseModal(true),
                },
                {
                  text: 'Cancel',
                  style: 'cancel',
                },
              ]
            );
            return;
          }
        }
      }

      // Create or get existing chat and send message
      const chatId = await getOrCreateChatAndSendMessage(
        user.uid,
        receiverId,
        icebreaker
      );

      // Process transaction if needed
      if (shouldCharge && existingChatId) {
        try {
          const tempMessageId = `msg_${Date.now()}`;
          await processMessageTransaction(
            user.uid,
            receiverId,
            chatId,
            tempMessageId,
            cost
          );
        } catch (txError) {
          console.error('Error processing transaction:', txError);
        }
      }

      // Close modal
      onClose();

      // Navigate to chat
      setTimeout(() => {
        router.push(`/chat/${chatId}` as any);
      }, 100);
    } catch (error) {
      console.error('Error sending icebreaker:', error);
      Alert.alert(
        'Error',
        'Failed to send message. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setSending(false);
      setSelectedIcebreaker(null);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              Send Icebreaker{receiverName ? ` to ${receiverName}` : ''}
            </Text>
            <TouchableOpacity onPress={onClose} disabled={sending}>
              <Text style={styles.closeButton}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.subtitle}>
            Choose a message to start the conversation
          </Text>

          <ScrollView style={styles.icebreakerList}>
            {ICEBREAKERS.map((icebreaker, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.icebreakerItem,
                  selectedIcebreaker === icebreaker && styles.icebreakerItemSelected,
                ]}
                onPress={() => handleSelectIcebreaker(icebreaker)}
                disabled={sending}
                activeOpacity={0.7}
              >
                {sending && selectedIcebreaker === icebreaker ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="small" color="#FF6B6B" />
                    <Text style={styles.icebreakerText}>{icebreaker}</Text>
                  </View>
                ) : (
                  <Text style={styles.icebreakerText}>{icebreaker}</Text>
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>

          {sending && (
            <View style={styles.sendingOverlay}>
              <ActivityIndicator size="large" color="#FF6B6B" />
              <Text style={styles.sendingText}>Sending...</Text>
            </View>
          )}
        </View>

        {/* Token Purchase Modal */}
        <TokenPurchaseModal
          visible={showPurchaseModal}
          onClose={() => setShowPurchaseModal(false)}
          onPurchase={(packId) => {
            console.log('Purchased pack:', packId);
            // Token balance will auto-update via subscription
          }}
          reason="You need more tokens to send an icebreaker"
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
    flex: 1,
  },
  closeButton: {
    fontSize: 28,
    color: '#999',
    paddingLeft: 16,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  icebreakerList: {
    paddingHorizontal: 20,
  },
  icebreakerItem: {
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  icebreakerItemSelected: {
    borderColor: '#FF6B6B',
    backgroundColor: '#fff5f5',
  },
  icebreakerText: {
    fontSize: 15,
    color: '#000',
    lineHeight: 22,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sendingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  sendingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
});
