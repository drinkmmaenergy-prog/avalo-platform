/**
 * PACK 323 - Feed Story Viewer Screen
 * Story carousel for given user with auto-advance timer
 * Close on tap / swipe down
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  Dimensions,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { db } from "@/lib/firebase";
import { collection, query, where, orderBy, getDocs, Timestamp } from 'firebase/firestore';

const { width, height } = Dimensions.get('window');
const STORY_DURATION = 5000; // 5 seconds per story

interface Story {
  id: string;
  ownerUserId: string;
  mediaUrl: string;
  caption?: string;
  createdAt: any;
  expiresAt: any;
}

export default function FeedStoryViewerScreen() {
  const router = useRouter();
  const { userId } = useLocalSearchParams();
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
  const [stories, setStories] = useState<Story[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);

  // Load stories for user
  useEffect(() => {
    loadStories();
  }, [userId]);

  // Auto-advance timer
  useEffect(() => {
    if (stories.length === 0) return;

    const startTime = Date.now();
    
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progressPercent = (elapsed / STORY_DURATION) * 100;
      
      setProgress(progressPercent);

      if (elapsed >= STORY_DURATION) {
        advanceStory();
      }
    }, 50);

    timerRef.current = interval;

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [currentIndex, stories.length]);

  const loadStories = async () => {
    try {
      setLoading(true);
      
      const now = Timestamp.now();
      const storiesQuery = query(
        collection(db, 'feedStories'),
        where('ownerUserId', '==', userId),
        where('isDeleted', '==', false),
        where('expiresAt', '>', now),
        orderBy('expiresAt', 'asc'),
        orderBy('createdAt', 'desc')
      );

      const storiesSnap = await getDocs(storiesQuery);
      const storiesData = storiesSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Story[];

      if (storiesData.length === 0) {
        Alert.alert('No Stories', 'This user has no active stories');
        router.back();
        return;
      }

      setStories(storiesData);
    } catch (error) {
      console.error('Error loading stories:', error);
      Alert.alert('Error', 'Failed to load stories');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const advanceStory = useCallback(() => {
    if (currentIndex < stories.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setProgress(0);
    } else {
      // All stories viewed, close
      router.back();
    }
  }, [currentIndex, stories.length, router]);

  const goToPreviousStory = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      setProgress(0);
    }
  }, [currentIndex]);

  const handleTapLeft = useCallback(() => {
    goToPreviousStory();
  }, [goToPreviousStory]);

  const handleTapRight = useCallback(() => {
    advanceStory();
  }, [advanceStory]);

  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  if (stories.length === 0) {
    return null;
  }

  const currentStory = stories[currentIndex];

  return (
    <View style={styles.container}>
      {/* Story Image */}
      <Image
        source={{ uri: currentStory.mediaUrl }}
        style={styles.storyImage}
        resizeMode="cover"
      />

      {/* Overlay */}
      <View style={styles.overlay}>
        {/* Progress Bars */}
        <View style={styles.progressContainer}>
          {stories.map((_, index) => (
            <View key={index} style={styles.progressBarBackground}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    width: `${
                      index < currentIndex
                        ? 100
                        : index === currentIndex
                        ? progress
                        : 0
                    }%`,
                  },
                ]}
              />
            </View>
          ))}
        </View>

        {/* Top Bar */}
        <View style={styles.topBar}>
          <Text style={styles.timestamp}>
            {currentStory.createdAt?.toDate?.().toLocaleTimeString() || 'Now'}
          </Text>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={handleClose}
          >
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Caption */}
        {currentStory.caption && (
          <View style={styles.captionContainer}>
            <Text style={styles.caption}>{currentStory.caption}</Text>
          </View>
        )}

        {/* Tap Areas */}
        <View style={styles.tapAreas}>
          <TouchableOpacity
            style={styles.tapAreaLeft}
            onPress={handleTapLeft}
            activeOpacity={1}
          />
          <TouchableOpacity
            style={styles.tapAreaRight}
            onPress={handleTapRight}
            activeOpacity={1}
          />
        </View>

        {/* Story Counter */}
        <View style={styles.counterContainer}>
          <Text style={styles.counter}>
            {currentIndex + 1} / {stories.length}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  storyImage: {
    width: width,
    height: height,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  progressContainer: {
    flexDirection: 'row',
    paddingTop: 50,
    paddingHorizontal: 8,
    gap: 4,
  },
  progressBarBackground: {
    flex: 1,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 1.5,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#FFF',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  timestamp: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '500',
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  captionContainer: {
    position: 'absolute',
    bottom: 100,
    left: 16,
    right: 16,
  },
  caption: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '500',
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  tapAreas: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
  },
  tapAreaLeft: {
    flex: 1,
  },
  tapAreaRight: {
    flex: 1,
  },
  counterContainer: {
    position: 'absolute',
    bottom: 50,
    right: 16,
  },
  counter: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
});
