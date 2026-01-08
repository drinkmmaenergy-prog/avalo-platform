# PACK 342 — Full Profile Creator & Verification UX Implementation

## 📋 Overview

Complete implementation of mandatory profile creation flow with identity photos, lifestyle gallery, video bio, and selfie verification UX for both Mobile and Web.

**Status**: 🟡 PARTIALLY IMPLEMENTED  
**Backend**: ✅ Complete (verification, strikes, compliance exist)  
**UI/Client**: 🚧 IN PROGRESS

---

## ✅ What's Implemented

### 1. Shared Package (`@avalo/ui-profile-creator`)

Created a shared TypeScript package with:

- **Types** (`packages/ui-profile-creator/src/types.ts`):
  - `ProfilePhoto`, `ProfileBasicInfo`, `SelfieVerification`
  - `VideoBio`, `ProfileCreationProgress`
  - Photo slots (1-6 = face only, 7-12 = lifestyle)
  - Validation types and constants

- **Validation Rules** (`packages/ui-profile-creator/src/validation.ts`):
  - `validatePrimaryPhoto()` - Face-only rules for slots 1-6
  - `validateLifestylePhoto()` - No restrictions for slots 7+
  - `validateBasicInfo()` - Nickname, age, gender, preferences
  - `validateSelfieMatch()` - Face match scoring
  - `validateVideoBio()` - Duration & sound requirements
  - Error/warning messages in EN & PL

---

## 🚧 What Needs Implementation

### 2. Mobile App Screens (React Native + Expo)

#### A. Profile Creation Wizard

**Location**: `app-mobile/app/onboarding/create-profile/`

**Screens**:
1. **Basic Info** (`_layout.tsx` → `basic-info.tsx`)
   - Nickname input (2-30 chars)
   - Age input (auto-checked vs DOB, 18+ required)
   - Gender selector: female | male | nonbinary
   - Preferences multi-select
   - "Next" → Primary Photos

2. **Primary Photos** (`primary-photos.tsx`)
   - Grid showing 6 slots
   - Upload button for each slot
   - **Minimum 1 photo required**
   - AI face detection check on upload:
     ```
     ✅ Face detected
     ❌ No face detected → Show error, allow retry
     ```
   - Rules displayed:
     - ✅ Visible face required
     - ❌ No animals
     - ❌ No landscapes
     - ❌ No objects only
     - ❌ No group photos as main
   - Live validation feedback
   - "Next" → Selfie Verification

3. **Selfie Verification** (`selfie-verification.tsx`)
   - Camera capture screen
   - Liveness check overlay
   - Instructions:  
     "Look at camera, center your face, ensure good lighting"
   - Compare with photos 1-6 (backend ML)
   - Show face match score
   - On fail (< 75% match):
     - Show retry button
     - After 3 fails → profile locked → support review
   - On success:  
     ✅ Verified badge earned
   - "Next" → Lifestyle Gallery

4. **Lifestyle Gallery** (`lifestyle.tsx`)
   - **Optional step** (can skip)
   - Grid showing 6 slots (7-12)
   - No face restriction
   - Travel / gym / pets / hobbies allowed
   - "Skip" or "Next" → Video Bio

5. **Video Bio** (`video-bio.tsx`)
   - **Optional but highlighted**
   - Record button → Opens camera
   - Requirements:
     - 5-30 seconds
     - Front camera preferred
     - Sound required
   - Preview & retake
   - "Video Verified" badge on upload
   - "Skip" or "Next" → Finish

6. **Finish** (`finish.tsx`)
   - Success screen
   - "Profile Activated 🎉"
   - Entry into app

**Implementation**:

```tsx
// app-mobile/app/onboarding/create-profile/_layout.tsx
import { Stack } from 'expo-router';

export default function CreateProfileLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="basic-info" />
      <Stack.Screen name="primary-photos" />
      <Stack.Screen name="selfie-verification" />
      <Stack.Screen name="lifestyle" />
      <Stack.Screen name="video-bio" />
      <Stack.Screen name="finish" />
    </Stack>
  );
}
```

