import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Camera, CameraView } from 'expo-camera';

export default function QRScannerScreen() {
  const router = useRouter();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    requestCameraPermission();
  }, []);

  const requestCameraPermission = async () => {
    const { status } = await Camera.requestCameraPermissionsAsync();
    setHasPermission(status === 'granted');
  };

  const handleBarCodeScanned = async ({ type, data }: { type: string; data: string }) => {
    if (scanned || processing) return;

    setScanned(true);
    setProcessing(true);

    try {
      // TODO: Call Cloud Function to process check-in
      // const result = await processEventCheckIn(data, organizerId);

      // Simulated check-in process
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Parse QR code data
      const qrData = JSON.parse(Buffer.from(data, 'base64').toString('utf-8'));

      Alert.alert(
        'Check-In Successful',
        `Participant checked in!\n\nTicket ID: ${qrData.ticketId.substring(0, 12)}...\n\n` +
        'Proceed with selfie verification?',
        [
          {
            text: 'Report Mismatch',
            style: 'destructive',
            onPress: () => handleMismatch(qrData.ticketId),
          },
          {
            text: 'Continue',
            onPress: () => {
              setScanned(false);
              setProcessing(false);
            },
          },
          {
            text: 'Done',
            onPress: () => router.back(),
          },
        ]
      );
    } catch (error) {
      console.error('Error processing check-in:', error);
      Alert.alert(
        'Check-In Failed',
        'Invalid QR code or check-in error. Please try again.',
        [
          {
            text: 'Try Again',
            onPress: () => {
              setScanned(false);
              setProcessing(false);
            },
          },
        ]
      );
    }
  };

  const handleMismatch = (ticketId: string) => {
    Alert.alert(
      'Report Appearance Mismatch',
      'This will issue a FULL REFUND to the participant (including Avalo\'s 20% fee).\n\n' +
      'The participant will be flagged for safety review.\n\n' +
      'Are you sure?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => {
            setScanned(false);
            setProcessing(false);
          },
        },
        {
          text: 'Confirm Mismatch',
          style: 'destructive',
          onPress: async () => {
            try {
              // TODO: Call Cloud Function to report mismatch
              // await reportMismatchAtEntry(ticketId, organizerId, reason);
              
              Alert.alert(
                'Mismatch Reported',
                'Full refund issued. Participant flagged for review.',
                [
                  {
                    text: 'OK',
                    onPress: () => {
                      setScanned(false);
                      setProcessing(false);
                    },
                  },
                ]
              );
            } catch (error) {
              console.error('Error reporting mismatch:', error);
              Alert.alert('Error', 'Failed to report mismatch');
              setScanned(false);
              setProcessing(false);
            }
          },
        },
      ]
    );
  };

  if (hasPermission === null) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Requesting camera permission...</Text>
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={styles.container}>
        <Text style={styles.permissionText}>
          Camera permission is required to scan QR codes
        </Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestCameraPermission}>
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        facing="back"
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: ['qr'],
        }}
      >
        <View style={styles.overlay}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
              <Text style={styles.backButtonText}>← Back</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.scanArea}>
            <View style={styles.scanFrame}>
              <View style={[styles.corner, styles.cornerTopLeft]} />
              <View style={[styles.corner, styles.cornerTopRight]} />
              <View style={[styles.corner, styles.cornerBottomLeft]} />
              <View style={[styles.corner, styles.cornerBottomRight]} />
            </View>
          </View>

          <View style={styles.instructions}>
            {processing ? (
              <>
                <ActivityIndicator size="large" color="#fff" />
                <Text style={styles.instructionText}>Processing check-in...</Text>
              </>
            ) : (
              <>
                <Text style={styles.instructionTitle}>Scan Ticket QR Code</Text>
                <Text style={styles.instructionText}>
                  Align the QR code within the frame
                </Text>
                <Text style={styles.instructionText}>
                  Selfie verification will follow
                </Text>
              </>
            )}
          </View>
        </View>
      </CameraView>

      {scanned && (
        <View style={styles.scannedOverlay}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    marginTop: 16,
    fontSize: 16,
  },
  permissionText: {
    color: '#fff',
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 40,
  },
  permissionButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  camera: {
    flex: 1,
    width: '100%',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  header: {
    padding: 20,
    paddingTop: 60,
  },
  backButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  scanArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanFrame: {
    width: 280,
    height: 280,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderColor: '#fff',
  },
  cornerTopLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
  },
  cornerTopRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
  },
  cornerBottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
  },
  cornerBottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
  },
  instructions: {
    padding: 32,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    alignItems: 'center',
  },
  instructionTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  instructionText: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 4,
  },
  scannedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
