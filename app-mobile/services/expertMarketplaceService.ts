/**
 * PACK 136: Expert Marketplace Service
 * 
 * Client-side service for verified expert/mentorship marketplace
 * Zero escort/dating loopholes - SAFE content only
 */

import { httpsCallable } from 'firebase/functions';
import { functions, db } from '../lib/firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  Timestamp,
} from 'firebase/firestore';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export enum ExpertCategory {
  FITNESS = 'fitness',
  LIFESTYLE = 'lifestyle',
  LANGUAGE = 'language',
  FINANCE = 'finance',
  BEAUTY = 'beauty',
  CREATIVE = 'creative',
  EDUCATION = 'education',
  PRODUCTIVITY = 'productivity',
  WELLNESS = 'wellness',
  COOKING = 'cooking',
}

export enum OfferType {
  CHAT_PER_MESSAGE = 'chat_per_message',
  CALL_PER_MINUTE = 'call_per_minute',
  GROUP_CALL_PER_MINUTE = 'group_call_per_minute',
  SCHEDULED_SESSION = 'scheduled_session',
  PREMIUM_POST = 'premium_post',
  CURRICULUM = 'curriculum',
}

export enum SessionStatus {
  SCHEDULED = 'scheduled',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED_BY_EXPERT = 'cancelled_by_expert',
  CANCELLED_BY_USER = 'cancelled_by_user',
  NO_SHOW = 'no_show',
}

