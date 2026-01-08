/**
 * Premium Story Service
 * Handles media upload, compression, and story management
 */

import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, serverTimestamp, query, where, getDocs, doc, getDoc, orderBy, limit } from 'firebase/firestore';
import { db, functions } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { getThumbnailAsync } from 'expo-video-thumbnails';
import { getInfoAsync } from 'expo-file-system';
import { PREMIUM_STORIES_CONFIG } from '../config/monetization';
import type { 
  PremiumStory, 
  PremiumStoryUploadData, 
  UploadProgress,
  UnlockAccessInfo,
  PremiumStoryFeedItem 
} from '../types/premiumStories';

const storage = getStorage();

// ============================================================================
// MEDIA COMPRESSION
// ============================================================================

/**
 * Compress image to meet size and dimension requirements
 */
export async function compressImage(
  uri: string,
  onProgress?: (progress: number) => void
): Promise<{ uri: string; width: number; height: number; size: number }> {
  try {
    onProgress?.(10);
    
    // Get image info
    const info = await getInfoAsync(uri);
    if (!info.exists) {
      throw new Error('Image file not found');
    }
    
    onProgress?.(30);
    
    // Resize and compress
    const manipResult = await manipulateAsync(
      uri,
      [
        {
          resize: {
            width: PREMIUM_STORIES_CONFIG.MAX_IMAGE_WIDTH,
            height: PREMIUM_STORIES_CONFIG.MAX_IMAGE_HEIGHT,
          },
        },
      ],
      {
        compress: PREMIUM_STORIES_CONFIG.IMAGE_QUALITY,
        format: SaveFormat.JPEG,
      }
    );
    
    onProgress?.(80);
    
    // Get final file info
    const finalInfo = await getInfoAsync(manipResult.uri);
    
    onProgress?.(100);
    
    return {
      uri: manipResult.uri,
      width: manipResult.width,
      height: manipResult.height,
      size: 'size' in finalInfo ? finalInfo.size : 0,
    };
  } catch (error) {
    console.error('Image compression failed:', error);
    throw new Error('Failed to compress image');
  }
}

/**
 * Generate thumbnail for video
 */
export async function generateVideoThumbnail(
  videoUri: string
): Promise<string> {
  try {
    const { uri } = await getThumbnailAsync(videoUri, {
      time: 0,
      quality: 0.8,
    });
    return uri;
  } catch (error) {
    console.error('Thumbnail generation failed:', error);
    throw new Error('Failed to generate video thumbnail');
  }
}

/**
 * Validate video duration
 */
export async function validateVideoDuration(uri: string): Promise<number> {
  try {
    // Note: You may need expo-av for this
    // For now, we'll return a placeholder
    // In production, use: import { Video } from 'expo-av';
    // and load the video to get duration
    return 0; // Placeholder - implement with expo-av
  } catch (error) {
    console.error('Video validation failed:', error);
    throw new Error('Failed to validate video');
  }
}

// ============================================================================
// UPLOAD FUNCTIONS
// ============================================================================

/**
 * Upload media to Firebase Storage with progress tracking
 */
async function uploadMediaToStorage(
  uri: string,
  path: string,
  onProgress?: (progress: number) => void
): Promise<string> {
  try {
    // Read file as blob
    const response = await fetch(uri);
    const blob = await response.blob();
    
    // Create storage reference
    const storageRef = ref(storage, path);
    
    // Upload with progress
    const uploadTask = uploadBytesResumable(storageRef, blob);
    
    return new Promise((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          onProgress?.(progress);
        },
        (error) => {
          reject(error);
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          resolve(downloadURL);
        }
      );
    });
  } catch (error) {
    console.error('Upload failed:', error);
    throw new Error('Failed to upload media');
  }
}

/**
 * Upload premium story with full flow:
 * 1. Compress media
 * 2. Generate thumbnail
 * 3. Upload to Storage
 * 4. Create Firestore document
 */
