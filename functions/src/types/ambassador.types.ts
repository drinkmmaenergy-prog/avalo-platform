/**
 * PACK 202 - Ambassador & Early Access Program Types
 * 
 * Professional creator ambassador program with strict anti-NSFW safeguards.
 * No free tokens, no romantic recruitment, no sexualized marketing.
 */

export interface Ambassador {
  id: string;
  userId: string;
  status: AmbassadorStatus;
  applicationDate: Date;
  approvalDate?: Date;
  rejectionDate?: Date;
  
  // Qualification details
  qualification: AmbassadorQualification;
  expertise: ExpertiseCategory[];
  portfolio: PortfolioItem[];
  socialProfiles: SocialProfile[];
  
  // Program details
  badge: 'Early Builder';
  referralCode: string;
  totalReferrals: number;
  totalRevenue: number;
  totalCommission: number;
  
  // Academy progress
  academyProgress: {
    completedModules: string[];
    currentModule?: string;
    certifications: string[];
  };
  
  // Compliance
  contractSigned: boolean;
  contractSignedDate?: Date;
  safetyTrainingCompleted: boolean;
  safetyTrainingDate?: Date;
  violations: AmbassadorViolation[];
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
  metadata: Record<string, any>;
}

export type AmbassadorStatus = 
  | 'pending'           // Application submitted
  | 'under_review'      // Being reviewed
  | 'approved'          // Active ambassador
  | 'rejected'          // Application denied
  | 'suspended'         // Temporarily blocked
  | 'removed';          // Permanently removed

export interface AmbassadorQualification {
  type: QualificationType;
  description: string;
  experience: string;
  achievements: string[];
  references?: string[];
  verificationDocuments?: string[];
}

export type QualificationType =
  | 'educational_value'      // fitness coach, language tutor, business mentor
  | 'community_building'     // event organizer, challenge leader
  | 'social_skills'          // motivational host, workshop organizer
  | 'skill_excellence'       // art, music, gaming, photography
  | 'professionalism';       // consistent quality and safe content

export type ExpertiseCategory =
  | 'fitness'
  | 'language'
  | 'business'
  | 'events'
  | 'motivation'
  | 'art'
  | 'music'
  | 'gaming'
  | 'photography'
  | 'design'
  | 'production'
  | 'teaching'
  | 'entrepreneurship'
  | 'public_speaking'
  | 'coaching'
  | 'workshops';

export interface PortfolioItem {
  id: string;
  type: 'video' | 'image' | 'article' | 'course' | 'event' | 'project';
  title: string;
  description: string;
  url: string;
  thumbnail?: string;
  verified: boolean;
  createdAt: Date;
}

export interface SocialProfile {
  platform: string;
  username: string;
  url: string;
  followers?: number;
  verified: boolean;
  contentType: string;
}

export interface AmbassadorViolation {
  id: string;
  type: ViolationType;
  description: string;
  severity: 'warning' | 'serious' | 'critical';
  evidence: string[];
  reportedBy?: string;
  reportedAt: Date;
  resolvedAt?: Date;
  resolution?: string;
}

export type ViolationType =
  | 'nsfw_content'
  | 'romantic_marketing'
  | 'parasocial_strategy'
  | 'body_selling'
  | 'emotional_pressure'
  | 'safety_violation'
  | 'contract_breach'
  | 'sexualized_recruitment'
  | 'inappropriate_language'
  | 'misleading_claims';

export interface AmbassadorReferral {
  id: string;
  ambassadorId: string;
  referralCode: string;
  referredUserId: string;
  referredUserType: 'creator' | 'user';
  
  // Status
  status: 'pending' | 'active' | 'inactive' | 'removed';
  activatedAt?: Date;
  
  // Revenue tracking
  totalRevenueGenerated: number;
  totalCommissionEarned: number;
  lastRevenueDate?: Date;
  
  // Compliance
  violationDetected: boolean;
  violationDetails?: string;
  
  createdAt: Date;
  updatedAt: Date;
}

export interface AmbassadorRevenueLog {
  id: string;
  ambassadorId: string;
  referralId: string;
  referredUserId: string;
  
  // Transaction details
  transactionId: string;
  transactionType: 'subscription' | 'purchase' | 'tip' | 'service';
  transactionAmount: number;
  
  // Commission calculation
  platformShare: number;           // 35% of transaction
  commissionRate: number;          // 5% of platform share
  commissionAmount: number;        // Final amount earned
  