export interface ExpertProfile {
  expertId: string;
  userName: string;
  userAvatar?: string;
  category: ExpertCategory;
  bio: string;
  expertiseDescription: string;
  certifications: string[];
  portfolio: string[];
  achievements: string[];
  isActive: boolean;
  totalSessions: number;
  completedSessions: number;
  totalEarnings: number;
  averageRating: number;
  totalReviews: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ExpertOffer {
  offerId: string;
  expertId: string;
  expertName: string;
  expertAvatar?: string;
  expertCategory: ExpertCategory;
  type: OfferType;
  title: string;
  description: string;
  priceTokens: number;
  duration?: number;
  maxGroupSize: number;
  isActive: boolean;
  purchaseCount: number;
  viewCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface MentorSession {
  sessionId: string;
  offerId: string;
  offerTitle: string;
  offerType: OfferType;
  expertId: string;
  expertName: string;
  expertAvatar?: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  scheduledTime: Timestamp;
  duration: number;
  tokensAmount: number;
  platformFee: number;
  expertEarnings: number;
  status: SessionStatus;
  createdAt: Timestamp;
  startedAt?: Timestamp;
  completedAt?: Timestamp;
  cancelledAt?: Timestamp;
  cancellationReason?: string;
}

export interface ExpertReview {
  reviewId: string;
  expertId: string;
  reviewerId: string;
  reviewerName: string;
  sessionId: string;
  ratings: {
    expertise: number;
    clarity: number;
    professionalism: number;
    helpfulness: number;
  };
  averageRating: number;
  comment?: string;
  createdAt: Timestamp;
  isVisible: boolean;
}

export interface Curriculum {
  curriculumId: string;
  expertId: string;
  expertName: string;
  expertAvatar?: string;
  expertCategory: ExpertCategory;
  title: string;
  description: string;
  priceTokens: number;
  lessons: CurriculumLesson[];
  isActive: boolean;
  enrollmentCount: number;
  completionRate: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CurriculumLesson {
  lessonId: string;
  title: string;
  description: string;
  type: 'video' | 'audio' | 'pdf' | 'quiz';
  contentRef?: string;
  duration?: number;
  order: number;
}

// ============================================================================
// CALLABLE FUNCTIONS
// ============================================================================

/**
 * Submit expert application
 */
export async function submitExpertApplication(data: {
  category: ExpertCategory;
  bio: string;
  expertiseDescription: string;
  certifications?: string[];
  portfolio?: string[];
  achievements?: string[];
}): Promise<{ success: boolean; applicationId: string; message: string }> {
  const submitApplication = httpsCallable(functions, 'submitExpertApplication');
  const result = await submitApplication(data);
  return result.data as any;
}

/**
 * Create mentorship offer
 */
export async function createMentorshipOffer(data: {
  type: OfferType;
  title: string;
  description: string;
  priceTokens: number;
  duration?: number;
  maxGroupSize?: number;
}): Promise<{ success: boolean; offerId: string; message: string }> {
  const createOffer = httpsCallable(functions, 'createMentorshipOffer');
  const result = await createOffer(data);
  return result.data as any;
}

/**
 * Update mentorship offer
 */
export async function updateMentorshipOffer(data: {
  offerId: string;
  title?: string;
  description?: string;
  priceTokens?: number;
  isActive?: boolean;
}): Promise<{ success: boolean; message: string }> {
  const updateOffer = httpsCallable(functions, 'updateMentorshipOffer');
  const result = await updateOffer(data);
  return result.data as any;
}

/**
 * List expert offers
 */
export async function listExpertOffers(
  expertId: string,
  onlyActive: boolean = true
): Promise<{ success: boolean; offers: ExpertOffer[] }> {
  const listOffers = httpsCallable(functions, 'listExpertOffers');
  const result = await listOffers({ expertId, onlyActive });
  return result.data as any;
}

/**
 * Create curriculum
 */
export async function createCurriculum(data: {
  title: string;
  description: string;
  priceTokens: number;
  lessons: Omit<CurriculumLesson, 'lessonId'>[];
}): Promise<{ success: boolean; curriculumId: string; message: string }> {
  const createCurr = httpsCallable(functions, 'createCurriculum');
  const result = await createCurr(data);
  return result.data as any;
}

/**
 * Enroll in curriculum
 */
export async function enrollInCurriculum(
  curriculumId: string
): Promise<{ success: boolean; message: string }> {
  const enroll = httpsCallable(functions, 'enrollInCurriculum');
  const result = await enroll({ curriculumId });
  return result.data as any;
}

/**
 * Schedule mentorship session
 */
export async function scheduleMentorshipSession(data: {
  offerId: string;
  scheduledTime: Date;
}): Promise<{ success: boolean; sessionId: string; message: string }> {
  const scheduleSession = httpsCallable(functions, 'scheduleMentorshipSession');
  const result = await scheduleSession({
    offerId: data.offerId,
    scheduledTime: data.scheduledTime.toISOString(),
  });
  return result.data as any;
}

/**
 * Cancel mentorship session
 */
export async function cancelMentorshipSession(
  sessionId: string,
  reason?: string
): Promise<{ success: boolean; message: string }> {
  const cancelSession = httpsCallable(functions, 'cancelMentorshipSession');
  const result = await cancelSession({ sessionId, reason });
  return result.data as any;
}

/**
 * Complete mentorship session
 */
export async function completeMentorshipSession(
  sessionId: string
): Promise<{ success: boolean; message: string }> {
  const completeSession = httpsCallable(functions, 'completeMentorshipSession');
  const result = await completeSession({ sessionId });
  return result.data as any;
}

/**
 * Leave expert review
 */
export async function leaveExpertReview(data: {
  sessionId: string;
  ratings: {
    expertise: number;
    clarity: number;
    professionalism: number;
    helpfulness: number;
  };
  comment?: string;
}): Promise<{ success: boolean; message: string }> {
  const leaveReview = httpsCallable(functions, 'leaveExpertReview');
  const result = await leaveReview(data);
  return result.data as any;
}

/**
 * Get expert analytics
 */
export async function getExpertAnalytics(): Promise<{
  success: boolean;
  analytics: {
    totalSessions: number;
    completedSessions: number;
    completionRate: string;
    totalEarnings: number;
    averageRating: number;
    totalReviews: number;
    totalOfferViews: number;
    totalOfferPurchases: number;
    conversionRate: string;
    activeCurriculums: number;
    totalEnrollments: number;
  };
}> {
  const getAnalytics = httpsCallable(functions, 'getExpertAnalytics');
  const result = await getAnalytics({});
  return result.data as any;
}

// ============================================================================
// FIRESTORE QUERIES
// ============================================================================

/**
 * Get expert profile
 */
export async function getExpertProfile(
  expertId: string
): Promise<ExpertProfile | null> {
  const docRef = doc(db, 'expert_profiles', expertId);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    return { expertId: docSnap.id, ...docSnap.data() } as ExpertProfile;
  }

  return null;
}

/**
 * Get experts by category
 */
export async function getExpertsByCategory(
  category: ExpertCategory,
  limitCount: number = 20
): Promise<ExpertProfile[]> {
  const q = query(
    collection(db, 'expert_profiles'),
    where('isActive', '==', true),
    where('category', '==', category),
    orderBy('averageRating', 'desc'),
    limit(limitCount)
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    expertId: doc.id,
    ...doc.data(),
  })) as ExpertProfile[];
}