export async function uploadPremiumStory(
  userId: string,
  data: PremiumStoryUploadData,
  onProgress?: (progress: UploadProgress) => void
): Promise<string> {
  try {
    let mediaUri = data.uri;
    let thumbnailUri = data.uri;
    let metadata = {
      width: data.width || 0,
      height: data.height || 0,
      duration: data.duration,
      fileSize: 0,
    };
    
    // Step 1: Compress media
    onProgress?.({
      progress: 0,
      stage: 'compressing',
      message: 'Compressing media...',
    });
    
    if (data.type === 'image') {
      const compressed = await compressImage(data.uri, (p) => {
        onProgress?.({
          progress: p * 0.3, // 0-30%
          stage: 'compressing',
          message: 'Compressing image...',
        });
      });
      mediaUri = compressed.uri;
      thumbnailUri = compressed.uri;
      metadata = {
        ...metadata,
        width: compressed.width,
        height: compressed.height,
        fileSize: compressed.size,
      };
    } else {
      // Video: generate thumbnail
      thumbnailUri = await generateVideoThumbnail(data.uri);
      onProgress?.({
        progress: 30,
        stage: 'compressing',
        message: 'Generating thumbnail...',
      });
    }
    
    // Step 2: Upload media
    onProgress?.({
      progress: 30,
      stage: 'uploading',
      message: 'Uploading media...',
    });
    
    const timestamp = Date.now();
    const mediaPath = `premium_stories/${userId}/${timestamp}_media`;
    const thumbnailPath = `premium_stories/${userId}/${timestamp}_thumb`;
    
    const [mediaUrl, thumbnailUrl] = await Promise.all([
      uploadMediaToStorage(mediaUri, mediaPath, (p) => {
        onProgress?.({
          progress: 30 + (p * 0.4), // 30-70%
          stage: 'uploading',
          message: 'Uploading media...',
        });
      }),
      uploadMediaToStorage(thumbnailUri, thumbnailPath, (p) => {
        onProgress?.({
          progress: 70 + (p * 0.2), // 70-90%
          stage: 'uploading',
          message: 'Uploading thumbnail...',
        });
      }),
    ]);
    
    // Step 3: Create Firestore document
    onProgress?.({
      progress: 90,
      stage: 'processing',
      message: 'Creating story...',
    });
    
    const storyData = {
      authorId: userId,
      mediaUrl,
      thumbnailUrl,
      mediaType: data.type,
      priceTokens: data.price,
      durationHours: 24,
      viewCount: 0,
      unlockCount: 0,
      metadata,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    
    const docRef = await addDoc(collection(db, 'premium_stories'), storyData);
    
    onProgress?.({
      progress: 100,
      stage: 'complete',
      message: 'Story published!',
    });
    
    return docRef.id;
  } catch (error) {
    console.error('Upload premium story failed:', error);
    throw error;
  }
}

// ============================================================================
// UNLOCK FUNCTIONS
// ============================================================================

/**
 * Unlock a premium story
 */
export async function unlockPremiumStory(
  storyId: string
): Promise<{
  success: boolean;
  mediaUrl?: string;
  expiresAt?: Date;
  error?: string;
}> {
  try {
    const unlockFn = httpsCallable(functions, 'unlockPremiumStory');
    const result = await unlockFn({ storyId });
    
    return result.data as any;
  } catch (error: any) {
    console.error('Unlock failed:', error);
    return {
      success: false,
      error: error.message || 'Failed to unlock story',
    };
  }
}

/**
 * Check if user has access to a story
 */
export async function checkStoryAccess(
  userId: string,
  storyId: string
): Promise<UnlockAccessInfo> {
  try {
    const now = new Date();
    
    const q = query(
      collection(db, 'premium_story_unlocks'),
      where('userId', '==', userId),
      where('storyId', '==', storyId)
    );
    
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      return { hasAccess: false };
    }
    
    // Check if any unlock is still valid
    for (const doc of snapshot.docs) {
      const unlock = doc.data();
      const expiresAt = unlock.expiresAt.toDate();
      
      if (expiresAt > now) {
        const remainingSeconds = Math.floor((expiresAt.getTime() - now.getTime()) / 1000);
        return {
          hasAccess: true,
          expiresAt,
          remainingSeconds,
          unlockId: doc.id,
        };
      }
    }
    
    return { hasAccess: false };
  } catch (error) {
    console.error('Check access failed:', error);
    return { hasAccess: false };
  }
}

