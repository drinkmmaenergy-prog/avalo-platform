import { ConflictType, ContentCategory, SeverityLevel, ClimateScore, ConflictDetectionResult } from './types';

interface ContentAnalysis {
  text: string;
  metadata?: {
    hashtags?: string[];
    mentions?: string[];
    links?: string[];
  };
}

const POLITICAL_KEYWORDS = [
  'vote', 'election', 'campaign', 'politician', 'democrat', 'republican', 'liberal', 'conservative',
  'left-wing', 'right-wing', 'socialist', 'capitalist', 'communist', 'fascist', 'party', 'politics'
];

const RELIGIOUS_CONFLICT_KEYWORDS = [
  'false religion', 'heretic', 'infidel', 'blasphemy', 'conversion', 'true faith', 'hell bound',
  'damned', 'evil religion', 'wrong belief', 'devil worship', 'cult'
];

const GENDER_WAR_KEYWORDS = [
  'all men are', 'all women are', 'men are trash', 'women are trash', 'male superiority',
  'female superiority', 'gender war', 'men vs women', 'battle of sexes', 'men bad', 'women bad',
  'toxic masculinity', 'toxic femininity', 'alpha male', 'beta male', 'feminism destroys'
];

const NATIONALIST_KEYWORDS = [
  'pure race', 'racial superiority', 'master race', 'inferior nation', 'ethnic cleansing',
  'nationalist pride', 'country first', 'foreign invasion', 'cultural genocide', 'protect our race'
];

const CONSPIRACY_KEYWORDS = [
  'deep state', 'illuminati', 'new world order', 'mind control', 'chemtrails', 'lizard people',
  'fake news', 'mainstream media lies', 'government cover-up', 'wake up sheeple', 'open your eyes'
];

const RECRUITMENT_PATTERNS = [
  'join our movement', 'fight with us', 'stand together against', 'our cause needs you',
  'together we can defeat', 'recruit allies', 'spread the message', 'convert others'
];

const POSITIVE_CATEGORIES = {
  lifestyle: ['travel', 'fitness', 'workout', 'vacation', 'adventure', 'wellness', 'balance'],
  business: ['career', 'entrepreneur', 'startup', 'business', 'leadership', 'management', 'professional'],
  art: ['photography', 'music', 'design', 'painting', 'drawing', 'creative', 'artistic'],
  food: ['recipe', 'cooking', 'nutrition', 'healthy eating', 'chef', 'culinary', 'food'],
  education: ['learn', 'study', 'course', 'tutorial', 'lesson', 'knowledge', 'science', 'history'],
  self_development: ['growth', 'mindset', 'habits', 'motivation', 'productivity', 'improvement'],
  philosophy: ['reflection', 'wisdom', 'life lessons', 'philosophical', 'contemplation']
};

export class AIContentModerator {
  
  async analyzeContent(content: ContentAnalysis): Promise<ConflictDetectionResult> {
    const text = content.text.toLowerCase();
    const hashtags = content.metadata?.hashtags?.map(h => h.toLowerCase()) || [];
    
    const scores = {
      political: this.calculatePoliticalScore(text, hashtags),
      religious: this.calculateReligiousConflictScore(text),
      genderWar: this.calculateGenderWarScore(text),
      nationalist: this.calculateNationalistScore(text),
      conspiracy: this.calculateConspiracyScore(text),
      recruitment: this.calculateRecruitmentScore(text)
    };
    
    const conflictTypes = this.identifyConflictTypes(scores);
    const severity = this.calculateSeverity(scores);
    const category = this.categorizeContent(text, hashtags, conflictTypes);
    const overallConflictScore = this.calculateOverallScore(scores);
    
    const climateScore: ClimateScore = {
      conflictScore: overallConflictScore,
      politicalScore: scores.political,
      religiousScore: scores.religious,
      genderWarScore: scores.genderWar,
      propagandaScore: Math.max(scores.nationalist, scores.conspiracy),
      toxicityScore: this.calculateToxicity(text),
      category,
      conflictTypes,
      analyzedAt: new Date()
    };
    
    const recommendedAction = this.determineAction(severity, overallConflictScore, conflictTypes);
    const confidence = this.calculateConfidence(scores, text);
    
    return {
      isConflict: conflictTypes.length > 0 && overallConflictScore > 0.3,
      conflictTypes,
      severity,
      confidence,
      climateScore,
      recommendedAction,
      reasoning: this.generateReasoning(conflictTypes, severity, scores)
    };
  }
  
