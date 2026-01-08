export interface AIStrategyProfile {
  id: string;
  creatorId: string;
  createdAt: Date;
  updatedAt: Date;
  
  personalBrand: {
    niche: string[];
    expertise: string[];
    strengths: string[];
    values: string[];
    targetAudience: string;
    uniqueValueProposition: string;
  };
  
  contentThemes: {
    primary: string[];
    secondary: string[];
    forbidden: string[];
  };
  
  professionalGoals: {
    timeline: 'short_term' | 'medium_term' | 'long_term';
    targetRole: 'full_time_creator' | 'hybrid_creator' | 'educator' | 'entertainer' | 'coach_trainer';
    milestones: string[];
  };
  
  boundaries: {
    personalInfoSharing: 'minimal' | 'moderate' | 'open';
    interactionLevel: 'professional' | 'friendly' | 'casual';
    contentComfortZone: string[];
    redLines: string[];
  };
  
  safetyFlags: {
    noSexualization: boolean;
    noParasocialManipulation: boolean;
    noEmotionalExploitation: boolean;
    noPaidIntimacy: boolean;
  };
}

export interface ContentStrategyPlan {
  id: string;
  profileId: string;
  creatorId: string;
  createdAt: Date;
  updatedAt: Date;
  
  period: {
    start: Date;
    end: Date;
    type: 'weekly' | 'monthly' | 'quarterly';
  };
  
  contentCalendar: ContentCalendarItem[];
  
  categoryRotation: {
    category: string;
    frequency: 'daily' | 'weekly' | 'bi_weekly' | 'monthly';
    targetCount: number;
  }[];
  
  formatMix: {
    shortForm: number; // percentage
    longForm: number;
    livestreams: number;
    stories: number;
  };
  
  campaigns: Campaign[];
  
  metrics: {
    targetPosts: number;
    targetEngagement: number;
    targetReach: number;
  };
}

export interface ContentCalendarItem {
  id: string;
  date: Date;
  timeSlot?: string;
  
  type: 'short_form' | 'long_form' | 'livestream' | 'story' | 'event';
  category: string;
  title: string;
  description: string;
  
  tags: string[];
  preparationTime: number; // minutes
  
  status: 'planned' | 'in_progress' | 'completed' | 'cancelled';
  
  notes?: string;
}

export interface Campaign {
  id: string;
  name: string;
  type: 'challenge' | 'series' | 'seasonal' | 'educational' | 'event';
  
  startDate: Date;
  endDate: Date;
  
  description: string;
  goals: string[];
  
  contentPieces: string[];
  
  metrics?: {
    participation?: number;
    engagement?: number;
    completion?: number;
  };
}

export interface BrandRoadmap {
  id: string;
  profileId: string;
  creatorId: string;
  createdAt: Date;
  updatedAt: Date;
  
  careerPath: 'full_time_creator' | 'hybrid_creator' | 'educator' | 'entertainer' | 'coach_trainer';
  
  phases: RoadmapPhase[];
  
  currentPhase: string;
  
  outcomes: {
    revenue: string[];
    audience: string[];
    products: string[];
    events: string[];
    partnerships: string[];
  };
  
  sustainabilityMetrics: {
    workPace: 'light' | 'moderate' | 'intense';
    restCycles: string[];
    burnoutRisk: 'low' | 'medium' | 'high';
  };
}

export interface RoadmapPhase {
  id: string;
  name: string;
  order: number;
  
  timeline: string;
  description: string;
  
  milestones: Milestone[];
  
  requiredSkills: string[];
  requiredResources: string[];
  
  status: 'not_started' | 'in_progress' | 'completed';
}

export interface Milestone {
  id: string;
  name: string;
  description: string;
  
  targetDate?: Date;
  completedDate?: Date;
  
  criteria: string[];
  
  status: 'not_started' | 'in_progress' | 'completed';
}

export interface StrategyInsight {
  id: string;
  profileId: string;
  creatorId: string;
  createdAt: Date;
  
  type: 'retention' | 'engagement' | 'posting_time' | 'topic_performance' | 
        'format_preference' | 'audience_growth' | 'product_response' | 'event_participation';
  
  category: string;
  
  insight: string;
  recommendation: string;
  
  data: {
    metric: string;
    value: number;
    trend: 'up' | 'down' | 'stable';
    comparison?: {
      previous: number;
      change: number;
    };
  };
  
  actionable: boolean;
  priority: 'low' | 'medium' | 'high';
  
  safetyVerified: boolean;
}

export interface StrategyInteraction {
  id: string;
  profileId: string;
  creatorId: string;
  timestamp: Date;
  
  interactionType: 'viewed_insight' | 'applied_recommendation' | 'updated_calendar' |
                    'completed_milestone' | 'adjusted_boundaries' | 'requested_suggestion';
  
  details: {
    itemId?: string;
    action?: string;
    result?: string;
  };
  
  feedback?: {
    helpful: boolean;
    comment?: string;
  };
}

export interface BrandIdentityQuestionnaire {
  id: string;
  creatorId: string;
  createdAt: Date;
  completedAt?: Date;
  
  status: 'in_progress' | 'completed';
  
  responses: {
    questionId: string;
    question: string;
    answer: string | string[];
  }[];
  
  generatedProfile?: Partial<AIStrategyProfile>;
}

// Safety filter types
export interface ContentSuggestion {
  type: string;
  category: string;
  title: string;
  description: string;
  tags: string[];
}

export interface SafetyCheckResult {
  passed: boolean;
  blockedReasons: string[];
  flags: {
    sexualization: boolean;
    parasocialManipulation: boolean;
    emotionalExploitation: boolean;
    intimacyMonetization: boolean;
    boundaryViolation: boolean;
  };
}

// Request/Response types
export interface GenerateStrategyProfileRequest {
  creatorId: string;
  questionnaireId?: string;
  personalBrand?: Partial<AIStrategyProfile['personalBrand']>;
  professionalGoals?: Partial<AIStrategyProfile['professionalGoals']>;
  boundaries?: Partial<AIStrategyProfile['boundaries']>;
}

export interface GenerateContentCalendarRequest {
  profileId: string;
  periodType: 'weekly' | 'monthly' | 'quarterly';
  startDate: Date;
  preferences?: {
    postsPerWeek?: number;
    includeLivestreams?: boolean;
    includeEvents?: boolean;
    focusCategories?: string[];
  };
}

export interface GenerateRoadmapRequest {
  profileId: string;
  careerPath: 'full_time_creator' | 'hybrid_creator' | 'educator' | 'entertainer' | 'coach_trainer';
  timeline: '6_months' | '1_year' | '2_years' | '5_years';
  currentStatus?: string;
}

export interface UpdateStrategyWithAnalyticsRequest {
  profileId: string;
  analyticsData: {
    topPerformingTopics: { topic: string; avgRetention: number; avgEngagement: number; }[];
    bestPostingTimes: { dayOfWeek: string; hour: number; score: number; }[];
    audienceGrowth: { period: string; growth: number; }[];
    productPerformance?: { productId: string; productName: string; revenue: number; units: number; }[];
    eventParticipation?: { eventId: string; eventName: string; attendees: number; engagement: number; }[];
  };
}