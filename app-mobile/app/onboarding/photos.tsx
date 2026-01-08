/**
 * PACK 276 - Photo Upload Screen (Onboarding Step 3)
 * 
 * Critical photo upload rules:
 * - Slots 1-6: MUST be real face photos (no AI, no pets, no objects)
 * - Slots 7-10: Can be lifestyle, AI avatars, etc.
 * - Minimum 1 face photo required to continue
 * - AI detection runs on each upload
 */

import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { ProfilePhoto } from "@/types/profile";
import { validatePhotoSlot, detectAI, detectFace } from "@/lib/profile-utils";

export default function PhotoUploadScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [photos, setPhotos] = useState<ProfilePhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadingSlot, setUploadingSlot] = useState<number | null>(null);

  const photoSlots = Array.from({ length: 10 }, (_, i) => i + 1);

  const handlePickImage = async (slot: number) => {
    try {
      // Request permissions
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please grant camera roll permissions to upload photos.');
        return;
      }

      // Pick image
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 5],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        await processImage(slot, result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image. Please try again.');
    }
  };

  const processImage = async (slot: number, imageUri: string) => {
    setUploading(true);
    setUploadingSlot(slot);

    try {
      // Run AI detection
      const aiResult = await detectAI(imageUri);
      const faceResult = await detectFace(imageUri);

      // Determine photo type based on slot
      const photoType = slot >= 1 && slot <= 6 ? 'face' : 'lifestyle';

      // Validate slot rules
      const validation = validatePhotoSlot(
        slot,
        photoType,
        aiResult.isAI,
        faceResult.hasFace
      );

      if (!validation.valid) {
        Alert.alert('Photo not allowed', validation.reason || 'This photo cannot be used in this slot.');
        return;
      }

      // Create photo object
      const newPhoto: ProfilePhoto = {
        url: imageUri,
        order: slot,
        type: photoType,
        uploadedAt: new Date().toISOString(),
        aiDetected: aiResult.isAI,
        faceDetected: faceResult.hasFace,
      };

      // Update photos array
      setPhotos((prev) => {
        const filtered = prev.filter((p) => p.order !== slot);
        return [...filtered, newPhoto].sort((a, b) => a.order - b.order);
      });

      // Show success for lifestyle photos that passed
      if (slot >= 7 && slot <= 10) {
        Alert.alert('Success', 'Photo added successfully!');
      }
    } catch (error) {
      console.error('Error processing image:', error);
      Alert.alert('Error', 'Failed to process image. Please try again.');
    } finally {
      setUploading(false);
      setUploadingSlot(null);
    }
  };

  const handleRemovePhoto = (slot: number) => {
    setPhotos((prev) => prev.filter((p) => p.order !== slot));
  };

  const handleContinue = () => {
    const facePhotos = photos.filter(
      (p) => p.order >= 1 && p.order <= 6 && p.type === 'face'
    );

    if (facePhotos.length === 0) {
      Alert.alert(
        'Face photo required',
        'Please add at least one photo showing your face clearly (slots 1-6).'
      );
      return;
    }

    // Navigate to verification
    router.push({
      pathname: '/onboarding/verification' as any,
      params: {
        ...params,
        photos: JSON.stringify(photos),
      },
    });
  };

  const handleBack = () => {
    router.back();
  };

  const getPhotoBySlot = (slot: number) => {
    return photos.find((p) => p.order === slot);
  };

  const canContinue = photos.some((p) => p.order >= 1 && p.order <= 6 && p.type === 'face');

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Progress indicator */}
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: '60%' }]} />
          </View>
          <Text style={styles.progressText}>Step 3 of 5</Text>
        </View>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Add your photos</Text>
          <Text style={styles.subtitle}>
            First 6 photos must show your face clearly
          </Text>
        </View>

        {/* Important rules */}
        <View style={styles.rulesCard}>
          <Text style={styles.rulesTitle}>📸 Photo Rules</Text>
          <View style={styles.ruleItem}>
            <Text style={styles.ruleEmoji}>✅</Text>
            <Text style={styles.ruleText}>Slots 1-6: Real face photos only</Text>
          </View>
          <View style={styles.ruleItem}>
            <Text style={styles.ruleEmoji}>❌</Text>
            <Text style={styles.ruleText}>No AI avatars in slots 1-6</Text>
          </View>
          <View style={styles.ruleItem}>
            <Text style={styles.ruleEmoji}>🎨</Text>
            <Text style={styles.ruleText}>Slots 7-10: AI avatars OK</Text>
          </View>
        </View>

        {/* Face photos section (1-6) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Face Photos (Required)</Text>
          <Text style={styles.sectionSubtitle}>At least 1 required</Text>
          <View style={styles.photoGrid}>
            {photoSlots.slice(0, 6).map((slot) => {
              const photo = getPhotoBySlot(slot);
              const isUploading = uploadingSlot === slot;

              return (
                <TouchableOpacity
                  key={slot}
                  style={styles.photoSlot}
                  onPress={() => !uploading && handlePickImage(slot)}
                  disabled={uploading}
                >
                  {isUploading ? (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator size="large" color="#FF6B6B" />
                    </View>
                  ) : photo ? (
                    <>
                      <Image source={{ uri: photo.url }} style={styles.photoImage} />
                      <TouchableOpacity
                        style={styles.removeButton}
                        onPress={() => handleRemovePhoto(slot)}
                      >
                        <Text style={styles.removeButtonText}>×</Text>
                      </TouchableOpacity>
                      <View style={styles.slotNumber}>
                        <Text style={styles.slotNumberText}>{slot}</Text>
                      </View>
                    </>
                  ) : (
                    <>
                      <Text style={styles.addIcon}>+</Text>
                      <Text style={styles.slotLabel}>{slot}</Text>
                    </>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Lifestyle photos section (7-10) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Lifestyle Photos (Optional)</Text>
          <Text style={styles.sectionSubtitle}>AI avatars, hobbies, pets allowed</Text>
          <View style={styles.photoGrid}>
            {photoSlots.slice(6, 10).map((slot) => {
              const photo = getPhotoBySlot(slot);
              const isUploading = uploadingSlot === slot;

              return (
                <TouchableOpacity
                  key={slot}
                  style={styles.photoSlot}
                  onPress={() => !uploading && handlePickImage(slot)}
                  disabled={uploading}
                >
                  {isUploading ? (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator size="large" color="#FF6B6B" />
                    </View>
                  ) : photo ? (
                    <>
                      <Image source={{ uri: photo.url }} style={styles.photoImage} />
                      <TouchableOpacity
                        style={styles.removeButton}
                        onPress={() => handleRemovePhoto(slot)}
                      >
                        <Text style={styles.removeButtonText}>×</Text>
                      </TouchableOpacity>
                      <View style={styles.slotNumber}>
                        <Text style={styles.slotNumberText}>{slot}</Text>
                      </View>
                      {photo.aiDetected && (
                        <View style={styles.aiTag}>
                          <Text style={styles.aiTagText}>AI</Text>
                        </View>
                      )}
                    </>
                  ) : (
                    <>
                      <Text style={styles.addIcon}>+</Text>
                      <Text style={styles.slotLabel}>{slot}</Text>
                    </>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Continue button */}
        <TouchableOpacity
          style={[
            styles.continueButton,
            (!canContinue || uploading) && styles.continueButtonDisabled,
          ]}
          onPress={handleContinue}
          disabled={!canContinue || uploading}
        >
          <Text style={styles.continueButtonText}>
            {uploading ? 'Processing...' : 'Continue'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.privacyNote}>
          Photos showing your face are required for verification and safety.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 24,
    paddingBottom: 40,
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
  rulesCard: {
    backgroundColor: '#FFF9E6',
    borderRadius: 12,
    padding: 16,
    marginBottom: 32,
    borderLeftWidth: 4,
    borderLeftColor: '#FFD700',
  },
  rulesTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  ruleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  ruleEmoji: {
    fontSize: 16,
    marginRight: 8,
  },
  ruleText: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  photoSlot: {
    width: '30%',
    aspectRatio: 0.8,
    backgroundColor: '#F8F8F8',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoImage: {
    width: '100%',
    height: '100%',
    borderRadius: 10,
  },
  addIcon: {
    fontSize: 32,
    color: '#CCC',
    marginBottom: 4,
  },
  slotLabel: {
    fontSize: 12,
    color: '#999',
  },
  removeButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  slotNumber: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  slotNumberText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  aiTag: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#4ECDC4',
  },
  aiTagText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  continueButton: {
    backgroundColor: '#FF6B6B',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginTop: 16,
  },
  continueButtonDisabled: {
    backgroundColor: '#E0E0E0',
    opacity: 0.5,
  },
  continueButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  privacyNote: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 18,
  },
});
