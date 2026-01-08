import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { subscribeToTokenBalance } from '../services/tokenService';

export function TokenBadge() {
  const router = useRouter();
  const { user } = useAuth();
  const [balance, setBalance] = useState(0);

  useEffect(() => {
    if (!user?.uid) {
      setBalance(0);
      return;
    }

    const unsubscribe = subscribeToTokenBalance(
      user.uid,
      (newBalance) => {
        setBalance(newBalance);
      },
      (error) => {
        console.error('Error in token balance subscription:', error);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [user?.uid]);

  const handlePress = () => {
    router.push('/wallet' as any);
  };

  return (
    <TouchableOpacity style={styles.container} onPress={handlePress}>
      <Text style={styles.icon}>💰</Text>
      <Text style={styles.balance}>{balance}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#FFF3E0',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FFB74D',
  },
  icon: {
    fontSize: 16,
    marginRight: 4,
  },
  balance: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF6B6B',
  },
});
