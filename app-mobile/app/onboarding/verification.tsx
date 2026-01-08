/**
 * PACK 276 - Selfie Verification Screen (Onboarding Step 4)
 * 
 * User takes a live selfie that is compared against their profile photos:
 * - Match confidence >= 0.75: auto-verified
 * - Match confidence < 0.75: pending manual review
 * - Profile hidden until verified
 */

import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';

export default function VerificationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [selfieUri, setSelfieUri] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<'idle' | 'success' | 'pending'>('idle');

  const handleTakeSelfie = async () => {
    try {
      // Request camera permissions
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please grant camera permissions to take a selfie.');
        return;
      }

      // Launch camera
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [3, 4],
        quality: 0.8,
        cameraType: ImagePicker.CameraType.front,
      });

      if (!result.canceled && result.assets[0]) {
        setSelfieUri(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error taking selfie:', error);
      Alert.alert('Error', 'Failed to take selfie. Please try again.');
    }
  };

  const handleVerify = async () => {
    if (!selfieUri) return;

    setVerifying(true);

    try {
      // TODO: Call verification service
      // For now, simulate verification with mock result
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Mock verification result
      const mockConfidence = 0.82; // > 0.75 threshold
      const threshold = 0.75;

      if (mockConfidence >= threshold) {
        setVerificationStatus('success');
        
        setTimeout(() => {
          // Navigate to completion
          router.push({
            pathname: '/onboarding/complete' as any,
            params: {
              ...params,
              verified: 'true',
            },
          });
        }, 2000);
      } else {
        setVerificationStatus('pending');
        
        Alert.alert(
          'Manual Review Required',
          'Your verification is under review. You will be notified once approved. You can still use the app, but your profile will be hidden until verification is complete.',
          [
            {
              text: 'Continue',
              onPress: () => {
                router.push({
                  pathname: '/onboarding/complete' as any,
                  params: {
                    ...params,
                    verified: 'pending',
                  },
                });
              },
            },
          ]
        );
      }
    } catch (error) {
      console.error('Error verifying selfie:', error);
      Alert.alert('Error', 'Failed to verify selfie. Please try again.');
      setVerificationStatus('idle');
    } finally {
      setVerifying(false);
    }
  };

  const handleRetake = () => {
    setSelfieUri(null);
    setVerificationStatus('idle');
  };

  const handleBack = () => {
    router.back();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Progress indicator */}
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: '80%' }]} />
          </View>
          <Text style={styles.progressText}>Step 4 of 5</Text>
        </View>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Verify your identity</Text>
          <Text style={styles.subtitle}>
            Take a selfie to confirm you match your photos
          </Text>
        </View>

        {/* Info card */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>🛡️ Why verification?</Text>
          <Text style={styles.infoText}>
            Verification helps keep Avalo safe by confirming you're a real person who looks like your photos. Your selfie is compared with your profile photos using AI.
          </Text>
        </View>

        {/* Selfie display or capture button */}
        {selfieUri ? (
          <View style={styles.selfieContainer}>
            <Image source={{ uri: selfieUri }} style={styles.selfieImage} />
            {verificationStatus === 'success' && (
              <View style={styles.successOverlay}>
                <Text style={styles.successIcon}>✓</Text>
                <Text style={styles.successText}>Verified!</Text>
              </View>
            )}
          </View>
        ) : (
          <TouchableOpacity
            style={styles.captureButton}
            onPress={handleTakeSelfie}
            disabled={verifying}
          >
            <Text style={styles.captureIcon}>📸</Text>
            <Text style={styles.captureText}>Take Selfie</Text>
          </TouchableOpacity>
        )}

        {/* Tips */}
        <View style={styles.tipsCard}>
          <Text style={styles.tipsTitle}>Tips for best results:</Text>
          <View style={styles.tipItem}>
            <Text style={styles.tipEmoji}>💡</Text>
            <Text style={styles.tipText}>Good lighting, face the camera</Text>
          </View>
          <View style={styles.tipItem}>
            <Text style={styles.tipEmoji}>😊</Text>
            <Text style={styles.tipText}>Natural expression, no filters</Text>
          </View>
          <View style={styles.tipItem}>
            <Text style={styles.tipEmoji}>👓</Text>
            <Text style={styles.tipText}>Remove sunglasses or masks</Text>
          </View>
        </View>

        {/* Action buttons */}
        <View style={styles.actionButtons}>
          {selfieUri && verificationStatus === 'idle' && (
            <>
              <TouchableOpacity
                style={styles.retakeButton}
                onPress={handleRetake}
                disabled={verifying}
              >
                <Text style={styles.retakeButtonText}>Retake</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.verifyButton}
                onPress={handleVerify}
                disabled={verifying}
              >
                {verifying ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.verifyButtonText}>Verify</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>

        <Text style={styles.privacyNote}>
          Your selfie is used only for verification and stored securely. It won't be shown on your profile.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    flex: 1,
    padding: 24,
  },
  progressContainer: {
    marginBottom: 32,
  },
  progressBar: {
    height: 4,
    backgroundColor: '#E0E0E0',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#FF6B6B',
    borderRadius: 2,
  },
  progressText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
  },
  header: {
    marginBottom: 24,
  },
  backButton: {
    marginBottom: 16,
  },
  backButtonText: {
    fontSize: 16,
    color: '#FF6B6B',
    fontWeight: '600',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    lineHeight: 24,
  },
  infoCard: {
    backgroundColor: '#F0F8FF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderLeftWidth: 4,
    borderLeftColor: '#4ECDC4',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  selfieContainer: {
    width: '100%',
    aspectRatio: 0.75,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 24,
    backgroundColor: '#F8F8F8',
  },
  selfieImage: {
    width: '100%',
    height: '100%',
  },
  successOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(78, 205, 196, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  successIcon: {
    fontSize: 64,
    color: '#FFFFFF',
    marginBottom: 8,
  },
  successText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  captureButton: {
    width: '100%',
    aspectRatio: 0.75,
    borderRadius: 16,
    backgroundColor: '#F8F8F8',
    borderWidth: 2,
    borderColor: '#E0E0E0',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  captureIcon: {
    fontSize: 56,
    marginBottom: 8,
  },
  captureText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
  },
  tipsCard: {
    backgroundColor: '#FFF9E6',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  tipsTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  tipEmoji: {
    fontSize: 16,
    marginRight: 8,
  },
  tipText: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  retakeButton: {
    flex: 1,
    backgroundColor: '#F8F8F8',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  retakeButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  verifyButton: {
    flex: 2,
    backgroundColor: '#FF6B6B',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
  },
  verifyButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  privacyNote: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    lineHeight: 18,
  },
});
