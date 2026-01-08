/**
 * Onboarding Steps Component
 * Individual step screens for onboarding flow
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ScrollView,
} from 'react-native';

interface OnboardingStepsProps {
  step: string;
  onNext: () => void;
  onComplete: () => void;
}

export default function OnboardingSteps({ step, onNext, onComplete }: OnboardingStepsProps) {
  const renderStep = () => {
    switch (step) {
      case 'photos':
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.stepEmoji}>📸</Text>
            <Text style={styles.stepTitle}>Add Your Best Photos</Text>
            <Text style={styles.stepDescription}>
              Upload at least 4 photos to complete your profile and start matching with others.
            </Text>
            <View style={styles.rewardCard}>
              <Text style={styles.rewardIcon}>🎁</Text>
              <Text style={styles.rewardText}>
                Complete your profile and get rewarded!
              </Text>
            </View>
            <View style={styles.tipBox}>
              <Text style={styles.tipTitle}>💡 Pro Tips:</Text>
              <Text style={styles.tipItem}>• Use high-quality, clear photos</Text>
              <Text style={styles.tipItem}>• Show your face in at least one photo</Text>
              <Text style={styles.tipItem}>• Include photos that show your interests</Text>
              <Text style={styles.tipItem}>• Smile naturally!</Text>
            </View>
          </View>
        );

      case 'preferences':
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.stepEmoji}>💘</Text>
            <Text style={styles.stepTitle}>Set Your Preferences</Text>
            <Text style={styles.stepDescription}>
              Tell us who you're looking for to get better matches.
            </Text>
            <View style={styles.featureList}>
              <View style={styles.featureItem}>
                <Text style={styles.featureIcon}>✓</Text>
                <Text style={styles.featureText}>Age range</Text>
              </View>
              <View style={styles.featureItem}>
                <Text style={styles.featureIcon}>✓</Text>
                <Text style={styles.featureText}>Distance preferences</Text>
              </View>
              <View style={styles.featureItem}>
                <Text style={styles.featureIcon}>✓</Text>
                <Text style={styles.featureText}>Interests & hobbies</Text>
              </View>
              <View style={styles.featureItem}>
                <Text style={styles.featureIcon}>✓</Text>
                <Text style={styles.featureText}>Relationship goals</Text>
              </View>
            </View>
          </View>
        );

      case 'swipe':
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.stepEmoji}>🔥</Text>
            <Text style={styles.stepTitle}>Start Swiping</Text>
            <Text style={styles.stepDescription}>
              Discover amazing people and make connections!
            </Text>
            <View style={styles.swipeGuide}>
              <View style={styles.swipeAction}>
                <Text style={styles.swipeIcon}>👈</Text>
                <Text style={styles.swipeLabel}>Swipe Left to Skip</Text>
              </View>
              <View style={styles.swipeAction}>
                <Text style={styles.swipeIcon}>👉</Text>
                <Text style={styles.swipeLabel}>Swipe Right to Like</Text>
              </View>
              <View style={styles.swipeAction}>
                <Text style={styles.swipeIcon}>👆</Text>
                <Text style={styles.swipeLabel}>Swipe Up for SuperLike</Text>
              </View>
            </View>
            <View style={styles.matchInfo}>
              <Text style={styles.matchText}>
                🎉 When you both like each other, it's a match!
              </Text>
            </View>
          </View>
        );

      case 'earn':
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.stepEmoji}>💎</Text>
            <Text style={styles.stepTitle}>Earn & Upgrade</Text>
            <Text style={styles.stepDescription}>
              Get the most out of Avalo with tokens and premium features.
            </Text>
            <View style={styles.earnOptions}>
              <View style={styles.earnCard}>
                <Text style={styles.earnCardIcon}>👑</Text>
                <Text style={styles.earnCardTitle}>VIP Membership</Text>
                <Text style={styles.earnCardDesc}>
                  Unlimited likes, see who liked you, priority in discovery
                </Text>
              </View>
              <View style={styles.earnCard}>
                <Text style={styles.earnCardIcon}>💫</Text>
                <Text style={styles.earnCardTitle}>Royal Membership</Text>
                <Text style={styles.earnCardDesc}>
                  Ad-free experience, 500 bonus tokens, exclusive features
                </Text>
              </View>
              <View style={styles.earnCard}>
                <Text style={styles.earnCardIcon}>💬</Text>
                <Text style={styles.earnCardTitle}>Earn on Chat</Text>
                <Text style={styles.earnCardDesc}>
                  Get paid for engaging conversations with your matches
                </Text>
              </View>
            </View>
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <ScrollView 
      style={styles.container} 
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {renderStep()}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 20,
  },
  stepContainer: {
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  stepEmoji: {
    fontSize: 80,
    marginBottom: 24,
  },
  stepTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 16,
  },
  stepDescription: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
    paddingHorizontal: 20,
  },
  rewardCard: {
    backgroundColor: '#FFF5E1',
    padding: 20,
    borderRadius: 18,
    alignItems: 'center',
    marginBottom: 24,
    width: '100%',
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  rewardIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  rewardText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  tipBox: {
    backgroundColor: '#F0F9FF',
    padding: 20,
    borderRadius: 18,
    width: '100%',
    borderWidth: 1,
    borderColor: '#B3E5FC',
  },
  tipTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  tipItem: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
    lineHeight: 20,
  },
  featureList: {
    width: '100%',
    gap: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9F9F9',
    padding: 16,
    borderRadius: 18,
  },
  featureIcon: {
    fontSize: 20,
    color: '#4CAF50',
    marginRight: 12,
    fontWeight: 'bold',
  },
  featureText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '600',
  },
  swipeGuide: {
    width: '100%',
    gap: 16,
    marginBottom: 24,
  },
  swipeAction: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9F9F9',
    padding: 20,
    borderRadius: 18,
  },
  swipeIcon: {
    fontSize: 32,
    marginRight: 16,
  },
  swipeLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  matchInfo: {
    backgroundColor: '#F3E5F5',
    padding: 20,
    borderRadius: 18,
    width: '100%',
  },
  matchText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#7B1FA2',
    textAlign: 'center',
  },
  earnOptions: {
    width: '100%',
    gap: 16,
  },
  earnCard: {
    backgroundColor: '#F9F9F9',
    padding: 20,
    borderRadius: 18,
    alignItems: 'center',
  },
  earnCardIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  earnCardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  earnCardDesc: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
});
