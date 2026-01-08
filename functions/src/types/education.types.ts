import { Timestamp } from 'firebase-admin/firestore';

export type CourseCategory =
  | 'business_fundamentals'
  | 'social_media_growth'
  | 'fitness_coaching'
  | 'language_teaching'
  | 'design_photography'
  | 'ecommerce'
  | 'productivity_mindset'
  | 'career_skills';

export type CourseStatus = 'pending_review' | 'published' | 'rejected' | 'archived';

export type PurchaseStatus = 'pending' | 'active' | 'refunded' | 'expired';

export type SubscriptionStatus = 'pending' | 'active' | 'cancelled' | 'expired';

export type ComplianceStatus = 'pending' | 'reviewing' | 'resolved' | 'escalated';

export type QASessionStatus = 'pending' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

export interface Course {
  id: string;
  creatorId: string;
  creatorName: string;
  creatorAvatar?: string;
  title: string;
  description: string;
  shortDescription: string;
  category: CourseCategory;
  coverImage: string;
  previewVideo?: string;
  price: number;
  currency: string;
  duration: number;
  level: 'beginner' | 'intermediate' | 'advanced';
  language: string;
  status: CourseStatus;
  rating: number;
  ratingCount: number;
  enrollmentCount: number;
  completionRate: number;
  learningObjectives: string[];
  prerequisites: string[];
  targetAudience: string[];
  materials: string[];
  hasQuizzes: boolean;
  hasCertificate: boolean;
  allowsQA: boolean;
  maxQASessionsPerMonth: number;
  tags: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
  publishedAt?: Timestamp;
  reviewedBy?: string;
  reviewNotes?: string;
  complianceScore: number;
  scamRiskScore: number;
}

