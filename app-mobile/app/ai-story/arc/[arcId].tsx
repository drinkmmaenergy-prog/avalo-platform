/**
 * PACK 188 - AI Narrative & Fantasy Engine
 * Story Arc Chapter Viewer
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Alert
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../lib/firebase';

interface StoryChapter {
  chapterId: string;
  title: string;
  content: string;
  narrativeStyle: string;
  mood: string;
  hasChoices: boolean;
  estimatedReadTime: number;
}

interface StoryChoice {
  id: string;
  choiceText: string;
  description: string;
  consequence: string;
  emotionalTone: string;
  impactType: string;
}

interface SceneState {
  stateId: string;
  currentChapterId: string;
  progressPercentage: number;
  status: string;
}

export default function StoryArcViewer() {
  const router = useRouter();
  const { arcId } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<SceneState | null>(null);
  const [chapter, setChapter] = useState<StoryChapter | null>(null);
  const [choices, setChoices] = useState<StoryChoice[]>([]);
  const [showChoices, setShowChoices] = useState(false);
  const [selecting, setSelecting] = useState(false);

  useEffect(() => {
    initializeStory();
  }, [arcId]);

  const initializeStory = async () => {
    try {
      setLoading(true);
      
      const startStoryFunc = httpsCallable(functions, 'startStoryArc');
      const result = await startStoryFunc({ arcId });
      
      const data = result.data as any;
      if (data.success) {
        setState({
          stateId: data.stateId,
          currentChapterId: data.currentChapter,
          progressPercentage: 0,
          status: 'in_progress'
        });
        setChapter(data.chapter);
        
        if (data.chapter?.hasChoices) {
          await loadChoices(data.stateId);
        }
      }
    } catch (error: any) {
      console.error('Error initializing story:', error);
      Alert.alert('Error', error.message || 'Failed to start story');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const loadChoices = async (stateId: string) => {
    try {
      const getChoicesFunc = httpsCallable(functions, 'getStoryChoices');
      const result = await getChoicesFunc({ stateId });
      
      const data = result.data as any;
      if (data.success && data.hasChoices) {
        setChoices(data.choices);
      }
    } catch (error) {
      console.error('Error loading choices:', error);
    }
  };

  const makeChoice = async (branchId: string) => {
    if (!state) return;
    
    try {
      setSelecting(true);
      
      const makeChoiceFunc = httpsCallable(functions, 'makeStoryChoice');
      const result = await makeChoiceFunc({
        stateId: state.stateId,
        branchId
      });
      
      const data = result.data as any;
      
      if (data.paused) {
        Alert.alert(
          'Story Paused',
          data.message,
          [
            {
              text: 'Okay',
              onPress: () => router.back()
            }
          ]
        );
        return;
      }
      
      if (data.success && data.nextChapter) {
        setChapter(data.nextChapter);
        setState({
          ...state,
          progressPercentage: data.progressPercentage
        });
        setShowChoices(false);
        setChoices([]);
        
        if (data.nextChapter.hasChoices) {
          await loadChoices(state.stateId);
        }
      } else if (data.success && !data.nextChapter) {
        Alert.alert(
          'Story Complete!',
          'You\'ve reached the end of this story arc.',
          [
            {
              text: 'Finish',
              onPress: () => completeStory()
            }
          ]
        );
      }
    } catch (error: any) {
      console.error('Error making choice:', error);
      Alert.alert('Error', error.message || 'Failed to make choice');
    } finally {
      setSelecting(false);
    }
  };

  const completeStory = async () => {
    if (!state) return;
    
    try {
      const completeFunc = httpsCallable(functions, 'completeStoryArc');
      await completeFunc({
        stateId: state.stateId,
        outcomeType: 'passionate_kiss'
      });
      
      router.back();
    } catch (error) {
      console.error('Error completing story:', error);
      router.back();
    }
  };

  const getMoodEmoji = (mood: string) => {
    const moodMap: Record<string, string> = {
      lighthearted: '😊',
      tense: '😰',
      romantic: '💕',
      mysterious: '🔮',
      exciting: '⚡'
    };
    return moodMap[mood] || '📖';
  };

  const getImpactColor = (impact: string) => {
    const colorMap: Record<string, string> = {
      minor: '#3498DB',
      moderate: '#F39C12',
      major: '#E74C3C'
    };
    return colorMap[impact] || '#95A5A6';
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#9B59B6" />
          <Text style={styles.loadingText}>Loading story...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!chapter || !state) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={64} color="#E74C3C" />
          <Text style={styles.errorText}>Story not found</Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                { width: `${state.progressPercentage}%` }
              ]}
            />
          </View>
          <Text style={styles.progressText}>
            {Math.round(state.progressPercentage)}%
          </Text>
        </View>
        <TouchableOpacity onPress={() => {
          Alert.alert(
            'Reset Story?',
            'This will restart the story from the beginning.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Reset',
                style: 'destructive',
                onPress: () => initializeStory()
              }
            ]
          );
        }}>
          <Ionicons name="refresh" size={24} color="#333" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.chapterHeader}>
          <Text style={styles.moodBadge}>
            {getMoodEmoji(chapter.mood)} {chapter.mood}
          </Text>
          <Text style={styles.readTime}>
            <Ionicons name="time-outline" size={14} /> {chapter.estimatedReadTime} min
          </Text>
        </View>

        <Text style={styles.chapterTitle}>{chapter.title}</Text>

        <View style={styles.storyContent}>
          <Text style={styles.storyText}>{chapter.content}</Text>
        </View>

        {chapter.hasChoices && choices.length > 0 && !showChoices && (
          <TouchableOpacity
            style={styles.continueButton}
            onPress={() => setShowChoices(true)}
          >
            <Text style={styles.continueButtonText}>Make a Choice</Text>
            <Ionicons name="chevron-forward" size={20} color="#FFF" />
          </TouchableOpacity>
        )}

        {showChoices && choices.length > 0 && (
          <View style={styles.choicesContainer}>
            <Text style={styles.choicesTitle}>What will you do?</Text>
            
            {choices.map((choice) => (
              <TouchableOpacity
                key={choice.id}
                style={styles.choiceCard}
                onPress={() => makeChoice(choice.id)}
                disabled={selecting}
              >
                <View style={styles.choiceHeader}>
                  <Text style={styles.choiceText}>{choice.choiceText}</Text>
                  <View
                    style={[
                      styles.impactBadge,
                      { backgroundColor: getImpactColor(choice.impactType) }
                    ]}
                  >
                    <Text style={styles.impactText}>{choice.impactType}</Text>
                  </View>
                </View>
                
                <Text style={styles.choiceDescription}>{choice.description}</Text>
                
                {choice.consequence && (
                  <View style={styles.consequenceContainer}>
                    <Ionicons name="information-circle-outline" size={16} color="#666" />
                    <Text style={styles.consequenceText}>{choice.consequence}</Text>
                  </View>
                )}
                
                <Ionicons
                  name="arrow-forward-circle"
                  size={24}
                  color="#9B59B6"
                  style={styles.choiceArrow}
                />
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.safetyReminder}>
          <Ionicons name="heart" size={16} color="#E74C3C" />
          <Text style={styles.safetyText}>
            Remember: This is fantasy. Real connections matter most!
          </Text>
        </View>
      </ScrollView>

      {selecting && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color="#9B59B6" />
          <Text style={styles.overlayText}>Processing choice...</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA'
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0'
  },
  progressContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16
  },
  progressBar: {
    flex: 1,
    height: 8,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#9B59B6',
    borderRadius: 4
  },
  progressText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginLeft: 8,
    minWidth: 35
  },
  content: {
    flex: 1
  },
  contentContainer: {
    padding: 20
  },
  chapterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16
  },
  moodBadge: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9B59B6',
    textTransform: 'capitalize'
  },
  readTime: {
    fontSize: 12,
    color: '#666'
  },
  chapterTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20
  },
  storyContent: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  storyText: {
    fontSize: 16,
    lineHeight: 28,
    color: '#333',
    textAlign: 'justify'
  },
  continueButton: {
    flexDirection: 'row',
    backgroundColor: '#9B59B6',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24
  },
  continueButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
    marginRight: 8
  },
  choicesContainer: {
    marginBottom: 24
  },
  choicesTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
    textAlign: 'center'
  },
  choiceCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#E0E0E0'
  },
  choiceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8
  },
  choiceText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginRight: 12
  },
  impactBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8
  },
  impactText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFF',
    textTransform: 'uppercase'
  },
  choiceDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 8
  },
  consequenceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F0F0',
    padding: 8,
    borderRadius: 8,
    marginTop: 8
  },
  consequenceText: {
    flex: 1,
    fontSize: 12,
    color: '#666',
    marginLeft: 6
  },
  choiceArrow: {
    position: 'absolute',
    right: 16,
    bottom: 16
  },
  safetyReminder: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3E0',
    padding: 16,
    borderRadius: 8,
    marginVertical: 20
  },
  safetyText: {
    flex: 1,
    fontSize: 12,
    color: '#E65100',
    marginLeft: 8,
    fontStyle: 'italic'
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666'
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#E74C3C',
    marginTop: 16,
    marginBottom: 24
  },
  backButton: {
    backgroundColor: '#9B59B6',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8
  },
  backButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600'
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  overlayText: {
    color: '#FFF',
    fontSize: 14,
    marginTop: 12
  }
});