export enum ConflictType {
  POLITICAL_CAMPAIGNING = 'political_campaigning',
  PARTY_ENDORSEMENT = 'party_endorsement',
  RELIGIOUS_SUPERIORITY = 'religious_superiority',
  GENDER_WAR = 'gender_war',
  NATIONALIST_PROPAGANDA = 'nationalist_propaganda',
  CONSPIRACY_EVANGELISM = 'conspiracy_evangelism',
  IDEOLOGICAL_RECRUITMENT = 'ideological_recruitment',
  CULTURE_WAR = 'culture_war'
}

export enum ContentCategory {
  LIFESTYLE = 'lifestyle',
  BUSINESS = 'business',
  ART = 'art',
  FOOD = 'food',
  EDUCATION = 'education',
  SELF_DEVELOPMENT = 'self_development',
  PHILOSOPHY = 'philosophy',
  CONFLICT_FORMING = 'conflict_forming'
}

export enum TrendStatus {
  MONITORING = 'monitoring',
  DOWNRANKED = 'downranked',
  EXPOSURE_REMOVED = 'exposure_removed',
  VIRALITY_DISABLED = 'virality_disabled',
  FROZEN = 'frozen',
  RESOLVED = 'resolved'
}

export enum SeverityLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface ClimateScore {
  conflictScore: number;
  politicalScore: number;
  religiousScore: number;
  genderWarScore: number;
  propagandaScore: number;
  toxicityScore: number;
  category: ContentCategory;
  conflictTypes: ConflictType[];
  analyzedAt: Date;
}

export interface ConflictTrend {
  id: string;
  trendHash: string;
  keywords: string[];
  hashtags: string[];
  category: ConflictType;
  severity: SeverityLevel;
  velocity: number;
  contentCount: number;
  userCount: number;
  status: TrendStatus;
  detectedAt: Date;
  lastUpdated: Date;
  conflictCommentRatio: number;
  viralityMetrics: {
    shares: number;
    comments: number;
    engagementRate: number;
    growthRate: number;
  };
}

export interface ConflictContentCase {
  id: string;
  contentId: string;
  userId: string;
  contentType: 'post' | 'comment' | 'reply' | 'bio';
  conflictType: ConflictType;
  severity: SeverityLevel;
  climateScore: ClimateScore;
  status: 'pending' | 'reviewed' | 'action_taken' | 'dismissed';
  actionTaken?: {
    type: 'downrank' | 'disable_virality' | 'remove_exposure' | 'freeze' | 'none';
    appliedAt: Date;
    reason: string;
  };
  createdAt: Date;
  reviewedAt?: Date;
  reviewedBy?: string;
  appealable: boolean;
}

export interface CultureSafetyProfile {
  userId: string;
  filters: {
    hidePolitical: boolean;
    hideReligious: boolean;
    hideDebateThreads: boolean;
    hideProvocativeHashtags: boolean;
    hideConflictComments: boolean;
  };
  preferences: {
    allowPeacefulBeliefExpression: boolean;
    allowedCreators: string[];
  };
  updatedAt: Date;
}

export interface ClimateReport {
  id: string;
  reporterId: string;
  contentId: string;
  contentType: 'post' | 'comment' | 'reply';
  reportType: ConflictType;
  description: string;
  status: 'pending' | 'reviewing' | 'resolved' | 'dismissed';
  priority: 'low' | 'medium' | 'high';
  timestamp: Date;
  resolvedAt?: Date;
  resolution?: string;
}

export interface TrendVelocity {
  trendId: string;
  velocity: number;
  acceleration: number;
  timestamp: Date;
  metrics: {
    shares: number;
    comments: number;
    views: number;
    uniqueUsers: number;
  };
}

export interface PositiveRedirect {
  id: string;
  category: ContentCategory;
  title: string;
  description: string;
  contentIds: string[];
  priority: number;
  active: boolean;
  createdAt: Date;
}

export interface ClimateAppeal {
  id: string;
  creatorId: string;
  contentId: string;
  caseId: string;
  reason: string;
  evidence?: string;
  status: 'pending' | 'under_review' | 'approved' | 'denied';
  timestamp: Date;
  reviewedAt?: Date;
  reviewedBy?: string;
  decision?: string;
}

export interface ConflictDetectionResult {
  isConflict: boolean;
  conflictTypes: ConflictType[];
  severity: SeverityLevel;
  confidence: number;
  climateScore: ClimateScore;
  recommendedAction: 'none' | 'monitor' | 'downrank' | 'disable_virality' | 'freeze';
  reasoning: string;
}