  private calculatePoliticalScore(text: string, hashtags: string[]): number {
    let score = 0;
    
    POLITICAL_KEYWORDS.forEach(keyword => {
      if (text.includes(keyword)) score += 0.1;
    });
    
    hashtags.forEach(tag => {
      if (POLITICAL_KEYWORDS.some(k => tag.includes(k))) score += 0.15;
    });
    
    if (text.match(/vote (for|against)/i)) score += 0.3;
    if (text.match(/support (our|my) (candidate|party)/i)) score += 0.4;
    if (text.match(/(destroy|defeat|crush) (the )?(left|right|liberals|conservatives)/i)) score += 0.5;
    
    return Math.min(score, 1.0);
  }
  
  private calculateReligiousConflictScore(text: string): number {
    let score = 0;
    
    RELIGIOUS_CONFLICT_KEYWORDS.forEach(keyword => {
      if (text.includes(keyword)) score += 0.2;
    });
    
    if (text.match(/only (true|real) (religion|faith|god)/i)) score += 0.4;
    if (text.match(/(convert|save) (from|to) (religion|faith)/i)) score += 0.3;
    if (text.match(/(your|their) religion is (wrong|false|evil)/i)) score += 0.6;
    
    return Math.min(score, 1.0);
  }
  
  private calculateGenderWarScore(text: string): number {
    let score = 0;
    
    GENDER_WAR_KEYWORDS.forEach(keyword => {
      if (text.includes(keyword)) score += 0.2;
    });
    
    if (text.match(/(men|women) are (always|never|all)/i)) score += 0.3;
    if (text.match(/(hate|destroy|defeat) (all )?(men|women)/i)) score += 0.7;
    if (text.match(/gender supremacy/i)) score += 0.6;
    
    return Math.min(score, 1.0);
  }
  
  private calculateNationalistScore(text: string): number {
    let score = 0;
    
    NATIONALIST_KEYWORDS.forEach(keyword => {
      if (text.includes(keyword)) score += 0.3;
    });
    
    if (text.match(/racial purity/i)) score += 0.8;
    if (text.match(/superior (race|nation|ethnicity)/i)) score += 0.7;
    
    return Math.min(score, 1.0);
  }
  
