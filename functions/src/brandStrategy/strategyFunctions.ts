import { db, serverTimestamp } from '../init';
import {
  AIStrategyProfile,
  ContentStrategyPlan,
  BrandRoadmap,
  StrategyInsight,
  StrategyInteraction,
  GenerateStrategyProfileRequest,
  GenerateContentCalendarRequest,
  GenerateRoadmapRequest,
  UpdateStrategyWithAnalyticsRequest,
  ContentCalendarItem,
  RoadmapPhase,
  Milestone,
  Campaign,
  ContentSuggestion,
} from '../types/brandStrategy';
import {
  checkContentSafety,
  filterSafeSuggestions,
  validateTheme,
  generateSafeCategories,
  validateRoadmap,
  validateInsight,
} from './safetyMiddleware';

/**
 * Generate a comprehensive brand strategy profile for a creator
 */
export async function generateStrategyProfile(
  request: GenerateStrategyProfileRequest
): Promise<AIStrategyProfile> {
  const { creatorId, personalBrand, professionalGoals, boundaries } = request;

  // Build default safe profile
  const profile: AIStrategyProfile = {
    id: db.collection('ai_strategy_profiles').doc().id,
    creatorId,
    createdAt: new Date(),
    updatedAt: new Date(),
    
    personalBrand: {
      niche: personalBrand?.niche || [],
      expertise: personalBrand?.expertise || [],
      strengths: personalBrand?.strengths || [],
      values: personalBrand?.values || ['authenticity', 'professionalism', 'quality'],
      targetAudience: personalBrand?.targetAudience || 'Professional audience seeking value',
      uniqueValueProposition: personalBrand?.uniqueValueProposition || 
        'Providing expert knowledge and practical guidance',
    },
    
    contentThemes: {
      primary: generateSafeCategories(personalBrand?.niche || []),
      secondary: [],
      forbidden: [
        'Sexualization',
        'Seductive content',
        'Thirst traps',
        'Parasocial manipulation',
        'Emotional exploitation',
        'Paid intimacy',
        'Girlfriend/Boyfriend experience',
        'Love bombing',
        'Trauma sharing for views',
      ],
    },
    
    professionalGoals: {
      timeline: professionalGoals?.timeline || 'medium_term',
      targetRole: professionalGoals?.targetRole || 'hybrid_creator',
      milestones: professionalGoals?.milestones || [
        'Build consistent content schedule',
        'Grow engaged audience',
        'Launch first digital product',
        'Host first live event',
      ],
    },
    
    boundaries: {
      personalInfoSharing: boundaries?.personalInfoSharing || 'minimal',
      interactionLevel: boundaries?.interactionLevel || 'professional',
      contentComfortZone: boundaries?.contentComfortZone || [
        'Educational content',
        'Professional insights',
        'Skill demonstrations',
        'Industry knowledge',
      ],
      redLines: boundaries?.redLines || [
        'No personal address sharing',
        'No romantic/intimate content',
        'No oversharing personal trauma',
        'No emotional manipulation',
        'No selling intimacy or companionship',
      ],
    },
    
    safetyFlags: {
      noSexualization: true,
      noParasocialManipulation: true,
      noEmotionalExploitation: true,
      noPaidIntimacy: true,
    },
  };

  // Validate all themes
  for (const theme of profile.contentThemes.primary) {
    const validation = validateTheme(theme);
    if (!validation.valid) {
      throw new Error(`Theme "${theme}" failed safety validation: ${validation.reason}`);
    }
  }

  // Save to Firestore
  await db.collection('ai_strategy_profiles').doc(profile.id).set({
    ...profile,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return profile;
}

/**
 * Generate a content calendar based on strategy profile
 */
export async function generateContentCalendar(
  request: GenerateContentCalendarRequest
): Promise<ContentStrategyPlan> {
  const { profileId, periodType, startDate, preferences } = request;

  // Get profile
  const profileDoc = await db.collection('ai_strategy_profiles').doc(profileId).get();
  if (!profileDoc.exists) {
    throw new Error('Strategy profile not found');
  }
  const profile = profileDoc.data() as AIStrategyProfile;

  // Calculate end date
  const start = new Date(startDate);
  const end = new Date(start);
  if (periodType === 'weekly') {
    end.setDate(end.getDate() + 7);
  } else if (periodType === 'monthly') {
    end.setMonth(end.getMonth() + 1);
  } else if (periodType === 'quarterly') {
    end.setMonth(end.getMonth() + 3);
  }

  // Generate content calendar items
  const calendarItems: ContentCalendarItem[] = [];
  const postsPerWeek = preferences?.postsPerWeek || 5;
  const categories = profile.contentThemes.primary;

  const daysInPeriod = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  const totalPosts = Math.floor((daysInPeriod / 7) * postsPerWeek);

  for (let i = 0; i < totalPosts; i++) {
    const category = categories[i % categories.length];
    const postDate = new Date(start);
    postDate.setDate(postDate.getDate() + Math.floor(i / postsPerWeek) * 7 + (i % postsPerWeek));

    const type = i % 10 === 0 ? 'livestream' : i % 5 === 0 ? 'long_form' : 'short_form';

    const item: ContentCalendarItem = {
      id: `item_${Date.now()}_${i}`,
      date: postDate,
      type,
      category,
      title: generateSafeContentTitle(category, type),
      description: generateSafeContentDescription(category, type),
      tags: [category.toLowerCase().replace(/\s+/g, '_'), type],
      preparationTime: type === 'livestream' ? 120 : type === 'long_form' ? 60 : 30,
      status: 'planned',
    };

    // Safety check
    const safetyCheck = checkContentSafety({
      type: item.type,
      category: item.category,
      title: item.title,
      description: item.description,
      tags: item.tags,
    });

    if (safetyCheck.passed) {
      calendarItems.push(item);
    }
  }

  // Generate campaigns
  const campaigns: Campaign[] = [];
  if (periodType === 'monthly' || periodType === 'quarterly') {
    campaigns.push({
      id: `campaign_${Date.now()}`,
      name: `${profile.contentThemes.primary[0]} Challenge`,
      type: 'challenge',
      startDate: new Date(start),
      endDate: new Date(end),
      description: `Monthly challenge to engage audience with ${profile.contentThemes.primary[0].toLowerCase()} content`,
      goals: ['Increase engagement', 'Build community', 'Demonstrate expertise'],
      contentPieces: [],
    });
  }

  const plan: ContentStrategyPlan = {
    id: db.collection('content_strategy_plans').doc().id,
    profileId,
    creatorId: profile.creatorId,
    createdAt: new Date(),
    updatedAt: new Date(),
    
    period: {
      start,
      end,
      type: periodType,
    },
    
    contentCalendar: calendarItems,
    
    categoryRotation: categories.map(category => ({
      category,
      frequency: 'weekly',
      targetCount: Math.floor(postsPerWeek / categories.length) || 1,
    })),
    
    formatMix: {
      shortForm: 60,
      longForm: 20,
      livestreams: 10,
      stories: 10,
    },
    
    campaigns,
    
    metrics: {
      targetPosts: calendarItems.length,
      targetEngagement: calendarItems.length * 100,
      targetReach: calendarItems.length * 1000,
    },
  };

  // Save to Firestore
  await db.collection('content_strategy_plans').doc(plan.id).set({
    ...plan,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return plan;
}

/**
 * Generate a career roadmap for a creator
 */
export async function generateRoadmap(
  request: GenerateRoadmapRequest
): Promise<BrandRoadmap> {
  const { profileId, careerPath, timeline, currentStatus } = request;

  // Get profile
  const profileDoc = await db.collection('ai_strategy_profiles').doc(profileId).get();
  if (!profileDoc.exists) {
    throw new Error('Strategy profile not found');
  }
  const profile = profileDoc.data() as AIStrategyProfile;

  const phases: RoadmapPhase[] = [];

  // Generate phases based on career path
  if (careerPath === 'full_time_creator') {
    phases.push(
      createPhase('Foundation', 1, '0-3 months', 'Build content foundation and audience', [
        createMilestone('Launch consistent posting schedule', 'Post 5x per week for 4 consecutive weeks'),
        createMilestone('Reach 1,000 followers', 'Grow engaged audience through quality content'),
        createMilestone('Establish content categories', 'Define 3-5 core content themes'),
      ]),
      createPhase('Growth', 2, '3-6 months', 'Scale content and monetization', [
        createMilestone('Launch first digital product', 'Create and sell educational resource'),
        createMilestone('Reach 5,000 followers', 'Continue audience growth'),
        createMilestone('Generate $1,000 monthly revenue', 'Diversify income streams'),
      ]),
      createPhase('Sustainability', 3, '6-12 months', 'Achieve full-time income', [
        createMilestone('Generate $3,000+ monthly revenue', 'Replace traditional employment income'),
        createMilestone('Launch secondary products', 'Expand product offerings'),
        createMilestone('Build team/automate', 'Delegate or automate repetitive tasks'),
      ])
    );
  } else if (careerPath === 'educator') {
    phases.push(
      createPhase('Content Creation', 1, '0-3 months', 'Establish teaching presence', [
        createMilestone('Define course topics', 'Identify 3-5 course areas based on expertise'),
        createMilestone('Create sample lessons', 'Produce 10 free educational videos'),
        createMilestone('Build email list', 'Collect 500 interested learners'),
      ]),
      createPhase('Course Launch', 2, '3-6 months', 'Launch first paid course', [
        createMilestone('Complete course production', 'Create comprehensive course materials'),
        createMilestone('Achieve 50 course sales', 'Launch and market first course'),
        createMilestone('Gather testimonials', 'Collect reviews from satisfied students'),
      ]),
      createPhase('Scale Education', 3, '6-12 months', 'Expand educational offerings', [
        createMilestone('Launch 3 additional courses', 'Diversify course catalog'),
        createMilestone('Offer mentorship program', 'Provide 1-on-1 guidance'),
        createMilestone('Generate $5,000+ monthly', 'Achieve sustainable education income'),
      ])
    );
  } else if (careerPath === 'coach_trainer') {
    phases.push(
      createPhase('Credibility Building', 1, '0-3 months', 'Establish expertise and authority', [
        createMilestone('Share transformation stories', 'Document client success stories (with permission)'),
        createMilestone('Publish expert content', 'Share knowledge through regular posts'),
        createMilestone('Offer free consultations', 'Connect with 20 potential clients'),
      ]),
      createPhase('Client Acquisition', 2, '3-6 months', 'Build client base', [
        createMilestone('Sign 10 paying clients', 'Convert consultations to paid programs'),
        createMilestone('Create coaching packages', 'Develop tiered service offerings'),
        createMilestone('Generate $2,000+ monthly', 'Achieve baseline coaching income'),
      ]),
      createPhase('Program Scaling', 3, '6-12 months', 'Scale coaching business', [
        createMilestone('Launch group programs', 'Serve multiple clients simultaneously'),
        createMilestone('Create digital coaching tools', 'Develop templates and resources'),
        createMilestone('Generate $5,000+ monthly', 'Achieve sustainable coaching income'),
      ])
    );
  } else {
    phases.push(
      createPhase('Getting Started', 1, '0-3 months', 'Build foundation', [
        createMilestone('Define content strategy', 'Establish consistent posting schedule'),
        createMilestone('Grow initial audience', 'Reach first 1,000 followers'),
      ]),
      createPhase('Expansion', 2, '3-6 months', 'Grow and monetize', [
        createMilestone('Launch first revenue stream', 'Create monetization channel'),
        createMilestone('Increase engagement', 'Build active community'),
      ])
    );
  }

  // Generate outcomes based on career path
  const outcomes = generateCareerOutcomes(careerPath, profile);

  // Validate roadmap for safety
  const validation = validateRoadmap(outcomes);
  if (!validation.valid) {
    throw new Error(`Roadmap validation failed: ${validation.issues.join(', ')}`);
  }

  const roadmap: BrandRoadmap = {
    id: db.collection('brand_roadmaps').doc().id,
    profileId,
    creatorId: profile.creatorId,
    createdAt: new Date(),
    updatedAt: new Date(),
    careerPath,
    phases,
    currentPhase: phases[0].id,
    outcomes,
    sustainabilityMetrics: {
      workPace: 'moderate',
      restCycles: ['Weekly rest day', 'Monthly review and adjustment', 'Quarterly break week'],
      burnoutRisk: 'low',
    },
  };

  // Save to Firestore
  await db.collection('brand_roadmaps').doc(roadmap.id).set({
    ...roadmap,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return roadmap;
}

/**
 * Update strategy based on analytics data
 */
export async function updateStrategyWithAnalytics(
  request: UpdateStrategyWithAnalyticsRequest
): Promise<StrategyInsight[]> {
  const { profileId, analyticsData } = request;

  const insights: StrategyInsight[] = [];

  // Analyze top performing topics
  if (analyticsData.topPerformingTopics && analyticsData.topPerformingTopics.length > 0) {
    const topTopic = analyticsData.topPerformingTopics[0];
    const insight: StrategyInsight = {
      id: db.collection('strategy_insights').doc().id,
      profileId,
      creatorId: '',
      createdAt: new Date(),
      type: 'topic_performance',
      category: topTopic.topic,
      insight: `Your "${topTopic.topic}" content performs best with ${topTopic.avgRetention.toFixed(1)}% retention`,
      recommendation: `Create more ${topTopic.topic} content and consider expanding into related sub-topics`,
      data: {
        metric: 'retention',
        value: topTopic.avgRetention,
        trend: 'up',
      },
      actionable: true,
      priority: 'high',
      safetyVerified: true,
    };

    // Validate insight
    const safetyCheck = validateInsight(insight.insight, insight.recommendation);
    if (safetyCheck.passed) {
      insights.push(insight);
    }
  }

  // Analyze posting times
  if (analyticsData.bestPostingTimes && analyticsData.bestPostingTimes.length > 0) {
    const bestTime = analyticsData.bestPostingTimes[0];
    const insight: StrategyInsight = {
      id: db.collection('strategy_insights').doc().id,
      profileId,
      creatorId: '',
      createdAt: new Date(),
      type: 'posting_time',
      category: 'scheduling',
      insight: `Best posting time: ${bestTime.dayOfWeek} at ${bestTime.hour}:00`,
      recommendation: `Schedule your highest-quality content for ${bestTime.dayOfWeek} at ${bestTime.hour}:00 to maximize reach`,
      data: {
        metric: 'engagement_score',
        value: bestTime.score,
        trend: 'stable',
      },
      actionable: true,
      priority: 'medium',
      safetyVerified: true,
    };
    insights.push(insight);
  }

  // Save insights
  for (const insight of insights) {
    await db.collection('strategy_insights').doc(insight.id).set({
      ...insight,
      createdAt: serverTimestamp(),
    });
  }

  return insights;
}

/**
 * Log strategy interaction
 */
export async function logStrategyInteraction(
  interaction: Omit<StrategyInteraction, 'id' | 'timestamp'>
): Promise<void> {
  const interactionDoc: StrategyInteraction = {
    id: db.collection('strategy_interactions').doc().id,
    ...interaction,
    timestamp: new Date(),
  };

  await db.collection('strategy_interactions').doc(interactionDoc.id).set({
    ...interactionDoc,
    timestamp: serverTimestamp(),
  });
}

// Helper functions

function generateSafeContentTitle(category: string, type: string): string {
  const templates: Record<string, string[]> = {
    short_form: [
      `Quick ${category} Tip`,
      `${category} Insight`,
      `${category} Breakdown`,
      `Daily ${category}`,
    ],
    long_form: [
      `Complete ${category} Guide`,
      `${category} Deep Dive`,
      `${category} Tutorial`,
      `Mastering ${category}`,
    ],
    livestream: [
      `${category} Live Session`,
      `${category} Q&A`,
      `${category} Workshop`,
      `${category} Masterclass`,
    ],
  };

  const options = templates[type] || templates.short_form;
  return options[Math.floor(Math.random() * options.length)];
}

function generateSafeContentDescription(category: string, type: string): string {
  const templates: Record<string, string[]> = {
    short_form: [
      `Professional insights on ${category.toLowerCase()}`,
      `Practical ${category.toLowerCase()} advice`,
      `Expert ${category.toLowerCase()} tips`,
    ],
    long_form: [
      `Comprehensive guide to ${category.toLowerCase()}`,
      `In-depth ${category.toLowerCase()} tutorial`,
      `Everything you need to know about ${category.toLowerCase()}`,
    ],
    livestream: [
      `Live ${category.toLowerCase()} session with Q&A`,
      `Interactive ${category.toLowerCase()} workshop`,
      `Real-time ${category.toLowerCase()} demonstration`,
    ],
  };

  const options = templates[type] || templates.short_form;
  return options[Math.floor(Math.random() * options.length)];
}

function createPhase(
  name: string,
  order: number,
  timeline: string,
  description: string,
  milestones: Milestone[]
): RoadmapPhase {
  return {
    id: `phase_${order}`,
    name,
    order,
    timeline,
    description,
    milestones,
    requiredSkills: [],
    requiredResources: [],
    status: order === 1 ? 'in_progress' : 'not_started',
  };
}

function createMilestone(name: string, description: string): Milestone {
  return {
    id: `milestone_${Date.now()}_${Math.random()}`,
    name,
    description,
    criteria: [description],
    status: 'not_started',
  };
}

function generateCareerOutcomes(
  careerPath: string,
  profile: AIStrategyProfile
): BrandRoadmap['outcomes'] {
  const baseOutcomes = {
    revenue: [
      'Digital product sales',
      'Content monetization',
      'Brand partnerships',
    ],
    audience: [
      'Engaged community growth',
      'Email list building',
      'Social media presence',
    ],
    products: [
      'Educational resources',
      'Digital guides',
      'Templates and tools',
    ],
    events: [
      'Live workshops',
      'Virtual events',
      'Community meetups',
    ],
    partnerships: [
      'Professional collaborations',
      'Industry partnerships',
      'Brand sponsorships',
    ],
  };

  if (careerPath === 'educator') {
    baseOutcomes.products = [
      'Online courses',
      'Educational workshops',
      'Mentorship programs',
      'Certification programs',
    ];
  } else if (careerPath === 'coach_trainer') {
    baseOutcomes.products = [
      'Coaching packages',
      'Group programs',
      'Training materials',
      'Assessment tools',
    ];
  } else if (careerPath === 'entertainer') {
    baseOutcomes.products = [
      'Exclusive content',
      'Merchandise',
      'Live performances',
      'Special events',
    ];
  }

  return baseOutcomes;
}