/**
 * PACK 382 — Global Creator Academy & Earnings Optimization Engine
 * TypeScript Types and Interfaces
 */

import { Timestamp } from 'firebase-admin/firestore';

// ========================================
// 1️⃣ CREATOR ACADEMY CORE SYSTEM
// ========================================

export type CourseCategory =
  | 'getting-started'
  | 'chat-optimization'
  | 'voice-video-monetization'
  | 'calendar-events'
  | 'profile-conversion'
  | 'ai-companion-earnings'
  | 'safety-risk'
  | 'vip-royal-optimization'
  | 'cross-market-growth';

export type CourseLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';

export interface CreatorAcademyCourse {
  courseId: string;
  category: CourseCategory;
  title: string;
  description: string;
  level: CourseLevel;
  durationMinutes: number;
  lessonCount: number;
  
  // Regional Adaptation
  regionVariants: {
    [regionCode: string]: {
      title: string;
      description: string;
      culturalNotes?: string;
    };
  };
  
  // Prerequisites
  prerequisites?: string[]; // courseIds
  
  // Certification
  certificateOnCompletion: boolean;
  badgeOnCompletion?: string;
  
  // Visibility
  isPublished: boolean;
  requiredTier?: 'standard' | 'vip' | 'royal';
  
  // Analytics
  enrollmentCount: number;
  completionRate: number;
  avgRating: number;
  
  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
  tags: string[];
}

export interface CreatorAcademyLesson {
  lessonId: string;
  courseId: string;
  order: number;
  
  title: string;
  content: string;
  videoUrl?: string;
  estimatedMinutes: number;
  
  // Regional Adaptation
  regionVariants: {
    [regionCode: string]: {
      title: string;
      content: string;
      videoUrl?: string;
    };
  };
  
  // Interactive Elements
  quiz?: {
    questions: Array<{
      question: string;
      options: string[];
      correctAnswer: number;
      explanation: string;
    }>;
    passingScore: number;
  };
  
  // Resources
  resources?: Array<{
    title: string;
    url: string;
    type: 'pdf' | 'video' | 'link' | 'tool';
  }>;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CreatorAcademyProgress {
  progressId: string;
  userId: string;
  courseId: string;
  
  // Progress Tracking
  enrolledAt: Timestamp;
  lastAccessedAt: Timestamp;
  completedAt?: Timestamp;
  
  lessonsCompleted: string[]; // lessonIds
  currentLessonId?: string;
  progressPercentage: number;
  
  // Quiz Results
  quizScores: {
    [lessonId: string]: {
      score: number;
      attempts: number;
      passedAt?: Timestamp;
    };
  };
  
  // Time Tracking
  totalTimeSpentMinutes: number;
  
  // Feedback
  rating?: number;
  feedback?: string;
  
  // Certificate
  certificateIssued: boolean;
  certificateId?: string;
}

export interface CreatorAcademyCertificate {
  certificateId: string;
  userId: string;
  courseId: string;
  
  issuedAt: Timestamp;
  expiresAt?: Timestamp;
  
  courseName: string;
  category: CourseCategory;
  level: CourseLevel;
  
  completionScore: number;
  completionTimeMinutes: number;
  
  // Verification
  verificationHash: string;
  isValid: boolean;
  
  // Display
  displayName: string;
  credentialUrl: string;
}

// ========================================
// 2️⃣ CREATOR SKILL PROFILING
// ========================================

export type SkillTier = 'BEGINNER' | 'ADVANCED' | 'PRO' | 'ELITE';

export interface CreatorEarningProfile {
  profileId: string;
  userId: string;
  
  // Skill Assessment
  skillTier: SkillTier;
  earningsPotentialScore: number; // 0-100
  burnoutRiskScore: number; // 0-100 (higher = more risk)
  
  // Performance Metrics
  metrics: {
    // Chat Metrics
    chatConversionRate: number; // percentage
    avgRevenuePerUser: number;
    avgResponseTimeMinutes: number;
    chatSatisfactionRate: number;
    
    // Call Metrics
    callAcceptanceRate: number;
    callCompletionRate: number;
    callAvgDurationMinutes: number;
    callRevenuePer30Min: number;
    
    // Calendar & Events
    eventFillRatio: number;
    calendarFillRatio: number;
    avgEventRevenue: number;
    cancellationRatio: number;
    
    // Financial
    refundRatio: number;
    viewerToPayerRatio: number;
    avgSubscriptionRetention: number;
    monthlyRecurringRevenue: number;
    
    // User Retention
    retentionOf30DayPayingUsers: number;
    avgCustomerLifetimeValue: number;
  };
  
  // Activity Stats
  activityStats: {
    totalChatsLast30Days: number;
    totalCallsLast30Days: number;
    totalEventsLast30Days: number;
    avgHoursOnlinePerDay: number;
    peakActivityHours: string[];
  };
  
  // Risk Signals
  riskSignals: {
    highRefundRate: boolean;
    delayedResponses: boolean;
    negativeRatings: boolean;
    safetyReports: number;
    excessiveWorkload: boolean;
    burnoutDetected: boolean;
  };
  