/**
 * Get all active experts
 */
export async function getAllActiveExperts(
  limitCount: number = 50
): Promise<ExpertProfile[]> {
  const q = query(
    collection(db, 'expert_profiles'),
    where('isActive', '==', true),
    orderBy('totalReviews', 'desc'),
    limit(limitCount)
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    expertId: doc.id,
    ...doc.data(),
  })) as ExpertProfile[];
}

/**
 * Subscribe to expert offers
 */
export function subscribeToExpertOffers(
  expertId: string,
  callback: (offers: ExpertOffer[]) => void,
  onlyActive: boolean = true
): () => void {
  let q = query(
    collection(db, 'expert_offers'),
    where('expertId', '==', expertId)
  );

  if (onlyActive) {
    q = query(q, where('isActive', '==', true));
  }

  q = query(q, orderBy('createdAt', 'desc'));

  return onSnapshot(q, (snapshot) => {
    const offers = snapshot.docs.map((doc) => ({
      offerId: doc.id,
      ...doc.data(),
    })) as ExpertOffer[];
    callback(offers);
  });
}

/**
 * Get user's sessions (as participant)
 */
export async function getUserSessions(
  userId: string,
  status?: SessionStatus
): Promise<MentorSession[]> {
  let q = query(
    collection(db, 'mentor_sessions'),
    where('userId', '==', userId)
  );

  if (status) {
    q = query(q, where('status', '==', status));
  }

  q = query(q, orderBy('scheduledTime', 'desc'));

  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    sessionId: doc.id,
    ...doc.data(),
  })) as MentorSession[];
}

/**
 * Get expert's sessions (as provider)
 */
export async function getExpertSessions(
  expertId: string,
  status?: SessionStatus
): Promise<MentorSession[]> {
  let q = query(
    collection(db, 'mentor_sessions'),
    where('expertId', '==', expertId)
  );

  if (status) {
    q = query(q, where('status', '==', status));
  }

  q = query(q, orderBy('scheduledTime', 'desc'));

  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    sessionId: doc.id,
    ...doc.data(),
  })) as MentorSession[];
}

/**
 * Subscribe to user sessions
 */
export function subscribeToUserSessions(
  userId: string,
  callback: (sessions: MentorSession[]) => void
): () => void {
  const q = query(
    collection(db, 'mentor_sessions'),
    where('userId', '==', userId),
    orderBy('scheduledTime', 'desc')
  );

  return onSnapshot(q, (snapshot) => {
    const sessions = snapshot.docs.map((doc) => ({
      sessionId: doc.id,
      ...doc.data(),
    })) as MentorSession[];
    callback(sessions);
  });
}

/**
 * Get expert reviews
 */
