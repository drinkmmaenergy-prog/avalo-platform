/**
 * QR Scanner Screen
 * Phase 25: Scan QR code to join Safe-Meet session
 * 
 * Note: Requires expo-camera for barcode scanning
 * Install with: npx expo install expo-camera
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { joinSessionByToken } from "@/services/safeMeetService";

// Try to import Camera, provide fallback
let Camera: any;
let CameraType: any;
let BarCodeScanner: any;
let hasCamera = false;

try {
  const cameraModule = require('expo-camera');
  Camera = cameraModule.Camera;
  CameraType = cameraModule.CameraType;
  BarCodeScanner = cameraModule.BarCodeScanner;
  hasCamera = true;
} catch {
  console.log('expo-camera not installed');
}

export default function QRScanner() {
  const router = useRouter();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    requestCameraPermission();
  }, []);

  const requestCameraPermission = async () => {
    if (!hasCamera) {
      setHasPermission(false);
      return;
    }

    try {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    } catch (error) {
      console.error('Error requesting camera permission:', error);
      setHasPermission(false);
    }
  };

  const handleBarCodeScanned = async ({ type, data }: { type: string; data: string }) => {
    if (scanned || processing) return;

    setScanned(true);
    setProcessing(true);

    try {
      // Extract session token from QR data
      // Assume the QR code contains just the session token
      const sessionToken = data.trim();

      if (!sessionToken || sessionToken.length < 8) {
        Alert.alert(
          'Nieprawidłowy kod',
          'Ten kod QR nie jest kodem Safe-Meet',
          [{ text: 'Skanuj ponownie', onPress: () => setScanned(false) }]
        );
        return;
      }

      // Join session
      const result = await joinSessionByToken(sessionToken);

      if (result.success && result.session) {
        Alert.alert(
          'Połączono!',
          'Dołączyłeś do bezpiecznego spotkania',
          [
            {
              text: 'Zobacz szczegóły',
              onPress: () => router.replace(`/safe-meet/session/${result.session!.sessionId}` as any),
            },
          ]
        );
      } else {
        Alert.alert(
          'Błąd',
          result.error || 'Nie udało się dołączyć do spotkania',
          [{ text: 'Skanuj ponownie', onPress: () => setScanned(false) }]
        );
      }
    } catch (error) {
      Alert.alert(
        'Błąd',
        'Wystąpił problem podczas dołączania do spotkania',
        [{ text: 'Spróbuj ponownie', onPress: () => setScanned(false) }]
      );
    } finally {
      setProcessing(false);
    }
  };

  const openSettings = () => {
    Linking.openSettings();
  };

  if (hasPermission === null) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Sprawdzanie uprawnień...</Text>
      </View>
    );
  }

  if (!hasCamera) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="camera-outline" size={64} color="#DC3545" />
        <Text style={styles.errorTitle}>Kamera niedostępna</Text>
        <Text style={styles.errorText}>
          Moduł kamery nie jest zainstalowany.{'\n'}
          Zainstaluj expo-camera, aby korzystać ze skanera QR.
        </Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => router.back()}
        >
          <Text style={styles.buttonText}>Powrót</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="lock-closed" size={64} color="#DC3545" />
        <Text style={styles.errorTitle}>Brak dostępu do kamery</Text>
        <Text style={styles.errorText}>
          Potrzebujemy dostępu do kamery, aby zeskanować kod QR.
        </Text>
        <TouchableOpacity
          style={styles.button}
          onPress={openSettings}
        >
          <Text style={styles.buttonText}>Otwórz ustawienia</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.secondaryButton]}
          onPress={() => router.back()}
        >
          <Text style={[styles.buttonText, styles.secondaryButtonText]}>Powrót</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {!scanned && !processing && (
        <Camera
          style={styles.camera}
          type={CameraType?.back || 'back'}
          onBarCodeScanned={scanned ? undefined : handleBarCodeScanned}
          barCodeScannerSettings={{
            barCodeTypes: [BarCodeScanner?.Constants?.BarCodeType?.qr || 'qr'],
          }}
        >
          <View style={styles.overlay}>
            {/* Top overlay */}
            <View style={styles.topOverlay} />

            {/* Middle with scanning frame */}
            <View style={styles.middleRow}>
              <View style={styles.sideOverlay} />
              <View style={styles.scanFrame}>
                <View style={[styles.corner, styles.topLeft]} />
                <View style={[styles.corner, styles.topRight]} />
                <View style={[styles.corner, styles.bottomLeft]} />
                <View style={[styles.corner, styles.bottomRight]} />
              </View>
              <View style={styles.sideOverlay} />
            </View>

            {/* Bottom overlay with instructions */}
            <View style={styles.bottomOverlay}>
              <View style={styles.instructions}>
                <Ionicons name="qr-code" size={48} color="#FFF" />
                <Text style={styles.instructionTitle}>Zeskanuj kod Safe-Meet</Text>
                <Text style={styles.instructionText}>
                  Wyceluj w kod QR wyświetlony przez drugą osobę
                </Text>
              </View>

              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => router.back()}
              >
                <Text style={styles.cancelButtonText}>Anuluj</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Camera>
      )}

      {processing && (
        <View style={styles.processingOverlay}>
          <View style={styles.processingBox}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.processingText}>Łączenie...</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    padding: 32,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#212529',
    marginTop: 16,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#6C757D',
    marginTop: 12,
    textAlign: 'center',
    lineHeight: 24,
  },
  button: {
    marginTop: 24,
    paddingHorizontal: 32,
    paddingVertical: 14,
    backgroundColor: '#007AFF',
    borderRadius: 12,
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#007AFF',
    marginTop: 12,
  },
  secondaryButtonText: {
    color: '#007AFF',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
  },
  topOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  middleRow: {
    flexDirection: 'row',
    height: 300,
  },
  sideOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  scanFrame: {
    width: 300,
    height: 300,
    backgroundColor: 'transparent',
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderColor: '#FFF',
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
  },
  bottomOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 40,
  },
  instructions: {
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  instructionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFF',
    marginTop: 16,
    textAlign: 'center',
  },
  instructionText: {
    fontSize: 14,
    color: '#FFF',
    marginTop: 8,
    textAlign: 'center',
    opacity: 0.9,
  },
  cancelButton: {
    marginTop: 32,
    paddingHorizontal: 32,
    paddingVertical: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  cancelButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  processingBox: {
    backgroundColor: '#FFF',
    padding: 32,
    borderRadius: 16,
    alignItems: 'center',
    minWidth: 200,
  },
  processingText: {
    marginTop: 16,
    fontSize: 18,
    color: '#212529',
    fontWeight: '600',
  },
});
