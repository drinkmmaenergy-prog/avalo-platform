/**
 * PACK 382 — Creator Academy Core System
 * Course management, progress tracking, and certification
 */

import * as functions from 'firebase-functions';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import {
  CreatorAcademyCourse,
  CreatorAcademyLesson,
  CreatorAcademyProgress,
  CreatorAcademyCertificate,
  CourseCategory,
  GetLocalizedAcademyContentInput,
  GetLocalizedAcademyContentOutput,
  RegionalAcademyContent,
} from './types/pack382-types';
import { v4 as uuidv4 } from 'uuid';

const db = getFirestore();

/**
 * Enroll user in a course
 */
export const pack382_enrollInCourse = functions.https.onCall(
  async (data: { courseId: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated'
      );
    }

    const { courseId } = data;
    const userId = context.auth.uid;

    try {
      // Check if course exists
      const courseDoc = await db
        .collection('creatorAcademyCourses')
        .doc(courseId)
        .get();

      if (!courseDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Course not found');
      }

      const course = courseDoc.data() as CreatorAcademyCourse;

      // Check tier requirements
      if (course.requiredTier) {
        const userDoc = await db.collection('users').doc(userId).get();
        const userTier = userDoc.data()?.subscriptionTier || 'standard';

        const tierOrder = { standard: 1, vip: 2, royal: 3 };
        if (tierOrder[userTier] < tierOrder[course.requiredTier]) {
          throw new functions.https.HttpsError(
            'permission-denied',
            `Requires ${course.requiredTier} tier`
          );
        }
      }

      // Check for existing enrollment
      const existingProgress = await db
        .collection('creatorAcademyProgress')
        .where('userId', '==', userId)
        .where('courseId', '==', courseId)
        .limit(1)
        .get();

      if (!existingProgress.empty) {
        return { success: true, message: 'Already enrolled', progressId: existingProgress.docs[0].id };
      }

      // Create progress record
      const progressId = uuidv4();
      const progress: CreatorAcademyProgress = {
        progressId,
        userId,
        courseId,
        enrolledAt: Timestamp.now(),
        lastAccessedAt: Timestamp.now(),
        lessonsCompleted: [],
        progressPercentage: 0,
        quizScores: {},
        totalTimeSpentMinutes: 0,
        certificateIssued: false,
      };

      await db.collection('creatorAcademyProgress').doc(progressId).set(progress);

      // Update enrollment count
      await db
        .collection('creatorAcademyCourses')
        .doc(courseId)
        .update({
          enrollmentCount: (course.enrollmentCount || 0) + 1,
        });

      return { success: true, progressId };
    } catch (error) {
      console.error('Error enrolling in course:', error);
      throw new functions.https.HttpsError('internal', 'Failed to enroll');
    }
  }
);

/**
 * Mark lesson as completed
 */
export const pack382_completeLesson = functions.https.onCall(
  async (
    data: {
      courseId: string;
      lessonId: string;
      quizScore?: number;
      timeSpentMinutes?: number;
    },
    context
  ) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated'
      );
    }

    const { courseId, lessonId, quizScore, timeSpentMinutes = 0 } = data;
    const userId = context.auth.uid;

    try {
      // Get progress record
      const progressQuery = await db
        .collection('creatorAcademyProgress')
        .where('userId', '==', userId)
        .where('courseId', '==', courseId)
        .limit(1)
        .get();

      if (progressQuery.empty) {
        throw new functions.https.HttpsError(
          'not-found',
          'Not enrolled in this course'
        );
      }

      const progressDoc = progressQuery.docs[0];
      const progress = progressDoc.data() as CreatorAcademyProgress;

      // Get course to count total lessons
      const courseDoc = await db
        .collection('creatorAcademyCourses')
        .doc(courseId)
        .get();

      const course = courseDoc.data() as CreatorAcademyCourse;

     // Add lesson to completed if not already there
      const lessonsCompleted = progress.lessonsCompleted || [];
      if (!lessonsCompleted.includes(lessonId)) {
        lessonsCompleted.push(lessonId);
      }

      // Update quiz scores if provided
      const quizScores = progress.quizScores || {};
      if (quizScore !== undefined) {
        quizScores[lessonId] = {
          score: quizScore,
          attempts: (quizScores[lessonId]?.attempts || 0) + 1,
          passedAt: quizScore >= 70 ? Timestamp.now() : undefined,
        };
      }

      // Calculate progress
      const progressPercentage = Math.round(
        (lessonsCompleted.length / course.lessonCount) * 100
      );

      const completed = progressPercentage === 100;

      // Update progress
      const updates: any = {
        lessonsCompleted,
        quizScores,
        progressPercentage,
        lastAccessedAt: Timestamp.now(),
        totalTimeSpentMinutes: progress.totalTimeSpentMinutes + timeSpentMinutes,
      };

      if (completed && !progress.completedAt) {
        updates.completedAt = Timestamp.now();

        // Issue certificate if eligible
        if (course.certificateOnCompletion) {
          const certificateId = await issueCertificate(userId, courseId, course);
          updates.certificateIssued = true;
          updates.certificateId = certificateId;
        }

        // Update course completion rate
        await updateCourseCompletionRate(courseId);
      }

      await progressDoc.ref.update(updates);

      return {
        success: true,
        progressPercentage,
        completed,
        certificateIssued: updates.certificateIssued || false,
      };
    } catch (error) {
      console.error('Error completing lesson:', error);
      throw new functions.https.HttpsError('internal', 'Failed to complete lesson');
    }
  }
);

