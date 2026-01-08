/**
 * PACK 156: Mystery Shopper & Compliance Audit Types
 * Decoy Users · Marketplace Fraud Catching · NSFW/Romance Trap Detection
 */

export type DecoyUserType =
  | 'new_user'
  | 'high_spender'
  | 'beginner_creator'
  | 'event_attendee'
  | 'digital_product_customer';

export type ProbeType =
  | 'external_contact'
  | 'romantic_monetization'
  | 'escort_dynamics'
  | 'nsfw_solicitation'
  | 'refund_fraud'
  | 'visibility_bartering';

export type ViolationSeverity = 1 | 2 | 3 | 4 | 5;

export type ComplianceAction =
  | 'no_violation'
  | 'warning'
  | 'education_required'
  | 'feature_freeze'
  | 'account_ban'
  | 'legal_escalation';

export type FeatureAccessType =
  | 'chat'
  | 'events'
  | 'marketplace'
  | 'video_calls'
  | 'stories'
  | 'gifts';

export interface MysteryShopperProfile {
  id: string;
  decoyType: DecoyUserType;
  displayName: string;
  avatarUrl?: string;
  bio?: string;
  metadata: {
    spendingProfile?: 'low' | 'medium' | 'high';
    activityPattern?: 'casual' | 'active' | 'very_active';
    interestCategories?: string[];
  };
  isActive: boolean;
  totalProbesCompleted: number;
  violationsDetected: number;
  createdAt: Date;
  lastActiveAt: Date;
}

export interface ProbeScenario {
  id: string;
  probeType: ProbeType;
  targetDecoyType: DecoyUserType;
  scriptLines: string[];
  expectedRedFlags: string[];
  severity: ViolationSeverity;
  description: string;
}

export interface ComplianceCase {
  id: string;
  targetUserId: string;
  shopperProfileId: string;
  probeType: ProbeType;
  severity: ViolationSeverity;
  status: 'open' | 'investigating' | 'resolved' | 'appealed';
  evidence: {
    chatSnapshots?: Array<{
      messageId: string;
      content: string;
      timestamp: Date;
      sender: string;
    }>;
    mediaSnapshots?: Array<{
      url: string;
      type: 'image' | 'video' | 'audio';
      timestamp: Date;
    }>;
    contextNotes?: string;
  };
  reasonCode: string;
  actionTaken: ComplianceAction;
  auditorId?: string;
  auditorNotes?: string;
  createdAt: Date;
  resolvedAt?: Date;
  expiresAt?: Date;
}

export interface ComplianceRiskScore {
  userId: string;
  score: number;
  tier: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
  factors: {
    violationHistory: number;
    reportCount: number;
    behaviorPatterns: number;
    engagementQuality: number;
  };
  auditFrequency: 'low' | 'medium' | 'high' | 'constant';
  lastCalculatedAt: Date;
  nextAuditScheduledAt?: Date;
}

export interface AuditAction {
  id: string;
  caseId: string;
  targetUserId: string;
  actionType: ComplianceAction;
  reason: string;
  reasonCode: string;
  severity: ViolationSeverity;
  frozenFeatures?: FeatureAccessType[];
  educationRequirements?: string[];
  appealDeadline?: Date;
  appliedBy: string;
  appliedAt: Date;
  expiresAt?: Date;
  metadata?: {
    deviceIds?: string[];
    ipAddresses?: string[];
    relatedCases?: string[];
  };
}

export interface ComplianceAppeal {
  id: string;
  caseId: string;
  actionId: string;
  userId: string;
  reason: string;
  evidence?: string;
  status: 'pending' | 'under_review' | 'approved' | 'denied';
  reviewedBy?: string;
  reviewNotes?: string;
  submittedAt: Date;
  reviewedAt?: Date;
}

export interface ProbeResult {
  shopperProfileId: string;
  targetUserId: string;
  probeType: ProbeType;
  violationDetected: boolean;
  severity?: ViolationSeverity;
  evidence?: ComplianceCase['evidence'];
  timestamp: Date;
}

export interface ComplianceMetrics {
  date: string;
  totalProbes: number;
  violationsDetected: number;
  warningsIssued: number;
  accountsBanned: number;
  appealsSubmitted: number;
  appealsApproved: number;
  detectionRate: number;
  falsePositiveRate: number;
}

