import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { doc, getDoc, collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { auth } from '../../../lib/firebase';
import { Course, CourseModule, CourseReview } from '../../../../functions/src/types/education.types';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../lib/firebase';

export default function CourseDetail() {
  const { id } = useLocalSearchParams();
  const [course, setCourse] = useState<Course | null>(null);
  const [modules, setModules] = useState<CourseModule[]>([]);
  const [reviews, setReviews] = useState<CourseReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [hasPurchased, setHasPurchased] = useState(false);
  const [expandedSection, setExpandedSection] = useState<'modules' | 'reviews' | null>('modules');

  useEffect(() => {
    loadCourseDetails();
  }, [id]);

  const loadCourseDetails = async () => {
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
      setModules(modulesSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as CourseModule)));

      const reviewsSnapshot = await getDocs(
        query(
          collection(db, 'course_reviews'),
          where('courseId', '==', id),
          orderBy('createdAt', 'desc')
        )
      );
      setReviews(reviewsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as CourseReview)));

      if (auth.currentUser) {
        const purchaseDoc = await getDoc(
          doc(db, 'course_purchases', `${auth.currentUser.uid}_${id}`)
        );
        setHasPurchased(purchaseDoc.exists() && purchaseDoc.data()?.status === 'active');
      }
    } catch (error) {
      console.error('Error loading course details:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async () => {
    if (!auth.currentUser) {
      Alert.alert('Sign In Required', 'Please sign in to purchase this course');
      return;
    }

    if (!course) return;

    Alert.alert(
      'Purchase Course',
      `Are you sure you want to purchase "${course.title}" for ${course.price} ${course.currency}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Purchase',
          onPress: async () => {
            try {
              setPurchasing(true);
              const purchaseCourse = httpsCallable(functions, 'purchaseCourse');
              const result = await purchaseCourse({
                userId: auth.currentUser!.uid,
                courseId: id,
                paymentMethod: 'stripe',
                currency: course.currency
              });

              if (result.data) {
                Alert.alert('Success', 'Course purchased successfully!');
                setHasPurchased(true);
                router.push(`/education/player/${id}` as any);
              }
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to purchase course');
            } finally {
              setPurchasing(false);
            }
          }
        }
      ]
    );
  };

  const handleStartCourse = () => {
    router.push(`/education/player/${id}` as any);
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

  if (!course) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={64} color="#CCC" />
          <Text style={styles.errorText}>Course not found</Text>
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
        <TouchableOpacity>
          <Ionicons name="share-outline" size={24} color="#000" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Image source={{ uri: course.coverImage }} style={styles.coverImage} />

        <View style={styles.courseHeader}>
          <Text style={styles.courseTitle}>{course.title}</Text>
          
          <View style={styles.creatorRow}>
            {course.creatorAvatar && (
              <Image source={{ uri: course.creatorAvatar }} style={styles.creatorAvatar} />
            )}
            <Text style={styles.creatorName}>by {course.creatorName}</Text>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Ionicons name="star" size={16} color="#FFD700" />
              <Text style={styles.statText}>{course.rating.toFixed(1)}</Text>
            </View>
            <View style={styles.stat}>
              <Ionicons name="people" size={16} color="#666" />
              <Text style={styles.statText}>{course.enrollmentCount} students</Text>
            </View>
            <View style={styles.stat}>
              <Ionicons name="time" size={16} color="#666" />
              <Text style={styles.statText}>{course.duration}h</Text>
            </View>
            <View style={[styles.levelBadge, getLevelColor(course.level)]}>
              <Text style={styles.levelText}>{course.level}</Text>
            </View>
          </View>

          <Text style={styles.price}>
            {course.price === 0 ? 'Free' : `${course.price} ${course.currency}`}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Description</Text>
          <Text style={styles.description}>{course.description}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What you'll learn</Text>
          {course.learningObjectives.map((objective, index) => (
            <View key={index} style={styles.objectiveRow}>
              <Ionicons name="checkmark-circle" size={20} color="#6C63FF" />
              <Text style={styles.objectiveText}>{objective}</Text>
            </View>
          ))}
        </View>

        {course.prerequisites.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Prerequisites</Text>
            {course.prerequisites.map((prereq, index) => (
              <View key={index} style={styles.objectiveRow}>
                <Ionicons name="information-circle" size={20} color="#666" />
                <Text style={styles.objectiveText}>{prereq}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.section}>
          <TouchableOpacity
            style={styles.sectionTitleRow}
            onPress={() => setExpandedSection(expandedSection === 'modules' ? null : 'modules')}
          >
            <Text style={styles.sectionTitle}>Course Content ({modules.length} modules)</Text>
            <Ionicons
              name={expandedSection === 'modules' ? 'chevron-up' : 'chevron-down'}
              size={24}
              color="#000"
            />
          </TouchableOpacity>

          {expandedSection === 'modules' && modules.map((module, index) => (
            <View key={module.id} style={styles.moduleCard}>
              <View style={styles.moduleHeader}>
                <Text style={styles.moduleNumber}>Module {index + 1}</Text>
                <Text style={styles.moduleDuration}>{module.duration}min</Text>
              </View>
              <Text style={styles.moduleTitle}>{module.title}</Text>
              <Text style={styles.moduleDescription} numberOfLines={2}>
                {module.description}
              </Text>
              {module.isPreview && (
                <View style={styles.previewBadge}>
                  <Text style={styles.previewText}>Preview</Text>
                </View>
              )}
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <TouchableOpacity
            style={styles.sectionTitleRow}
            onPress={() => setExpandedSection(expandedSection === 'reviews' ? null : 'reviews')}
          >
            <Text style={styles.sectionTitle}>Reviews ({course.ratingCount})</Text>
            <Ionicons
              name={expandedSection === 'reviews' ? 'chevron-up' : 'chevron-down'}
              size={24}
              color="#000"
            />
          </TouchableOpacity>

          {expandedSection === 'reviews' && reviews.slice(0, 5).map(review => (
            <View key={review.id} style={styles.reviewCard}>
              <View style={styles.reviewHeader}>
                {review.userAvatar && (
                  <Image source={{ uri: review.userAvatar }} style={styles.reviewAvatar} />
                )}
                <View style={styles.reviewInfo}>
                  <Text style={styles.reviewerName}>{review.userName}</Text>
                  <View style={styles.reviewRating}>
                    {[1, 2, 3, 4, 5].map(star => (
                      <Ionicons
                        key={star}
                        name={star <= review.rating ? 'star' : 'star-outline'}
                        size={14}
                        color="#FFD700"
                      />
                    ))}
                  </View>
                </View>
              </View>
              <Text style={styles.reviewComment}>{review.comment}</Text>
            </View>
          ))}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {!hasPurchased && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.purchaseButton, purchasing && styles.purchaseButtonDisabled]}
            onPress={handlePurchase}
            disabled={purchasing}
          >
            {purchasing ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.purchaseButtonText}>
                {course.price === 0 ? 'Enroll Now' : `Purchase for ${course.price} ${course.currency}`}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {hasPurchased && (
        <View style={styles.footer}>
          <TouchableOpacity style={styles.startButton} onPress={handleStartCourse}>
            <Text style={styles.startButtonText}>Continue Learning</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const getLevelColor = (level: string) => {
  switch (level) {
    case 'beginner':
      return { backgroundColor: '#E8F5E9' };
    case 'intermediate':
      return { backgroundColor: '#FFF3E0' };
    case 'advanced':
      return { backgroundColor: '#FFEBEE' };
    default:
      return { backgroundColor: '#F5F5F5' };
  }
};

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
  coverImage: {
    width: '100%',
    height: 240,
    backgroundColor: '#F0F0F0'
  },
  courseHeader: {
    padding: 20
  },
  courseTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 12
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12
  },
  creatorAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8
  },
  creatorName: {
    fontSize: 14,
    color: '#666'
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 16
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  statText: {
    fontSize: 14,
    color: '#666'
  },
  levelBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12
  },
  levelText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    textTransform: 'capitalize'
  },
  price: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#6C63FF'
  },
  section: {
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
  sectionTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  description: {
    fontSize: 15,
    lineHeight: 24,
    color: '#333'
  },
  objectiveRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 8
  },
  objectiveText: {
    flex: 1,
    fontSize: 15,
    color: '#333',
    lineHeight: 22
  },
  moduleCard: {
    backgroundColor: '#F8F8F8',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12
  },
  moduleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  moduleNumber: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6C63FF'
  },
  moduleDuration: {
    fontSize: 12,
    color: '#666'
  },
  moduleTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4
  },
  moduleDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20
  },
  previewBadge: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: '#E8E5FF',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12
  },
  previewText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6C63FF'
  },
  reviewCard: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0'
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8
  },
  reviewAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12
  },
  reviewInfo: {
    flex: 1
  },
  reviewerName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4
  },
  reviewRating: {
    flexDirection: 'row',
    gap: 2
  },
  reviewComment: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0'
  },
  purchaseButton: {
    backgroundColor: '#6C63FF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center'
  },
  purchaseButtonDisabled: {
    opacity: 0.6
  },
  purchaseButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold'
  },
  startButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center'
  },
  startButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold'
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