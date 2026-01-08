/**
 * PACK 142 — Liveness Check Screen
 * 
 * User-friendly liveness verification with:
 * - Camera access
 * - Micro-movement prompts
 * - Real-time feedback
 * - Zero shame UX
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Camera, CameraType } from 'expo-camera';
import { Video } from 'expo-av';
import { useRouter } from 'expo-router';
import { httpsCallable } from 'firebase/functions';
import { functions } from "@/lib/firebase";
import { uploadToStorage } from "@/lib/storage";

type LivenessStep = 
  | 'PERMISSION'
  | 'INSTRUCTIONS'
  | 'RECORDING'
  | 'PROCESSING'
  | 'COMPLETE';

export default function LivenessCheckScreen() {
  const router = useRouter();
  const cameraRef = useRef<Camera>(null);
  
  const [step, setStep] = useState<LivenessStep>('PERMISSION');
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [currentPrompt, setCurrentPrompt] = useState('');
  const [loading, setLoading] = useState(false);

  // Request camera permission
  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
      if (status === 'granted') {
        setStep('INSTRUCTIONS');
      }
    })();
  }, []);

  // Create liveness session
  const createSession = async () => {
    try {
      setLoading(true);
      const createLivenessSession = httpsCallable(functions, 'pack142_createLivenessSession');
      const result = await createLivenessSession({
        triggerReason: 'onboarding_verification',
      });
      
      const data = result.data as { sessionId: string };
      setSessionId(data.sessionId);
      setStep('RECORDING');
      startRecording();
    } catch (error) {
      console.error('Failed to create session:', error);
      Alert.alert('Error', 'Failed to start verification. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Start recording with prompts
  const startRecording = async () => {
    if (!cameraRef.current) return;

    try {
      setIsRecording(true);
      
      // Prompt sequence
      const prompts = [
        'Look at the camera',
        'Blink naturally',
        'Turn your head slowly left',
        'Turn your head slowly right',
        'Say "Hello"',
      ];

      // Show prompts one by one
      for (let i = 0; i < prompts.length; i++) {
        setCurrentPrompt(prompts[i]);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Record video
      const video = await cameraRef.current.recordAsync({
        maxDuration: 10,
        quality: '720p',
      });

      setVideoUri(video.uri);
      setIsRecording(false);
      setStep('PROCESSING');
      
      await processVideo(video.uri);
    } catch (error) {
      console.error('Recording failed:', error);
      Alert.alert('Error', 'Recording failed. Please try again.');
      setIsRecording(false);
    }
  };

  // Process and upload video
  const processVideo = async (uri: string) => {
    if (!sessionId) return;

    try {
      setLoading(true);
      
      // Upload video to storage
      const videoUrl = await uploadToStorage(uri, `liveness/${sessionId}.mp4`);
      
      // Submit video for processing
      const uploadVideo = httpsCallable(functions, 'pack142_uploadLivenessVideo');
      await uploadVideo({
        sessionId,
        videoUrl,
        videoDuration: 10,
      });

      // Poll for results
      await pollForResults();
    } catch (error) {
      console.error('Processing failed:', error);
      Alert.alert('Error', 'Processing failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Poll for liveness check results
  const pollForResults = async () => {
    if (!sessionId) return;

    const getSession = httpsCallable(functions, 'pack142_getLivenessSession');
    
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds

    while (attempts < maxAttempts) {
      try {
        const result = await getSession({ sessionId });
        const data = result.data as any;

        if (data.status === 'COMPLETED') {
          setStep('COMPLETE');
          
          if (data.passed) {
            Alert.alert(
              'Verification Complete',
              'Your identity has been verified successfully!',
              [{ text: 'Continue', onPress: () => router.back() }]
            );
          } else {
            Alert.alert(
              'Verification Incomplete',
              'We couldn\'t complete your verification. Please try again or contact support if you need help.',
              [
                { text: 'Try Again', onPress: () => router.reload() },
                { text: 'Contact Support', onPress: () => router.push('/support') },
              ]
            );
          }
          return;
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
      } catch (error) {
        console.error('Failed to poll results:', error);
        break;
      }
    }

    Alert.alert('Timeout', 'Verification is taking longer than expected. Please check back later.');
  };

  if (hasPermission === null) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.text}>Requesting camera permission...</Text>
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Camera Access Required</Text>
        <Text style={styles.text}>
          We need camera access to verify your identity. This helps keep everyone safe on Avalo.
        </Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => Camera.requestCameraPermissionsAsync()}
        >
          <Text style={styles.buttonText}>Grant Access</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (step === 'INSTRUCTIONS') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Quick Identity Verification</Text>
        <Text style={styles.text}>
          To ensure everyone on Avalo is who they say they are, we need to verify your identity.
        </Text>
        <Text style={styles.subtitle}>What to expect:</Text>
        <Text style={styles.bulletPoint}>• Look at the camera</Text>
        <Text style={styles.bulletPoint}>• Follow simple prompts (blink, turn head)</Text>
        <Text style={styles.bulletPoint}>• Say a short phrase</Text>
        <Text style={styles.bulletPoint}>• Takes less than 30 seconds</Text>
        
        <TouchableOpacity
          style={styles.button}
          onPress={createSession}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Start Verification</Text>
          )}
        </TouchableOpacity>
        
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.linkText}>Maybe Later</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (step === 'RECORDING') {
    return (
      <View style={styles.fullScreen}>
        <Camera
          ref={cameraRef}
          style={styles.camera}
          type={CameraType.front}
        />
        
        <View style={styles.overlay}>
          <View style={styles.frame} />
          
          {currentPrompt && (
            <View style={styles.promptContainer}>
              <Text style={styles.promptText}>{currentPrompt}</Text>
            </View>
          )}
          
          {isRecording && (
            <View style={styles.recordingIndicator}>
              <View style={styles.recordingDot} />
              <Text style={styles.recordingText}>Recording...</Text>
            </View>
          )}
        </View>
      </View>
    );
  }

  if (step === 'PROCESSING') {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.title}>Verifying...</Text>
        <Text style={styles.text}>
          We're analyzing your video. This should only take a moment.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#007AFF" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreen: {
    flex: 1,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  frame: {
    width: 280,
    height: 350,
    borderWidth: 3,
    borderColor: '#fff',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 16,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginTop: 20,
    marginBottom: 12,
  },
  text: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 12,
    paddingHorizontal: 20,
  },
  bulletPoint: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
  },
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginTop: 24,
    minWidth: 200,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  linkText: {
    color: '#007AFF',
    fontSize: 16,
    marginTop: 20,
  },
  promptContainer: {
    position: 'absolute',
    top: 100,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  promptText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  recordingIndicator: {
    position: 'absolute',
    top: 40,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 0, 0, 0.7)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#fff',
    marginRight: 8,
  },
  recordingText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
