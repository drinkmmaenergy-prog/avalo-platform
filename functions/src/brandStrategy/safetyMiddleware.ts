import { ContentSuggestion, SafetyCheckResult } from '../types/brandStrategy';

// Forbidden patterns that indicate sexualization, parasocial manipulation, or emotional exploitation
const FORBIDDEN_PATTERNS = {
  sexualization: [
    /\bthirst\s*trap/gi,
    /\bsexy/gi,
    /\bseductive/gi,
    /\bhot\b/gi,
    /\bsexy\s*pose/gi,
    /\bsensual/gi,
    /\berotic/gi,
    /\bnsfw/gi,
    /\bintimate\s*photo/gi,
    /\bbikini\s*shot/gi,
    /\bbedroom/gi,
    /\blingerie/gi,
    /\bshowcase.*body/gi,
    /\bflirt/gi,
    /\bflirtation/gi,
    /\bflirtatious/gi,
    /\bact.*available/gi,
    /\bplay.*hard.*get/gi,
    /\btease.*fans/gi,
    /\bsexual.*appeal/gi,
    /\battractiveness/gi,
    /\bbeauty.*farm/gi,
  ],
  
  parasocialManipulation: [
    /\bpretend.*care/gi,
    /\bfake.*relationship/gi,
    /\bact.*in\s*love/gi,
    /\bfake.*interest/gi,
    /\blove.*bomb/gi,
    /\bemotional.*hook/gi,
    /\bmanipulate.*feelings/gi,
    /\bstring.*along/gi,
    /\blead.*on/gi,
    /\bfake.*availability/gi,
    /\bpretend.*single/gi,
    /\bact.*interested/gi,
    /\btop.*simp/gi,
    /\brank.*by.*spending/gi,
    /\bfan.*loyalty.*reward/gi,
    /\bcompanionship.*sale/gi,
  ],
  
  emotionalExploitation: [
    /\btrauma.*content/gi,
    /\bshare.*trauma.*views/gi,
    /\bovershare.*personal/gi,
    /\bemotional.*bait/gi,
    /\bcrying.*stream/gi,
    /\bbreakdown.*content/gi,
    /\bmental.*health.*exploit/gi,
    /\bvulnerability.*views/gi,
    /\bsadness.*monetize/gi,
    /\bguilt.*trip/gi,
    /\breward.*affection/gi,
    /\bsell.*love/gi,
    /\brent.*girlfriend/gi,
    /\bpaid.*intimacy/gi,
  ],
  
  intimacyMonetization: [
    /\bgirlfriend.*experience/gi,
    /\bboyfriend.*experience/gi,
    /\bpaid.*date/gi,
    /\bvirtual.*girlfriend/gi,
    /\bvirtual.*boyfriend/gi,
    /\bescort/gi,
    /\bsugar.*baby/gi,
    /\bsugar.*daddy/gi,
    /\bpay.*for.*attention/gi,
    /\bpay.*for.*affection/gi,
    /\bmoney.*for.*love/gi,
    /\bintimacy.*tier/gi,
    /\bromantic.*package/gi,
    /\bdate.*package/gi,
  ],
  
  boundaryViolation: [
    /\bshare.*home.*address/gi,
    /\bshow.*where.*live/gi,
    /\bpersonal.*phone/gi,
    /\breal.*name.*reveal/gi,
    /\bprivate.*life.*exposed/gi,
    /\bfamily.*exploitation/gi,
    /\bchildren.*content/gi,
    /\brelationship.*drama/gi,
    /\bex.*drama/gi,
  ],
};

// Allowed professional themes
const ALLOWED_THEMES = [
  'fitness',
  'nutrition',
  'health',
  'wellness',
  'photography',
  'art',
  'music',
  'business',
  'entrepreneurship',
  'education',
  'teaching',
  'coaching',
  'training',
  'lifestyle',
  'travel',
  'cooking',
  'technology',
  'gaming',
  'productivity',
  'motivation',
  'inspiration',
  'creativity',
  'DIY',
  'crafts',
  'fashion',
  'style',
  'design',
  'architecture',
  'gardening',
  'pets',
  'sports',
  'outdoors',
  'adventure',
  'meditation',
  'mindfulness',
  'personal development',
  'professional skills',
  'career growth',
  'finance',
  'investing',
  'budgeting',
];