```tsx
// app-mobile/app/onboarding/create-profile/basic-info.tsx
import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { validateBasicInfo, Gender } from '@avalo/ui-profile-creator';

export default function BasicInfoScreen() {
  const router = useRouter();
  const [nickname, setNickname] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [preferences, setPreferences] = useState<Gender[]>([]);
  const [errors, setErrors] = useState<any>({});

  const handleNext = () => {
    const validation = validateBasicInfo({
      nickname,
      age: parseInt(age),
      gender: gender!,
      preferences,
    });

    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    // Save to context/state
    // TODO: Save to Firebase
    router.push('/onboarding/create-profile/primary-photos');
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Create Your Profile</Text>
      <Text style={styles.subtitle}>Step 1 of 5: Basic Info</Text>

      {/* Nickname */}
      <View style={styles.field}>
        <Text style={styles.label}>Nickname *</Text>
        <TextInput
          style={styles.input}
          value={nickname}
          onChangeText={setNickname}
          placeholder="Enter nickname"
          maxLength={30}
        />
        {errors.nickname && <Text style={styles.error}>{errors.nickname}</Text>}
      </View>

      {/* Age */}
      <View style={styles.field}>
        <Text style={styles.label}>Age *</Text>
        <TextInput
          style={styles.input}
          value={age}
          onChangeText={setAge}
          placeholder="18"
          keyboardType="number-pad"
          maxLength={3}
        />
        {errors.age && <Text style={styles.error}>{errors.age}</Text>}
      </View>

      {/* Gender */}
      <View style={styles.field}>
        <Text style={styles.label}>Gender *</Text>
        <View style={styles.genderRow}>
          {(['female', 'male', 'nonbinary'] as Gender[]).map((g) => (
            <TouchableOpacity
              key={g}
              style={[styles.genderButton, gender === g && styles.genderButtonActive]}
              onPress={() => setGender(g)}
            >
              <Text style={gender === g ? styles.genderTextActive : styles.genderText}>
                {g === 'female' ? '♀ Female' : g === 'male' ? '♂ Male' : '⚧ Non-binary'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {errors.gender && <Text style={styles.error}>{errors.gender}</Text>}
      </View>

      {/* Preferences */}
      <View style={styles.field}>
        <Text style={styles.label}>Interested in *</Text>
        <View style={styles.genderRow}>
          {(['female', 'male', 'nonbinary'] as Gender[]).map((g) => (
            <TouchableOpacity
              key={g}
              style={[styles.genderButton, preferences.includes(g) && styles.genderButtonActive]}
              onPress={() => {
                setPreferences((prev) =>
                  prev.includes(g) ? prev.filter((p) => p !== g) : [...prev, g]
                );
              }}
            >
              <Text style={preferences.includes(g) ? styles.genderTextActive : styles.genderText}>
                {g === 'female' ? '♀' : g === 'male' ? '♂' : '⚧'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {errors.preferences && <Text style={styles.error}>{errors.preferences}</Text>}
      </View>

      <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
        <Text style={styles.nextButtonText}>Next →</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 20 },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#666', marginBottom: 32 },
  field: { marginBottom: 24 },
  label: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  error: { color: 'red', fontSize: 14, marginTop: 4 },
  genderRow: { flexDirection: 'row', gap: 12 },
  genderButton: {
    flex: 1,
    padding: 12,
    borderWidth: 2,
    borderColor: '#ddd',
    borderRadius: 8,
    alignItems: 'center',
  },
  genderButtonActive: { borderColor: '#FF6B6B', backgroundColor: '#FFF5F5' },
  genderText: { fontSize: 14, color: '#666' },
  genderTextActive: { fontSize: 14, color: '#FF6B6B', fontWeight: '600' },
  nextButton: {
    backgroundColor: '#FF6B6B',
    padding: 16,
    borderRadius: 24,
    alignItems: 'center',
    marginTop: 32,
  },
  nextButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});
```

#### B. Photo Upload Component

**Location**: `app-mobile/app/components/PhotoUploader.tsx`

**Features**:
- Expo ImagePicker integration
- Expo Camera for selfie capture
- Firebase Storage upload
- AI face detection API call
- Loading states
- Error handling