  // Timestamps
  transactionDate: Date;
  commissionPaidDate?: Date;
  
  createdAt: Date;
}

export interface AmbassadorAcademyModule {
  id: string;
  title: string;
  description: string;
  category: AcademyCategory;
  order: number;
  
  // Content
  lessons: AcademyLesson[];
  estimatedDuration: number;  // minutes
  
  // Requirements
  prerequisiteModules: string[];
  certificationRequired: boolean;
  
  // Status
  published: boolean;
  publishedAt?: Date;
  
  createdAt: Date;
  updatedAt: Date;
}

export type AcademyCategory =
  | 'platform_basics'
  | 'content_creation'
  | 'community_building'
  | 'ethical_monetization'
  | 'safety_compliance'
  | 'brand_building'
  | 'marketing_strategy'
  | 'audience_engagement';

export interface AcademyLesson {
  id: string;
  title: string;
  description: string;
  type: 'video' | 'article' | 'interactive' | 'quiz';
  contentUrl?: string;
  content?: string;
  duration: number;  // minutes
  order: number;
  
  // Quiz data if applicable
  quiz?: {
    questions: QuizQuestion[];
    passingScore: number;
  };
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number;  // index of correct option
  explanation?: string;
}

export interface AmbassadorProgress {
  ambassadorId: string;
  userId: string;
  moduleId: string;
  
  // Progress tracking
  startedAt: Date;
  completedAt?: Date;
  currentLessonId?: string;
  completedLessons: string[];
  
  // Quiz results
  quizAttempts: QuizAttempt[];
  quizPassed: boolean;
  
  // Certification
  certified: boolean;
  certificationDate?: Date;
  certificateUrl?: string;
  
  updatedAt: Date;
}

export interface QuizAttempt {
  attemptId: string;
  attemptedAt: Date;
  score: number;
  passed: boolean;
  answers: Record<string, number>;  // questionId -> selectedOption
}

export interface AmbassadorContract {
  id: string;
  ambassadorId: string;
  userId: string;
  version: string;
  
  // Terms
  terms: ContractTerms;
  
  // Signature
  signed: boolean;
  signedAt?: Date;
  signature?: string;
  ipAddress?: string;
  
  // Status
  status: 'draft' | 'active' | 'terminated';
  terminatedAt?: Date;
  terminationReason?: string;
  
  createdAt: Date;
  updatedAt: Date;
}

export interface ContractTerms {
  // Prohibited activities
  prohibitions: {
    noSexualMonetization: boolean;
    noRomanticMarketing: boolean;
    noParasocialStrategies: boolean;
    noBodySellingContent: boolean;
    noEmotionalPressure: boolean;
  };
  
  // Required compliance
  requirements: {
    mandatorySafetyTraining: boolean;
    ethicalRecruitment: boolean;
    professionalStandards: boolean;
    contentModeration: boolean;
  };
  
  // Consequences
  violations: {
    autoRemoval: boolean;
    revenueFreezeOnViolation: boolean;
    legalNoticeOnBreach: boolean;
  };
  
  // Commission structure
  commissionStructure: {
    rate: number;               // 5%
    source: string;             // "platform share"
    noCreatorImpact: boolean;   // Creator still gets 65%
    noInflation: boolean;       // No token inflation
  };
}

export interface AmbassadorApplication {
  id: string;
  userId: string;
  status: 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected';
  
  // Application data
  qualification: AmbassadorQualification;
  expertise: ExpertiseCategory[];
  portfolio: PortfolioItem[];
  socialProfiles: SocialProfile[];
  
  // Additional information
  motivationStatement: string;
  contentSamples: string[];
  references: ApplicationReference[];
  
  // Review process
  submittedAt?: Date;
  reviewStartedAt?: Date;
  reviewedBy?: string;
  reviewedAt?: Date;
  reviewNotes?: string;
  rejectionReason?: string;
  
  // NSFW/romantic content check
  contentScreening: {
    checked: boolean;
    checkedAt?: Date;
    nsfwDetected: boolean;
    romanticContentDetected: boolean;
    inappropriateLanguageDetected: boolean;
    screeningDetails?: string;
  };
  
  createdAt: Date;
  updatedAt: Date;
}

export interface ApplicationReference {
  name: string;
  relationship: string;
  contactEmail: string;
  verified: boolean;
  verifiedAt?: Date;
}