/**
 * Issue certificate
 */
async function issueCertificate(
  userId: string,
  courseId: string,
  course: CreatorAcademyCourse
): Promise<string> {
  const certificateId = uuidv4();

  const certificate: CreatorAcademyCertificate = {
    certificateId,
    userId,
    courseId,
    issuedAt: Timestamp.now(),
    courseName: course.title,
    category: course.category,
    level: course.level,
    completionScore: 100, // Would calculate from quiz scores
    completionTimeMinutes: course.durationMinutes,
    verificationHash: generateVerificationHash(certificateId, userId, courseId),
    isValid: true,
    displayName: `${course.title} Certification`,
    credentialUrl: `https://avalo.app/certificates/${certificateId}`,
  };

  await db
    .collection('creatorAcademyCertificates')
    .doc(certificateId)
    .set(certificate);

  // Grant badge if specified
  if (course.badgeOnCompletion) {
    await grantBadge(userId, course.badgeOnCompletion);
  }

  return certificateId;
}

/**
 * Generate verification hash
 */
function generateVerificationHash(
  certificateId: string,
  userId: string,
  courseId: string
): string {
  const crypto = require('crypto');
  const data = `${certificateId}:${userId}:${courseId}:${Date.now()}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Grant badge to user
 */
async function grantBadge(userId: string, badgeType: string): Promise<void> {
  // Implementation would integrate with badge system
  await db.collection('creatorBadges').add({
    badgeId: uuidv4(),
    userId,
    type: badgeType,
    earnedAt: Timestamp.now(),
    isVisible: true,
    displayOrder: 0,
    isExpired: false,
  });
}

/**
 * Update course completion rate
 */
async function updateCourseCompletionRate(courseId: string): Promise<void> {
  const enrollmentsSnapshot = await db
    .collection('creatorAcademyProgress')
    .where('courseId', '==', courseId)
    .get();

  let completed = 0;
  let total = enrollmentsSnapshot.size;

  enrollmentsSnapshot.forEach((doc) => {
    if (doc.data().completedAt) completed++;
  });

  const completionRate = total > 0 ? (completed / total) * 100 : 0;

  await db
    .collection('creatorAcademyCourses')
    .doc(courseId)
    .update({ completionRate });
}

/**
 * Rate a course
 */
export const pack382_rateCourse = functions.https.onCall(
  async (
    data: { courseId: string; rating: number; feedback?: string },
    context
  ) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated'
      );
    }

    const { courseId, rating, feedback } = data;
    const userId = context.auth.uid;

    if (rating < 1 || rating > 5) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Rating must be between 1 and 5'
      );
    }

    try {
      // Update progress record
      const progressQuery = await db
        .collection('creatorAcademyProgress')
        .where('userId', '==', userId)
        .where('courseId', '==', courseId)
        .limit(1)
        .get();

      if (progressQuery.empty) {
        throw new functions.https.HttpsError(
          'not-found',
          'Must be enrolled to rate'
        );
      }

      await progressQuery.docs[0].ref.update({
        rating,
        feedback,
      });

      // Update course average rating
      const allRatings = await db
        .collection('creatorAcademyProgress')
        .where('courseId', '==', courseId)
        .where('rating', '>', 0)
        .get();

      let totalRating = 0;
      let count = 0;

      allRatings.forEach((doc) => {
        const r = doc.data().rating;
        if (r) {
          totalRating += r;
          count++;
        }
      });

      const avgRating = count > 0 ? totalRating / count : 0;

      await db.collection('creatorAcademyCourses').doc(courseId).update({
        avgRating,
      });

      return { success: true, avgRating };
    } catch (error) {
      console.error('Error rating course:', error);
      throw new functions.https.HttpsError('internal', 'Failed to rate course');
    }
  }
);

/**
 * Get localized academy content for a region
 */
export const pack382_getLocalizedAcademyContent = functions.https.onCall(
  async (
    data: GetLocalizedAcademyContentInput,
    context
  ): Promise<GetLocalizedAcademyContentOutput> => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated'
      );
    }

    const { regionCode, category } = data;

    try {
      // Get regional content
      const regionalDoc = await db
        .collection('regionalAcademyContent')
        .doc(regionCode)
        .get();

      let content: RegionalAcademyContent;

      if (!regionalDoc.exists) {
        // Return default content
        content = getDefaultRegionalContent(regionCode);
      } else {
        content = regionalDoc.data() as RegionalAcademyContent;
      }

      // Get relevant courses
      let coursesQuery = db
        .collection('creatorAcademyCourses')
        .where('isPublished', '==', true);

      if (category) {
        coursesQuery = coursesQuery.where('category', '==', category);
      }

      const coursesSnapshot = await coursesQuery.get();
      const courses: CreatorAcademyCourse[] = [];

      coursesSnapshot.forEach((doc) => {
        courses.push(doc.data() as CreatorAcademyCourse);
      });

      return { content, courses };
    } catch (error) {
      console.error('Error getting localized content:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Failed to get localized content'
      );
    }
  }
);

/**
 * Get default regional content
 */
function getDefaultRegionalContent(regionCode: string): RegionalAcademyContent {
  return {
    regionCode,
    pricingPsychology: {
      preferredPricingStrategy: 'market-based',
      culturalNotes: 'Local market pricing applies',
      examplePricing: {
        chat: 50,
        voice: 100,
        video: 150,
      },
    },
    flirtingStyles: {
      culturalContext: 'Standard approach',
      dosList: ['Be respectful', 'Be genuine', 'Listen actively'],
      dontsList: ['Be pushy', 'Be offensive', 'Make assumptions'],
      examples: [],
    },
    legalBoundaries: {
      contentRestrictions: ['No explicit content', 'No illegal activities'],
      requiredDisclosures: ['Age verification', 'Terms of service'],
      prohibitedContent: ['Adult content', 'Violence', 'Hate speech'],
      complianceLinks: [],
    },
    payoutExpectations: {
      avgEarningsRange: { min: 100, max: 5000 },
      currencyCode: 'USD',
      paymentMethods: ['bank transfer', 'paypal'],
      taxConsiderations: ['Report earnings to tax authority'],
    },
    peakHours: {
      localTimezone: 'UTC',
      peakHours: ['18:00-22:00'],
      offPeakHours: ['02:00-08:00'],
      bestDays: ['Friday', 'Saturday', 'Sunday'],
    },
    localizedCourses: [],
    featuredCreators: [],
    updatedAt: Timestamp.now(),
  };
}

/**
 * Get user's course progress
 */
export const pack382_getUserProgress = functions.https.onCall(
  async (data: { courseId?: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated'
      );
    }

    const userId = context.auth.uid;
    const { courseId } = data;

    try {
      let query = db
        .collection('creatorAcademyProgress')
        .where('userId', '==', userId);

      if (courseId) {
        query = query.where('courseId', '==', courseId);
      }

      const progressSnapshot = await query.get();
      const progress = progressSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      return { success: true, progress };
    } catch (error) {
      console.error('Error getting user progress:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Failed to get progress'
      );
    }
  }
);
