/**
 * FTUX Screen 2: Meet people effortlessly
 * Premium animated hero onboarding
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from "@/hooks/useTranslation";
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width, height } = Dimensions.get('window');

export default function IntroScreen2() {
  const router = useRouter();
  const { t } = useTranslation();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    // Fade and slide in animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleSkip = () => {
    // Don't set onboarding_completed yet - that happens after profile suggestions
    router.replace('/onboarding/quiz' as any);
  };

  const handleContinue = () => {
    router.push('/onboarding/intro-3' as any);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Skip Button */}
      <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
        <Text style={styles.skipText}>{t('ftux.skip')}</Text>
      </TouchableOpacity>

      {/* Pagination Dots */}
      <View style={styles.pagination}>
        <View style={styles.dot} />
        <View style={[styles.dot, styles.dotActive]} />
        <View style={styles.dot} />
        <View style={styles.dot} />
      </View>

      {/* Content */}
      <Animated.View
        style={[
          styles.content,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        {/* Illustration Placeholder */}
        <View style={styles.illustrationContainer}>
          <View style={styles.illustrationPlaceholder}>
            <Text style={styles.illustrationEmoji}>💬</Text>
          </View>
        </View>

        {/* Title */}
        <Text style={styles.title}>{t('ftux.title2')}</Text>

        {/* Subtitle */}
        <Text style={styles.subtitle}>{t('ftux.subtitle2')}</Text>
      </Animated.View>

      {/* CTA Button */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.ctaButton} onPress={handleContinue}>
          <Text style={styles.ctaButtonText}>{t('ftux.continue')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F0F',
  },
  skipButton: {
    position: 'absolute',
    top: 60,
    right: 20,
    zIndex: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  skipText: {
    fontSize: 16,
    color: '#40E0D0',
    fontWeight: '600',
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 70,
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#40E0D0',
    opacity: 0.3,
  },
  dotActive: {
    backgroundColor: '#D4AF37',
    opacity: 1,
    width: 24,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  illustrationContainer: {
    width: width * 0.7,
    height: width * 0.7,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 48,
  },
  illustrationPlaceholder: {
    width: '100%',
    height: '100%',
    borderRadius: 18,
    backgroundColor: 'rgba(64, 224, 208, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(64, 224, 208, 0.3)',
  },
  illustrationEmoji: {
    fontSize: 120,
  },
  title: {
    fontSize: 32,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 18,
    color: '#40E0D0',
    textAlign: 'center',
    lineHeight: 26,
    opacity: 0.9,
  },
  buttonContainer: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  ctaButton: {
    backgroundColor: '#D4AF37',
    paddingVertical: 18,
    paddingHorizontal: 40,
    borderRadius: 18,
    alignItems: 'center',
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  ctaButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0F0F0F',
    letterSpacing: 0.5,
  },
});