export interface AmbassadorReport {
  id: string;
  reportedAmbassadorId: string;
  reportedBy: string;  // userId
  reportType: ViolationType;
  
  // Details
  description: string;
  evidence: ReportEvidence[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  
  // Status
  status: 'pending' | 'investigating' | 'resolved' | 'dismissed';
  investigatedBy?: string;
  investigationNotes?: string;
  resolution?: string;
  actionTaken?: AmbassadorAction;
  
  // Timestamps
  reportedAt: Date;
  investigatedAt?: Date;
  resolvedAt?: Date;
  
  metadata: Record<string, any>;
}

export interface ReportEvidence {
  type: 'screenshot' | 'url' | 'message' | 'video' | 'document';
  url?: string;
  description: string;
  timestamp?: Date;
}

export type AmbassadorAction =
  | 'warning_issued'
  | 'content_removed'
  | 'training_required'
  | 'temporary_suspension'
  | 'permanent_removal'
  | 'revenue_frozen'
  | 'legal_notice_sent'
  | 'no_action';

export interface NSFWDetectionResult {
  detected: boolean;
  confidence: number;
  categories: NSFWCategory[];
  details: string;
  timestamp: Date;
}

export type NSFWCategory =
  | 'explicit_content'
  | 'suggestive_content'
  | 'romantic_language'
  | 'body_focus'
  | 'sexual_innuendo'
  | 'dating_appeal'
  | 'emotional_manipulation'
  | 'adult_entertainment_reference';

export interface RecruitmentMessage {
  id: string;
  ambassadorId: string;
  recipientUserId?: string;
  recipientEmail?: string;
  
  // Content
  message: string;
  subject?: string;
  attachments?: string[];
  
  // Screening
  screened: boolean;
  screeningResult?: NSFWDetectionResult;
  approved: boolean;
  rejectionReason?: string;
  
  // Status
  status: 'draft' | 'screening' | 'approved' | 'rejected' | 'sent';
  sentAt?: Date;
  
  createdAt: Date;
  updatedAt: Date;
}

export interface AmbassadorDashboardStats {
  ambassadorId: string;
  period: 'all_time' | 'month' | 'week' | 'day';
  
  // Referral stats
  totalReferrals: number;
  activeReferrals: number;
  creatorReferrals: number;
  userReferrals: number;
  
  // Revenue stats
  totalRevenueGenerated: number;
  totalCommissionEarned: number;
  commissionPending: number;
  commissionPaid: number;
  
  // Performance
  topReferral?: {
    userId: string;
    username: string;
    revenue: number;
  };
  recentActivity: ReferralActivity[];
  
  // Academy progress
  modulesCompleted: number;
  totalModules: number;
  certifications: number;
  
  // Compliance status
  violations: number;
  warnings: number;
  complianceScore: number;  // 0-100
  