  // Regional Performance
  regionalPerformance: {
    [regionCode: string]: {
      conversionRate: number;
      avgRevenue: number;
      satisfactionRate: number;
    };
  };
  
  // Timestamps
  lastCalculatedAt: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ========================================
// 3️⃣ AI EARNINGS OPTIMIZER
// ========================================

export type OptimizationType =
  | 'pricing-increase'
  | 'pricing-decrease'
  | 'add-service'
  | 'improve-quality'
  | 'schedule-optimization'
  | 'content-strategy'
  | 'safety-improvement'
  | 'burnout-prevention';

export interface EarningsOptimization {
  optimizationId: string;
  userId: string;
  
  type: OptimizationType;
  priority: 'low' | 'medium' | 'high' | 'critical';
  
  // Recommendation
  title: string;
  description: string;
  actionSteps: string[];
  
  // Impact Prediction
  predictedImpact: {
    revenueIncreasePercentage?: number;
    conversionRateImprovement?: number;
    retentionImprovement?: number;
    burnoutReduction?: number;
  };
  
  // Supporting Data
  insight: string;
  dataPoints: {
    [key: string]: number | string;
  };
  
  // Regional Context
  regionCode?: string;
  regionSpecific: boolean;
  
  // Status
  status: 'pending' | 'viewed' | 'applied' | 'dismissed' | 'expired';
  viewedAt?: Timestamp;
  appliedAt?: Timestamp;
  dismissedAt?: Timestamp;
  
  // Validation
  validUntil: Timestamp;
  createdAt: Timestamp;
}

// ========================================
// 4️⃣ PRICING RECOMMENDATION
// ========================================

export interface PricingRecommendation {
  recommendationId: string;
  userId: string;
  
  serviceType: 'chat' | 'voice' | 'video' | 'calendar' | 'event' | 'subscription';
  
  // Current vs Recommended
  currentPrice: number;
  recommendedPrice: number;
  priceChange: number;
  priceChangePercentage: number;
  
  // Reasoning
  reasoning: string;
  factors: Array<{
    factor: string;
    weight: number;
    impact: 'increase' | 'decrease' | 'neutral';
  }>;
  
  // Market Context
  marketData: {
    regionCode: string;
    regionalAvgPrice: number;
    competitorPriceRange: {
      min: number;
      max: number;
      median: number;
    };
    demandLevel: 'low' | 'medium' | 'high' | 'very-high';
  };
  
  // Confidence
  confidenceScore: number; // 0-100
  
  // Impact Forecast
  forecast: {
    expectedRevenueChange: number;
    expectedDemandChange: number;
    riskLevel: 'low' | 'medium' | 'high';
  };
  
  createdAt: Timestamp;
  expiresAt: Timestamp;
}

// ========================================
// 5️⃣ BURNOUT PREVENTION
// ========================================

export type BurnoutLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

export interface BurnoutAssessment {
  assessmentId: string;
  userId: string;
  
  level: BurnoutLevel;
  score: number; // 0-100
  
  // Contributing Factors
  factors: {
    excessiveWorkload: {
      detected: boolean;
      chatsPerDay: number;
      hoursOnline: number;
      daysWithoutBreak: number;
    };
    
    qualityDecline: {
      detected: boolean;
      responseDelayIncrease: number;
      satisfactionDrop: number;
      refundIncrease: number;
    };
    
    negativeInteractions: {
      detected: boolean;
      negativeRatings: number;
      safetyReports: number;
      conflictCount: number;
    };
    
    financialStress: {
      detected: boolean;
      revenueDrop: number;
      inconsistentEarnings: boolean;
      refundRate: number;
    };
  };
  
  // Recommendations
  recommendations: string[];
  suggestedActions: Array<{
    action: string;
    priority: 'low' | 'medium' | 'high';
    automated: boolean;
  }>;
  
  // Auto-Actions Taken
  actionsApplied: Array<{
    action: string;
    appliedAt: Timestamp;
    result: string;
  }>;
  
  // Timeline
  detectedAt: Timestamp;
  resolvedAt?: Timestamp;
  nextCheckAt: Timestamp;
}

// ========================================
// 6️⃣ EARNINGS MISSION SYSTEM
// ========================================

export type MissionType =
  | 'revenue-target'
  | 'service-activation'
  | 'quality-milestone'
  | 'growth-achievement'
  | 'engagement-goal';

export type MissionStatus = 'active' | 'completed' | 'failed' | 'expired';

export interface CreatorEarningMission {
  missionId: string;
  userId: string;
  
  type: MissionType;
  title: string;
  description: string;
  
  // Requirements
  requirements: {
    target: number;
    unit: string;
    metric: string;
  };
  
  // Progress
  currentProgress: number;
  progressPercentage: number;
  status: MissionStatus;
  
  // Timeframe
  startsAt: Timestamp;
  endsAt: Timestamp;
  completedAt?: Timestamp;
  
  // Rewards
  rewards: {
    tokens?: number;
    rankingBoost?: number;
    visibilityBoost?: number;
    badge?: string;
    certificate?: string;
  };
  
