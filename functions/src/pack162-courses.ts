/**
 * PACK 162: Avalo Creator Publishing Suite 3.0
 * 
 * Long-Form Courses · Series · Audiobooks · Multi-Episode Programs
 * Zero NSFW Loopholes
 * 
 * Features:
 * - Multi-episode courses and series
 * - Structured learning paths
 * - Audiobooks and narrative series
 * - Training programs and routines
 * - Progress tracking and XP system
 * - Course bundling
 * - Certificate generation
 * - Quiz and checkpoints
 * - NSFW moderation (zero nudity, sensual content, or parasocial exploitation)
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { db, auth, storage, generateId, serverTimestamp, increment, arrayUnion, timestamp } from './init';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type CourseFormat = 
  | 'LINEAR_COURSE'
  | 'MULTI_TRACK'
  | 'WEEKLY_PROGRAM'
  | 'AUDIOBOOK_SERIES'
  | 'CHALLENGE_SERIES';

export type CourseCategory =
  | 'BUSINESS'
  | 'EDUCATION'
  | 'FITNESS'
  | 'LIFESTYLE'
  | 'PERSONAL_DEVELOPMENT'
  | 'SKILLS'
  | 'HEALTH'
  | 'CREATIVITY';

export type CourseStatus = 'DRAFT' | 'UNDER_REVIEW' | 'PUBLISHED' | 'SUSPENDED' | 'ARCHIVED';
export type CourseVisibility = 'PUBLIC' | 'PRIVATE' | 'UNLISTED';
export type ContentType = 'VIDEO' | 'AUDIO' | 'TEXT' | 'PDF' | 'IMAGE' | 'MIXED';
export type PurchaseType = 'FULL_COURSE' | 'SINGLE_EPISODE';

interface Course {
  courseId: string;
  creatorId: string;
  title: string;
  description: string;
  format: CourseFormat;
  category: CourseCategory;
  status: CourseStatus;
  visibility: CourseVisibility;
  contentType: ContentType;
  
  priceTokens: number;
  episodeCount: number;
  totalDurationMinutes: number;
  
  thumbnailUrl?: string;
  previewVideoUrl?: string;
  
  tags: string[];
  learningObjectives: string[];
  prerequisites: string[];
  
  allowIndividualEpisodePurchase: boolean;
  episodePriceTokens?: number;
  
  stats: {
    enrollmentCount: number;
    completionCount: number;
    averageRating: number;
    reviewCount: number;
    totalRevenue: number;
  };
  
  moderationFlags: string[];
  lastModerationCheck?: Timestamp;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
  publishedAt?: Timestamp;
}

interface CourseEpisode {
  episodeId: string;
  courseId: string;
  creatorId: string;
  
  title: string;
  description: string;
  orderIndex: number;
  
  contentType: ContentType;
  contentUrl: string;
  durationMinutes: number;
  
  resources: Array<{
    type: 'PDF' | 'IMAGE' | 'LINK';
    title: string;
    url: string;
  }>;
  
  hasQuiz: boolean;
  quizId?: string;
  
  status: CourseStatus;
  publishedAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface CoursePurchase {
  purchaseId: string;
  userId: string;
  courseId: string;
  creatorId: string;
  
  purchaseType: PurchaseType;
  episodeId?: string;
  
  priceTokens: number;
  creatorEarnings: number;
  platformFee: number;
  
  transactionId: string;
  status: 'ACTIVE' | 'REFUNDED' | 'REVOKED';
  
  purchasedAt: Timestamp;
  expiresAt?: Timestamp;
}

interface CourseProgress {
  progressId: string;
  userId: string;
  courseId: string;
  
  completedEpisodes: string[];
  currentEpisodeId?: string;
  
  progressPercentage: number;
  totalTimeSpentMinutes: number;
  
  xpEarned: number;
  badgesEarned: string[];
  
  startedAt: Timestamp;
  lastAccessedAt: Timestamp;
  completedAt?: Timestamp;
}

interface EpisodeProgress {
  progressId: string;
  userId: string;
  courseId: string;
  episodeId: string;
  
  watchedMinutes: number;
  completed: boolean;
  
  quizScore?: number;
  quizPassed?: boolean;
  
  lastWatchedAt: Timestamp;
  completedAt?: Timestamp;
}

interface CourseReview {
  reviewId: string;
  courseId: string;
  userId: string;
  
  rating: number;
  comment: string;
  
  helpful: number;
  reported: number;
  
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface CourseBundle {
  bundleId: string;
  creatorId: string;
  
  title: string;
  description: string;
  
  courseIds: string[];
  
  originalPriceTokens: number;
  bundlePriceTokens: number;
  discountPercentage: number;
  
  status: 'ACTIVE' | 'INACTIVE';
  
  createdAt: Timestamp;
  expiresAt?: Timestamp;
}

interface CourseCertificate {
  certificateId: string;
  userId: string;
  courseId: string;
  creatorId: string;
  
  userName: string;
  courseName: string;
  
  completionDate: Timestamp;
  issuedAt: Timestamp;
  
  certificateUrl: string;
  verificationCode: string;
}

interface CourseQuiz {
  quizId: string;
  courseId: string;
  episodeId: string;
  creatorId: string;
  
  title: string;
  passingScore: number;
  
  questions: Array<{
    questionId: string;
    question: string;
    options: string[];
    correctAnswer: number;
    explanation?: string;
  }>;
  
  createdAt: Timestamp;
}

// ============================================================================
// MODERATION UTILITIES
// ============================================================================

const NSFW_KEYWORDS = [
  'asmr',
  'erotic',
  'erotica',
  'sensual',
  'seduction',
  'pickup',
  'girlfriend',
  'boyfriend',
  'romance',
  'dating',
  'intimacy',
  'arousal',
  'nude',
  'naked',
  'fetish',
  'roleplay',
  'sugar',
  'escort',
  'sexy',
  'hot',
  'sexual',
];

const FORBIDDEN_CATEGORIES = [
  'adult',
  'dating',
  'romance',
  'seduction',
  'intimacy',
];

async function moderateCourseContent(
  title: string,
  description: string,
  tags: string[],
  category: string
): Promise<{ safe: boolean; flags: string[] }> {
  const flags: string[] = [];
  const content = `${title} ${description} ${tags.join(' ')}`.toLowerCase();
  
  for (const keyword of NSFW_KEYWORDS) {
    if (content.includes(keyword)) {
      flags.push(`nsfw_keyword_${keyword}`);
    }
  }
  
  if (FORBIDDEN_CATEGORIES.includes(category.toLowerCase())) {
    flags.push('forbidden_category');
  }
  
  if (title.match(/\b(18\+|adult|nsfw|explicit)\b/i)) {
    flags.push('explicit_title_marker');
  }
  
  const safe = flags.length === 0;
  
  if (!safe) {
    await db.collection('course_moderation_flags').add({
      contentType: 'COURSE',
      flags,
      content: { title, description, tags, category },
      status: 'PENDING_REVIEW',
      severity: 'HIGH',
      createdAt: serverTimestamp(),
    });
  }
  
  return { safe, flags };
}

async function moderateEpisodeContent(
  episodeId: string,
  title: string,
  description: string,
  contentUrl: string
): Promise<{ safe: boolean; flags: string[] }> {
  const flags: string[] = [];
  const content = `${title} ${description}`.toLowerCase();
  
  for (const keyword of NSFW_KEYWORDS) {
    if (content.includes(keyword)) {
      flags.push(`nsfw_keyword_${keyword}`);
    }
  }
  
  if (contentUrl.match(/\b(onlyfans|patreon|\/adult\/|\/nsfw\/)\b/i)) {
    flags.push('suspicious_content_url');
  }
  
  const safe = flags.length === 0;
  
  if (!safe) {
    await db.collection('course_moderation_flags').add({
      contentType: 'EPISODE',
      episodeId,
      flags,
      content: { title, description, contentUrl },
      status: 'PENDING_REVIEW',
      severity: 'HIGH',
      createdAt: serverTimestamp(),
    });
  }
  
  return { safe, flags };
}

// ============================================================================
// COURSE MANAGEMENT
// ============================================================================

export const createCourse = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const {
      title,
      description,
      format,
      category,
      contentType,
      priceTokens,
      tags = [],
      learningObjectives = [],
      prerequisites = [],
      allowIndividualEpisodePurchase = false,
      episodePriceTokens,
    } = request.data;

    if (!title || !description || !format || !category) {
      throw new HttpsError('invalid-argument', 'Missing required fields');
    }

    if (priceTokens < 0 || priceTokens > 100000) {
      throw new HttpsError('invalid-argument', 'Invalid price range');
    }

    const moderation = await moderateCourseContent(title, description, tags, category);
    if (!moderation.safe) {
      throw new HttpsError(
        'failed-precondition',
        'Course content violates content policy - contains NSFW or forbidden content'
      );
    }

    const courseId = generateId();
    const course: Course = {
      courseId,
      creatorId: uid,
      title,
      description,
      format,
      category,
      status: 'DRAFT',
      visibility: 'PRIVATE',
      contentType,
      priceTokens,
      episodeCount: 0,
      totalDurationMinutes: 0,
      tags,
      learningObjectives,
      prerequisites,
      allowIndividualEpisodePurchase,
      episodePriceTokens,
      stats: {
        enrollmentCount: 0,
        completionCount: 0,
        averageRating: 0,
        reviewCount: 0,
        totalRevenue: 0,
      },
      moderationFlags: [],
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    await db.collection('courses').doc(courseId).set(course);

    logger.info(`Course created: ${courseId} by ${uid}`);

    return {
      success: true,
      courseId,
      message: 'Course created successfully',
    };
  }
);

export const publishCourse = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { courseId } = request.data;

    const courseDoc = await db.collection('courses').doc(courseId).get();
    if (!courseDoc.exists) {
      throw new HttpsError('not-found', 'Course not found');
    }

    const course = courseDoc.data() as Course;
    if (course.creatorId !== uid) {
      throw new HttpsError('permission-denied', 'Not your course');
    }

    if (course.episodeCount === 0) {
      throw new HttpsError('failed-precondition', 'Course must have at least one episode');
    }

    if (course.moderationFlags.length > 0) {
      throw new HttpsError('failed-precondition', 'Course has unresolved moderation flags');
    }

    await courseDoc.ref.update({
      status: 'PUBLISHED',
      visibility: 'PUBLIC',
      publishedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return {
      success: true,
      message: 'Course published successfully',
    };
  }
);

export const publishEpisode = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const {
      courseId,
      title,
      description,
      contentType,
      contentUrl,
      durationMinutes,
      orderIndex,
      resources = [],
    } = request.data;

    if (!courseId || !title || !contentType || !contentUrl) {
      throw new HttpsError('invalid-argument', 'Missing required fields');
    }

    const courseDoc = await db.collection('courses').doc(courseId).get();
    if (!courseDoc.exists) {
      throw new HttpsError('not-found', 'Course not found');
    }

    const course = courseDoc.data() as Course;
    if (course.creatorId !== uid) {
      throw new HttpsError('permission-denied', 'Not your course');
    }

    const episodeId = generateId();
    const moderation = await moderateEpisodeContent(episodeId, title, description, contentUrl);
    
    if (!moderation.safe) {
      throw new HttpsError(
        'failed-precondition',
        'Episode content violates content policy'
      );
    }

    const episode: CourseEpisode = {
      episodeId,
      courseId,
      creatorId: uid,
      title,
      description,
      orderIndex,
      contentType,
      contentUrl,
      durationMinutes,
      resources,
      hasQuiz: false,
      status: 'PUBLISHED',
      publishedAt: Timestamp.now(),
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    await db.runTransaction(async (transaction) => {
      transaction.set(db.collection('course_episodes').doc(episodeId), episode);
      
      transaction.update(courseDoc.ref, {
        episodeCount: increment(1),
        totalDurationMinutes: increment(durationMinutes),
        updatedAt: serverTimestamp(),
      });
    });

    logger.info(`Episode published: ${episodeId} for course ${courseId}`);

    return {
      success: true,
      episodeId,
      message: 'Episode published successfully',
    };
  }
);

// ============================================================================
// COURSE PURCHASES
// ============================================================================

export const purchaseCourse = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { courseId, purchaseType = 'FULL_COURSE', episodeId } = request.data;

    const courseDoc = await db.collection('courses').doc(courseId).get();
    if (!courseDoc.exists) {
      throw new HttpsError('not-found', 'Course not found');
    }

    const course = courseDoc.data() as Course;

    if (course.status !== 'PUBLISHED') {
      throw new HttpsError('failed-precondition', 'Course is not published');
    }

    if (course.creatorId === uid) {
      throw new HttpsError('failed-precondition', 'Cannot purchase your own course');
    }

    const existingPurchaseKey = `${uid}_${courseId}`;
    const existingPurchase = await db.collection('course_purchases')
      .doc(existingPurchaseKey)
      .get();

    if (existingPurchase.exists) {
      throw new HttpsError('already-exists', 'Already purchased this course');
    }

    let priceTokens: number;
    if (purchaseType === 'SINGLE_EPISODE') {
      if (!course.allowIndividualEpisodePurchase) {
        throw new HttpsError('failed-precondition', 'Individual episode purchase not allowed');
      }
      if (!episodeId) {
        throw new HttpsError('invalid-argument', 'Episode ID required');
      }
      priceTokens = course.episodePriceTokens || 0;
    } else {
      priceTokens = course.priceTokens;
    }

    const platformFee = Math.floor(priceTokens * 0.35);
    const creatorEarnings = priceTokens - platformFee;

    const userWalletRef = db.collection('users').doc(uid).collection('wallet').doc('current');
    const userWallet = await userWalletRef.get();
    const balance = userWallet.data()?.balance || 0;

    if (balance < priceTokens) {
      throw new HttpsError('failed-precondition', 'Insufficient balance');
    }

    const purchaseId = generateId();
    const transactionId = `tx_course_${purchaseId}`;

    const purchase: CoursePurchase = {
      purchaseId,
      userId: uid,
      courseId,
      creatorId: course.creatorId,
      purchaseType,
      episodeId,
      priceTokens,
      creatorEarnings,
      platformFee,
      transactionId,
      status: 'ACTIVE',
      purchasedAt: Timestamp.now(),
    };

    await db.runTransaction(async (transaction) => {
      transaction.update(userWalletRef, {
        balance: increment(-priceTokens),
      });

      const creatorWalletRef = db.collection('users')
        .doc(course.creatorId)
        .collection('wallet')
        .doc('current');
      transaction.update(creatorWalletRef, {
        balance: increment(creatorEarnings),
      });

      transaction.set(
        db.collection('course_purchases').doc(existingPurchaseKey),
        purchase
      );

      transaction.update(courseDoc.ref, {
        'stats.enrollmentCount': increment(1),
        'stats.totalRevenue': increment(priceTokens),
      });

      transaction.set(db.collection('transactions').doc(transactionId), {
        transactionId,
        type: 'course_purchase',
        userId: uid,
        creatorId: course.creatorId,
        courseId,
        amount: priceTokens,
        creatorEarnings,
        platformFee,
        createdAt: serverTimestamp(),
      });
    });

    logger.info(`Course purchased: ${courseId} by ${uid}`);

    return {
      success: true,
      purchaseId,
      message: 'Course purchased successfully',
    };
  }
);

export const purchaseEpisode = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { courseId, episodeId } = request.data;

    const courseDoc = await db.collection('courses').doc(courseId).get();
    if (!courseDoc.exists) {
      throw new HttpsError('not-found', 'Course not found');
    }

    const course = courseDoc.data() as Course;

    if (course.status !== 'PUBLISHED') {
      throw new HttpsError('failed-precondition', 'Course is not published');
    }

    if (!course.allowIndividualEpisodePurchase) {
      throw new HttpsError('failed-precondition', 'Individual episode purchase not allowed');
    }

    if (!episodeId) {
      throw new HttpsError('invalid-argument', 'Episode ID required');
    }

    if (course.creatorId === uid) {
      throw new HttpsError('failed-precondition', 'Cannot purchase your own content');
    }

    const existingPurchaseKey = `${uid}_${courseId}_${episodeId}`;
    const existingPurchase = await db.collection('course_purchases')
      .doc(existingPurchaseKey)
      .get();

    if (existingPurchase.exists) {
      throw new HttpsError('already-exists', 'Already purchased this episode');
    }

    const priceTokens = course.episodePriceTokens || 0;
    const platformFee = Math.floor(priceTokens * 0.35);
    const creatorEarnings = priceTokens - platformFee;

    const userWalletRef = db.collection('users').doc(uid).collection('wallet').doc('current');
    const userWallet = await userWalletRef.get();
    const balance = userWallet.data()?.balance || 0;

    if (balance < priceTokens) {
      throw new HttpsError('failed-precondition', 'Insufficient balance');
    }

    const purchaseId = generateId();
    const transactionId = `tx_episode_${purchaseId}`;

    const purchase: CoursePurchase = {
      purchaseId,
      userId: uid,
      courseId,
      creatorId: course.creatorId,
      purchaseType: 'SINGLE_EPISODE',
      episodeId,
      priceTokens,
      creatorEarnings,
      platformFee,
      transactionId,
      status: 'ACTIVE',
      purchasedAt: Timestamp.now(),
    };

    await db.runTransaction(async (transaction) => {
      transaction.update(userWalletRef, {
        balance: increment(-priceTokens),
      });

      const creatorWalletRef = db.collection('users')
        .doc(course.creatorId)
        .collection('wallet')
        .doc('current');
      transaction.update(creatorWalletRef, {
        balance: increment(creatorEarnings),
      });

      transaction.set(
        db.collection('course_purchases').doc(existingPurchaseKey),
        purchase
      );

      transaction.update(courseDoc.ref, {
        'stats.totalRevenue': increment(priceTokens),
      });

      transaction.set(db.collection('transactions').doc(transactionId), {
        transactionId,
        type: 'episode_purchase',
        userId: uid,
        creatorId: course.creatorId,
        courseId,
        episodeId,
        amount: priceTokens,
        creatorEarnings,
        platformFee,
        createdAt: serverTimestamp(),
      });
    });

    logger.info(`Episode purchased: ${episodeId} by ${uid}`);

    return {
      success: true,
      purchaseId,
      message: 'Episode purchased successfully',
    };
  }
);

// ============================================================================
// PROGRESS TRACKING
// ============================================================================

export const trackCourseProgress = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { courseId, episodeId, watchedMinutes, completed } = request.data;

    const progressId = `${uid}_${courseId}`;
    const episodeProgressId = `${uid}_${courseId}_${episodeId}`;

    const existingProgress = await db.collection('course_progress').doc(progressId).get();

    await db.runTransaction(async (transaction) => {
      if (!existingProgress.exists) {
        const newProgress: CourseProgress = {
          progressId,
          userId: uid,
          courseId,
          completedEpisodes: completed ? [episodeId] : [],
          currentEpisodeId: episodeId,
          progressPercentage: 0,
          totalTimeSpentMinutes: watchedMinutes || 0,
          xpEarned: 0,
          badgesEarned: [],
          startedAt: Timestamp.now(),
          lastAccessedAt: Timestamp.now(),
        };
        transaction.set(db.collection('course_progress').doc(progressId), newProgress);
      } else {
        const updates: any = {
          currentEpisodeId: episodeId,
          totalTimeSpentMinutes: increment(watchedMinutes || 0),
          lastAccessedAt: serverTimestamp(),
        };

        if (completed) {
          updates.completedEpisodes = arrayUnion(episodeId);
          updates.xpEarned = increment(10);
        }

        transaction.update(db.collection('course_progress').doc(progressId), updates);
      }

      const episodeProgress: EpisodeProgress = {
        progressId: episodeProgressId,
        userId: uid,
        courseId,
        episodeId,
        watchedMinutes: watchedMinutes || 0,
        completed: completed || false,
        lastWatchedAt: Timestamp.now(),
        completedAt: completed ? Timestamp.now() : undefined,
      };

      transaction.set(
        db.collection('episode_progress').doc(episodeProgressId),
        episodeProgress,
        { merge: true }
      );
    });

    return {
      success: true,
      message: 'Progress tracked successfully',
    };
  }
);

// ============================================================================
// REVIEWS
// ============================================================================

export const reviewCourse = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { courseId, rating, comment } = request.data;

    if (rating < 1 || rating > 5) {
      throw new HttpsError('invalid-argument', 'Rating must be between 1 and 5');
    }

    const purchaseKey = `${uid}_${courseId}`;
    const purchase = await db.collection('course_purchases').doc(purchaseKey).get();

    if (!purchase.exists) {
      throw new HttpsError('failed-precondition', 'Must purchase course before reviewing');
    }

    const reviewId = generateId();
    const review: CourseReview = {
      reviewId,
      courseId,
      userId: uid,
      rating,
      comment,
      helpful: 0,
      reported: 0,
      status: 'APPROVED',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    await db.collection('course_reviews').doc(reviewId).set(review);

    const courseRef = db.collection('courses').doc(courseId);
    const courseDoc = await courseRef.get();
    const course = courseDoc.data() as Course;

    const newReviewCount = course.stats.reviewCount + 1;
    const newAverageRating =
      (course.stats.averageRating * course.stats.reviewCount + rating) / newReviewCount;

    await courseRef.update({
      'stats.reviewCount': increment(1),
      'stats.averageRating': newAverageRating,
    });

    return {
      success: true,
      reviewId,
      message: 'Review submitted successfully',
    };
  }
);

// ============================================================================
// CERTIFICATES
// ============================================================================

async function generateCertificate(
  userId: string,
  courseId: string
): Promise<CourseCertificate> {
  const userDoc = await db.collection('users').doc(userId).get();
  const courseDoc = await db.collection('courses').doc(courseId).get();

  const userName = userDoc.data()?.displayName || 'Student';
  const course = courseDoc.data() as Course;

  const certificateId = generateId();
  const verificationCode = `AVALO-${Date.now()}-${userId.substring(0, 8)}`;

  const certificate: CourseCertificate = {
    certificateId,
    userId,
    courseId,
    creatorId: course.creatorId,
    userName,
    courseName: course.title,
    completionDate: Timestamp.now(),
    issuedAt: Timestamp.now(),
    certificateUrl: `https://avalo.app/certificates/${certificateId}`,
    verificationCode,
  };

  await db.collection('course_certificates').doc(certificateId).set(certificate);

  return certificate;
}

export const issueCertificate = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { courseId } = request.data;

    const progressId = `${uid}_${courseId}`;
    const progressDoc = await db.collection('course_progress').doc(progressId).get();

    if (!progressDoc.exists) {
      throw new HttpsError('failed-precondition', 'No progress found for this course');
    }

    const progress = progressDoc.data() as CourseProgress;
    if (progress.progressPercentage < 100) {
      throw new HttpsError('failed-precondition', 'Course not completed');
    }

    const certificate = await generateCertificate(uid, courseId);

    return {
      success: true,
      certificate,
      message: 'Certificate issued successfully',
    };
  }
);

// ============================================================================
// BUNDLES
// ============================================================================

export const createCourseBundle = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { title, description, courseIds, discountPercentage } = request.data;

    if (courseIds.length < 2) {
      throw new HttpsError('invalid-argument', 'Bundle must have at least 2 courses');
    }

    if (discountPercentage < 0 || discountPercentage > 50) {
      throw new HttpsError('invalid-argument', 'Discount must be between 0-50%');
    }

    let originalPrice = 0;
    for (const courseId of courseIds) {
      const courseDoc = await db.collection('courses').doc(courseId).get();
      if (!courseDoc.exists) {
        throw new HttpsError('not-found', `Course ${courseId} not found`);
      }
      const course = courseDoc.data() as Course;
      if (course.creatorId !== uid) {
        throw new HttpsError('permission-denied', 'Can only bundle your own courses');
      }
      originalPrice += course.priceTokens;
    }

    const bundlePriceTokens = Math.floor(originalPrice * (1 - discountPercentage / 100));

    const bundleId = generateId();
    const bundle: CourseBundle = {
      bundleId,
      creatorId: uid,
      title,
      description,
      courseIds,
      originalPriceTokens: originalPrice,
      bundlePriceTokens,
      discountPercentage,
      status: 'ACTIVE',
      createdAt: Timestamp.now(),
    };

    await db.collection('course_bundles').doc(bundleId).set(bundle);

    return {
      success: true,
      bundleId,
      message: 'Bundle created successfully',
    };
  }
);

// ============================================================================
// TRIGGERS
// ============================================================================

export const onCourseProgressUpdate = onDocumentUpdated(
  {
    document: 'course_progress/{progressId}',
    region: 'europe-west3',
  },
  async (event) => {
    const progressData = event.data?.after.data() as CourseProgress;
    
    if (!progressData) return;

    const courseDoc = await db.collection('courses').doc(progressData.courseId).get();
    const course = courseDoc.data() as Course;

    if (!course) return;

    const completionPercentage = 
      (progressData.completedEpisodes.length / course.episodeCount) * 100;

    await event.data?.after.ref.update({
      progressPercentage: completionPercentage,
    });

    if (completionPercentage === 100 && !progressData.completedAt) {
      await event.data?.after.ref.update({
        completedAt: serverTimestamp(),
        xpEarned: increment(100),
      });

      await db.collection('courses').doc(progressData.courseId).update({
        'stats.completionCount': increment(1),
      });

      await generateCertificate(progressData.userId, progressData.courseId);
    }
  }
);

// ============================================================================
// EXPORTS
// ============================================================================

export const pack162_createCourse = createCourse;
export const pack162_publishCourse = publishCourse;
export const pack162_publishEpisode = publishEpisode;
export const pack162_purchaseCourse = purchaseCourse;
export const pack162_purchaseEpisode = purchaseEpisode;
export const pack162_trackCourseProgress = trackCourseProgress;
export const pack162_reviewCourse = reviewCourse;
export const pack162_issueCertificate = issueCertificate;
export const pack162_createCourseBundle = createCourseBundle;
export const pack162_onCourseProgressUpdate = onCourseProgressUpdate;