  lastUpdated: Date;
}

export interface ReferralActivity {
  type: 'referral_joined' | 'revenue_earned' | 'commission_paid' | 'milestone_reached';
  referralId: string;
  userId: string;
  username: string;
  amount?: number;
  timestamp: Date;
}

export interface AllowedRecruitmentChannel {
  id: string;
  name: string;
  type: 'educational' | 'professional' | 'creative' | 'business';
  description: string;
  approved: boolean;
  examples: string[];
}

export interface ForbiddenRecruitmentPattern {
  id: string;
  pattern: string;
  type: 'nsfw' | 'romantic' | 'attention_selling' | 'body_focus';
  severity: 'low' | 'medium' | 'high' | 'critical';
  examples: string[];
  autoReject: boolean;
}

export const ALLOWED_CHANNELS: AllowedRecruitmentChannel[] = [
  {
    id: 'business_schools',
    name: 'Business Schools & Universities',
    type: 'educational',
    description: 'Academic institutions focused on business, entrepreneurship',
    approved: true,
    examples: ['MBA programs', 'Business student groups', 'Entrepreneurship clubs']
  },
  {
    id: 'fitness_communities',
    name: 'Fitness Communities',
    type: 'professional',
    description: 'Professional fitness, health, and wellness communities',
    approved: true,
    examples: ['Personal trainer groups', 'Nutrition coaching', 'Yoga instructors']
  },
  {
    id: 'music_production',
    name: 'Music & Production Communities',
    type: 'creative',
    description: 'Music creation, production, and teaching',
    approved: true,
    examples: ['Music producer groups', 'DJ communities', 'Music theory educators']
  },
  {
    id: 'photography_design',
    name: 'Photography & Design Communities',
    type: 'creative',
    description: 'Visual arts, photography, and design professionals',
    approved: true,
    examples: ['Photography groups', 'Graphic designers', 'UI/UX communities']
  },
  {
    id: 'public_speaking',
    name: 'Public Speaking & Teaching Groups',
    type: 'professional',
    description: 'Professional speakers, educators, workshop leaders',
    approved: true,
    examples: ['Toastmasters', 'Workshop facilitators', 'Online educators']
  },
  {
    id: 'startup_hubs',
    name: 'Startup & Entrepreneurship Hubs',
    type: 'business',
    description: 'Startup ecosystems, entrepreneurship networks',
    approved: true,
    examples: ['Startup incubators', 'Founders groups', 'Innovation hubs']
  },
  {
    id: 'gaming_esports',
    name: 'Gaming & E-sports Communities',
    type: 'professional',
    description: 'Professional gaming, e-sports teams and coaches',
    approved: true,
    examples: ['E-sports teams', 'Gaming coaches', 'Tournament organizers']
  }
];

export const FORBIDDEN_PATTERNS: ForbiddenRecruitmentPattern[] = [
  {
    id: 'influencer_paid_chat',
    pattern: 'be an influencer and get paid to chat',
    type: 'attention_selling',
    severity: 'critical',
    examples: [
      'Get paid just for chatting',
      'Earn money for being you',
      'Monetize your personality'
    ],
    autoReject: true
  },
  {
    id: 'attractive_payment',
    pattern: 'get paid by being attractive',
    type: 'body_focus',
    severity: 'critical',
    examples: [
      'Use your looks to earn',
      'Get paid for being pretty',
      'Monetize your appearance'
    ],
    autoReject: true
  },
  {
    id: 'attention_monetization',
    pattern: 'get paid for attention',
    type: 'attention_selling',
    severity: 'critical',
    examples: [
      'Earn by getting attention',
      'Get paid for views',
      'Monetize your following'
    ],
    autoReject: true
  },
  {
    id: 'men_pay_messages',
    pattern: 'men will pay you for messages',
    type: 'romantic',
    severity: 'critical',
    examples: [
      'Guys will pay to talk to you',
      'Men want to message you',
      'Get paid by talking to men'
    ],
    autoReject: true
  },
  {
    id: 'sugar_economy',
    pattern: 'sugar daddy',
    type: 'romantic',
    severity: 'critical',
    examples: [
      'Sugar daddy/baby',
      'Financial arrangement',
      'Generous benefactor'
    ],
    autoReject: true
  },
  {
    id: 'cam_performer',
    pattern: 'cam performer',
    type: 'nsfw',
    severity: 'critical',
    examples: [
      'Webcam model',
      'Live cam streaming',
      'Adult cam performer'
    ],
    autoReject: true
  },
  {
    id: 'romantic_texting',
    pattern: 'paid romantic texting',
    type: 'romantic',
    severity: 'critical',
    examples: [
      'Get paid to flirt',
      'Romantic conversations for money',
      'Paid girlfriend experience'
    ],
    autoReject: true
  }
];

export const AMBASSADOR_BENEFITS = {
  priorityAccess: [
    'New tools beta access',
    'Feature previews',
    'Early API access',
    'Priority support'
  ],
  expeditedVerification: [
    'Fast-track identity verification',
    'Quick account approval',
    'Instant badge assignment'
  ],
  badge: 'Early Builder',
  growthAcademy: [
    'Exclusive training modules',
    'Business development courses',
    'Marketing masterclasses',
    'Community building workshops'
  ],
  priorityScheduling: [
    'Early event registration',
    'Webinar hosting opportunities',
    'Workshop speaker slots',
    'Official livestream hosting'
  ]
};

export const COMMISSION_STRUCTURE = {
  rate: 0.05,                    // 5%
  source: 'platform_share',      // from Avalo's 35%
  creatorSplit: 0.65,           // Creator still gets 65%
  platformSplit: 0.35,          // Avalo takes 35%
  noInflation: true,            // No token inflation
  noBonuses: true,              // No bonus tokens
  noFreeTokens: true            // No free tokens
};