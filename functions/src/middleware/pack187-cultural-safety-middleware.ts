/**
 * PACK 187: Cultural Safety Middleware
 * Real-time blocking of stereotypes, fetishization, and harmful patterns
 */

import { db } from '../init';

export interface MessageCheckResult {
  allowed: boolean;
  violations: Array<{
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    pattern: string;
    suggestion: string;
  }>;
  sanitizedMessage?: string;
  blockReason?: string;
}

const CRITICAL_PATTERNS = {
  stereotype: [
    /asian\s+(submissive|docile|quiet|shy)/i,
    /latina?\s+(fiery|spicy|hot|passionate)/i,
    /scandinavian\s+(ice\s+queen|cold|distant)/i,
    /african\s+(savage|primitive|wild)/i,
    /arab\s+(terrorist|extremist|violent)/i,
    /jewish\s+(money|cheap|greedy)/i,
    /italian\s+(mafia|mob|criminal)/i,
    /russian\s+(spy|agent|cold)/i,
    /french\s+(surrender|weak|coward)/i,
    /german\s+(nazi|rigid|militaristic)/i,
    /black\s+(thug|gangster|criminal)/i,
    /mexican\s+(illegal|lazy|criminal)/i
  ],
  
  fetishization: [
    /exotic\s+(beauty|lover|woman|girl)/i,
    /oriental\s+(mystery|beauty|charm)/i,
    /submissive\s+(asian|japanese|chinese|korean)/i,
    /dominant\s+(black|african|arab)/i,
    /innocent\s+(asian|schoolgirl|anime)/i,
    /spicy\s+latina/i,
    /BBC/i,
    /yellow\s+fever/i,
    /jungle\s+fever/i
  ],
  
  infantilization: [
    /kawaii\s+desu/i,
    /uwu/i,
    /owo/i,
    /baby\s+(voice|talk|speak)/i,
    /childish\s+(voice|tone|accent)/i,
    /little\s+girl\s+(voice|tone)/i,
    /daddy['']?s\s+(little\s+)?girl/i,
    /age\s*play/i,
    /loli/i,
    /shota/i
  ],
  
  ownership: [
    /you\s+(are|'re)\s+(my\s+)?property/i,
    /i\s+own\s+you/i,
    /you\s+belong\s+to\s+me/i,
    /my\s+possession/i,
    /you['']re\s+mine\s+forever/i,
    /can['']t\s+leave\s+me/i,
    /never\s+let\s+you\s+go/i
  ],
  
  culturalMockery: [
    /ching\s+chong/i,
    /me\s+love\s+you\s+long\s+time/i,
    /ay\s+caramba/i,
    /allah\s+akbar/i,
    /sieg\s+heil/i,
    /\/pol\//i,
    /kike/i,
    /chink/i,
    /gook/i,
    /spic/i,
    /wetback/i,
    /raghead/i,
    /sand\s+n[i!]gger/i
  ],
  
  accentCaricature: [
    /me\s+so\s+solly/i,
    /you\s+no\s+understand/i,
    /ver[iy]\s+nice/i,
    /how\s+you\s+say/i,
    /broken\s+english/i,
    /anime\s+(voice|accent|tone)/i,
    /thick\s+accent/i
  ]
};

const GENDER_CULTURE_RISK_PAIRS = [
  { gender: 'female', cultures: ['asian', 'japanese', 'chinese', 'korean', 'thai', 'vietnamese'] },
  { gender: 'female', cultures: ['latina', 'mexican', 'brazilian', 'colombian'] },
  { gender: 'female', cultures: ['arab', 'middle eastern', 'persian'] },
  { gender: 'female', cultures: ['african', 'black'] }
];

const EMOTIONAL_DEBT_PATTERNS = [
  /if\s+you\s+loved\s+me/i,
  /prove\s+your\s+love/i,
  /you\s+owe\s+me/i,
  /after\s+all\s+I['']ve\s+done/i,
  /guilt/i,
  /disappoint/i,
  /hurt\s+me/i
];

export class CulturalSafetyMiddleware {
  private cachedFlags: Map<string, any> = new Map();
  private lastCacheUpdate: number = 0;
  private cacheExpiry: number = 60000; // 1 minute

  async checkMessage(
    message: string,
    aiId: string,
    userId: string,
    context?: {
      aiGender?: string;
      aiCulture?: string;
      userLanguage?: string;
    }
  ): Promise<MessageCheckResult> {
    const violations: MessageCheckResult['violations'] = [];

    for (const [category, patterns] of Object.entries(CRITICAL_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(message)) {
          violations.push({
            type: category,
            severity: this.getSeverity(category),
            pattern: pattern.toString(),
            suggestion: this.getSuggestion(category)
          });
        }
      }
    }

    if (context?.aiGender && context?.aiCulture) {
      const genderCultureViolation = this.checkGenderCulturePair(
        message,
        context.aiGender,
        context.aiCulture
      );
      if (genderCultureViolation) {
        violations.push(genderCultureViolation);
      }
    }

    for (const pattern of EMOTIONAL_DEBT_PATTERNS) {
      if (pattern.test(message)) {
        violations.push({
          type: 'emotional_manipulation',
          severity: 'high',
          pattern: pattern.toString(),
          suggestion: 'Remove guilt-inducing or emotional debt language'
        });
      }
    }

    await this.updateCachedFlags();
    const flagViolations = await this.checkAgainstFlags(message, context?.userLanguage);
    violations.push(...flagViolations);

    const criticalViolations = violations.filter(v => v.severity === 'critical');
    const highViolations = violations.filter(v => v.severity === 'high');

    if (criticalViolations.length > 0) {
      await this.logViolation(aiId, userId, message, violations);
      return {
        allowed: false,
        violations,
        blockReason: 'Message contains prohibited content that violates cultural safety rules'
      };
    }

    if (highViolations.length >= 2) {
      await this.logViolation(aiId, userId, message, violations);
      return {
        allowed: false,
        violations,
        blockReason: 'Message contains multiple high-severity violations'
      };
    }

    if (violations.length > 0) {
      await this.logViolation(aiId, userId, message, violations);
    }

    return {
      allowed: true,
      violations
    };
  }

  private checkGenderCulturePair(
    message: string,
    gender: string,
    culture: string
  ): MessageCheckResult['violations'][0] | null {
    const lowerMessage = message.toLowerCase();
    const lowerGender = gender.toLowerCase();
    const lowerCulture = culture.toLowerCase();

    for (const pair of GENDER_CULTURE_RISK_PAIRS) {
      if (pair.gender === lowerGender && pair.cultures.some(c => lowerCulture.includes(c))) {
        const sexualTerms = [
          'submissive', 'obedient', 'docile', 'serve', 'master',
          'exotic', 'oriental', 'mysterious', 'sensual'
        ];
        
        for (const term of sexualTerms) {
          if (lowerMessage.includes(term)) {
            return {
              type: 'gender_culture_fetish',
              severity: 'critical',
              pattern: `${gender}-${culture} with sexual/submissive language`,
              suggestion: 'Remove fetishizing language related to gender and culture'
            };
          }
        }
      }
    }

    return null;
  }

  private getSeverity(category: string): 'low' | 'medium' | 'high' | 'critical' {
    const severityMap: Record<string, 'low' | 'medium' | 'high' | 'critical'> = {
      stereotype: 'high',
      fetishization: 'critical',
      infantilization: 'critical',
      ownership: 'critical',
      culturalMockery: 'critical',
      accentCaricature: 'high'
    };
    return severityMap[category] || 'medium';
  }

  private getSuggestion(category: string): string {
    const suggestions: Record<string, string> = {
      stereotype: 'Remove stereotypical cultural assumptions',
      fetishization: 'Remove sexualized or fetishizing references to ethnicity',
      infantilization: 'Use age-appropriate, mature language',
      ownership: 'Remove possessive or controlling language',
      culturalMockery: 'Remove mocking or derogatory cultural references',
      accentCaricature: 'Use natural language without exaggerated accents'
    };
    return suggestions[category] || 'Review message for cultural sensitivity';
  }

  private async updateCachedFlags(): Promise<void> {
    const now = Date.now();
    if (now - this.lastCacheUpdate < this.cacheExpiry) {
      return;
    }

    try {
      const flagsSnapshot = await db
        .collection('cultural_safety_flags')
        .where('severity', 'in', ['high', 'critical'])
        .get();

      this.cachedFlags.clear();
      flagsSnapshot.docs.forEach(doc => {
        const flag = doc.data();
        this.cachedFlags.set(doc.id, flag);
      });

      this.lastCacheUpdate = now;
    } catch (error) {
      console.error('Failed to update cached flags:', error);
    }
  }

  private async checkAgainstFlags(
    message: string,
    language?: string
  ): Promise<MessageCheckResult['violations']> {
    const violations: MessageCheckResult['violations'] = [];
    const lowerMessage = message.toLowerCase();

    for (const [, flag] of Array.from(this.cachedFlags.entries())) {
      if (language && flag.languages && !flag.languages.includes(language)) {
        continue;
      }

      const pattern = flag.pattern?.toLowerCase();
      if (pattern && lowerMessage.includes(pattern)) {
        violations.push({
          type: flag.category,
          severity: flag.severity,
          pattern: flag.pattern,
          suggestion: 'Message matches flagged pattern for cultural safety'
        });
      }
    }

    return violations;
  }

  private async logViolation(
    aiId: string,
    userId: string,
    message: string,
    violations: MessageCheckResult['violations']
  ): Promise<void> {
    try {
      await db.collection('cultural_safety_violations').add({
        aiId,
        userId,
        message: message.substring(0, 500),
        violations: violations.map(v => ({
          type: v.type,
          severity: v.severity
        })),
        timestamp: new Date(),
        reviewed: false
      });
    } catch (error) {
      console.error('Failed to log violation:', error);
    }
  }

  async blockInfantilizedVoiceRequest(
    voicePackId: string,
    userId: string
  ): Promise<{ allowed: boolean; reason?: string }> {
    try {
      const voicePackDoc = await db
        .collection('accent_voice_profiles')
        .doc(voicePackId)
        .get();

      if (!voicePackDoc.exists) {
        return { allowed: false, reason: 'Voice pack not found' };
      }

      const voicePack = voicePackDoc.data();
      const prohibitedCharacteristics = voicePack?.prohibitedCharacteristics || [];

      const infantilizedTerms = [
        'infantilized',
        'childish',
        'baby',
        'little girl',
        'anime baby',
        'loli',
        'youth-coded'
      ];

      for (const term of infantilizedTerms) {
        if (prohibitedCharacteristics.includes(term)) {
          await db.collection('blocked_voice_requests').add({
            userId,
            voicePackId,
            reason: 'Infantilized voice pack blocked',
            timestamp: new Date()
          });

          return {
            allowed: false,
            reason: 'This voice pack contains prohibited infantilized characteristics'
          };
        }
      }

      return { allowed: true };
    } catch (error) {
      console.error('Voice request check error:', error);
      return { allowed: false, reason: 'Failed to verify voice pack' };
    }
  }
}

export const culturalSafetyMiddleware = new CulturalSafetyMiddleware();