export interface CourseModule {
  id: string;
  courseId: string;
  title: string;
  description: string;
  order: number;
  duration: number;
  videoUrl?: string;
  contentText?: string;
  attachments: CourseAttachment[];
  hasQuiz: boolean;
  quizId?: string;
  isPreview: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CourseAttachment {
  id: string;
  name: string;
  type: 'pdf' | 'doc' | 'xlsx' | 'image' | 'video' | 'other';
  url: string;
  size: number;
}

export interface CourseQuiz {
  id: string;
  courseId: string;
  moduleId: string;
  title: string;
  description: string;
  passingScore: number;
  timeLimit?: number;
  questions: QuizQuestion[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface QuizQuestion {
  id: string;
  type: 'multiple_choice' | 'true_false' | 'short_answer';
  question: string;
  options?: string[];
  correctAnswer: string | number;
  explanation: string;
  points: number;
}

export interface CoursePurchase {
  id: string;
  userId: string;
  courseId: string;
  courseName: string;
  creatorId: string;
  amount: number;
  currency: string;
  status: PurchaseStatus;
  paymentMethod: string;
  transactionId: string;
  purchasedAt: Timestamp;
  expiresAt?: Timestamp;
  refundedAt?: Timestamp;
  refundReason?: string;
  accessGrantedAt: Timestamp;
}

export interface CourseProgress {
  id: string;
  userId: string;
  courseId: string;
  completedModules: string[];
  currentModuleId: string;
  progressPercentage: number;
  totalTimeSpent: number;
  quizScores: Record<string, number>;
  completed: boolean;
  completedAt?: Timestamp;
  lastAccessedAt: Timestamp;
  startedAt: Timestamp;
  certificateIssued: boolean;
}

export interface CourseReview {
  id: string;
  courseId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  rating: number;
  comment: string;
  helpful: number;
  notHelpful: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  verified: boolean;
  response?: CreatorResponse;
}

export interface CreatorResponse {
  text: string;
  respondedAt: Timestamp;
}

export interface CourseCertificate {
  id: string;
  userId: string;
  userName: string;
  courseId: string;
  courseName: string;
  creatorId: string;
  creatorName: string;
  completionDate: Timestamp;
  issuedAt: Timestamp;
  certificateNumber: string;
  digitalSignature: string;
  verificationUrl: string;
  skills: string[];
  finalScore: number;
}

export interface EducationSubscription {
  id: string;
  userId: string;
  planType: 'monthly' | 'quarterly' | 'annual';
  status: SubscriptionStatus;
  price: number;
  currency: string;
  startDate: Timestamp;
  expiresAt: Timestamp;
  renewsAt?: Timestamp;
  cancelledAt?: Timestamp;
  cancellationReason?: string;
  accessibleCreators: string[];
  coursesAccessed: number;
  autoRenew: boolean;
  paymentMethod: string;
}

export interface LearningProgress {
  userId: string;
  totalCoursesEnrolled: number;
  totalCoursesCompleted: number;
  totalLearningTime: number;
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: Timestamp;
  xpPoints: number;
  level: number;
  badges: Badge[];
  achievements: Achievement[];
  learningGoals: LearningGoal[];
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  earnedAt: Timestamp;
  category: string;
}

export interface Achievement {
  id: string;
  type: 'course_completion' | 'streak' | 'mastery' | 'community';
  title: string;
  description: string;
  progress: number;
  target: number;
  completed: boolean;
  completedAt?: Timestamp;
  reward: number;
}

export interface LearningGoal {
  id: string;
  title: string;
  targetDate: Timestamp;
  coursesRequired: string[];
  completedCourses: string[];
  progress: number;
  completed: boolean;
  completedAt?: Timestamp;
}

export interface QASession {
  id: string;
  courseId: string;
  studentId: string;
  studentName: string;
  coachId: string;
  coachName: string;
  question: string;
  answer?: string;
  status: QASessionStatus;
  scheduledAt?: Timestamp;
  startedAt?: Timestamp;
  completedAt?: Timestamp;
  duration?: number;
  rating?: number;
  feedback?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CourseComplianceReport {
  id: string;
  courseId: string;
  courseName: string;
  creatorId: string;
  reporterId: string;
  reporterName: string;
  violationType: 'scam_claims' | 'blocked_category' | 'erotic_content' | 'misleading' | 'other';
  description: string;
  evidence?: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: ComplianceStatus;
  reviewedBy?: string;
  reviewNotes?: string;
  actionTaken?: string;
  createdAt: Timestamp;
  resolvedAt?: Timestamp;
}

export interface ScamDetectionResult {
  isScam: boolean;
  confidence: number;
  flags: string[];
  reasons: string[];
  riskScore: number;
}

export interface CourseUploadRequest {
  creatorId: string;
  title: string;
  description: string;
  shortDescription: string;
  category: CourseCategory;
  price: number;
  currency: string;
  duration: number;
  level: 'beginner' | 'intermediate' | 'advanced';
  language: string;
  learningObjectives: string[];
  prerequisites: string[];
  targetAudience: string[];
}

export interface ModuleUploadRequest {
  courseId: string;
  title: string;
  description: string;
  order: number;
  duration: number;
  contentText?: string;
  isPreview: boolean;
}

export interface PurchaseRequest {
  userId: string;
  courseId: string;
  paymentMethod: string;
  currency: string;
}

export interface CertificateRequest {
  userId: string;
  courseId: string;
  finalScore: number;
}

export interface QASessionRequest {
  courseId: string;
  studentId: string;
  question: string;
}

export interface ComplianceReportRequest {
  courseId: string;
  reporterId: string;
  violationType: string;
  description: string;
  evidence?: string[];
}

export interface EducationStats {
  totalCourses: number;
  totalStudents: number;
  totalRevenue: number;
  averageRating: number;
  completionRate: number;
  activeSubscriptions: number;
  certificatesIssued: number;
}

export interface CreatorEarnings {
  creatorId: string;
  totalEarnings: number;
  pendingEarnings: number;
  paidOut: number;
  courseSales: number;
  subscriptionRevenue: number;
  qaSessionRevenue: number;
  period: {
    start: Timestamp;
    end: Timestamp;
  };
}