export async function getExpertReviews(
  expertId: string,
  limitCount: number = 20
): Promise<ExpertReview[]> {
  const q = query(
    collection(db, 'expert_reviews'),
    where('expertId', '==', expertId),
    where('isVisible', '==', true),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    reviewId: doc.id,
    ...doc.data(),
  })) as ExpertReview[];
}

/**
 * Get curriculums by expert
 */
export async function getExpertCurriculums(
  expertId: string,
  onlyActive: boolean = true
): Promise<Curriculum[]> {
  let q = query(
    collection(db, 'expert_curriculums'),
    where('expertId', '==', expertId)
  );

  if (onlyActive) {
    q = query(q, where('isActive', '==', true));
  }

  q = query(q, orderBy('createdAt', 'desc'));

  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    curriculumId: doc.id,
    ...doc.data(),
  })) as Curriculum[];
}

/**
 * Check if user is enrolled in curriculum
 */
export async function isEnrolledInCurriculum(
  userId: string,
  curriculumId: string
): Promise<boolean> {
  const q = query(
    collection(db, 'curriculum_enrollments'),
    where('userId', '==', userId),
    where('curriculumId', '==', curriculumId),
    limit(1)
  );

  const snapshot = await getDocs(q);
  return !snapshot.empty;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Format category name for display
 */
export function formatCategoryName(category: ExpertCategory): string {
  const names: Record<ExpertCategory, string> = {
    [ExpertCategory.FITNESS]: 'Fitness',
    [ExpertCategory.LIFESTYLE]: 'Lifestyle',
    [ExpertCategory.LANGUAGE]: 'Language',
    [ExpertCategory.FINANCE]: 'Finance',
    [ExpertCategory.BEAUTY]: 'Beauty',
    [ExpertCategory.CREATIVE]: 'Creative',
    [ExpertCategory.EDUCATION]: 'Education',
    [ExpertCategory.PRODUCTIVITY]: 'Productivity',
    [ExpertCategory.WELLNESS]: 'Wellness',
    [ExpertCategory.COOKING]: 'Cooking',
  };
  return names[category] || category;
}

/**
 * Format offer type for display
 */
export function formatOfferType(type: OfferType): string {
  const names: Record<OfferType, string> = {
    [OfferType.CHAT_PER_MESSAGE]: 'Chat (per message)',
    [OfferType.CALL_PER_MINUTE]: '1:1 Call (per minute)',
    [OfferType.GROUP_CALL_PER_MINUTE]: 'Group Call (per minute)',
    [OfferType.SCHEDULED_SESSION]: 'Scheduled Session',
    [OfferType.PREMIUM_POST]: 'Premium Content',
    [OfferType.CURRICULUM]: 'Full Curriculum',
  };
  return names[type] || type;
}

/**
 * Format session status for display
 */
export function formatSessionStatus(status: SessionStatus): string {
  const names: Record<SessionStatus, string> = {
    [SessionStatus.SCHEDULED]: 'Scheduled',
    [SessionStatus.IN_PROGRESS]: 'In Progress',
    [SessionStatus.COMPLETED]: 'Completed',
    [SessionStatus.CANCELLED_BY_EXPERT]: 'Cancelled by Expert',
    [SessionStatus.CANCELLED_BY_USER]: 'Cancelled',
    [SessionStatus.NO_SHOW]: 'No Show',
  };
  return names[status] || status;
}

/**
 * Get status color
 */
export function getSessionStatusColor(status: SessionStatus): string {
  const colors: Record<SessionStatus, string> = {
    [SessionStatus.SCHEDULED]: '#3B82F6',
    [SessionStatus.IN_PROGRESS]: '#10B981',
    [SessionStatus.COMPLETED]: '#6B7280',
    [SessionStatus.CANCELLED_BY_EXPERT]: '#EF4444',
    [SessionStatus.CANCELLED_BY_USER]: '#F59E0B',
    [SessionStatus.NO_SHOW]: '#EF4444',
  };
  return colors[status] || '#6B7280';
}