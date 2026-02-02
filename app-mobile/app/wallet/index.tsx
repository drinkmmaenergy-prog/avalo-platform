/**
 * PACK 3.2 — Wallet Screen (Canonical Integration)
 * 
 * RULES:
 * - Balance is READ-ONLY from Firestore subscription
 * - Transactions are READ-ONLY from Firestore
 * - Token purchase opens Stripe Checkout URL from backend
 * - NO client-side token mutations
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useLocaleContext } from '@/contexts/LocaleContext';
import { useWallet } from '@/hooks/useWallet';
import AnimatedTokenBalance from '@/components/AnimatedTokenBalance';

export default function WalletScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { locale, formatPrice } = useLocaleContext();
  const {
    balance,
    loading,
    error,
    transactions,
    transactionsLoading,
    tokenPacks,
    refreshTransactions,
    purchaseTokens,
  } = useWallet();
  
  const [refreshing, setRefreshing] = useState(false);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  
  // Load transactions on mount
  useEffect(() => {
    if (user?.uid) {
      refreshTransactions();
    }
  }, [user?.uid, refreshTransactions]);
  
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshTransactions();
    setRefreshing(false);
  }, [refreshTransactions]);
  
  const handlePurchase = async (packId: string) => {
    if (!user?.uid) {
      Alert.alert(
        locale === 'pl' ? 'Błąd' : 'Error',
        locale === 'pl' ? 'Zaloguj się, aby kupić tokeny' : 'Sign in to purchase tokens'
      );
      return;
    }
    
    const pack = tokenPacks.find(p => p.id === packId);
    if (!pack) return;
    
    // Confirmation dialog
    Alert.alert(
      locale === 'pl' ? 'Zakup tokenów' : 'Purchase Tokens',
      locale === 'pl'
        ? `Kupić ${pack.tokens} tokenów za ${formatPrice(pack.priceUSD)}?`
        : `Purchase ${pack.tokens} tokens for ${formatPrice(pack.priceUSD)}?`,
      [
        { text: locale === 'pl' ? 'Anuluj' : 'Cancel', style: 'cancel' },
        {
          text: locale === 'pl' ? 'Kup teraz' : 'Buy Now',
          onPress: async () => {
            setPurchasing(packId);
            
            const result = await purchaseTokens(packId);
            
            if (!result.success) {
              Alert.alert(
                locale === 'pl' ? 'Błąd' : 'Error',
                locale === 'pl'
                  ? 'Nie udało się otworzyć płatności. Spróbuj ponownie.'
                  : 'Failed to open payment. Please try again.'
              );
            }
            // If successful, Stripe Checkout opens in browser
            // Balance will update automatically via Firestore subscription
            // after webhook processes the payment
            
            setPurchasing(null);
          },
        },
      ]
    );
  };
  
  if (!user) {
    return (
      <View style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>
            {locale === 'pl' ? 'Zaloguj się, aby uzyskać dostęp do portfela' : 'Please sign in to access your wallet'}
          </Text>
        </View>
      </View>
    );
  }
  
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>← {locale === 'pl' ? 'Wstecz' : 'Back'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{locale === 'pl' ? 'Portfel' : 'Wallet'}</Text>
        <View style={styles.placeholder} />
      </View>
      
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {/* Balance Card (READ-ONLY) */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>
            {locale === 'pl' ? 'Twoje saldo' : 'Your Balance'}
          </Text>
          {loading ? (
            <ActivityIndicator size="large" color="#fff" />
          ) : (
            <AnimatedTokenBalance balance={balance} fontSize={48} color="#fff" />
          )}
          <Text style={styles.balanceUnit}>
            {locale === 'pl' ? 'tokenów' : 'tokens'}
          </Text>
          {error && (
            <Text style={styles.errorBadge}>
              {locale === 'pl' ? 'Błąd synchronizacji' : 'Sync error'}
            </Text>
          )}
        </View>
        
        {/* Token Packs (Stripe Checkout) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            💰 {locale === 'pl' ? 'Kup tokeny' : 'Buy Tokens'}
          </Text>
          
          {tokenPacks.map((pack) => (
            <TouchableOpacity
              key={pack.id}
              style={[styles.packCard, pack.popular && styles.packCardPopular]}
              onPress={() => handlePurchase(pack.id)}
              disabled={purchasing === pack.id}
            >
              {pack.popular && (
                <View style={styles.popularBadge}>
                  <Text style={styles.popularBadgeText}>
                    ⭐ {locale === 'pl' ? 'POPULARNE' : 'POPULAR'}
                  </Text>
                </View>
              )}
              
              <View style={styles.packInfo}>
                <Text style={styles.packName}>{pack.displayName || pack.id}</Text>
                <Text style={styles.packTokens}>
                  {pack.tokens.toLocaleString()} {locale === 'pl' ? 'tokenów' : 'tokens'}
                </Text>
                {pack.bonus && pack.bonus > 0 && (
                  <Text style={styles.packBonus}>
                    +{pack.bonus} BONUS
                  </Text>
                )}
              </View>
              
              <View style={styles.packPricing}>
                {purchasing === pack.id ? (
                  <ActivityIndicator color="#FF6B6B" />
                ) : (
                  <>
                    <Text style={styles.packPrice}>
                      {formatPrice(pack.priceUSD)}
                    </Text>
                    <Text style={styles.packPriceNote}>
                      {locale === 'pl' ? '≈' : '≈'} {pack.basePricePLN.toFixed(2)} PLN
                    </Text>
                  </>
                )}
              </View>
            </TouchableOpacity>
          ))}
          
          <Text style={styles.purchaseNote}>
            💳 {locale === 'pl'
              ? 'Bezpieczne płatności przez Stripe'
              : 'Secure payments via Stripe'}
          </Text>
        </View>
        
        {/* Transaction History (READ-ONLY) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            📜 {locale === 'pl' ? 'Historia transakcji' : 'Transaction History'}
          </Text>
          
          {transactionsLoading ? (
            <ActivityIndicator style={styles.loadingIndicator} />
          ) : transactions.length === 0 ? (
            <Text style={styles.emptyText}>
              {locale === 'pl'
                ? 'Brak transakcji'
                : 'No transactions yet'}
            </Text>
          ) : (
            transactions.slice(0, 10).map((tx) => (
              <View key={tx.id} style={styles.transactionRow}>
                <View style={styles.transactionInfo}>
                  <Text style={styles.transactionDescription}>
                    {tx.description}
                  </Text>
                  <Text style={styles.transactionDate}>
                    {tx.createdAt.toLocaleDateString(locale === 'pl' ? 'pl-PL' : 'en-US')}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.transactionAmount,
                    tx.amount > 0 ? styles.amountPositive : styles.amountNegative,
                  ]}
                >
                  {tx.amount > 0 ? '+' : ''}{tx.amount}
                </Text>
              </View>
            ))
          )}
          
          {transactions.length > 10 && (
            <TouchableOpacity
              style={styles.viewAllButton}
              onPress={() => router.push('/wallet/transactions')}
            >
              <Text style={styles.viewAllText}>
                {locale === 'pl' ? 'Zobacz wszystkie' : 'View all'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
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
    paddingTop: 50,
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
  content: {
    padding: 16,
  },
  balanceCard: {
    backgroundColor: '#FF6B6B',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    marginBottom: 24,
  },
  balanceLabel: {
    color: '#fff',
    fontSize: 14,
    marginBottom: 8,
  },
  balanceUnit: {
    color: '#fff',
    fontSize: 16,
  },
  errorBadge: {
    marginTop: 8,
    color: '#FFCCCC',
    fontSize: 12,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 16,
  },
  packCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    position: 'relative',
  },
  packCardPopular: {
    borderWidth: 2,
    borderColor: '#FF6B6B',
  },
  popularBadge: {
    position: 'absolute',
    top: -8,
    right: 16,
    backgroundColor: '#FF6B6B',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  popularBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  packInfo: {
    flex: 1,
  },
  packName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 2,
  },
  packTokens: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
  },
  packBonus: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginTop: 4,
  },
  packPricing: {
    alignItems: 'flex-end',
  },
  packPrice: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FF6B6B',
  },
  packPriceNote: {
    fontSize: 11,
    color: '#999',
  },
  purchaseNote: {
    fontSize: 11,
    color: '#999',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 8,
  },
  loadingIndicator: {
    marginVertical: 20,
  },
  emptyText: {
    color: '#999',
    textAlign: 'center',
    marginVertical: 20,
  },
  transactionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  transactionInfo: {
    flex: 1,
  },
  transactionDescription: {
    fontSize: 14,
    color: '#333',
  },
  transactionDate: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  amountPositive: {
    color: '#4CAF50',
  },
  amountNegative: {
    color: '#FF6B6B',
  },
  viewAllButton: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 8,
  },
  viewAllText: {
    color: '#FF6B6B',
    fontSize: 14,
    fontWeight: '600',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
});
