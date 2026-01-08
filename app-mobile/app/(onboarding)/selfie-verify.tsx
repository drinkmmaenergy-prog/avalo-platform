import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';

export default function SelfieVerifyScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleSkip = () => {
    router.push('/(onboarding)/profile-setup' as any);
  };

  const handleTakePhoto = () => {
    // TODO: Implement camera functionality
    // For now, redirect to profile setup
    router.push('/(onboarding)/profile-setup' as any);
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>📸</Text>
        </View>
        
        <Text style={styles.title}>Let's Make You Stand Out</Text>
        <Text style={styles.subtitle}>
          Quick selfie check — verified profiles get 3x more attention
        </Text>

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>Why you'll love this:</Text>
          <Text style={styles.infoText}>✨ Instant credibility boost</Text>
          <Text style={styles.infoText}>🔥 Stand out from the crowd</Text>
          <Text style={styles.infoText}>💎 Premium-level trust</Text>
        </View>
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity 
          style={styles.primaryButton}
          onPress={handleTakePhoto}
        >
          <Text style={styles.primaryButtonText}>Let's Do This</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.secondaryButton}
          onPress={handleSkip}
        >
          <Text style={styles.secondaryButtonText}>Skip for Now</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0C0714',
    padding: 20,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#2A1A1F',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
  },
  icon: {
    fontSize: 64,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 15,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 17,
    color: '#E8E8E8',
    textAlign: 'center',
    paddingHorizontal: 20,
    marginBottom: 30,
    fontWeight: '500',
    lineHeight: 24,
  },
  infoBox: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FF3B77',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 15,
    color: '#E8E8E8',
    marginBottom: 8,
    fontWeight: '500',
  },
  buttonContainer: {
    gap: 15,
    marginBottom: 40,
  },
  primaryButton: {
    backgroundColor: '#FF3B77',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#B8B8B8',
    fontSize: 18,
    fontWeight: '600',
  },
});
