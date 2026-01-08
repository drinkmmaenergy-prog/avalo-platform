/**
 * PACK 323 - Feed Reel Viewer Screen
 * Full-screen vertical video viewer (TikTok style)
 * Auto-play with swipe up/down for next/prev reel
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  Dimensions,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { httpsCallable } from 'firebase/functions';
import { functions, db } from "@/lib/firebase";
import { doc, getDoc, collection, query, where, orderBy, limit as firestoreLimit, getDocs } from 'firebase/firestore';
import { Video, ResizeMode } from 'expo-av';

const { width, height } = Dimensions.get('window');

interface Reel {
  id: string;
  ownerUserId: string;
  videoUrl: string;
  thumbnailUrl?: string;
  caption?: string;
  durationSec: number;
  createdAt: any;
}

export default function FeedReelViewerScreen() {
  const router = useRouter();
  const { reelId } = useLocalSearchParams();
  const videoRef = useRef<Video>(null);
  
  const [reel, setReel] = useState<Reel | null>(null);
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [commentCount, setCommentCount] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);

  // Load reel
  useEffect(() => {
    loadReel();
  }, [reelId]);

  // Autoplay video when loaded
  useEffect(() => {
    if (reel && videoRef.current) {
      videoRef.current.playAsync();
    }
  }, [reel]);

  const loadReel = async () => {
    try {
      setLoading(true);
      const reelDoc = await getDoc(doc(db, 'feedReels', reelId as string));
      
      if (reelDoc.exists()) {
        setReel({ id: reelDoc.id, ...reelDoc.data() } as Reel);
        
        // Load aggregate data
        const aggDoc = await getDoc(doc(db, 'feedAggregates', reelId as string));
        if (aggDoc.exists()) {
          const aggData = aggDoc.data();
          setLikeCount(aggData?.likes || 0);
          setCommentCount(aggData?.comments || 0);
        }

        // Track view
        trackView();
      }
    } catch (error) {
      console.error('Error loading reel:', error);
      Alert.alert('Error', 'Failed to load reel');
    } finally {
      setLoading(false);
    }
  };

  const trackView = async () => {
    try {
      // Simple view tracking - could be enhanced with duration tracking
      const viewsRef = collection(db, 'feedViews');
      // Note: In production, use Cloud Function for view tracking
    } catch (error) {
      console.error('Error tracking view:', error);
    }
  };

  const handleLike = useCallback(async () => {
    const newLiked = !liked;
    setLiked(newLiked);
    setLikeCount(prev => newLiked ? prev + 1 : prev - 1);

    try {
      const likeContent = httpsCallable(functions, 'pack323_likeContent');
      await likeContent({
        contentId: reelId,
        contentType: 'FEED_REEL',
      });
    } catch (error) {
      console.error('Error liking reel:', error);
      // Revert on error
      setLiked(!newLiked);
      setLikeCount(prev => newLiked ? prev - 1 : prev + 1);
    }
  }, [liked, reelId]);

  const handleComment = useCallback(() => {
    // Navigate to comments view (could be a modal)
    Alert.alert('Comments', 'Comments view coming soon!');
  }, []);

  const handleShare = useCallback(() => {
    Alert.alert('Share', 'Share functionality coming soon!');
  }, []);

  const handleReport = useCallback(() => {
    Alert.alert(
      'Report Reel',
      'Select a reason',
      [
        {
          text: 'Spam',
          onPress: () => submitReport('spam'),
        },
        {
          text: 'Harassment',
          onPress: () => submitReport('harassment'),
        },
        {
          text: 'Inappropriate Content',
          onPress: () => submitReport('nudity'),
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]
    );
  }, []);

  const submitReport = async (reason: string) => {
    try {
      const reportContent = httpsCallable(functions, 'pack323_reportContent');
      await reportContent({
        contentId: reelId,
        contentType: 'FEED_REEL',
        reason,
      });

      Alert.alert('Reported', 'Thank you for helping keep Avalo safe');
    } catch (error) {
      console.error('Error reporting reel:', error);
      Alert.alert('Error', 'Failed to submit report');
    }
  };

  const togglePlayPause = useCallback(async () => {
    if (!videoRef.current) return;

    if (isPlaying) {
      await videoRef.current.pauseAsync();
    } else {
      await videoRef.current.playAsync();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const handleVideoEnd = useCallback(() => {
    // Auto-loop or navigate to next reel
    if (videoRef.current) {
      videoRef.current.replayAsync();
    }
  }, []);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  if (!reel) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Reel not found</Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Video Player */}
      <TouchableOpacity
        style={styles.videoContainer}
        activeOpacity={1}
        onPress={togglePlayPause}
      >
        <Video
          ref={videoRef}
          source={{ uri: reel.videoUrl }}
          style={styles.video}
          resizeMode={ResizeMode.COVER}
          shouldPlay
          isLooping
          onPlaybackStatusUpdate={(status) => {
            if (status.isLoaded) {
              setIsPlaying(status.isPlaying);
            }
          }}
          onError={(error) => {
            console.error('Video error:', error);
            Alert.alert('Error', 'Failed to play video');
          }}
        />
      </TouchableOpacity>

      {/* Overlay UI */}
      <View style={styles.overlay}>
        {/* Top Bar */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => router.back()}
          >
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Bottom Info */}
        <View style={styles.bottomBar}>
          <View style={styles.infoSection}>
            {reel.caption && (
              <Text style={styles.caption} numberOfLines={2}>
                {reel.caption}
              </Text>
            )}
          </View>

          {/* Action Buttons */}
          <View style={styles.actionsBar}>
            <TouchableOpacity style={styles.actionButton} onPress={handleLike}>
              <Text style={styles.actionIcon}>{liked ? '❤️' : '🤍'}</Text>
              <Text style={styles.actionCount}>{likeCount}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionButton} onPress={handleComment}>
              <Text style={styles.actionIcon}>💬</Text>
              <Text style={styles.actionCount}>{commentCount}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionButton} onPress={handleShare}>
              <Text style={styles.actionIcon}>📤</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionButton} onPress={handleReport}>
              <Text style={styles.actionIcon}>⚠️</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Play/Pause Indicator */}
        {!isPlaying && (
          <View style={styles.pauseOverlay}>
            <Text style={styles.pauseIcon}>▶️</Text>
          </View>
        )}
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
  videoContainer: {
    flex: 1,
  },
  video: {
    width: width,
    height: height,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
  topBar: {
    paddingTop: 50,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  bottomBar: {
    paddingBottom: 50,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  infoSection: {
    flex: 1,
    marginRight: 16,
  },
  caption: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '500',
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  actionsBar: {
    alignItems: 'center',
    gap: 20,
  },
  actionButton: {
    alignItems: 'center',
  },
  actionIcon: {
    fontSize: 32,
    marginBottom: 4,
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  actionCount: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  pauseOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  pauseIcon: {
    fontSize: 64,
  },
  errorText: {
    fontSize: 16,
    color: '#FFF',
    marginBottom: 16,
  },
  backButton: {
    backgroundColor: '#6C63FF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