  private calculateConspiracyScore(text: string): number {
    let score = 0;
    
    CONSPIRACY_KEYWORDS.forEach(keyword => {
      if (text.includes(keyword)) score += 0.15;
    });
    
    if (text.match(/wake up|open your eyes|they don't want you to know/i)) score += 0.3;
    if (text.match(/truth (they|media) (hide|conceal)/i)) score += 0.4;
    
    return Math.min(score, 1.0);
  }
  
  private calculateRecruitmentScore(text: string): number {
    let score = 0;
    
    RECRUITMENT_PATTERNS.forEach(pattern => {
      if (text.includes(pattern)) score += 0.25;
    });
    
    if (text.match(/join (us|our (cause|movement|fight))/i)) score += 0.4;
    if (text.match(/recruit|evangelize|convert (others|people)/i)) score += 0.5;
    
    return Math.min(score, 1.0);
  }
  
  private calculateToxicity(text: string): number {
    const toxicPatterns = [
      /\b(hate|destroy|kill|attack|fight|war)\b/i,
      /\b(idiot|stupid|dumb|trash|garbage)\b/i,
      /\b(loser|failure|pathetic|worthless)\b/i
    ];
    
    let score = 0;
    toxicPatterns.forEach(pattern => {
      if (pattern.test(text)) score += 0.2;
    });
    
    return Math.min(score, 1.0);
  }
  
  private identifyConflictTypes(scores: any): ConflictType[] {
    const types: ConflictType[] = [];
    
    if (scores.political > 0.4) types.push(ConflictType.POLITICAL_CAMPAIGNING);
    if (scores.religious > 0.4) types.push(ConflictType.RELIGIOUS_SUPERIORITY);
    if (scores.genderWar > 0.4) types.push(ConflictType.GENDER_WAR);
    if (scores.nationalist > 0.5) types.push(ConflictType.NATIONALIST_PROPAGANDA);
    if (scores.conspiracy > 0.4) types.push(ConflictType.CONSPIRACY_EVANGELISM);
    if (scores.recruitment > 0.5) types.push(ConflictType.IDEOLOGICAL_RECRUITMENT);
    
    return types;
  }
  
  private calculateSeverity(scores: Record<string, number>): SeverityLevel {
    const maxScore = Math.max(...Object.values(scores));
    
    if (maxScore >= 0.8) return SeverityLevel.CRITICAL;
    if (maxScore >= 0.6) return SeverityLevel.HIGH;
    if (maxScore >= 0.4) return SeverityLevel.MEDIUM;
    return SeverityLevel.LOW;
  }
  
  private categorizeContent(text: string, hashtags: string[], conflictTypes: ConflictType[]): ContentCategory {
    if (conflictTypes.length > 0) return ContentCategory.CONFLICT_FORMING;
    
    for (const [category, keywords] of Object.entries(POSITIVE_CATEGORIES)) {
      const matches = keywords.filter(keyword => 
        text.includes(keyword) || hashtags.some(tag => tag.includes(keyword))
      );
      if (matches.length >= 2) return category as ContentCategory;
    }
    
    return ContentCategory.LIFESTYLE;
  }
  
  private calculateOverallScore(scores: Record<string, number>): number {
    const values = Object.values(scores) as number[];
    return values.reduce((sum, score) => sum + score, 0) / values.length;
  }
  
  private determineAction(
    severity: SeverityLevel,
    overallScore: number,
    conflictTypes: ConflictType[]
  ): 'none' | 'monitor' | 'downrank' | 'disable_virality' | 'freeze' {
    if (severity === SeverityLevel.CRITICAL) return 'freeze';
    if (severity === SeverityLevel.HIGH) return 'disable_virality';
    if (severity === SeverityLevel.MEDIUM && overallScore > 0.5) return 'downrank';
    if (conflictTypes.length > 0) return 'monitor';
    return 'none';
  }
  
  private calculateConfidence(scores: Record<string, number>, text: string): number {
    const maxScore = Math.max(...Object.values(scores));
    const textLength = text.length;
    
    let confidence = maxScore;
    
    if (textLength < 50) confidence *= 0.7;
    if (textLength > 200) confidence = Math.min(confidence * 1.2, 1.0);
    
    return Math.max(0.5, Math.min(confidence, 0.95));
  }
  
  private generateReasoning(conflictTypes: ConflictType[], severity: SeverityLevel, scores: Record<string, number>): string {
    if (conflictTypes.length === 0) {
      return 'Content appears to be non-conflict forming and within positive categories.';
    }
    
    const reasons = conflictTypes.map(type => {
      switch (type) {
        case ConflictType.POLITICAL_CAMPAIGNING:
          return `Political campaigning detected (score: ${scores.political.toFixed(2)})`;
        case ConflictType.RELIGIOUS_SUPERIORITY:
          return `Religious conflict language detected (score: ${scores.religious.toFixed(2)})`;
        case ConflictType.GENDER_WAR:
          return `Gender war rhetoric detected (score: ${scores.genderWar.toFixed(2)})`;
        case ConflictType.NATIONALIST_PROPAGANDA:
          return `Nationalist propaganda detected (score: ${scores.nationalist.toFixed(2)})`;
        case ConflictType.CONSPIRACY_EVANGELISM:
          return `Conspiracy evangelism detected (score: ${scores.conspiracy.toFixed(2)})`;
        case ConflictType.IDEOLOGICAL_RECRUITMENT:
          return `Ideological recruitment detected (score: ${scores.recruitment.toFixed(2)})`;
        default:
          return `Conflict type: ${type}`;
      }
    });
    
    return `Severity: ${severity}. ${reasons.join('. ')}.`;
  }
  
  async analyzeCommentClimate(comments: Array<{ text: string; userId: string }>): Promise<{
    conflictRatio: number;
    sentimentScore: number;
    isEscalating: boolean;
  }> {
    let conflictCount = 0;
    let totalSentiment = 0;
    
    for (const comment of comments) {
      const result = await this.analyzeContent({ text: comment.text });
      if (result.isConflict) conflictCount++;
      totalSentiment += (1 - result.climateScore.conflictScore);
    }
    
    const conflictRatio = comments.length > 0 ? conflictCount / comments.length : 0;
    const sentimentScore = comments.length > 0 ? totalSentiment / comments.length : 0.5;
    const isEscalating = conflictRatio > 0.3 && sentimentScore < 0.4;
    
    return { conflictRatio, sentimentScore, isEscalating };
  }
}

export const aiModerator = new AIContentModerator();