export const SEVERITY_DEFINITIONS = {
  5: {
    description: 'Critical - Instant ban',
    triggers: [
      'escorting/sugar dating solicitation',
      'sexual services pricing',
      'sexual content for tokens',
      'prostitution disguised as mentoring',
      'external NSFW content funnels'
    ],
    action: 'account_ban' as ComplianceAction
  },
  4: {
    description: 'Severe - Feature freeze',
    triggers: [
      'flirting for tokens',
      'love-bombing tied to payments',
      'parasocial manipulation for monetization',
      'predatory targeting of high-spenders'
    ],
    action: 'feature_freeze' as ComplianceAction
  },
  3: {
    description: 'Moderate - Warning and education',
    triggers: [
      'excessive external contact attempts',
      'inappropriate payment requests',
      'misleading product descriptions'
    ],
    action: 'warning' as ComplianceAction
  },
  2: {
    description: 'Minor - Education only',
    triggers: [
      'unclear communication about services',
      'minor policy violations'
    ],
    action: 'education_required' as ComplianceAction
  },
  1: {
    description: 'Informational - No action',
    triggers: ['suspicious but not clearly violating'],
    action: 'no_violation' as ComplianceAction
  }
} as const;

export const PROBE_SCENARIOS: ProbeScenario[] = [
  {
    id: 'external_contact_whatsapp',
    probeType: 'external_contact',
    targetDecoyType: 'high_spender',
    scriptLines: [
      'I really enjoy talking with you',
      'Can we continue this conversation on WhatsApp?',
      'I want to connect more privately'
    ],
    expectedRedFlags: ['whatsapp', 'telegram', 'off-platform', 'private'],
    severity: 4,
    description: 'Tests for external payment/contact solicitation'
  },
  {
    id: 'romantic_payment',
    probeType: 'romantic_monetization',
    targetDecoyType: 'high_spender',
    scriptLines: [
      'I am very generous to people I like',
      'What do I get if I pay more tokens?',
      'Can I have special attention for tokens?'
    ],
    expectedRedFlags: ['special attention', 'exclusive', 'romance', 'relationship'],
    severity: 5,
    description: 'Detects romantic monetization schemes'
  },
  {
    id: 'escort_inquiry',
    probeType: 'escort_dynamics',
    targetDecoyType: 'high_spender',
    scriptLines: [
      'I noticed you\'re in my city',
      'Can I pay to meet you in person?',
      'What are your rates for private time?'
    ],
    expectedRedFlags: ['meet', 'in person', 'rates', 'private time'],
    severity: 5,
    description: 'Detects escort/dating service solicitation'
  },
  {
    id: 'nsfw_request',
    probeType: 'nsfw_solicitation',
    targetDecoyType: 'high_spender',
    scriptLines: [
      'I really like your content',
      'Do you have other kinds of photos?',
      'Can I see more if I pay tokens?'
    ],
    expectedRedFlags: ['photos', 'private', 'exclusive content', 'nsfw'],
    severity: 5,
    description: 'Tests for NSFW content solicitation'
  },
  {
    id: 'refund_scam',
    probeType: 'refund_fraud',
    targetDecoyType: 'digital_product_customer',
    scriptLines: [
      'I bought your digital product',
      'I want to refund to get my tokens back',
      'Can you help me launder these tokens?'
    ],
    expectedRedFlags: ['refund', 'launder', 'transfer tokens'],
    severity: 4,
    description: 'Detects refund fraud and token laundering'
  },
  {
    id: 'visibility_barter',
    probeType: 'visibility_bartering',
    targetDecoyType: 'beginner_creator',
    scriptLines: [
      'I can help you get more visibility',
      'If you promote my stuff, I will promote yours',
      'Let\'s exchange followers'
    ],
    expectedRedFlags: ['promote', 'exchange', 'boost', 'visibility'],
    severity: 3,
    description: 'Detects improper visibility bartering'
  }
];

export const REASON_CODES = {
  ESC_001: 'Escorting/sugar dating solicitation detected',
  SEX_001: 'Sexual services pricing detected',
  SEX_002: 'Sexual content for tokens detected',
  SEX_003: 'Prostitution disguised as mentoring/coaching',
  SEX_004: 'External NSFW content funnel detected',
  ROM_001: 'Flirting for tokens detected',
  ROM_002: 'Love-bombing tied to payments',
  ROM_003: 'Parasocial manipulation for monetization',
  ROM_004: 'Predatory targeting of high-spenders',
  EXT_001: 'External contact solicitation (WhatsApp/Telegram)',
  EXT_002: 'Direct payment request bypass',
  EXT_003: 'Cryptocurrency payment solicitation',
  FRD_001: 'Refund fraud attempt',
  FRD_002: 'Token laundering scheme',
  FRD_003: 'Fake product/service fraud',
  VIS_001: 'Visibility bartering detected',
  VIS_002: 'Follower exchange scheme',
  SAF_001: 'Offline safety policy violation',
  MIS_001: 'Misleading service description'
} as const;