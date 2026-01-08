/**
 * Profile Screen
 * User profile management and settings
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from "@/contexts/AuthContext";
import { purchaseBoost, hasActiveBoost, getActiveBoost, getRemainingBoostTime } from "@/services/boostService";
import { getTokenBalance } from "@/services/tokenService";
import { DISCOVERY_CONFIG } from "@/config/monetization";
import { TokenPurchaseModal } from "@/components/TokenPurchaseModal";
import MiniAnalyticsDashboard from "@/components/MiniAnalyticsDashboard";

export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [tokenBalance, setTokenBalance] = useState(0);
  const [isBoosted, setIsBoosted] = useState(false);
  const [boostTimeRemaining, setBoostTimeRemaining] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showTokenModal, setShowTokenModal] = useState(false);

  useEffect(() => {
    if (user?.uid) {
      loadData();
      // Refresh boost status every minute
      const interval = setInterval(loadData, 60000);
      return () => clearInterval(interval);
    }
  }, [user?.uid]);

  const loadData = async () => {
    if (!user?.uid) return;
    
    try {
      const [balance, boosted] = await Promise.all([
        getTokenBalance(user.uid),
        hasActiveBoost(user.uid),
      ]);
      
      setTokenBalance(balance);
      setIsBoosted(boosted);
      
      if (boosted) {
        const remainingTime = await getRemainingBoostTime(user.uid);
        setBoostTimeRemaining(remainingTime);
      } else {
        setBoostTimeRemaining(0);
      }
    } catch (error) {
      console.error('Error loading profile data:', error);
    }
  };

  const handleBoost = async () => {
    if (!user?.uid) return;

    if (isBoosted) {
      Alert.alert('Boost aktywny', `Twój profil jest już wzmocniony przez kolejne ${boostTimeRemaining} minut.`);
      return;
    }

    const boostCost = DISCOVERY_CONFIG.BOOST_COST;
    
    if (tokenBalance < boostCost) {
      Alert.alert(
        'Brakuje tokenów',
        `Potrzebujesz ${boostCost} tokenów, aby wzmocnić profil. Czy chcesz kupić tokeny?`,
        [
          { text: 'Anuluj', style: 'cancel' },
          { text: 'Kup tokeny', onPress: () => setShowTokenModal(true) },
        ]
      );
      return;
    }

    Alert.alert(
      'Wzmocnij swój profil',
      `Wzmocnij profil na ${DISCOVERY_CONFIG.BOOST_DURATION_MINUTES} minut?\n\nKoszt: ${boostCost} tokenów\n\nTwój profil otrzyma ${DISCOVERY_CONFIG.BOOST_MULTIPLIER}x priorytet w odkrywaniu!`,
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Wzmocnij teraz',
          onPress: async () => {
            setLoading(true);
            try {
              const result = await purchaseBoost(user.uid);
              
              if (result.success) {
                await loadData();
                Alert.alert(
                  'Boost aktywowany! 🚀',
                  `Twój profil jest teraz wzmocniony do ${result.expiresAt?.toLocaleTimeString()}!`
                );
              } else {
                if (result.error === 'BOOST_ALREADY_ACTIVE') {
                  Alert.alert('Już wzmocniony', 'Twój profil jest już wzmocniony!');
                } else if (result.error === 'INSUFFICIENT_TOKENS') {
                  setShowTokenModal(true);
                } else {
                  Alert.alert('Błąd', 'Nie udało się aktywować boost. Spróbuj ponownie.');
                }
              }
            } catch (error) {
              console.error('Error activating boost:', error);
              Alert.alert('Błąd', 'Nie udało się aktywować boost. Spróbuj ponownie.');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const accountToolsItems = [
    {
      title: 'Wallet',
      subtitle: 'Manage your tokens & purchases',
      icon: '💎',
      onPress: () => router.push('/(tabs)/wallet' as any),
    },
    {
      title: '🎁 Rewards Hub',
      subtitle: 'Activate welcome bonuses',
      icon: '🎁',
      onPress: () => router.push('/rewards' as any),
    },
    {
      title: 'Invite Friends',
      subtitle: 'Invite friends & earn cosmetic rewards',
      icon: '🎯',
      onPress: () => router.push('/referrals' as any),
    },
    {
      title: 'Historia połączeń',
      subtitle: 'View your call history',
      icon: '📞',
      onPress: () => router.push('/profile/call-history' as any),
    },
    {
      title: 'Dating Preferences',
      subtitle: 'Set your match preferences',
      icon: '💘',
      onPress: () => router.push('/(tabs)/dating-preferences' as any),
    },
    {
      title: 'Swipe Icebreakers',
      subtitle: 'Customize your opening messages',
      icon: '💬',
      onPress: () => router.push('/settings/swipe-icebreakers' as any),
    },
    {
      title: 'Calendar',
      subtitle: 'Schedule & manage meetings',
      icon: '📅',
      onPress: () => router.push('/(tabs)/calendar' as any),
    },
    {
      title: 'Safe-Meet',
      subtitle: 'Bezpieczne spotkania z QR',
      icon: '🛡️',
      onPress: () => router.push('/safe-meet' as any),
    },
    {
      title: 'Settings',
      subtitle: 'App settings & preferences',
      icon: '⚙️',
      onPress: () => router.push('/(tabs)/profile/settings' as any),
    },
  ];

  const earningsMonetizationItems = [
    {
      title: 'Creator Marketplace',
      subtitle: 'Discover creators & earn opportunities',
      icon: '🛍️',
      onPress: () => router.push('/creator/marketplace' as any),
    },
    {
      title: 'My Earnings',
      subtitle: 'View your earnings dashboard',
      icon: '💰',
      onPress: () => router.push('/creator/my-earnings' as any),
    },
    {
      title: 'Creator Academy',
      subtitle: 'Learn how to maximize earnings',
      icon: '🎓',
      onPress: () => router.push('/creator/academy' as any),
    },
    {
      title: 'Creator Dashboard',
      subtitle: 'Track your performance & earnings',
      icon: '📊',
      onPress: () => router.push('/creator/dashboard' as any),
    },
    {
      title: 'Payout Settings',
      subtitle: 'Manage earnings & withdrawals',
      icon: '💸',
      onPress: () => router.push('/(tabs)/payout' as any),
    },
    {
      title: 'Cele zarobkowe',
      subtitle: 'Twórz cele i zbieraj wsparcie',
      icon: '🎯',
      onPress: () => router.push('/creator/goals' as any),
    },
    {
      title: 'Drops',
      subtitle: 'Exclusive content & rewards',
      icon: '🎁',
      onPress: () => {
        // TODO: Implement drops screen
        Alert.alert('Coming Soon', 'Drops feature is coming soon!');
      },
    },
    {
      title: 'Missions',
      subtitle: 'Complete tasks & earn rewards',
      icon: '🎯',
      onPress: () => {
        // TODO: Implement missions screen
        Alert.alert('Coming Soon', 'Missions feature is coming soon!');
      },
    },
    {
      title: 'Boost Hub',
      subtitle: 'Upgrade & earn more tokens',
      icon: '🚀',
      onPress: () => router.push('/boost-hub' as any),
    },
  ];

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
        <Text style={styles.headerSubtitle}>{user?.email || 'Not logged in'}</Text>
      </View>

      {/* Boost Section */}
      <View style={styles.boostSection}>
        <View style={styles.boostHeader}>
          <View>
            <Text style={styles.boostTitle}>🚀 Boost Your Profile</Text>
            <Text style={styles.boostSubtitle}>
              Get {DISCOVERY_CONFIG.BOOST_MULTIPLIER}x more visibility for {DISCOVERY_CONFIG.BOOST_DURATION_MINUTES} minutes
            </Text>
          </View>
          <Text style={styles.tokenBalance}>💰 {tokenBalance}</Text>
        </View>
        
        {isBoosted ? (
          <View style={styles.boostActiveContainer}>
            <Text style={styles.boostActiveText}>
              ✨ Boost Active: {boostTimeRemaining} minutes remaining
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.boostButton}
            onPress={handleBoost}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.boostButtonText}>Boost Now</Text>
                <Text style={styles.boostCost}>{DISCOVERY_CONFIG.BOOST_COST} tokens</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Analytics Dashboard */}
      {user?.uid && (
        <View style={styles.analyticsContainer}>
          <MiniAnalyticsDashboard userId={user.uid} />
        </View>
      )}

      {/* Account & Tools Section */}
      <View style={styles.sectionContainer}>
        <Text style={styles.sectionHeader}>Account & Tools</Text>
        <View style={styles.menuSection}>
          {accountToolsItems.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={styles.menuItem}
              onPress={item.onPress}
            >
              <View style={styles.menuItemLeft}>
                <Text style={styles.menuIcon}>{item.icon}</Text>
                <View>
                  <Text style={styles.menuTitle}>{item.title}</Text>
                  <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
                </View>
              </View>
              <Text style={styles.menuArrow}>›</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Earnings & Monetization Section */}
      <View style={styles.sectionContainer}>
        <Text style={styles.sectionHeader}>Earnings & Monetization</Text>
        <View style={styles.menuSection}>
          {earningsMonetizationItems.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={styles.menuItem}
              onPress={item.onPress}
            >
              <View style={styles.menuItemLeft}>
                <Text style={styles.menuIcon}>{item.icon}</Text>
                <View>
                  <Text style={styles.menuTitle}>{item.title}</Text>
                  <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
                </View>
              </View>
              <Text style={styles.menuArrow}>›</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <TouchableOpacity style={styles.signOutButton} onPress={signOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>

      {/* Token Purchase Modal */}
      <TokenPurchaseModal
        visible={showTokenModal}
        onClose={() => {
          setShowTokenModal(false);
          loadData();
        }}
        reason={`You need ${DISCOVERY_CONFIG.BOOST_COST} tokens to boost your profile`}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9F9F9',
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#666',
  },
  boostSection: {
    margin: 16,
    padding: 20,
    backgroundColor: '#fff',
    borderRadius: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  boostHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  boostTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  boostSubtitle: {
    fontSize: 14,
    color: '#666',
    maxWidth: 220,
  },
  tokenBalance: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF6B6B',
  },
  boostButton: {
    backgroundColor: '#40E0D0',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 18,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  boostButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  boostCost: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.9,
  },
  boostActiveContainer: {
    backgroundColor: '#E8F5E9',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  boostActiveText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2E7D32',
    textAlign: 'center',
  },
  sectionContainer: {
    marginTop: 24,
  },
  sectionHeader: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
    marginLeft: 20,
  },
  menuSection: {
    backgroundColor: '#fff',
    borderRadius: 18,
    marginHorizontal: 16,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  menuIcon: {
    fontSize: 28,
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  menuSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  menuArrow: {
    fontSize: 28,
    color: '#CCC',
  },
  signOutButton: {
    margin: 20,
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FF6B6B',
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF6B6B',
  },
  analyticsContainer: {
    paddingHorizontal: 16,
  },
});