// ============================================================================
// FEED FUNCTIONS
// ============================================================================

/**
 * Fetch premium stories for feed
 */
export async function fetchPremiumStories(
  userId: string,
  limitCount: number = 20
): Promise<PremiumStoryFeedItem[]> {
  try {
    const q = query(
      collection(db, 'premium_stories'),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    
    const snapshot = await getDocs(q);
    
    const stories: PremiumStoryFeedItem[] = [];
    
    for (const docSnap of snapshot.docs) {
      const story = { id: docSnap.id, ...docSnap.data() } as PremiumStory;
      
      // Fetch author info
      const authorSnap = await getDoc(doc(db, 'profiles', story.authorId));
      const authorData = authorSnap.data();
      
      // Check unlock status
      const unlockStatus = await checkStoryAccess(userId, story.id);
      
      stories.push({
        ...story,
        author: {
          id: story.authorId,
          displayName: authorData?.displayName || 'Unknown',
          photoURL: authorData?.photoURL,
          verified: authorData?.verified,
        },
        unlockStatus,
      });
    }
    
    return stories;
  } catch (error) {
    console.error('Fetch stories failed:', error);
    throw error;
  }
}

/**
 * Fetch user's own premium stories
 */
export async function fetchMyPremiumStories(userId: string): Promise<PremiumStory[]> {
  try {
    const q = query(
      collection(db, 'premium_stories'),
      where('authorId', '==', userId),
      orderBy('createdAt', 'desc')
    );
    
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as PremiumStory[];
  } catch (error) {
    console.error('Fetch my stories failed:', error);
    throw error;
  }
}

/**
 * Fetch user's unlocked stories
 */
export async function fetchUnlockedStories(userId: string): Promise<PremiumStoryFeedItem[]> {
  try {
    const now = new Date();
    
    // Get active unlocks
    const q = query(
      collection(db, 'premium_story_unlocks'),
      where('userId', '==', userId)
    );
    
    const unlocksSnap = await getDocs(q);
    
    const validUnlocks = unlocksSnap.docs
      .map((doc) => doc.data())
      .filter((unlock) => unlock.expiresAt.toDate() > now);
    
    if (validUnlocks.length === 0) {
      return [];
    }
    
    // Fetch stories
    const stories: PremiumStoryFeedItem[] = [];
    
    for (const unlock of validUnlocks) {
      const storySnap = await getDoc(doc(db, 'premium_stories', unlock.storyId));
      
      if (!storySnap.exists()) continue;
      
      const story = { id: storySnap.id, ...storySnap.data() } as PremiumStory;
      
      // Fetch author
      const authorSnap = await getDoc(doc(db, 'profiles', story.authorId));
      const authorData = authorSnap.data();
      
      const expiresAt = unlock.expiresAt.toDate();
      const remainingSeconds = Math.floor((expiresAt.getTime() - now.getTime()) / 1000);
      
      stories.push({
        ...story,
        author: {
          id: story.authorId,
          displayName: authorData?.displayName || 'Unknown',
          photoURL: authorData?.photoURL,
          verified: authorData?.verified,
        },
        unlockStatus: {
          hasAccess: true,
          expiresAt,
          remainingSeconds,
          unlockId: unlock.id,
        },
      });
    }
    
    return stories;
  } catch (error) {
    console.error('Fetch unlocked stories failed:', error);
    throw error;
  }
}

// ============================================================================
// ANALYTICS
// ============================================================================

/**
 * Get story analytics for creator
 */
export async function getStoryAnalytics(storyId: string): Promise<{
  viewCount: number;
  unlockCount: number;
  totalEarnings: number;
}> {
  try {
    const storySnap = await getDoc(doc(db, 'premium_stories', storyId));
    
    if (!storySnap.exists()) {
      throw new Error('Story not found');
    }
    
    const story = storySnap.data() as PremiumStory;
    
    // Calculate total earnings
    const totalEarnings = Math.floor(story.priceTokens * story.unlockCount * 0.65);
    
    return {
      viewCount: story.viewCount || 0,
      unlockCount: story.unlockCount || 0,
      totalEarnings,
    };
  } catch (error) {
    console.error('Get analytics failed:', error);
    throw error;
  }
}