/**
 * Check if content suggestion passes safety filters
 */
export function checkContentSafety(suggestion: ContentSuggestion): SafetyCheckResult {
  const result: SafetyCheckResult = {
    passed: true,
    blockedReasons: [],
    flags: {
      sexualization: false,
      parasocialManipulation: false,
      emotionalExploitation: false,
      intimacyMonetization: false,
      boundaryViolation: false,
    },
  };
  
  const contentText = `${suggestion.type} ${suggestion.category} ${suggestion.title} ${suggestion.description} ${suggestion.tags.join(' ')}`;
  
  // Check for sexualization
  for (const pattern of FORBIDDEN_PATTERNS.sexualization) {
    if (pattern.test(contentText)) {
      result.passed = false;
      result.flags.sexualization = true;
      result.blockedReasons.push('Content contains sexualization or seductive themes');
      break;
    }
  }
  
  // Check for parasocial manipulation
  for (const pattern of FORBIDDEN_PATTERNS.parasocialManipulation) {
    if (pattern.test(contentText)) {
      result.passed = false;
      result.flags.parasocialManipulation = true;
      result.blockedReasons.push('Content encourages parasocial manipulation');
      break;
    }
  }
  
  // Check for emotional exploitation
  for (const pattern of FORBIDDEN_PATTERNS.emotionalExploitation) {
    if (pattern.test(contentText)) {
      result.passed = false;
      result.flags.emotionalExploitation = true;
      result.blockedReasons.push('Content exploits emotional vulnerability');
      break;
    }
  }
  
  // Check for intimacy monetization
  for (const pattern of FORBIDDEN_PATTERNS.intimacyMonetization) {
    if (pattern.test(contentText)) {
      result.passed = false;
      result.flags.intimacyMonetization = true;
      result.blockedReasons.push('Content monetizes intimacy or relationships');
      break;
    }
  }
  
  // Check for boundary violations
  for (const pattern of FORBIDDEN_PATTERNS.boundaryViolation) {
    if (pattern.test(contentText)) {
      result.passed = false;
      result.flags.boundaryViolation = true;
      result.blockedReasons.push('Content violates personal boundaries');
      break;
    }
  }
  
  return result;
}

/**
 * Filter a list of content suggestions to only include safe ones
 */
export function filterSafeSuggestions(suggestions: ContentSuggestion[]): ContentSuggestion[] {
  return suggestions.filter(suggestion => {
    const safetyCheck = checkContentSafety(suggestion);
    return safetyCheck.passed;
  });
}

/**
 * Validate that a content theme is allowed
 */
export function validateTheme(theme: string): { valid: boolean; reason?: string } {
  const themeLower = theme.toLowerCase();
  
  // Check if theme contains forbidden patterns
  const themeCheck = checkContentSafety({
    type: 'theme_validation',
    category: theme,
    title: theme,
    description: theme,
    tags: [theme],
  });
  
  if (!themeCheck.passed) {
    return {
      valid: false,
      reason: themeCheck.blockedReasons[0],
    };
  }
  
  // Check if theme is in allowed list or similar
  const isAllowed = ALLOWED_THEMES.some(allowed => 
    themeLower.includes(allowed.toLowerCase()) || 
    allowed.toLowerCase().includes(themeLower)
  );
  
  if (!isAllowed) {
    // Be lenient - only block if explicitly forbidden
    // Most professional themes should be acceptable
    return { valid: true };
  }
  
  return { valid: true };
}

/**
 * Generate safe content category suggestions based on user's niche
 */
