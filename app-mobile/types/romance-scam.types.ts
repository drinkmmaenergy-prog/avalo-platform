/**
 * PACK 248 - Romance Scam Protection Types
 * 
 * Objective: Allow romance/flirting/sex but block financial manipulation
 * This system does NOT block consensual romantic or sexual content
 */

export interface RomanceScamDetection {
  messageId: string;
  chatId: string;
  senderId: string;
  receiverId: string;
  messageText: string;
  detectedAt: Date;
  suspiciousPatterns: SuspiciousPattern[];
  riskLevel: RiskLevel;
  autoBlocked: boolean;
}

export interface SuspiciousPattern {
  patternType: ScamPatternType;
  matchedPhrase: string;
  confidence: number; // 0.0 - 1.0
  context: string;
}

export type ScamPatternType =
  | 'MONEY_REQUEST'           // "send me money", "need cash"
  | 'GIFT_DEMAND'             // "buy me", "gift me"
  | 'FINANCIAL_PRESSURE'      // "if you love me, pay"
  | 'EMERGENCY_SCAM'          // "sick family", "emergency"
  | 'CRYPTO_SCAM'             // "invest in crypto"
  | 'EXTERNAL_PAYMENT'        // "send to my PayPal"
  | 'EMOTIONAL_BLACKMAIL'     // "block you if no payment"
  | 'TRAVEL_SCAM';            // "buy me ticket"

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface UserRiskScore {
  userId: string;
  totalScore: number; // 0-100, higher = more suspicious
  lastUpdated: Date;
  incidents: RiskIncident[];
  earnPaused: boolean;
  requiresManualReview: boolean;
}

export interface RiskIncident {
  incidentId: string;
  timestamp: Date;
  type: ScamPatternType;
  severityPoints: number; // Points added to risk score
  messageId?: string;
  reportedBy?: string;
}

export interface StopScamReport {
  reportId: string;
  reporterId: string;
  reportedUserId: string;
  chatId: string;
  messageId?: string;
  timestamp: Date;
  reason: string;
  status: ReportStatus;
  reviewedBy?: string;
  reviewedAt?: Date;
  actionTaken?: ScamAction;
}

export type ReportStatus = 'PENDING' | 'UNDER_REVIEW' | 'CONFIRMED_SCAM' | 'FALSE_POSITIVE' | 'DISMISSED';

export type ScamAction =
  | 'WARNING_ISSUED'
  | 'EARN_PAUSED'
  | 'ACCOUNT_SUSPENDED'
  | 'REFUND_ISSUED'
  | 'NO_ACTION';

export interface RefundRecord {
  refundId: string;
  victimUserId: string;
  scammerUserId: string;
  chatId: string;
  tokensRefunded: number;
  transactionIds: string[]; // Original transaction IDs
  reason: string;
  issuedAt: Date;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
}

/**
 * Detection Configuration
 * IMPORTANT: These patterns detect FINANCIAL MANIPULATION only
 * Romance, flirting, sexual content is ALLOWED
 */
export interface ScamDetectionConfig {
  enabled: boolean;
  patterns: ScamPattern[];
  riskThresholds: {
    LOW: number;      // 0-25 points
    MEDIUM: number;   // 26-50 points
    HIGH: number;     // 51-75 points
    CRITICAL: number; // 76-100 points
  };
  autoBlockThreshold: number; // Auto-pause earn at this score
  manualReviewThreshold: number; // Flag for manual review at this score
}

export interface ScamPattern {
  type: ScamPatternType;
  keywords: string[];
  regex?: RegExp;
  severityPoints: number;
  requiresContext?: boolean; // True if needs surrounding text for accuracy
}

/**
 * Default scam patterns - FINANCIAL MANIPULATION ONLY
 * Romance/flirting/sex is NOT included
 */
export const ROMANCE_SCAM_PATTERNS: ScamPattern[] = [
  {
    type: 'MONEY_REQUEST',
    keywords: [
      'send me money',
      'send money',
      'need money',
      'give me money',
      'lend me',
      'loan me',
      'transfer money',
      'wire money',
      'wire transfer',
      'cash app',
      'venmo me',
      'zelle me',
    ],
    severityPoints: 25,
  },
  {
    type: 'GIFT_DEMAND',
    keywords: [
      'buy me',
      'gift me',
      'purchase for me',
      'get me',
      'need you to buy',
      'want you to buy',
    ],
    severityPoints: 20,
  },
  {
    type: 'FINANCIAL_PRESSURE',
    keywords: [
      'if you love me',
      'prove your love',
      'show you care',
      'real love means',
      'don\'t love me if',
      'block you if you don\'t',
    ],
    severityPoints: 30,
    requiresContext: true,
  },
  {
    type: 'EMERGENCY_SCAM',
    keywords: [
      'sick family',
      'hospital emergency',
      'urgent medical',
      'family emergency',
      'need help urgently',
      'tragedy',
      'accident',
    ],
    severityPoints: 35,
    requiresContext: true,
  },
  {
    type: 'CRYPTO_SCAM',
    keywords: [
      'invest in crypto',
      'bitcoin investment',
      'guaranteed returns',
      'crypto opportunity',
      'trading platform',
    ],
    severityPoints: 40,
  },
  {
    type: 'EXTERNAL_PAYMENT',
    keywords: [
      'paypal',
      'outside avalo',
      'my bank account',
      'direct payment',
      'payment app',
      'cash app',
      'venmo',
      'zelle',
    ],
    severityPoints: 30,
  },
  {
    type: 'EMOTIONAL_BLACKMAIL',
    keywords: [
      'block you if',
      'leave you unless',
      'won\'t talk unless',
      'forget you if',
      'done with you if',
    ],
    severityPoints: 35,
  },
  {
    type: 'TRAVEL_SCAM',
    keywords: [
      'buy ticket',
      'visa fee',
      'travel expenses',
      'flight ticket',
      'book flight',
      'pay for travel',
    ],
    severityPoints: 25,
  },
];

export const DEFAULT_SCAM_CONFIG: ScamDetectionConfig = {
  enabled: true,
  patterns: ROMANCE_SCAM_PATTERNS,
  riskThresholds: {
    LOW: 25,
    MEDIUM: 50,
    HIGH: 75,
    CRITICAL: 100,
  },
  autoBlockThreshold: 75,  // Pause earn at 75+ risk score
  manualReviewThreshold: 50, // Flag for review at 50+
};

/**
 * Educational messages - Subtle, not alarming
 */
export const SAFETY_MESSAGES = {
  SUBTLE_WARNING: 'Be yourself — you don\'t need to buy anything to be liked.',
  FINANCIAL_PRESSURE: 'If a conversation turns into financial pressure — report it and we\'ll help.',
  GENUINE_FEELINGS: 'Real feelings are free. They don\'t require payment.',
  REPORT_OPTION: 'Feel uncomfortable? Use the report button — it\'s confidential.',
} as const;