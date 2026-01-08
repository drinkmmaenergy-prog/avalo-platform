/**
 * PACK 206C — Onboarding Welcome Screen
 * Initial welcome screen before starting missions
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

export default function WelcomeScreen() {
  const navigation = useNavigation();

  const handleStart = () => {
    navigation.navigate('OnboardingMissionsDay1' as never);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Welcome to Avalo</Text>
          <Text style={styles.subtitle}>
            Let's set up your profile to attract the right connections
          </Text>
        </View>

        <View style={styles.missionPreview}>
          <View style={styles.missionCard}>
            <Text style={styles.missionEmoji}>✨</Text>
            <Text style={styles.missionTitle}>Day 1: Magnetic Profile</Text>
            <Text style={styles.missionDesc}>
              Create an attractive profile that stands out
            </Text>
          </View>

          <View style={styles.missionCard}>
            <Text style={styles.missionEmoji}>💫</Text>
            <Text style={styles.missionTitle}>Day 2: Start the Spark</Text>
            <Text style={styles.missionDesc}>
              Begin meaningful interactions with others
            </Text>
          </View>

          <View style={styles.missionCard}>
            <Text style={styles.missionEmoji}>🔥</Text>
            <Text style={styles.missionTitle}>Day 3: Heat Up the Connection</Text>
            <Text style={styles.missionDesc}>
              Take your connections to the next level
            </Text>
          </View>
        </View>

        <TouchableOpacity style={styles.startButton} onPress={handleStart}>
          <Text style={styles.startButtonText}>Get Started</Text>
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
  },
  header: {
    marginTop: 60,
    alignItems: 'center',
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
  },
  missionPreview: {
    gap: 16,
  },
  missionCard: {
    backgroundColor: '#1a1a1a',
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  missionEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  missionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  missionDesc: {
    fontSize: 14,
    color: '#999',
  },
  startButton: {
    backgroundColor: '#FF1744',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  startButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
});