  // Difficulty
  difficulty: 'easy' | 'medium' | 'hard' | 'expert';
  xpValue: number;
  
  // Regional
  regionCode?: string;
  isGlobal: boolean;
  
  createdAt: Timestamp;
}

// ========================================
// 7️⃣ CERTIFICATION & BADGES
// ========================================

export type BadgeType =
  | 'certified-creator'
  | 'voice-pro'
  | 'event-organizer'
  | 'elite-chat-pro'
  | 'royal-verified'
  | 'safety-champion'
  | 'top-earner'
  | 'customer-favorite';

export interface CreatorBadge {
  badgeId: string;
  userId: string;
  
  type: BadgeType;
  name: string;
  description: string;
  iconUrl: string;
  
  // Requirements Met
  earnedBy: {
    courseCompletion?: string[];
    skillScoreThreshold?: number;
    fraudFreeOperation: boolean;
    safetyHistory: boolean;
    customCriteria?: { [key: string]: any };
  };
  
  // Display
  isVisible: boolean;
  displayOrder: number;
  
  // Expiration
  expiresAt?: Timestamp;
  isExpired: boolean;
  
  // Verification
  verificationHash: string;
  
  earnedAt: Timestamp;
  lastVerifiedAt: Timestamp;
}

// ========================================
// 8️⃣ REGIONAL EDUCATION VARIANTS
// ========================================

export interface RegionalAcademyContent {
  regionCode: string;
  
  // Cultural Adaptations
  pricingPsychology: {
    preferredPricingStrategy: string;
    culturalNotes: string;
    examplePricing: { [serviceType: string]: number };
  };
  
  flirtingStyles: {
    culturalContext: string;
    dosList: string[];
    dontsList: string[];
    examples: string[];
  };
  
  legalBoundaries: {
    contentRestrictions: string[];
    requiredDisclosures: string[];
    prohibitedContent: string[];
    complianceLinks: string[];
  };
  
  payoutExpectations: {
    avgEarningsRange: { min: number; max: number };
    currencyCode: string;
    paymentMethods: string[];
    taxConsiderations: string[];
  };
  
  peakHours: {
    localTimezone: string;
    peakHours: string[];
    offPeakHours: string[];
    bestDays: string[];
  };
  
  // Localized Content
  localizedCourses: string[]; // courseIds
  featuredCreators: string[]; // userIds
  
  updatedAt: Timestamp;
}

// ========================================
// 9️⃣ FUNCTION INPUT/OUTPUT TYPES
// ========================================

export interface CalculateSkillScoreInput {
  userId: string;
  forceRecalculate?: boolean;
}

export interface CalculateSkillScoreOutput {
  profileId: string;
  skillTier: SkillTier;
  earningsPotentialScore: number;
  burnoutRiskScore: number;
  recommendations: string[];
}

export interface GenerateOptimizationsInput {
  userId: string;
  regionCode?: string;
  limit?: number;
}

export interface GenerateOptimizationsOutput {
  optimizations: EarningsOptimization[];
  totalCount: number;
}

export interface RecommendOptimalPricingInput {
  userId: string;
  serviceType: 'chat' | 'voice' | 'video' | 'calendar' | 'event' | 'subscription';
  regionCode?: string;
}

export interface RecommendOptimalPricingOutput {
  recommendation: PricingRecommendation;
  confidence: 'low' | 'medium' | 'high';
}

export interface DetectBurnoutInput {
  userId: string;
  checkIntervalDays?: number;
}

export interface DetectBurnoutOutput {
  assessment: BurnoutAssessment;
  actionsApplied: string[];
  requiresAttention: boolean;
}

export interface GetLocalizedAcademyContentInput {
  regionCode: string;
  category?: CourseCategory;
}

export interface GetLocalizedAcademyContentOutput {
  content: RegionalAcademyContent;
  courses: CreatorAcademyCourse[];
}

// ========================================
// ADMIN DASHBOARD TYPES
// ========================================

export interface CreatorAcademyAnalytics {
  totalCourses: number;
  totalLessons: number;
  totalEnrollments: number;
  avgCompletionRate: number;
  avgCourseRating: number;
  
  byCategoryAnalytics: {
    [category: string]: {
      enrollments: number;
      completionRate: number;
      avgRating: number;
      revenueImpact: number;
    };
  };
  
  topCourses: Array<{
    courseId: string;
    title: string;
    enrollments: number;
    completionRate: number;
    rating: number;
  }>;
  
  skillTierDistribution: {
    [tier: string]: number;
  };
  
  burnoutStats: {
    creatorsAtRisk: number;
    creatorsInCritical: number;
    preventionActionsApplied: number;
  };
  
  regionalPerformance: {
    [regionCode: string]: {
      enrollments: number;
      completionRate: number;
      avgEarningsIncrease: number;
    };
  };
  
  optimizationEffectiveness: {
    totalOptimizationsGenerated: number;
    applied: number;
    avgRevenueIncrease: number;
    topOptimizationType: string;
  };
  
  generatedAt: Timestamp;
}
