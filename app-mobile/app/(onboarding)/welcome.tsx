import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from "@/hooks/useTranslation";

export default function WelcomeScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.logo}>AVALO</Text>
        <Text style={styles.tagline}>Where Chemistry Happens</Text>
        <Text style={styles.headline}>
          This isn't a place for endless swiping.{'\n'}
          It's a place for connection.
        </Text>
        <Text style={styles.description}>
          Someone out there will love your vibe.{'\n'}
          Let's find them.
        </Text>
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.push('/(onboarding)/language')}
        >
          <Text style={styles.primaryButtonText}>Start Your Story</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.push('/(onboarding)/login')}
        >
          <Text style={styles.secondaryButtonText}>I'm Already Here</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0C0714',
    padding: 24,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 40,
  },
  logo: {
    fontSize: 56,
    fontWeight: 'bold',
    color: '#FF3B77',
    marginBottom: 16,
    letterSpacing: 2,
  },
  tagline: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FF3B77',
    marginBottom: 40,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  headline: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 24,
    textAlign: 'center',
    lineHeight: 34,
    paddingHorizontal: 20,
  },
  description: {
    fontSize: 18,
    color: '#E8E8E8',
    textAlign: 'center',
    paddingHorizontal: 30,
    lineHeight: 26,
    fontWeight: '500',
  },
  buttonContainer: {
    gap: 16,
    marginBottom: 50,
    width: '100%',
  },
  primaryButton: {
    backgroundColor: '#FF3B77',
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: '#FF3B77',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 19,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FF3B77',
  },
  secondaryButtonText: {
    color: '#FF3B77',
    fontSize: 19,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});
