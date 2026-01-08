/**
 * Sleep Mode Settings Screen (PACK 228)
 * 
 * Mental cooldown system that protects users from burnout
 * - Pauses social pressure while preserving matches & chemistry
 * - AI suggestions for healthy breaks
 * - Auto-exit options for convenience
 * - Supportive, non-judgmental design
 */

import {
  View,
  Text,
  StyleSheet,
  Switch,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
} from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';

interface SleepModeSuggestion {
  id: string;
  triggerType: string;
  triggerDetails: string;
  dismissed: boolean;
  actioned: boolean;
  createdAt: Date;
}

export default function SleepModeSettingsScreen() {
  const router = useRouter();
  const [sleepModeActive, setSleepModeActive] = useState(false);
  const [autoEndHours, setAutoEndHours] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<SleepModeSuggestion[]>([]);
  const [activatedAt, setActivatedAt] = useState<Date | null>(null);

  useEffect(() => {
    loadSleepModeSettings();
    loadSuggestions();
  }, []);

  const loadSleepModeSettings = async () => {
    try {
      // TODO: Load from Firestore
      // const userId = await getCurrentUserId();
      // const stateDoc = await getDoc(doc(db, 'sleep_mode_states', userId));
      // if (stateDoc.exists()) {
      //   const data = stateDoc.data();
      //   setSleepModeActive(data.isActive || false);
      //   setActivatedAt(data.activatedAt?.toDate() || null);
      // }
      setSleepModeActive(false);
    } catch (error) {
      console.error('Failed to load sleep mode settings:', error);
    }
  };

  const loadSuggestions = async () => {
    try {
      // TODO: Load AI suggestions from Firestore
      // const userId = await getCurrentUserId();
      // const suggestionsSnap = await getDocs(
      //   query(
      //     collection(db, 'sleep_mode_suggestions'),
      //     where('userId', '==', userId),
      //     where('dismissed', '==', false),
      //     where('actioned', '==', false),
      //     orderBy('createdAt', 'desc'),
      //     limit(3)
      //   )
      // );
      // const data = suggestionsSnap.docs.map(doc => ({
      //   id: doc.id,
      //   ...doc.data(),
      // }));
      // setSuggestions(data);
      setSuggestions([]);
    } catch (error) {
      console.error('Failed to load suggestions:', error);
    }
  };

  const toggleSleepMode = async () => {
    if (sleepModeActive) {
      // Deactivate sleep mode
      Alert.alert(
        'Exit Sleep Mode?',
        'You can return to Sleep Mode anytime if you need another break.',
        [
          { text: 'Stay in Sleep Mode', style: 'cancel' },
          { 
            text: 'Exit Sleep Mode', 
            style: 'default',
            onPress: async () => {
              try {
                setLoading(true);
                // TODO: Call Cloud Function to deactivate
                // await deactivateSleepMode({ exitReason: 'manual' });
                
                setSleepModeActive(false);
                setActivatedAt(null);
                
                Alert.alert(
                  '💫 Welcome back',
                  'Continue at your own pace. Your matches and chemistry are preserved.',
                  [{ text: 'Got it' }]
                );
              } catch (error) {
                console.error('Failed to exit sleep mode:', error);
                Alert.alert('Error', 'Failed to exit sleep mode. Please try again.');
              } finally {
                setLoading(false);
              }
            }
          },
        ]
      );
    } else {
      // Activate sleep mode
      setSleepModeActive(true);
      showActivationConfirmation();
    }
  };

  const showActivationConfirmation = () => {
    Alert.alert(
      'Activate Sleep Mode?',
      'This will:\n\n• Hide you from Discovery temporarily\n• Silence push notifications (in-app only)\n• Preserve all your matches and chemistry\n• Protect your romantic momentum\n\nYou can exit anytime.',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => setSleepModeActive(false) },
        { 
          text: 'Activate', 
          style: 'default',
          onPress: async () => {
            try {
              setLoading(true);
              const hours = parseInt(autoEndHours) || null;
              
              // TODO: Call Cloud Function to activate
              // await activateSleepMode({ autoEndHours: hours });
              
              setSleepModeActive(true);
              setActivatedAt(new Date());
              setAutoEndHours('');
              
              Alert.alert(
                '🌙 Sleep Mode Active',
                'Take your time. We\'ll be here when you\'re ready to return.',
                [{ text: 'OK' }]
              );
            } catch (error) {
              console.error('Failed to activate sleep mode:', error);
              Alert.alert('Error', 'Failed to activate sleep mode. Please try again.');
              setSleepModeActive(false);
            } finally {
              setLoading(false);
            }
          }
        },
      ]
    );
  };

  const dismissSuggestion = async (suggestionId: string) => {
    try {
      // TODO: Update Firestore
      // await updateDoc(doc(db, 'sleep_mode_suggestions', suggestionId), {
      //   dismissed: true,
      //   dismissedAt: serverTimestamp(),
      // });
      
      setSuggestions(prev => prev.filter(s => s.id !== suggestionId));
    } catch (error) {
      console.error('Failed to dismiss suggestion:', error);
    }
  };

  const actionSuggestion = async (suggestionId: string) => {
    try {
      // TODO: Update Firestore
      // await updateDoc(doc(db, 'sleep_mode_suggestions', suggestionId), {
      //   actioned: true,
      //   actionedAt: serverTimestamp(),
      // });
      
      setSuggestions(prev => prev.filter(s => s.id !== suggestionId));
      
      // Activate sleep mode
      setSleepModeActive(true);
      showActivationConfirmation();
    } catch (error) {
      console.error('Failed to action suggestion:', error);
    }
  };

  const getSuggestionMessage = (type: string) => {
    switch (type) {
      case 'inactivity':
        return 'We noticed you haven\'t been active lately. A short break might help refresh your energy.';
      case 'anxiety_pattern':
        return 'You\'ve been checking the app frequently without engaging. Consider taking a moment for yourself.';
      case 'sudden_drop':
        return 'Your engagement has changed recently. Sometimes a pause can help restore balance.';
      case 'declined_invitations':
        return 'You\'ve declined several invitations. A break might help you feel more comfortable returning.';
      default:
        return 'Consider taking a healthy break to recharge.';
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Sleep Mode</Text>
        <Text style={styles.subtitle}>Mental Cooldown • Healthy Breaks</Text>
      </View>

      <View style={styles.content}>
        {/* AI Suggestions */}
        {suggestions.length > 0 && !sleepModeActive && (
          <View style={styles.suggestionsCard}>
            <Text style={styles.suggestionsTitle}>💡 Suggestions for You</Text>
            {suggestions.map((suggestion) => (
              <View key={suggestion.id} style={styles.suggestionItem}>
                <Text style={styles.suggestionText}>
                  {getSuggestionMessage(suggestion.triggerType)}
                </Text>
                <View style={styles.suggestionActions}>
                  <TouchableOpacity
                    style={styles.suggestionDismiss}
                    onPress={() => dismissSuggestion(suggestion.id)}
                  >
                    <Text style={styles.suggestionDismissText}>Not now</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.suggestionAction}
                    onPress={() => actionSuggestion(suggestion.id)}
                  >
                    <Text style={styles.suggestionActionText}>Take a break</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Main Toggle */}
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleLabel}>Sleep Mode</Text>
              <Text style={styles.toggleDescription}>
                {sleepModeActive 
                  ? activatedAt 
                    ? `Active since ${activatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                    : 'Currently active'
                  : 'Take a healthy break whenever you need'}
              </Text>
            </View>
            <Switch
              value={sleepModeActive}
              onValueChange={toggleSleepMode}
              disabled={loading}
              trackColor={{ false: '#E0E0E0', true: '#9B59B6' }}
              thumbColor={sleepModeActive ? '#fff' : '#fff'}
            />
          </View>
        </View>

        {/* Auto-End Timer (only when activating) */}
        {!sleepModeActive && (
          <View style={styles.autoEndCard}>
            <Text style={styles.autoEndTitle}>⏰ Auto-End Timer (Optional)</Text>
            <Text style={styles.autoEndDescription}>
              Sleep mode can automatically end after a set time
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Hours (leave empty for manual)"
              value={autoEndHours}
              onChangeText={setAutoEndHours}
              keyboardType="number-pad"
              editable={!loading}
            />
            <Text style={styles.autoEndHint}>
              Leave empty to exit manually, or set 1-72 hours
            </Text>
          </View>
        )}

        {/* Active Sleep Mode Info */}
        {sleepModeActive && (
          <View style={styles.activeCard}>
            <Text style={styles.activeIcon}>🌙</Text>
            <Text style={styles.activeTitle}>Sleep Mode is Active</Text>
            <Text style={styles.activeDescription}>
              You're taking a healthy break. Your profile is hidden from Discovery, but all your matches and chemistry are preserved.
            </Text>
            
            <View style={styles.activeFeatures}>
              <View style={styles.activeFeature}>
                <Text style={styles.activeFeatureIcon}>✓</Text>
                <Text style={styles.activeFeatureText}>Matches preserved</Text>
              </View>
              <View style={styles.activeFeature}>
                <Text style={styles.activeFeatureIcon}>✓</Text>
                <Text style={styles.activeFeatureText}>Chemistry protected</Text>
              </View>
              <View style={styles.activeFeature}>
                <Text style={styles.activeFeatureIcon}>✓</Text>
                <Text style={styles.activeFeatureText}>Messages still received</Text>
              </View>
              <View style={styles.activeFeature}>
                <Text style={styles.activeFeatureIcon}>✓</Text>
                <Text style={styles.activeFeatureText}>Safety systems active</Text>
              </View>
            </View>
          </View>
        )}

        {/* How It Works */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>How Sleep Mode Works</Text>
          
          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>👁️</Text>
            <View style={styles.featureText}>
              <Text style={styles.featureTitle}>Hidden from Discovery</Text>
              <Text style={styles.featureDescription}>
                Your profile won't appear in Discover, Swipe, or Feed temporarily
              </Text>
            </View>
          </View>

          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>💬</Text>
            <View style={styles.featureText}>
              <Text style={styles.featureTitle}>Messages Still Accepted</Text>
              <Text style={styles.featureDescription}>
                Others can still message you, you'll see them when you return
              </Text>
            </View>
          </View>

          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>🔕</Text>
            <View style={styles.featureText}>
              <Text style={styles.featureTitle}>Notifications Silenced</Text>
              <Text style={styles.featureDescription}>
                No push notifications, but messages show in your inbox
              </Text>
            </View>
          </View>

          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>💝</Text>
            <View style={styles.featureText}>
              <Text style={styles.featureTitle}>Chemistry Preserved</Text>
              <Text style={styles.featureDescription}>
                Romantic momentum is paused, not lost. Picks up where you left off
              </Text>
            </View>
          </View>

          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>🛡️</Text>
            <View style={styles.featureText}>
              <Text style={styles.featureTitle}>Safety Always On</Text>
              <Text style={styles.featureDescription}>
                All safety features remain fully active during your break
              </Text>
            </View>
          </View>

          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>💰</Text>
            <View style={styles.featureText}>
              <Text style={styles.featureTitle}>Payments Preserved</Text>
              <Text style={styles.featureDescription}>
                Any paid messages/calls wait for you, no tokens are lost
              </Text>
            </View>
          </View>
        </View>

        {/* Auto-Exit Info */}
        {!sleepModeActive && (
          <View style={styles.noteCard}>
            <Text style={styles.noteTitle}>🔄 Automatic Exit</Text>
            <Text style={styles.noteText}>
              Sleep mode can auto-exit when you:{'\n'}
              • Send a message{'\n'}
              • Schedule a meeting{'\n'}
              • Start a call{'\n'}
              • Open chats 3 times in 24 hours
            </Text>
          </View>
        )}

        {/* Supportive Message */}
        <View style={styles.supportCard}>
          <Text style={styles.supportText}>
            Taking breaks is healthy. Sleep mode protects your wellbeing while keeping your connections safe. Return whenever you're ready.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    backgroundColor: '#fff',
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  backButton: {
    marginBottom: 10,
  },
  backButtonText: {
    fontSize: 16,
    color: '#9B59B6',
    fontWeight: '600',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    color: '#9B59B6',
    fontWeight: '600',
    marginTop: 4,
  },
  content: {
    padding: 20,
  },
  suggestionsCard: {
    backgroundColor: '#F3E5F5',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#9B59B6',
  },
  suggestionsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  suggestionItem: {
    marginBottom: 15,
  },
  suggestionText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 10,
  },
  suggestionActions: {
    flexDirection: 'row',
    gap: 10,
  },
  suggestionDismiss: {
    flex: 1,
    backgroundColor: '#E0E0E0',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
  },
  suggestionDismissText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  suggestionAction: {
    flex: 1,
    backgroundColor: '#9B59B6',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
  },
  suggestionActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  card: {
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
  autoEndCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  autoEndTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  autoEndDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 15,
  },
  input: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 15,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    marginBottom: 8,
  },
  autoEndHint: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
  },
  activeCard: {
    backgroundColor: '#F3E5F5',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#9B59B6',
  },
  activeIcon: {
    fontSize: 48,
    marginBottom: 10,
  },
  activeTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
    textAlign: 'center',
  },
  activeDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 20,
  },
  activeFeatures: {
    width: '100%',
  },
  activeFeature: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  activeFeatureIcon: {
    fontSize: 16,
    color: '#9B59B6',
    marginRight: 10,
    fontWeight: 'bold',
  },
  activeFeatureText: {
    fontSize: 14,
    color: '#666',
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
  },
  featureItem: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  featureIcon: {
    fontSize: 24,
    marginRight: 15,
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  featureDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  noteCard: {
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
    padding: 15,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  noteTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  noteText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  supportCard: {
    backgroundColor: '#FFF3E0',
    borderRadius: 12,
    padding: 15,
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
  },
  supportText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    textAlign: 'center',
  },
});