export function generateSafeCategories(niche: string[]): string[] {
  const categories: string[] = [];
  
  const nicheMap: Record<string, string[]> = {
    fitness: [
      'Workout Tutorials',
      'Exercise Form Analysis',
      'Training Program Design',
      'Nutrition Tips',
      'Recovery Techniques',
      'Fitness Motivation',
      'Progress Tracking',
      'Athletic Performance',
    ],
    nutrition: [
      'Meal Planning',
      'Healthy Recipes',
      'Dietary Education',
      'Supplement Guides',
      'Nutrition Science',
      'Meal Prep Tips',
      'Nutritional Myths',
      'Food Quality Analysis',
    ],
    photography: [
      'Photography Techniques',
      'Camera Settings Guide',
      'Editing Tutorials',
      'Composition Breakdown',
      'Lighting Tips',
      'Gear Reviews',
      'Location Scouting',
      'Photography Business',
    ],
    art: [
      'Art Techniques',
      'Creative Process',
      'Art History',
      'Medium Tutorials',
      'Portfolio Building',
      'Art Business',
      'Inspiration Sources',
      'Art Critique',
    ],
    business: [
      'Business Strategy',
      'Entrepreneurship Tips',
      'Marketing Insights',
      'Productivity Hacks',
      'Leadership Skills',
      'Financial Planning',
      'Networking Strategies',
      'Success Stories',
    ],
    education: [
      'Educational Content',
      'Learning Techniques',
      'Study Methods',
      'Skill Development',
      'Knowledge Sharing',
      'Teaching Strategies',
      'Course Creation',
      'Mentorship',
    ],
    lifestyle: [
      'Daily Routines',
      'Life Balance',
      'Personal Growth',
      'Habit Building',
      'Time Management',
      'Goal Setting',
      'Wellness Practices',
      'Life Skills',
    ],
    technology: [
      'Tech Tutorials',
      'Software Reviews',
      'Programming Tips',
      'Tech News Analysis',
      'Digital Tools',
      'Innovation Insights',
      'Tech Career Advice',
      'Problem Solving',
    ],
  };
  
  // Match niche to categories
  niche.forEach(n => {
    const nicheLower = n.toLowerCase();
    Object.keys(nicheMap).forEach(key => {
      if (nicheLower.includes(key) || key.includes(nicheLower)) {
        categories.push(...nicheMap[key]);
      }
    });
  });
  
  // Remove duplicates
  return Array.from(new Set(categories));
}

/**
 * Validate roadmap and ensure it doesn't include forbidden monetization
 */
export function validateRoadmap(outcomes: {
  revenue: string[];
  audience: string[];
  products: string[];
  events: string[];
  partnerships: string[];
}): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  
  const allOutcomes = [
    ...outcomes.revenue,
    ...outcomes.audience,
    ...outcomes.products,
    ...outcomes.events,
    ...outcomes.partnerships,
  ];
  
  const checkText = allOutcomes.join(' ');
  
  const safetyCheck = checkContentSafety({
    type: 'roadmap_validation',
    category: 'outcomes',
    title: 'roadmap',
    description: checkText,
    tags: allOutcomes,
  });
  
  if (!safetyCheck.passed) {
    issues.push(...safetyCheck.blockedReasons);
  }
  
  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * Check if analytics insight is safe to present
 */
export function validateInsight(insight: string, recommendation: string): SafetyCheckResult {
  return checkContentSafety({
    type: 'insight',
    category: 'analytics',
    title: insight,
    description: recommendation,
    tags: [],
  });
}

/**
 * Get alternative safe suggestions when content is blocked
 */
export function getAlternativeSuggestions(blockedCategory: string, niche: string[]): ContentSuggestion[] {
  const safeCategories = generateSafeCategories(niche);
  
  const suggestions: ContentSuggestion[] = safeCategories.slice(0, 5).map(category => ({
    type: 'alternative_content',
    category,
    title: `Create ${category} content`,
    description: `Professional content focused on ${category.toLowerCase()} to grow your audience authentically`,
    tags: [category.toLowerCase().replace(/\s+/g, '_'), 'professional', 'educational'],
  }));
  
  return suggestions;
}