```tsx
import React, { useState } from 'react';
import { View, Image, TouchableOpacity, Text, ActivityIndicator, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { validatePrimaryPhoto, requiresFaceDetection, PhotoSlot } from '@avalo/ui-profile-creator';

interface PhotoUploaderProps {
  slot: PhotoSlot;
  onUploadSuccess: (photoData: { url: string; storagePath: string; faceDetected: boolean }) => void;
  onUploadError: (error: string) => void;
}

export function PhotoUploader({ slot, onUploadSuccess, onUploadError }: PhotoUploaderProps) {
  const [loading, setLoading] = useState(false);
  const [imageUri, setImageUri] = useState<string | null>(null);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission denied', 'We need camera roll permission');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      await uploadImage(result.assets[0].uri);
    }
  };

  const uploadImage = async (uri: string) => {
    setLoading(true);
    setImageUri(uri);

    try {
      // 1. Upload to Firebase Storage
      const storage = getStorage();
      const filename = `profiles/${Date.now()}_${slot}.jpg`;
      const storageRef = ref(storage, filename);
      
      const response = await fetch(uri);
      const blob = await response.blob();
      
      await uploadBytes(storageRef, blob);
      const downloadURL = await getDownloadURL(storageRef);

      // 2. Call AI face detection API (Cloud Function)
      const faceCheckResponse = await fetch('/api/detectFace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: downloadURL, slot }),
      });

      const faceCheckData = await faceCheckResponse.json();

      // 3. Validate according to rules
      if (requiresFaceDetection(slot)) {
        const validation = validatePrimaryPhoto(faceCheckData);
        
        if (!validation.isValid) {
          // Show first error
          const errorMsg = validation.errors[0];
          onUploadError(errorMsg);
          setLoading(false);
          return;
        }
      }

      // 4. Success
      onUploadSuccess({
        url: downloadURL,
        storagePath: filename,
        faceDetected: faceCheckData.faceDetected,
      });
      setLoading(false);
    } catch (error: any) {
      console.error('Upload error:', error);
      onUploadError('Upload failed. Please try again.');
      setLoading(false);
    }
  };

  return (
    <TouchableOpacity onPress={pickImage} disabled={loading}>
      {loading ? (
        <View style={{ width: 100, height: 120, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f0f0', borderRadius: 8 }}>
          <ActivityIndicator size="large" color="#FF6B6B" />
        </View>
      ) : imageUri ? (
        <Image source={{ uri: imageUri }} style={{ width: 100, height: 120, borderRadius: 8 }} />
      ) : (
        <View style={{ width: 100, height: 120, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f0f0', borderRadius: 8, borderWidth: 2, borderColor: '#ddd', borderStyle: 'dashed' }}>
          <Text style={{ fontSize: 40 }}>+</Text>
          <Text style={{ fontSize: 12, color: '#666' }}>Add Photo</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}
```

#### C. Selfie Verification Screen

**Location**: `app-mobile/app/onboarding/create-profile/selfie-verification.tsx`

**Features**:
- Expo Camera with front camera
- Liveness detection overlay
- Capture selfie
- Upload & compare with photos 1-6
- Show match score
- Retry logic (max 3 attempts)

