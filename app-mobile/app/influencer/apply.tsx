/**
 * PACK 354 — Influencer Application Screen (Mobile)
 * Creator onboarding flow
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  Image,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { useAuth } from "@/contexts/AuthContext";
import { getFunctions, httpsCallable } from 'firebase/functions';
import * as ImagePicker from 'expo-image-picker';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

interface ApplicationData {
  legalName: string;
  country: string;
  city: string;
  age: string;
  photoUrls: string[];
  socialLinks: {
    instagram?: string;
    tiktok?: string;
    twitter?: string;
    onlyfans?: string;
  };
  expectedWeeklyActivity: string;
  agreedToRules: boolean;
  gender: 'FEMALE' | 'MALE' | 'AI';
}

export default function InfluencerApplyScreen() {
  const { user } = useAuth();
  const functions = getFunctions();
  const storage = getStorage();

  const [formData, setFormData] = useState<ApplicationData>({
    legalName: '',
    country: '',
    city: '',
    age: '',
    photoUrls: [],
    socialLinks: {},
    expectedWeeklyActivity: '',
    agreedToRules: false,
    gender: 'FEMALE',
  });

  const [loading, setLoading] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);

  // Pick and upload photos
  const pickPhotos = async () => {
    if (formData.photoUrls.length >= 6) {
      Alert.alert('Maximum Reached', 'You can upload up to 6 photos');
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.8,
        aspect: [3, 4],
      });

      if (!result.canceled && result.assets) {
        setUploadingPhotos(true);

        const newPhotoUrls: string[] = [];

        for (const asset of result.assets) {
          if (formData.photoUrls.length + newPhotoUrls.length >= 6) {
            break;
          }

          // Upload to Firebase Storage
          const response = await fetch(asset.uri);
          const blob = await response.blob();
          
          const photoRef = ref(
            storage,
            `influencer-applications/${user?.uid}/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`
          );

          await uploadBytes(photoRef, blob);
          const downloadUrl = await getDownloadURL(photoRef);
          newPhotoUrls.push(downloadUrl);
        }

        setFormData({
          ...formData,
          photoUrls: [...formData.photoUrls, ...newPhotoUrls],
        });

        setUploadingPhotos(false);
      }
    } catch (error) {
      setUploadingPhotos(false);
      Alert.alert('Error', 'Failed to upload photos. Please try again.');
      console.error('Photo upload error:', error);
    }
  };

  // Remove photo
  const removePhoto = (index: number) => {
    const newPhotoUrls = [...formData.photoUrls];
    newPhotoUrls.splice(index, 1);
    setFormData({ ...formData, photoUrls: newPhotoUrls });
  };

  // Validate form
  const validateForm = (): boolean => {
    if (!formData.legalName.trim()) {
      Alert.alert('Required Field', 'Please enter your legal name');
      return false;
    }

    if (!formData.country.trim()) {
      Alert.alert('Required Field', 'Please enter your country');
      return false;
    }

    if (!formData.city.trim()) {
      Alert.alert('Required Field', 'Please enter your city');
      return false;
    }

    const age = parseInt(formData.age);
    if (!age || age < 18) {
      Alert.alert('Age Requirement', 'You must be 18 years or older to apply');
      return false;
    }

    if (formData.photoUrls.length < 3) {
      Alert.alert('Photos Required', 'Please upload at least 3 photos with your face visible');
      return false;
    }

    const weeklyHours = parseInt(formData.expectedWeeklyActivity);
    if (!weeklyHours || weeklyHours < 1) {
      Alert.alert('Activity Required', 'Please enter expected weekly hours');
      return false;
    }

    if (!formData.agreedToRules) {
      Alert.alert('Agreement Required', 'Please agree to Avalo creator rules');
      return false;
    }

    return true;
  };

  // Submit application
  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      const applyAsInfluencer = httpsCallable(functions, 'applyAsInfluencer');
      
      const result = await applyAsInfluencer({
        legalName: formData.legalName.trim(),
        country: formData.country.trim().toUpperCase(),
        city: formData.city.trim(),
        age: parseInt(formData.age),
        photoUrls: formData.photoUrls,
        socialLinks: formData.socialLinks,
        expectedWeeklyActivity: parseInt(formData.expectedWeeklyActivity),
        agreedToRules: formData.agreedToRules,
        gender: formData.gender,
      });

      const data = result.data as any;

      if (data.success) {
        Alert.alert(
          'Application Submitted! 🎉',
          'We will review your application within 48 hours. You will be notified via email.',
          [
            {
              text: 'Check Status',
              onPress: () => router.replace('/influencer/status'),
            },
          ]
        );
      }
    } catch (error: any) {
      console.error('Application submission error:', error);
      Alert.alert(
        'Error',
        error.message || 'Failed to submit application. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Become a Creator on Avalo</Text>
        <Text style={styles.subtitle}>
          Join our community of high-value creators and start earning
        </Text>
      </View>

      <View style={styles.form}>
        {/* Legal Name */}
        <View style={styles.field}>
          <Text style={styles.label}>Legal Name *</Text>
          <TextInput
            style={styles.input}
            value={formData.legalName}
            onChangeText={(text) => setFormData({ ...formData, legalName: text })}
            placeholder="Full legal name"
            placeholderTextColor="#999"
          />
        </View>

        {/* Country */}
        <View style={styles.field}>
          <Text style={styles.label}>Country *</Text>
          <TextInput
            style={styles.input}
            value={formData.country}
            onChangeText={(text) => setFormData({ ...formData, country: text })}
            placeholder="e.g., Poland"
            placeholderTextColor="#999"
          />
        </View>

        {/* City */}
        <View style={styles.field}>
          <Text style={styles.label}>City *</Text>
          <TextInput
            style={styles.input}
            value={formData.city}
            onChangeText={(text) => setFormData({ ...formData, city: text })}
            placeholder="e.g., Warsaw"
            placeholderTextColor="#999"
          />
        </View>

        {/* Age */}
        <View style={styles.field}>
          <Text style={styles.label}>Age *</Text>
          <TextInput
            style={styles.input}
            value={formData.age}
            onChangeText={(text) => setFormData({ ...formData, age: text })}
            placeholder="Must be 18+"
            keyboardType="numeric"
            placeholderTextColor="#999"
          />
        </View>

        {/* Gender */}
        <View style={styles.field}>
          <Text style={styles.label}>Gender *</Text>
          <View style={styles.genderButtons}>
            {(['FEMALE', 'MALE'] as const).map((gender) => (
              <TouchableOpacity
                key={gender}
                style={[
                  styles.genderButton,
                  formData.gender === gender && styles.genderButtonActive,
                ]}
                onPress={() => setFormData({ ...formData, gender })}
              >
                <Text
                  style={[
                    styles.genderButtonText,
                    formData.gender === gender && styles.genderButtonTextActive,
                  ]}
                >
                  {gender}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Photos */}
        <View style={styles.field}>
          <Text style={styles.label}>
            Photos * (3-6 required, face must be visible)
          </Text>
          
          <View style={styles.photosGrid}>
            {formData.photoUrls.map((url, index) => (
              <View key={index} style={styles.photoWrapper}>
                <Image source={{ uri: url }} style={styles.photo} />
                <TouchableOpacity
                  style={styles.removePhotoButton}
                  onPress={() => removePhoto(index)}
                >
                  <Text style={styles.removePhotoText}>×</Text>
                </TouchableOpacity>
              </View>
            ))}
            
            {formData.photoUrls.length < 6 && (
              <TouchableOpacity
                style={styles.addPhotoButton}
                onPress={pickPhotos}
                disabled={uploadingPhotos}
              >
                {uploadingPhotos ? (
                  <ActivityIndicator color="#FF1493" />
                ) : (
                  <Text style={styles.addPhotoText}>+</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
          
          <Text style={styles.hint}>
            {formData.photoUrls.length}/6 photos uploaded
          </Text>
        </View>

        {/* Social Links */}
        <View style={styles.field}>
          <Text style={styles.label}>Social Media (Optional)</Text>
          
          <TextInput
            style={styles.input}
            value={formData.socialLinks.instagram || ''}
            onChangeText={(text) =>
              setFormData({
                ...formData,
                socialLinks: { ...formData.socialLinks, instagram: text },
              })
            }
            placeholder="Instagram username"
            placeholderTextColor="#999"
          />
          
          <TextInput
            style={styles.input}
            value={formData.socialLinks.tiktok || ''}
            onChangeText={(text) =>
              setFormData({
                ...formData,
                socialLinks: { ...formData.socialLinks, tiktok: text },
              })
            }
            placeholder="TikTok username"
            placeholderTextColor="#999"
          />
          
          <TextInput
            style={styles.input}
            value={formData.socialLinks.twitter || ''}
            onChangeText={(text) =>
              setFormData({
                ...formData,
                socialLinks: { ...formData.socialLinks, twitter: text },
              })
            }
            placeholder="X (Twitter) username"
            placeholderTextColor="#999"
          />
        </View>

        {/* Expected Activity */}
        <View style={styles.field}>
          <Text style={styles.label}>Expected Weekly Activity (hours) *</Text>
          <TextInput
            style={styles.input}
            value={formData.expectedWeeklyActivity}
            onChangeText={(text) =>
              setFormData({ ...formData, expectedWeeklyActivity: text })
            }
            placeholder="e.g., 20"
            keyboardType="numeric"
            placeholderTextColor="#999"
          />
        </View>

        {/* Agreement */}
        <TouchableOpacity
          style={styles.checkbox}
          onPress={() =>
            setFormData({ ...formData, agreedToRules: !formData.agreedToRules })
          }
        >
          <View
            style={[
              styles.checkboxBox,
              formData.agreedToRules && styles.checkboxBoxChecked,
            ]}
          >
            {formData.agreedToRules && <Text style={styles.checkboxCheck}>✓</Text>}
          </View>
          <Text style={styles.checkboxLabel}>
            I agree to Avalo's Creator Rules and Terms of Service *
          </Text>
        </TouchableOpacity>

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitButton, loading && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.submitButtonText}>Submit Application</Text>
          )}
        </TouchableOpacity>

        {/* Info */}
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>What happens next?</Text>
          <Text style={styles.infoText}>
            • Our team reviews your application within 48 hours{'\n'}
            • We verify your photos and information{'\n'}
            • You'll receive an email with the decision{'\n'}
            • If approved, you can start earning immediately
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    padding: 20,
    paddingTop: 60,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#AAA',
  },
  form: {
    padding: 20,
  },
  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#FFF',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  hint: {
    fontSize: 14,
    color: '#888',
    marginTop: 4,
  },
  genderButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  genderButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#1C1C1E',
    borderWidth: 2,
    borderColor: '#333',
    alignItems: 'center',
  },
  genderButtonActive: {
    borderColor: '#FF1493',
    backgroundColor: '#FF149320',
  },
  genderButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  genderButtonTextActive: {
    color: '#FF1493',
  },
  photosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  photoWrapper: {
    position: 'relative',
    width: 100,
    height: 133,
  },
  photo: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  removePhotoButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FF1493',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removePhotoText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  addPhotoButton: {
    width: 100,
    height: 133,
    borderRadius: 12,
    backgroundColor: '#1C1C1E',
    borderWidth: 2,
    borderColor: '#FF1493',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhotoText: {
    fontSize: 40,
    color: '#FF1493',
  },
  checkbox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  checkboxBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#666',
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxBoxChecked: {
    backgroundColor: '#FF1493',
    borderColor: '#FF1493',
  },
  checkboxCheck: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 14,
    color: '#AAA',
    lineHeight: 20,
  },
  submitButton: {
    backgroundColor: '#FF1493',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 20,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFF',
  },
  infoBox: {
    backgroundColor: '#1C1C1E',
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#FF1493',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#AAA',
    lineHeight: 20,
  },
});

