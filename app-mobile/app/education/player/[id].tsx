import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { doc, getDoc, collection, query, orderBy, getDocs } from 'firebase/firestore';
import { db, auth } from '../../../lib/firebase';
import { Course, CourseModule, CourseProgress } from '../../../../functions/src/types/education.types';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../lib/firebase';
// import { Video, ResizeMode } from 'expo-av';

export default function CoursePlayer() {
  const { id } = useLocalSearchParams();
  const [course, setCourse] = useState<Course | null>(null);
  const [modules, setModules] = useState<CourseModule[]>([]);
  const [currentModule, setCurrentModule] = useState<CourseModule | null>(null);
  const [progress, setProgress] = useState<CourseProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModules, setShowModules] = useState(false);
  const [timeSpent, setTimeSpent] = useState(0);

  useEffect(() => {
    loadCourse();
    const interval = setInterval(() => {
      setTimeSpent(prev => prev + 1);
    }, 60000);
    return () => clearInterval(interval);
  }, [id]);

  useEffect(() => {
    if (timeSpent > 0 && currentModule) {
      saveProgress(false);
    }
  }, [timeSpent]);

  const loadCourse = async () => {
    if (!auth.currentUser) return;

    try {
      setLoading(true);

      const courseDoc = await getDoc(doc(db, 'courses', id as string));
      if (courseDoc.exists()) {
        setCourse({ ...courseDoc.data(), id: courseDoc.id } as Course);
      }

      const modulesSnapshot = await getDocs(
        query(
          collection(db, 'courses', id as string, 'modules'),
          orderBy('order', 'asc')
        )
      );
      const modulesData = modulesSnapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      })) as CourseModule[];
      setModules(modulesData);

      const progressId = `${auth.currentUser.uid}_${id}`;
      const progressDoc = await getDoc(doc(db, 'course_progress', progressId));
      
      if (progressDoc.exists()) {
        const progressData = progressDoc.data() as CourseProgress;
        setProgress(progressData);

        const lastModule = modulesData.find(m => m.id === progressData.currentModuleId);
        setCurrentModule(lastModule || modulesData[0]);
      } else {
        setCurrentModule(modulesData[0]);
      }
    } catch (error) {
      console.error('Error loading course:', error);
      Alert.alert('Error', 'Failed to load course');
    } finally {
      setLoading(false);
    }
  };

  const saveProgress = async (completed: boolean = false) => {
    if (!auth.currentUser || !currentModule) return;

    try {
      const logProgress = httpsCallable(functions, 'logCourseProgress');
      await logProgress({
        courseId: id,
        moduleId: currentModule.id,
        completed,
        timeSpent
      });

      setTimeSpent(0);

      if (completed) {
        const updatedProgress = {
          ...progress!,
          completedModules: [...(progress?.completedModules || []), currentModule.id]
        };
        setProgress(updatedProgress);
      }
    } catch (error) {
      console.error('Error saving progress:', error);
    }
  };

  const handleModuleComplete = async () => {
    await saveProgress(true);

    if (currentModule?.hasQuiz) {
      router.push(`/education/quiz/${currentModule.quizId}` as any);
    } else {
      const currentIndex = modules.findIndex(m => m.id === currentModule?.id);
      if (currentIndex < modules.length - 1) {
        setCurrentModule(modules[currentIndex + 1]);
      } else {
        Alert.alert('Congratulations!', 'You have completed this course!', [
          {
            text: 'Get Certificate',
            onPress: () => router.push(`/education/certificate/${id}` as any)
          }
        ]);
      }
    }
  };

  const isModuleCompleted = (moduleId: string) => {
    return progress?.completedModules.includes(moduleId) || false;
  };

  const handleModuleSelect = (module: CourseModule) => {
    setCurrentModule(module);
    setShowModules(false);
    setTimeSpent(0);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6C63FF" />
        </View>
      </SafeAreaView>
    );
  }

  if (!course || !currentModule) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={64} color="#CCC" />
          <Text style={styles.errorText}>Course not available</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowModules(!showModules)}>
          <Ionicons name="list" size={24} color="#000" />
        </TouchableOpacity>
      </View>

      {showModules ? (
        <ScrollView style={styles.modulesList}>
          <Text style={styles.courseTitleInList}>{course.title}</Text>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                { width: `${progress?.progressPercentage || 0}%` }
              ]}
            />
          </View>
          <Text style={styles.progressText}>
            {progress?.progressPercentage.toFixed(0) || 0}% Complete
          </Text>

          {modules.map((module, index) => (
            <TouchableOpacity
              key={module.id}
              style={[
                styles.moduleItem,
                currentModule.id === module.id && styles.moduleItemActive,
                isModuleCompleted(module.id) && styles.moduleItemCompleted
              ]}
              onPress={() => handleModuleSelect(module)}
            >
              <View style={styles.moduleItemHeader}>
                <Text style={styles.moduleItemNumber}>Module {index + 1}</Text>
                {isModuleCompleted(module.id) && (
                  <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
                )}
              </View>
              <Text style={styles.moduleItemTitle}>{module.title}</Text>
              <Text style={styles.moduleItemDuration}>{module.duration} min</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : (
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.moduleHeader}>
            <Text style={styles.moduleOrder}>
              Module {modules.findIndex(m => m.id === currentModule.id) + 1} of {modules.length}
            </Text>
            <Text style={styles.moduleDuration}>{currentModule.duration} min</Text>
          </View>

          <Text style={styles.moduleTitle}>{currentModule.title}</Text>

          {currentModule.videoUrl && (
            <View style={styles.videoContainer}>
              <View style={styles.videoPlaceholder}>
                <Ionicons name="play-circle" size={64} color="#FFF" />
                <Text style={styles.videoPlaceholderText}>Video Player</Text>
                <Text style={styles.videoNote}>Install expo-av to play videos</Text>
              </View>
            </View>
          )}

          <View style={styles.contentSection}>
            <Text style={styles.sectionTitle}>Description</Text>
            <Text style={styles.moduleDescription}>{currentModule.description}</Text>
          </View>

          {currentModule.contentText && (
            <View style={styles.contentSection}>
              <Text style={styles.sectionTitle}>Content</Text>
              <Text style={styles.contentText}>{currentModule.contentText}</Text>
            </View>
          )}

          {currentModule.attachments.length > 0 && (
            <View style={styles.contentSection}>
              <Text style={styles.sectionTitle}>Resources</Text>
              {currentModule.attachments.map(attachment => (
                <TouchableOpacity key={attachment.id} style={styles.attachment}>
                  <Ionicons name="document" size={20} color="#6C63FF" />
                  <Text style={styles.attachmentName}>{attachment.name}</Text>
                  <Ionicons name="download" size={20} color="#666" />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {!showModules && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.completeButton}
            onPress={handleModuleComplete}
          >
            <Text style={styles.completeButtonText}>
              {currentModule.hasQuiz ? 'Take Quiz' : 'Mark as Complete'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF'
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0'
  },
  content: {
    flex: 1
  },
  moduleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#F8F8F8'
  },
  moduleOrder: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6C63FF'
  },
  moduleDuration: {
    fontSize: 14,
    color: '#666'
  },
  moduleTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#000',
    padding: 20,
    paddingBottom: 12
  },
  contentSection: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0'
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 12
  },
  moduleDescription: {
    fontSize: 15,
    lineHeight: 24,
    color: '#333'
  },
  contentText: {
    fontSize: 15,
    lineHeight: 24,
    color: '#333'
  },
  attachment: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F8F8',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    gap: 12
  },
  attachmentName: {
    flex: 1,
    fontSize: 14,
    color: '#000',
    fontWeight: '500'
  },
  videoContainer: {
    width: '100%',
    height: 220,
    backgroundColor: '#000'
  },
  video: {
    width: '100%',
    height: '100%'
  },
  videoPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000'
  },
  videoPlaceholderText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12
  },
  videoNote: {
    color: '#999',
    fontSize: 12,
    marginTop: 4
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0'
  },
  completeButton: {
    backgroundColor: '#6C63FF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center'
  },
  completeButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold'
  },
  modulesList: {
    flex: 1,
    padding: 20
  },
  courseTitleInList: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 16
  },
  progressBar: {
    height: 8,
    backgroundColor: '#F0F0F0',
    borderRadius: 4,
    marginBottom: 8,
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#6C63FF'
  },
  progressText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20
  },
  moduleItem: {
    backgroundColor: '#F8F8F8',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12
  },
  moduleItemActive: {
    borderWidth: 2,
    borderColor: '#6C63FF'
  },
  moduleItemCompleted: {
    backgroundColor: '#E8F5E9'
  },
  moduleItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  moduleItemNumber: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6C63FF'
  },
  moduleItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4
  },
  moduleItemDuration: {
    fontSize: 12,
    color: '#666'
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  errorText: {
    marginTop: 16,
    fontSize: 16,
    color: '#999'
  }
});