```tsx
import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Camera, CameraType } from 'expo-camera';
import { useRouter } from 'expo-router';
import { validateSelfieMatch, MAX_SELFIE_ATTEMPTS } from '@avalo/ui-profile-creator';

export default function SelfieVerificationScreen() {
  const router = useRouter();
  const cameraRef = useRef<Camera>(null);
  const [hasPermission, setHasPermission] = useState(false);
  const [attemptNumber, setAttemptNumber] = useState(1);
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

  const captureSelfie = async () => {
    if (!cameraRef.current) return;

    setLoading(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
      });

      // Upload and verify
      const verifyResponse = await fetch('/api/verifySelfie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selfieUri: photo.uri }),
      });

      const result = await verifyResponse.json();
      const validation = validateSelfieMatch(result.faceMatchScore);

      if (validation.isValid) {
        Alert.alert('Success!', 'Face verification passed ✅', [
          { text: 'Continue', onPress: () => router.push('/onboarding/create-profile/lifestyle') }
        ]);
      } else {
        if (attemptNumber >= MAX_SELFIE_ATTEMPTS) {
          Alert.alert(
            'Verification Failed',
            'Maximum attempts reached. Your profile is under review. Contact support.',
            [{ text: 'OK', onPress: () => router.push('/') }]
          );
        } else {
          Alert.alert('Try Again', validation.message, [
            { text: 'Retry', onPress: () => setAttemptNumber(attemptNumber + 1) }
          ]);
        }
      }
      setLoading(false);
    } catch (error) {
      console.error('Selfie capture error:', error);
      Alert.alert('Error', 'Failed to capture selfie. Please try again.');
      setLoading(false);
    }
  };

  if (!hasPermission) {
    return (
      <View style={styles.container}>
        <Text>Camera permission denied</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Selfie Verification</Text>
      <Text style={styles.subtitle}>Attempt {attemptNumber} of {MAX_SELFIE_ATTEMPTS}</Text>
      <Text style={styles.instructions}>
        • Look directly at the camera{'\n'}
        • Ensure good lighting{'\n'}
        • Remove glasses if possible
      </Text>

      <Camera
        ref={cameraRef}
        style={styles.camera}
        type={CameraType.front}
      >
        <View style={styles.overlay}>
          <View style={styles.faceFrame} />
        </View>
      </Camera>

      <TouchableOpacity
        style={styles.captureButton}
        onPress={captureSelfie}
        disabled={loading}
      >
        <Text style={styles.captureButtonText}>{loading ? 'Processing...' : 'Capture'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', padding: 20 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginTop: 60 },
  subtitle: { fontSize: 16, color: '#aaa', marginBottom: 16 },
  instructions: { fontSize: 14, color: '#ccc', marginBottom: 24 },
  camera: { flex: 1, borderRadius: 16, overflow: 'hidden' },
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  faceFrame: {
    width: 200,
    height: 250,
    borderWidth: 3,
    borderColor: '#FF6B6B',
    borderRadius: 125,
  },
  captureButton: {
    backgroundColor: '#FF6B6B',
    padding: 20,
    borderRadius: 40,
    alignItems: 'center',
    marginTop: 24,
  },
  captureButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});
```

#### D. Video Bio Recorder

**Location**: `app-mobile/app/onboarding/create-profile/video-bio.tsx`

Similar implementation using `expo-camera` with video mode.

#### E. Profile Editor

**Location**: `app-mobile/app/profile/edit.tsx` (replace current placeholder)

**Rules**:
- Replacing any photo in slots 1-6 → triggers re-verification
- Replacing photos 7+ → no verification needed
- Removing all face photos → profile auto-hidden

```tsx
// When user replaces a primary photo (slots 1-6)
const onPhotoCh Deleting photo in slot 1-6
await updateProfile({ requiresReverification: true });
router.push('/profile/selfie-reverification');
```

### 3. Firebase Cloud Functions

**Location**: `functions/src/pack342-profile-creator.ts`

