/**
 * PACK 306 — Mandatory Identity Verification Screen
 * Main verification gate - blocks all app access until verified
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { auth, db, functions } from "@/lib/firebase";
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Camera } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';

type VerificationStep = 'intro' | 'selfie' | 'photos' | 'processing' | 'complete' | 'failed';

interface VerificationStatus {
  status: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'FAILED' | 'BANNED' | 'BANNED_TEMP' | 'BANNED_PERMANENT';
  attempts: number;
  reasonFailed?: string;
  lastAttemptAt?: Date;
}

export default function VerifyIdentity() {
  const [step, setStep] = useState<VerificationStep>('intro');
  const [loading, setLoading] = useState(true);
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus | null>(null);
  const [selfieData, setSelfieData] = useState<string | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [hasPermission, setHasPermission] = useState(false);

  useEffect(() => {
    loadVerificationStatus();
    requestPermissions();
  }, []);

  const requestPermissions = async () => {
    const { status: cameraStatus } = await Camera.requestCameraPermissionsAsync();
    const { status: mediaStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    setHasPermission(cameraStatus === 'granted' && mediaStatus === 'granted');
  };

  const loadVerificationStatus = async () => {
    if (!auth.currentUser) return;

    const statusRef = doc(
      db,
      'users',
      auth.currentUser.uid,
      'verification',
      'status'
    );

    // Listen for real-time updates
    const unsubscribe = onSnapshot(statusRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        setVerificationStatus(data as VerificationStatus);

        // If already verified, redirect to main app
        if (data.status === 'VERIFIED') {
          router.replace('/(tabs)');
        } else if (data.status === 'BANNED_PERMANENT') {
          setStep('failed');
        } else if (data.status === 'PENDING') {
          setStep('processing');
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  };

  const startVerification = async () => {
    try {
      setLoading(true);
      const startVerificationFn = httpsCallable(functions, 'startVerification');
      await startVerificationFn();
      setStep('selfie');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to start verification');
    } finally {
      setLoading(false);
    }
  };

  const handleSelfieCapture = async (videoBase64: string) => {
    try {
      setLoading(true);
      setSelfieData(videoBase64);

      const verifySelfieFn = httpsCallable(functions, 'verifySelfie');
      const result = await verifySelfieFn({ videoBase64 });

      if (result.data) {
        setStep('photos');
      }
    } catch (error: any) {
      Alert.alert(
        'Verification Failed',
        error.message || 'Selfie verification failed. Please try again.',
        [{ text: 'Retry', onPress: () => setStep('selfie') }]
      );
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoUpload = async () => {
    if (photos.length < 1) {
      Alert.alert('Error', 'Please select at least 1 photo');
      return;
    }

    if (photos.length > 6) {
      Alert.alert('Error', 'Maximum 6 photos allowed');
      return;
    }

    try {
      setLoading(true);
      const verifyPhotosFn = httpsCallable(functions, 'verifyProfilePhotos');
      const result = await verifyPhotosFn({ photosBase64: photos });

      const data = result.data as any;

      if (data.requiresReview) {
        Alert.alert(
          'Manual Review Required',
          data.message,
          [{ text: 'OK', onPress: () => setStep('processing') }]
        );
      } else if (data.verified) {
        setStep('complete');
      }
    } catch (error: any) {
      Alert.alert(
        'Photo Verification Failed',
        error.message || 'One or more photos do not match your selfie.',
        [{ text: 'Retry', onPress: () => setPhotos([]) }]
      );
    } finally {
      setLoading(false);
    }
  };

  const pickPhoto = async () => {
    if (photos.length >= 6) {
      Alert.alert('Limit Reached', 'Maximum 6 photos allowed');
      return;
    }

    const result = await ImagePicker.launchImagePickerAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      setPhotos([...photos, result.assets[0].base64]);
    }
  };

  const removePhoto = (index: number) => {
    setPhotos(photos.filter((_, i) => i !== index));
  };

  const renderIntro = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.title}>Identity Verification Required</Text>
      <Text style={styles.subtitle}>
        To ensure a safe community, all Avalo users must verify their identity.
      </Text>

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>What we'll need:</Text>
        <Text style={styles.infoText}>✓ A live selfie video (3-5 seconds)</Text>
        <Text style={styles.infoText}>✓ 1-6 profile photos with your face</Text>
        <Text style={styles.infoText}>✓ Age verification (18+ only)</Text>
      </View>

      <View style={styles.privacyBox}>
        <Text style={styles.privacyTitle}>Your Privacy</Text>
        <Text style={styles.privacyText}>
          • Your selfie data is encrypted and securely stored{'\n'}
          • We verify your age without storing it{'\n'}
          • Data is retained only as required by law{'\n'}
          • You remain in control of your information
        </Text>
      </View>

      {verificationStatus && verificationStatus.attempts > 0 && (
        <View style={styles.attemptsBox}>
          <Text style={styles.attemptsText}>
            Attempts: {verificationStatus.attempts}/7
          </Text>
          {verificationStatus.reasonFailed && (
            <Text style={styles.failureReason}>
              Previous failure: {verificationStatus.reasonFailed}
            </Text>
          )}
        </View>
      )}

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={startVerification}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Start Verification</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={() => {
          Alert.alert(
            'Cannot Continue',
            'Verification is required to use Avalo. You can delete your account if you wish to discontinue.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete Account', style: 'destructive' },
            ]
          );
        }}
      >
        <Text style={styles.secondaryButtonText}>I don't want to verify</Text>
      </TouchableOpacity>
    </View>
  );

  const renderSelfie = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.title}>Record Your Selfie</Text>
      <Text style={styles.subtitle}>
        Record a 3-5 second video of your face. Move your head slightly to prove you're real.
      </Text>

      <View style={styles.instructionsBox}>
        <Text style={styles.instructionTitle}>Tips for success:</Text>
        <Text style={styles.instructionText}>• Ensure good lighting</Text>
        <Text style={styles.instructionText}>• Remove glasses and hats</Text>
        <Text style={styles.instructionText}>• Look directly at camera</Text>
        <Text style={styles.instructionText}>• Move your head slowly</Text>
      </View>

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={() => router.push('/identity/liveness-check')}
      >
        <Text style={styles.buttonText}>Open Camera</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={() => setStep('intro')}
      >
        <Text style={styles.secondaryButtonText}>Go Back</Text>
      </TouchableOpacity>
    </View>
  );

  const renderPhotos = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.title}>Upload Profile Photos</Text>
      <Text style={styles.subtitle}>
        Upload 1-6 photos that clearly show your face.{'\n'}
        These must match your selfie video.
      </Text>

      <View style={styles.photosGrid}>
        {photos.map((photo, index) => (
          <View key={index} style={styles.photoPreview}>
            <Image
              source={{ uri: `data:image/jpeg;base64,${photo}` }}
              style={styles.photoImage}
            />
            <TouchableOpacity
              style={styles.removePhotoButton}
              onPress={() => removePhoto(index)}
            >
              <Text style={styles.removePhotoText}>✕</Text>
            </TouchableOpacity>
          </View>
        ))}

        {photos.length < 6 && (
          <TouchableOpacity
            style={styles.addPhotoButton}
            onPress={pickPhoto}
          >
            <Text style={styles.addPhotoText}>+</Text>
            <Text style={styles.addPhotoLabel}>Add Photo</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.warningBox}>
        <Text style={styles.warningText}>
          ⚠️ All photos must show YOUR face clearly.{'\n'}
          Photos that don't match your selfie will be rejected.
        </Text>
      </View>

      <TouchableOpacity
        style={[
          styles.primaryButton,
          photos.length === 0 && styles.buttonDisabled,
        ]}
        onPress={handlePhotoUpload}
        disabled={photos.length === 0 || loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>
            Verify Photos ({photos.length})
          </Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={() => setStep('selfie')}
      >
        <Text style={styles.secondaryButtonText}>Back to Selfie</Text>
      </TouchableOpacity>
    </View>
  );

  const renderProcessing = () => (
    <View style={styles.stepContainer}>
      <ActivityIndicator size="large" color="#FF3366" />
      <Text style={styles.title}>Verifying Your Identity</Text>
      <Text style={styles.subtitle}>
        Our AI is checking your verification data.{'\n'}
        This usually takes a few seconds...
      </Text>

      {verificationStatus?.status === 'PENDING' && (
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            Your submission is pending manual review.{'\n'}
            This can take up to 24 hours.
          </Text>
        </View>
      )}
    </View>
  );

  const renderComplete = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.successIcon}>✓</Text>
      <Text style={styles.title}>Verification Complete!</Text>
      <Text style={styles.subtitle}>
        Welcome to Avalo! You now have full access to the app.
      </Text>

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={() => router.replace('/(tabs)')}
      >
        <Text style={styles.buttonText}>Continue to App</Text>
      </TouchableOpacity>
    </View>
  );

  const renderFailed = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.failureIcon}>✕</Text>
      <Text style={styles.title}>Verification Failed</Text>
      <Text style={styles.subtitle}>
        {verificationStatus?.reasonFailed || 'Unable to verify your identity.'}
      </Text>

      {verificationStatus?.status === 'BANNED_PERMANENT' ? (
        <>
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>
              Your account has been permanently banned from verification due to multiple failed attempts.
            </Text>
          </View>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => {
              Alert.alert(
                'Contact Support',
                'Please contact support@avalo.app for assistance.'
              );
            }}
          >
            <Text style={styles.secondaryButtonText}>Contact Support</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>
              Attempts remaining: {7 - (verificationStatus?.attempts || 0)}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => {
              setStep('intro');
              setPhotos([]);
              setSelfieData(null);
            }}
          >
            <Text style={styles.buttonText}>Try Again</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );

  if (loading && !verificationStatus) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color="#FF3366" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {step === 'intro' && renderIntro()}
        {step === 'selfie' && renderSelfie()}
        {step === 'photos' && renderPhotos()}
        {step === 'processing' && renderProcessing()}
        {step === 'complete' && renderComplete()}
        {step === 'failed' && renderFailed()}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
  },
  stepContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 30,
    paddingHorizontal: 20,
  },
  infoBox: {
    backgroundColor: '#f8f9fa',
    padding: 20,
    borderRadius: 12,
    marginBottom: 20,
    width: '100%',
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 10,
  },
  infoText: {
    fontSize: 15,
    color: '#444',
    marginBottom: 8,
  },
  privacyBox: {
    backgroundColor: '#e3f2fd',
    padding: 20,
    borderRadius: 12,
    marginBottom: 30,
    width: '100%',
  },
  privacyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1976d2',
    marginBottom: 10,
  },
  privacyText: {
    fontSize: 14,
    color: '#0d47a1',
    lineHeight: 20,
  },
  attemptsBox: {
    backgroundColor: '#fff3cd',
    padding: 15,
    borderRadius: 12,
    marginBottom: 20,
    width: '100%',
  },
  attemptsText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#856404',
  },
  failureReason: {
    fontSize: 13,
    color: '#856404',
    marginTop: 5,
  },
  instructionsBox: {
    backgroundColor: '#f8f9fa',
    padding: 20,
    borderRadius: 12,
    marginBottom: 30,
    width: '100%',
  },
  instructionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 10,
  },
  instructionText: {
    fontSize: 14,
    color: '#444',
    marginBottom: 6,
  },
  photosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    width: '100%',
    marginBottom: 20,
  },
  photoPreview: {
    width: '30%',
    aspectRatio: 0.75,
    margin: '1.5%',
    borderRadius: 8,
    overflow: 'hidden',
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  removePhotoButton: {
    position: 'absolute',
    top: 5,
    right: 5,
    backgroundColor: 'rgba(0,0,0,0.6)',
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removePhotoText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  addPhotoButton: {
    width: '30%',
    aspectRatio: 0.75,
    margin: '1.5%',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#ddd',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  addPhotoText: {
    fontSize: 36,
    color: '#999',
  },
  addPhotoLabel: {
    fontSize: 12,
    color: '#999',
    marginTop: 5,
  },
  warningBox: {
    backgroundColor: '#fff3cd',
    padding: 15,
    borderRadius: 12,
    marginBottom: 20,
    width: '100%',
  },
  warningText: {
    fontSize: 13,
    color: '#856404',
    textAlign: 'center',
  },
  errorBox: {
    backgroundColor: '#f8d7da',
    padding: 20,
    borderRadius: 12,
    marginBottom: 20,
    width: '100%',
  },
  errorText: {
    fontSize: 14,
    color: '#721c24',
    textAlign: 'center',
  },
  primaryButton: {
    backgroundColor: '#FF3366',
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 25,
    marginBottom: 15,
    width: '100%',
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  secondaryButtonText: {
    color: '#666',
    fontSize: 14,
  },
  successIcon: {
    fontSize: 80,
    color: '#4caf50',
    marginBottom: 20,
  },
  failureIcon: {
    fontSize: 80,
    color: '#f44336',
    marginBottom: 20,
  },
});
