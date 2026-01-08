import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
  Dimensions
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useAuth } from "@/contexts/AuthContext";
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import {
  saveProfile,
  uploadProfilePhotos,
  DEFAULT_INTERESTS,
  ProfileSetupData
} from "@/lib/profileService";

const { width } = Dimensions.get('window');
const photoSize = (width - 60) / 3; // 3 photos per row with spacing

type Gender = 'male' | 'female' | 'non-binary' | 'prefer-not-to-say';
type InterestedIn = 'male' | 'female' | 'non-binary' | 'everyone';

export default function ProfileSetupScreen() {
  const router = useRouter();
  const { user, registrationData } = useAuth();
  
  // Form state
  const [name, setName] = useState('');
  const [age] = useState(registrationData?.age || 18);
  const [gender, setGender] = useState<Gender | ''>('');
  const [interestedIn, setInterestedIn] = useState<InterestedIn[]>([]);
  const [city, setCity] = useState('');
  const [bio, setBio] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingLocation, setLoadingLocation] = useState(false);

  const handlePickImage = async () => {
    if (photos.length >= 6) {
      Alert.alert('Maximum Photos', 'You can only upload up to 6 photos');
      return;
    }

    try {
      // Request permission
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow access to your photo library');
        return;
      }

      // Launch image picker
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [3, 4],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setPhotos([...photos, result.assets[0].uri]);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const handleRemovePhoto = (index: number) => {
    setPhotos(photos.filter((_, i) => i !== index));
  };

  const toggleInterest = (interest: string) => {
    if (selectedInterests.includes(interest)) {
      setSelectedInterests(selectedInterests.filter(i => i !== interest));
    } else {
      setSelectedInterests([...selectedInterests, interest]);
    }
  };

  const toggleInterestedIn = (option: InterestedIn) => {
    if (interestedIn.includes(option)) {
      setInterestedIn(interestedIn.filter(i => i !== option));
    } else {
      setInterestedIn([...interestedIn, option]);
    }
  };

  const handleDetectLocation = async () => {
    try {
      setLoadingLocation(true);
      
      // Request permission
      const { status } = await Location.requestForegroundPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow location access to auto-detect your city');
        setLoadingLocation(false);
        return;
      }

      // Get current location
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      // Reverse geocode to get city
      const geocode = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      if (geocode && geocode.length > 0) {
        const cityName = geocode[0].city || geocode[0].subregion || geocode[0].region || '';
        if (cityName) {
          setCity(cityName);
          Alert.alert('Location Detected', `City set to: ${cityName}`);
        } else {
          Alert.alert('Unable to Detect', 'Please enter your city manually');
        }
      } else {
        Alert.alert('Unable to Detect', 'Please enter your city manually');
      }
    } catch (error) {
      console.error('Error detecting location:', error);
      Alert.alert('Error', 'Failed to detect location. Please enter manually.');
    } finally {
      setLoadingLocation(false);
    }
  };

  const validateForm = (): boolean => {
    if (!name.trim()) {
      Alert.alert('Missing Information', 'Please enter your name');
      return false;
    }

    if (!gender) {
      Alert.alert('Missing Information', 'Please select your gender');
      return false;
    }

    if (interestedIn.length === 0) {
      Alert.alert('Missing Information', 'Please select who you want to meet');
      return false;
    }

    if (!city.trim()) {
      Alert.alert('Missing Information', 'Please enter your city');
      return false;
    }

    if (!bio.trim()) {
      Alert.alert('Missing Information', 'Please write a short bio');
      return false;
    }

    if (photos.length === 0) {
      Alert.alert('Missing Photos', 'Please add at least one photo');
      return false;
    }

    if (selectedInterests.length === 0) {
      Alert.alert('Missing Interests', 'Please select at least one interest');
      return false;
    }

    return true;
  };

  const handleComplete = async () => {
    if (!validateForm()) {
      return;
    }

    if (!user?.uid) {
      Alert.alert('Error', 'User not authenticated');
      return;
    }

    setLoading(true);
    try {
      // Upload photos to Firebase Storage
      const photoURLs = await uploadProfilePhotos(user.uid, photos);

      // Prepare profile data
      const profileData: ProfileSetupData = {
        name: name.trim(),
        age,
        gender: gender as Gender,
        interestedIn,
        city: city.trim(),
        bio: bio.trim(),
        interests: selectedInterests
      };

      // Save profile to Firestore
      await saveProfile(user.uid, profileData, photoURLs, false);

      // Navigate to home
      router.replace('/(tabs)/home' as any);
    } catch (error: any) {
      console.error('Error completing profile:', error);
      Alert.alert('Error', error.message || 'Failed to save profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.header}>
        <Text style={styles.title}>Show Your Best Side</Text>
        <Text style={styles.subtitle}>Someone's about to fall for your vibe...</Text>
      </View>

      {/* Name */}
      <View style={styles.section}>
        <Text style={styles.label}>Name *</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter your name"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
        />
      </View>

      {/* Age (Read-only) */}
      <View style={styles.section}>
        <Text style={styles.label}>Age</Text>
        <View style={[styles.input, styles.readOnlyInput]}>
          <Text style={styles.readOnlyText}>{age}</Text>
        </View>
      </View>

      {/* Gender */}
      <View style={styles.section}>
        <Text style={styles.label}>Gender *</Text>
        <View style={styles.optionsContainer}>
          {(['male', 'female', 'non-binary', 'prefer-not-to-say'] as Gender[]).map((option) => (
            <TouchableOpacity
              key={option}
              style={[
                styles.optionButton,
                gender === option && styles.optionButtonSelected
              ]}
              onPress={() => setGender(option)}
            >
              <Text style={[
                styles.optionButtonText,
                gender === option && styles.optionButtonTextSelected
              ]}>
                {option.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Interested In */}
      <View style={styles.section}>
        <Text style={styles.label}>Interested In *</Text>
        <View style={styles.optionsContainer}>
          {(['male', 'female', 'non-binary', 'everyone'] as InterestedIn[]).map((option) => (
            <TouchableOpacity
              key={option}
              style={[
                styles.optionButton,
                interestedIn.includes(option) && styles.optionButtonSelected
              ]}
              onPress={() => toggleInterestedIn(option)}
            >
              <Text style={[
                styles.optionButtonText,
                interestedIn.includes(option) && styles.optionButtonTextSelected
              ]}>
                {option.charAt(0).toUpperCase() + option.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* City */}
      <View style={styles.section}>
        <Text style={styles.label}>City *</Text>
        <View style={styles.cityContainer}>
          <TextInput
            style={[styles.input, styles.cityInput]}
            placeholder="Enter your city"
            value={city}
            onChangeText={setCity}
            autoCapitalize="words"
          />
          <TouchableOpacity
            style={styles.locationButton}
            onPress={handleDetectLocation}
            disabled={loadingLocation}
          >
            {loadingLocation ? (
              <ActivityIndicator size="small" color="#FF6B6B" />
            ) : (
              <Text style={styles.locationIcon}>📍</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Bio */}
      <View style={styles.section}>
        <Text style={styles.label}>Bio *</Text>
        <TextInput
          style={[styles.input, styles.bioInput]}
          placeholder="Tell us about yourself..."
          value={bio}
          onChangeText={setBio}
          multiline
          maxLength={500}
          textAlignVertical="top"
        />
        <Text style={styles.charCount}>{bio.length}/500</Text>
      </View>

      {/* Photos */}
      <View style={styles.section}>
        <Text style={styles.label}>Photos * (up to 6)</Text>
        <View style={styles.photosGrid}>
          {photos.map((photo, index) => (
            <View key={index} style={styles.photoContainer}>
              <Image source={{ uri: photo }} style={styles.photo} />
              <TouchableOpacity
                style={styles.removePhotoButton}
                onPress={() => handleRemovePhoto(index)}
              >
                <Text style={styles.removePhotoText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
          
          {photos.length < 6 && (
            <TouchableOpacity
              style={styles.addPhotoButton}
              onPress={handlePickImage}
            >
              <Text style={styles.addPhotoIcon}>+</Text>
              <Text style={styles.addPhotoText}>Add Photo</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Interests */}
      <View style={styles.section}>
        <Text style={styles.label}>Interests * (select at least one)</Text>
        <View style={styles.interestsContainer}>
          {DEFAULT_INTERESTS.map((interest) => (
            <TouchableOpacity
              key={interest}
              style={[
                styles.interestBadge,
                selectedInterests.includes(interest) && styles.interestBadgeSelected
              ]}
              onPress={() => toggleInterest(interest)}
            >
              <Text style={[
                styles.interestBadgeText,
                selectedInterests.includes(interest) && styles.interestBadgeTextSelected
              ]}>
                {interest}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Complete Button */}
      <TouchableOpacity
        style={styles.completeButton}
        onPress={handleComplete}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.completeButtonText}>I'm Ready</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0C0714',
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    marginTop: 20,
    marginBottom: 30,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 17,
    color: '#E8E8E8',
    fontWeight: '500',
  },
  section: {
    marginBottom: 25,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 10,
  },
  input: {
    borderWidth: 2,
    borderColor: '#2A2A2A',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#FFFFFF',
    backgroundColor: '#1A1A1A',
  },
  readOnlyInput: {
    backgroundColor: '#1A1A1A',
  },
  readOnlyText: {
    fontSize: 16,
    color: '#B8B8B8',
  },
  bioInput: {
    height: 120,
    paddingTop: 14,
  },
  charCount: {
    fontSize: 12,
    color: '#777',
    textAlign: 'right',
    marginTop: 5,
  },
  optionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  optionButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: '#2A2A2A',
    backgroundColor: '#1A1A1A',
  },
  optionButtonSelected: {
    borderColor: '#FF3B77',
    backgroundColor: '#FF3B77',
  },
  optionButtonText: {
    fontSize: 15,
    color: '#B8B8B8',
    fontWeight: '600',
  },
  optionButtonTextSelected: {
    color: '#FFFFFF',
  },
  photosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  photoContainer: {
    width: photoSize,
    height: photoSize * 1.33,
    borderRadius: 12,
    overflow: 'hidden',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  removePhotoButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removePhotoText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  addPhotoButton: {
    width: photoSize,
    height: photoSize * 1.33,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#2A2A2A',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
  },
  addPhotoIcon: {
    fontSize: 32,
    color: '#777',
    marginBottom: 8,
  },
  addPhotoText: {
    fontSize: 14,
    color: '#777',
    fontWeight: '600',
  },
  interestsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  interestBadge: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#2A2A2A',
    backgroundColor: '#1A1A1A',
  },
  interestBadgeSelected: {
    borderColor: '#FF3B77',
    backgroundColor: '#2A1A1F',
  },
  interestBadgeText: {
    fontSize: 14,
    color: '#B8B8B8',
    fontWeight: '600',
  },
  interestBadgeTextSelected: {
    color: '#FF3B77',
  },
  completeButton: {
    backgroundColor: '#FF3B77',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  completeButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  cityContainer: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  cityInput: {
    flex: 1,
  },
  locationButton: {
    width: 50,
    height: 50,
    borderRadius: 12,
    backgroundColor: '#2A1A1F',
    borderWidth: 2,
    borderColor: '#FF3B77',
    justifyContent: 'center',
    alignItems: 'center',
  },
  locationIcon: {
    fontSize: 24,
  },
});
