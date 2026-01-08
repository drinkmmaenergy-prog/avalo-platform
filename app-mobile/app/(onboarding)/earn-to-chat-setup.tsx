/**
 * Onboarding Monetization Optimization
 * 
 * After initial signup, before Swipe:
 * - Ask "Enable Earn-to-Chat?"
 * - Default ON for women
 * - Default OFF for men
 * - Show micro-tutorial how earnings work
 */

import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  ScrollView,
} from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';

export default function EarnToChatSetupScreen() {
  const router = useRouter();
  const [earnToChatEnabled, setEarnToChatEnabled] = useState(false);
  const [userGender, setUserGender] = useState<'male' | 'female' | 'other'>('female');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      // TODO: Load user gender from Firestore
      // const userId = await getCurrentUserId();
      // const userDoc = await getDoc(doc(db, 'users', userId));
      // const gender = userDoc.data()?.gender || 'female';
      // setUserGender(gender);
      
      // Set default based on gender
      // const defaultEnabled = gender === 'female';
      // setEarnToChatEnabled(defaultEnabled);
      
      // Mock data for now
      setUserGender('female');
      setEarnToChatEnabled(true); // Default ON for women
    } catch (error) {
      console.error('Failed to load user data:', error);
    }
  };

  const handleContinue = async () => {
    try {
      setLoading(true);
      
      // TODO: Save Earn-to-Chat preference to Firestore
      // const userId = await getCurrentUserId();
      // await updateDoc(doc(db, 'users', userId), {
      //   'modes.earnFromChat': earnToChatEnabled,
      //   'onboarding.earnToChatSetupCompleted': true,
      // });
      
      // Navigate to main app
      router.replace('/');
    } catch (error) {
      console.error('Failed to save Earn-to-Chat preference:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>💰</Text>
        </View>

        <Text style={styles.title}>Earn While You Chat</Text>
        
        <Text style={styles.subtitle}>
          Turn your conversations into earnings with Earn-to-Chat
        </Text>

        {/* Toggle Card */}
        <View style={styles.toggleCard}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleLabel}>Enable Earn-to-Chat</Text>
              <Text style={styles.toggleDescription}>
                {earnToChatEnabled ? 'Enabled' : 'Disabled'}
              </Text>
            </View>
            <Switch
              value={earnToChatEnabled}
              onValueChange={setEarnToChatEnabled}
              trackColor={{ false: '#E0E0E0', true: '#4ECDC4' }}
              thumbColor={earnToChatEnabled ? '#fff' : '#fff'}
            />
          </View>

          {userGender === 'female' && (
            <View style={styles.recommendedBadge}>
              <Text style={styles.recommendedText}>✨ Recommended for you</Text>
            </View>
          )}
        </View>

        {/* How It Works */}
        <View style={styles.tutorialCard}>
          <Text style={styles.tutorialTitle}>How It Works</Text>

          <View style={styles.stepItem}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>1</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Enable Earn-to-Chat</Text>
              <Text style={styles.stepDescription}>
                When enabled, others pay to chat with you
              </Text>
            </View>
          </View>

          <View style={styles.stepItem}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>2</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Chat Normally</Text>
              <Text style={styles.stepDescription}>
                Your messages earn tokens automatically (11 words = 1 token)
              </Text>
            </View>
          </View>

          <View style={styles.stepItem}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>3</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Get Paid</Text>
              <Text style={styles.stepDescription}>
                Earn 80% of tokens, withdraw anytime (Avalo keeps 20%)
              </Text>
            </View>
          </View>
        </View>

        {/* Example Earnings */}
        <View style={styles.exampleCard}>
          <Text style={styles.exampleTitle}>💡 Example Earnings</Text>
          
          <View style={styles.exampleRow}>
            <Text style={styles.exampleLabel}>100 words sent</Text>
            <Text style={styles.exampleValue}>≈ 9 tokens earned</Text>
          </View>
          
          <View style={styles.exampleRow}>
            <Text style={styles.exampleLabel}>1,000 words/day</Text>
            <Text style={styles.exampleValue}>≈ 90 tokens/day</Text>
          </View>
          
          <View style={styles.exampleRow}>
            <Text style={styles.exampleLabel}>Monthly potential</Text>
            <Text style={styles.exampleValue}>≈ 2,700 tokens</Text>
          </View>

          <Text style={styles.exampleNote}>
            * Earnings vary based on activity. Royal members get 43% bonus (15 words/token)
          </Text>
        </View>

        {/* Benefits */}
        <View style={styles.benefitsCard}>
          <Text style={styles.benefitsTitle}>Why Enable?</Text>

          <View style={styles.benefitItem}>
            <Text style={styles.benefitIcon}>💵</Text>
            <Text style={styles.benefitText}>
              Monetize your conversations
            </Text>
          </View>

          <View style={styles.benefitItem}>
            <Text style={styles.benefitIcon}>🎯</Text>
            <Text style={styles.benefitText}>
              Attract serious connections (they invest to chat)
            </Text>
          </View>

          <View style={styles.benefitItem}>
            <Text style={styles.benefitIcon}>🔓</Text>
            <Text style={styles.benefitText}>
              Turn off anytime in settings
            </Text>
          </View>

          <View style={styles.benefitItem}>
            <Text style={styles.benefitIcon}>💎</Text>
            <Text style={styles.benefitText}>
              First 3 messages are free (both ways)
            </Text>
          </View>
        </View>

        {/* Action Buttons */}
        <TouchableOpacity
          style={[styles.continueButton, loading && styles.continueButtonDisabled]}
          onPress={handleContinue}
          disabled={loading}
        >
          <Text style={styles.continueButtonText}>
            {earnToChatEnabled ? 'Enable & Continue' : 'Skip & Continue'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.skipButton}
          onPress={() => {
            setEarnToChatEnabled(false);
            handleContinue();
          }}
          disabled={loading}
        >
          <Text style={styles.skipButtonText}>
            I'll decide later
          </Text>
        </TouchableOpacity>

        <Text style={styles.footerNote}>
          You can change this setting anytime in your profile
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  content: {
    padding: 20,
    paddingTop: 60,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  icon: {
    fontSize: 80,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 24,
  },
  toggleCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toggleInfo: {
    flex: 1,
  },
  toggleLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  toggleDescription: {
    fontSize: 14,
    color: '#666',
  },
  recommendedBadge: {
    marginTop: 15,
    backgroundColor: '#FFF9E6',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  recommendedText: {
    fontSize: 14,
    color: '#F39C12',
    fontWeight: '600',
  },
  tutorialCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  tutorialTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
  },
  stepItem: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#4ECDC4',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  stepNumberText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  stepDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  exampleCard: {
    backgroundColor: '#FFF9E6',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#F39C12',
  },
  exampleTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  exampleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  exampleLabel: {
    fontSize: 14,
    color: '#666',
  },
  exampleValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F39C12',
  },
  exampleNote: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
    marginTop: 10,
  },
  benefitsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 30,
  },
  benefitsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  benefitIcon: {
    fontSize: 24,
    marginRight: 15,
  },
  benefitText: {
    flex: 1,
    fontSize: 15,
    color: '#333',
  },
  continueButton: {
    backgroundColor: '#4ECDC4',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 15,
  },
  continueButtonDisabled: {
    opacity: 0.5,
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  skipButton: {
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 20,
  },
  skipButtonText: {
    color: '#999',
    fontSize: 16,
  },
  footerNote: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
