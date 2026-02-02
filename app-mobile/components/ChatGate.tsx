/**
 * PACK 3.2 — ChatGate Component
 * 
 * Gating component for chat functionality.
 * - Checks if user has enough tokens to send message
 * - Shows purchase prompt when balance is low
 * - NO token spending logic here - backend handles that
 * 
 * Usage:
 * ```tsx
 * <ChatGate 
 *   requiredTokens={1}
 *   onInsufficientTokens={() => router.push('/wallet')}
 * >
 *   <ChatInput />
 * </ChatGate>
 * ```
 */

import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useWallet } from '../hooks/useWallet';
import { useLocaleContext } from '../contexts/LocaleContext';

interface ChatGateProps {
  children: React.ReactNode;
  requiredTokens?: number;
  recipientEarnEnabled?: boolean;
  isFreeMessage?: boolean;
  onInsufficientTokens?: () => void;
}

/**
 * Gate component that wraps chat UI
 * 
 * The component:
 * 1. Reads balance from useWallet (Firestore subscription)
 * 2. Shows children if balance is sufficient
 * 3. Shows purchase prompt if balance is low
 * 
 * Token SPENDING is handled by backend when message is sent.
 * This component only DISPLAYS the current state.
 */
export function ChatGate({
  children,
  requiredTokens = 1,
  recipientEarnEnabled = false,
  isFreeMessage = false,
  onInsufficientTokens,
}: ChatGateProps) {
  const router = useRouter();
  const { locale } = useLocaleContext();
  const { balance, loading, hasTokens } = useWallet();
  
  // Handle insufficient tokens
  const handleBuyTokens = useCallback(() => {
    if (onInsufficientTokens) {
      onInsufficientTokens();
    } else {
      router.push('/wallet');
    }
  }, [router, onInsufficientTokens]);
  
  // Loading state
  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color="#FF6B6B" />
      </View>
    );
  }
  
  // Free message - no gating needed
  if (isFreeMessage || !recipientEarnEnabled) {
    return <>{children}</>;
  }
  
  // Check if user has enough tokens (READ-ONLY check)
  if (!hasTokens(requiredTokens)) {
    return (
      <View style={styles.gateContainer}>
        <View style={styles.gateCard}>
          <Text style={styles.gateIcon}>💰</Text>
          <Text style={styles.gateTitle}>
            {locale === 'pl' ? 'Niewystarczające tokeny' : 'Insufficient Tokens'}
          </Text>
          <Text style={styles.gateMessage}>
            {locale === 'pl'
              ? `Potrzebujesz ${requiredTokens} tokenów, aby wysłać wiadomość. Masz ${balance}.`
              : `You need ${requiredTokens} tokens to send a message. You have ${balance}.`}
          </Text>
          <TouchableOpacity style={styles.buyButton} onPress={handleBuyTokens}>
            <Text style={styles.buyButtonText}>
              {locale === 'pl' ? 'Kup tokeny' : 'Buy Tokens'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }
  
  // User has enough tokens - render children
  // Actual token spending happens when sendMessage is called on backend
  return (
    <View style={styles.container}>
      {children}
      
      {/* Token cost indicator */}
      {recipientEarnEnabled && (
        <View style={styles.costIndicator}>
          <Text style={styles.costText}>
            💰 {requiredTokens} {locale === 'pl' ? 'token/wiadomość' : 'token/message'}
          </Text>
          <Text style={styles.balanceText}>
            {locale === 'pl' ? 'Saldo:' : 'Balance:'} {balance}
          </Text>
        </View>
      )}
    </View>
  );
}

/**
 * Hook variant for programmatic access
 */
export function useChatGate(recipientEarnEnabled: boolean, requiredTokens: number = 1) {
  const { balance, loading, hasTokens } = useWallet();
  
  return {
    canSend: !recipientEarnEnabled || hasTokens(requiredTokens),
    balance,
    loading,
    requiredTokens: recipientEarnEnabled ? requiredTokens : 0,
  };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f9f9f9',
  },
  gateCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    maxWidth: 320,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  gateIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  gateTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  gateMessage: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  buyButton: {
    backgroundColor: '#FF6B6B',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 25,
  },
  buyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  costIndicator: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#FFF9E6',
    borderTopWidth: 1,
    borderTopColor: '#F0E6D0',
  },
  costText: {
    fontSize: 12,
    color: '#F39C12',
    fontWeight: '500',
  },
  balanceText: {
    fontSize: 12,
    color: '#999',
  },
});

export default ChatGate;