```typescript
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { detectFaces, compareFaces } from './ai/faceDetection';

/**
 * PACK 342: Detect face in uploaded photo
 */
export const detectFaceInPhoto = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }

  const { imageUrl, slot } = data;
  
  // Call ML Kit or Vision API
  const result = await detectFaces(imageUrl);
  
  return {
    faceDetected: result.faceCount >= 1,
    faceCount: result.faceCount,
    quality: result.quality,
    hasAnimal: result.labels.includes('animal'),
    isLandscape: result.labels.includes('landscape'),
    isMinor: result.ageEstimate < 18,
  };
});

/**
 * PACK 342: Verify selfie against profile photos
 */
export const verifySelfie = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }

  const userId = context.auth.uid;
  const { selfieUrl } = data;

  // Get user's primary photos (slots 1-6)
  const userDoc = await admin.firestore().collection('users').doc(userId).get();
  const userData = userDoc.data();
  const primaryPhotos = userData?.photos?.filter((p: any) => p.slot >= 1 && p.slot <= 6);

  if (!primaryPhotos || primaryPhotos.length === 0) {
    throw new functions.https.HttpsError('failed-precondition', 'No primary photos to compare');
  }

  // Compare selfie with each primary photo
  let bestMatchScore = 0;
  let matchedPhotoSlot = null;

  for (const photo of primaryPhotos) {
    const score = await compareFaces(selfieUrl, photo.url);
    if (score > bestMatchScore) {
      bestMatchScore = score;
      matchedPhotoSlot = photo.slot;
    }
  }

  // Update verification record
  const verificationRef = admin.firestore().collection('selfie_verifications').doc();
  await verificationRef.set({
    userId,
    selfieUrl,
    faceMatchScore: bestMatchScore,
    matchedPhotoSlot,
    verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
    status: bestMatchScore >= 75 ? 'passed' : 'failed',
  });

  return {
    faceMatchScore: bestMatchScore,
    matchedPhotoSlot,
    success: bestMatchScore >= 75,
  };
});

/**
 * PACK 342: Safety hook - check if profile violates rules
 */
export const checkProfileCompliance = functions.firestore
  .document('users/{userId}/photos/{photoId}')
  .onCreate(async (snap, context) => {
    const photoData = snap.data();
    const userId = context.params.userId;

    // If photo in slots 1-6 has no face, create violation
    if (photoData.slot >= 1 && photoData.slot <= 6 && !photoData.faceDetected) {
      await admin.firestore().collection('content_strikes').add({
        userId,
        type: 'invalid_primary_photo',
        severity: 'medium',
        photoId: snap.id,
        reason: 'Primary photo must contain a visible face',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Hide photo
      await snap.ref.update({ hidden: true });
    }

    // If minor detected, immediate ban
    if (photoData.isMinor) {
      await admin.firestore().collection('users').doc(userId).update({
        banned: true,
        banReason: 'Minor detected in photos',
        bannedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Create legal audit log
      await admin.firestore().collection('legal_audit_log').add({
        userId,
        event: 'MINOR_DETECTED',
        severity: 'CRITICAL',
        photoId: snap.id,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  });
```

### 4. Discovery Integration

**Location**: `functions/src/discoveryEngineV2.ts`

Add filter to only show profiles with verified face photos:

```typescript
// In discovery query
query = query
  .where('verification.selfieVerified', '==', true)
  .where('photos', 'array-contains', { slot: 1, faceDetected: true });
```

### 5. Public Profile Viewer

**Location**: `app-mobile/app/profile/[userId].tsx`

**Features**:
- Display header with avatar (slot 1)
- Show badges (Verified ✅, VIP 👑, etc.)
- Photo carousel (1-6 = face, 7+ = lifestyle)
- Video bio player
- Bio text
- Interests
- Location (approximate)
- Report/Block buttons

```tsx
import React from 'react';
import { View, Text, Image, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

export default function PublicProfileScreen() {
  const { userId } = useLocalSearchParams();
  // Fetch user profile data
  
  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Image source={{ uri: profile.avatar }} style={styles.avatar} />
        <Text style={styles.name}>{profile.nickname}, {profile.age}</Text>
        <View style={styles.badges}>
          {profile.verified && <Text style={styles.badge}>✅ Verified</Text>}
          {profile.vip && <Text style={styles.badge}>👑 VIP</Text>}
        </View>
      </View>

      {/* Photo Carousel */}
      <ScrollView horizontal style={styles.carousel}>
        {profile.photos.map(photo => (
          <Image key={photo.id} source={{ uri: photo.url }} style={styles.carouselPhoto} />
        ))}
      </ScrollView>

      {/* Video Bio */}
      {profile.videoBio && (
        <View style={styles.videoSection}>
          <Text style={styles.sectionTitle}>Video Bio</Text>
          {/* Video player */}
        </View>
      )}

      {/* Bio */}
      <View style={styles.bioSection}>
        <Text style={styles.bioText}>{profile.bio}</Text>
      </View>

      {/* Safety Actions */}
      <View style={styles.safetyActions}>
        <TouchableOpacity style={styles.reportButton}>
          <Text>⚠️ Report</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.blockButton}>
          <Text>🚫 Block</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { alignItems: 'center', padding: 24 },
  avatar: { width: 120, height: 120, borderRadius: 60, marginBottom: 16 },
  name: { fontSize: 24, fontWeight: 'bold' },
  badges: { flexDirection: 'row', gap: 8, marginTop: 8 },
  badge: { backgroundColor: '#f0f0f0', paddingHorizontal: 12, paddingVertical:4, borderRadius: 12, fontSize: 14 },
  carousel: { height: 300, paddingHorizontal: 16 },
  carouselPhoto: { width: 200, height: 280, borderRadius: 12, marginRight: 12 },
  videoSection: { padding: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '600', marginBottom: 12 },
  bioSection: { padding: 16 },
  bioText: { fontSize: 16, lineHeight: 24 },
  safetyActions: { flexDirection: 'row', padding: 16, gap: 12 },
  reportButton: { flex: 1, padding: 12, backgroundColor: '#FFF3E0', borderRadius: 8, alignItems: 'center' },
  blockButton: { flex: 1, padding: 12, backgroundColor: '#FFEBEE', borderRadius: 8, alignItems: 'center' },
});
```

