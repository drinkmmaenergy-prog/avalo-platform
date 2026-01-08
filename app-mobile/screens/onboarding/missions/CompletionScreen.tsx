/**
 * PACK 206C — Onboarding Completion Screen
 * Final screen after completing all onboarding missions
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';

export default function CompletionScreen() {
  const navigation = useNavigation();

  const handleEnterApp = () => {
    // Navigate to main app (home/feed)
    navigation.reset({
      index: 0,
      routes: [{ name: 'Home' as never }],
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      <View style={styles.content}>
        <View style={styles.successContainer}>
          <Text style={styles.successEmoji}>🎉</Text>
          <Text style={styles.title}>You're Ready!</Text>
          <Text style={styles.subtitle}>
            Explore freely, flirt freely, and enjoy meeting new people — safely and confidently.
          </Text>
        </View>

        <View style={styles.benefitsContainer}>
          <View style={styles.benefitCard}>
            <Text style={styles.benefitIcon}>✨</Text>
            <Text style={styles.benefitTitle}>Your Profile Shines</Text>
            <Text style={styles.benefitText}>
              Increased visibility to potential matches
            </Text>
          </View>

          <View style={styles.benefitCard}>
            <Text style={styles.benefitIcon}>💫</Text>
            <Text style={styles.benefitTitle}>Ready to Connect</Text>
            <Text style={styles.benefitText}>
              Start meaningful conversations right away
            </Text>
          </View>

          <View style={styles.benefitCard}>
            <Text style={styles.benefitIcon}>🔥</Text>
            <Text style={styles.benefitTitle}>Safe & Confident</Text>
            <Text style={styles.benefitText}>
              All safety features and tools enabled
            </Text>
          </View>
        </View>

        <TouchableOpacity style={styles.enterButton} onPress={handleEnterApp}>
          <Text style={styles.enterButtonText}>Enter Avalo</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
    paddingBottom: 40,
    paddingTop: 60,
  },
  successContainer: {
    alignItems: 'center',
  },
  successEmoji: {
    fontSize: 80,
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 24,
  },
  benefitsContainer: {
    gap: 16,
  },
  benefitCard: {
    backgroundColor: '#1a1a1a',
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#333',
    alignItems: 'center',
  },
  benefitIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  benefitTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  benefitText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  enterButton: {
    backgroundColor: '#FF1744',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  enterButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
});
