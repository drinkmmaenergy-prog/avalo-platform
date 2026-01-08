/**
 * PACK 207: Platform Introduction Screen
 * Mandatory messaging about Avalo's dating & social lifestyle identity
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { BrandIdentity } from "@/constants/BrandIdentity";

export default function PlatformIntroScreen() {
  const router = useRouter();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  const handleContinue = () => {
    router.push('/onboarding/intro' as any);
  };

  return (
    <SafeAreaView style={styles.container}>
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.logo}>✨ Avalo</Text>
            <Text style={styles.tagline}>Premium Dating & Social Lifestyle</Text>
          </View>

          {/* PACK 207 Mandatory Message */}
          <View style={styles.mainCard}>
            <Text style={styles.cardTitle}>Welcome to Avalo</Text>
            <Text style={styles.cardDescription}>
              {BrandIdentity.coreMessage}
            </Text>
          </View>

          {/* What's Allowed */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>✓ What's Welcome</Text>
            {BrandIdentity.allowed.map((item, index) => (
              <View key={index} style={styles.listItem}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.listText}>{item}</Text>
              </View>
            ))}
          </View>

          {/* What's Prohibited */}
          <View style={styles.section}>
            <Text style={styles.sectionTitleProhibited}>✗ What's Prohibited</Text>
            {BrandIdentity.forbidden.map((item, index) => (
              <View key={index} style={styles.listItem}>
                <Text style={styles.bulletProhibited}>•</Text>
                <Text style={styles.listTextProhibited}>{item}</Text>
              </View>
            ))}
          </View>

          {/* Safety Notice */}
          <View style={styles.safetyCard}>
            <Text style={styles.safetyTitle}>🔒 Your Safety Matters</Text>
            <Text style={styles.safetyText}>
              {BrandIdentity.safetyMessage}
            </Text>
            <Text style={styles.safetySubText}>
              Age 18+ with identity verification is required.
            </Text>
          </View>
        </ScrollView>

        {/* CTA Button */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.ctaButton} onPress={handleContinue}>
            <Text style={styles.ctaButtonText}>I Understand</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0C0714',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 100,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
    marginTop: 20,
  },
  logo: {
    fontSize: 48,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  tagline: {
    fontSize: 16,
    color: '#A62EFF',
    fontWeight: '600',
  },
  mainCard: {
    backgroundColor: 'rgba(166, 46, 255, 0.1)',
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(166, 46, 255, 0.3)',
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  cardDescription: {
    fontSize: 16,
    color: '#FFFFFF',
    lineHeight: 24,
    opacity: 0.9,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#4ECDC4',
    marginBottom: 12,
  },
  sectionTitleProhibited: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FF6B6B',
    marginBottom: 12,
  },
  listItem: {
    flexDirection: 'row',
    marginBottom: 8,
    paddingLeft: 8,
  },
  bullet: {
    fontSize: 16,
    color: '#4ECDC4',
    marginRight: 12,
    fontWeight: '700',
  },
  bulletProhibited: {
    fontSize: 16,
    color: '#FF6B6B',
    marginRight: 12,
    fontWeight: '700',
  },
  listText: {
    fontSize: 16,
    color: '#FFFFFF',
    flex: 1,
    lineHeight: 22,
  },
  listTextProhibited: {
    fontSize: 16,
    color: '#FFB8B8',
    flex: 1,
    lineHeight: 22,
  },
  safetyCard: {
    backgroundColor: 'rgba(78, 205, 196, 0.1)',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(78, 205, 196, 0.3)',
  },
  safetyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#4ECDC4',
    marginBottom: 12,
  },
  safetyText: {
    fontSize: 15,
    color: '#FFFFFF',
    lineHeight: 22,
    marginBottom: 8,
  },
  safetySubText: {
    fontSize: 14,
    color: '#B8B8B8',
    lineHeight: 20,
    fontStyle: 'italic',
  },
  buttonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 24,
    backgroundColor: '#0C0714',
    borderTopWidth: 1,
    borderTopColor: 'rgba(166, 46, 255, 0.2)',
  },
  ctaButton: {
    backgroundColor: '#A62EFF',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#A62EFF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  ctaButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
});