---

## 🔒 Safety & Compliance Hooks

All safety logic already exists in backend (PACK 338 strikes):

1. **Wrong content in slots 1-6** → Content strike created → Photo hidden → Force re-verify
2. **Minor detected** → Immediate permanent ban → Legal audit log
3. **No verified photos** → Profile hidden from discovery
4. **Failed 3 selfie verifications** → Profile locked → Support review

---

## 📱 Web Implementation

Similar structure in `app-web/` using:
- React + Next.js
- WebRTC for camera capture
- Progressive upload
- Shared `@avalo/ui-profile-creator` validation

---

## 🧪 Testing Checklist

- [ ] Basic info validation (nickname, age, preferences)
- [ ] Primary photo upload with face detection
- [ ] Block photos without faces in slots 1-6
- [ ] Allow lifestyle photos in slots 7+
- [ ] Selfie verification flow
- [ ] Retry logic (max 3 attempts)
- [ ] Video bio recording & upload
- [ ] Profile activation after completion
- [ ] Profile editing re-verification triggers
- [ ] Public profile viewer
- [ ] Discovery filter (only verified profiles)
- [ ] Safety hooks (strikes, bans, hiding)

---

## 📊 Status Summary

| Component | Status |
|-----------|--------|
| Shared Package (types, validation) | ✅ Complete |
| Basic Info Screen | 🚧 Code provided |
| Primary Photos Screen | 🚧 Code provided |
| Photo Uploader Component | 🚧 Code provided |
| Selfie Verification Screen | 🚧 Code provided |
| Lifestyle Gallery Screen | ⏳ TODO |
| Video Bio Recorder | ⏳ TODO |
| Profile Editor | ⏳ TODO |
| Public Profile Viewer | 🚧 Code provided |
| Backend Functions | 🚧 Code provided |
| Safety Hooks | ✅ Exists (PACK 338) |
| Discovery Integration | ⏳ TODO |
| Web Implementation | ⏳ TODO |

---

## 🚀 Next Steps

1. **Create all mobile screens** in `app-mobile/app/onboarding/create-profile/`
2. **Implement `detectFaceInPhoto` Cloud Function** with ML Kit / Vision API
3. **Implement `verifySelfie` Cloud Function** with face comparison
4. **Update `edit.tsx`** with re-verification triggers
5. **Add discovery filter** in `discoveryEngineV2.ts`
6. **Create web version** in `app-web/`
7. **Test complete flow** end-to-end
8. **Deploy to staging** for UAT

---

**Estimated Remaining Work**: 8-12 hours  
**Priority**: 🔴 HIGH (Critical for profile quality & safety)  
**Dependencies**: Expo Camera, Firebase ML, Cloud Storage  

---

*This document provides the complete implementation architecture for PACK 342. All validation logic is centralized in the shared package, and code samples show the exact structure needed for each screen.*
