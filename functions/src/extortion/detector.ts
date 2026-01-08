import * as admin from 'firebase-admin';
import {
  ExtortionType,
  ExtortionSeverity,
  DetectionResult,
  ExtortionPattern,
  EmotionalBlackmailPattern
} from './types';

const EXTORTION_KEYWORDS = [
  'send tokens or i leak',
  'pay or i expose',
  'buy or i tell',
  'tokens or i post',
  'pay me or i show',
  'send money or i leak',
  'i will leak your nudes',
  'i\'ll expose you',
  'pay or everyone sees',
  'send or i tell your',
  'buy my product or i expose',
  'give me money or i share',
  'pay up or i release',
  'tokens or i embarrass',
  'send or i humiliate',
  'pay or i ruin you'
];

const THREAT_PATTERNS = [
  /pay.*or.*leak/i,
  /send.*tokens.*or.*expose/i,
  /buy.*or.*tell/i,
  /money.*or.*share/i,
  /tokens.*or.*post/i,
  /i will leak/i,
  /i\'ll expose/i,
  /pay.*or.*show/i,
  /send.*or.*embarrass/i,
  /give me.*or i\'ll/i
];

const EMOTIONAL_BLACKMAIL = [
  {
    type: 'abandonment_threat',
    patterns: [
      /if you stop paying.*gone forever/i,
      /no money.*i leave/i,
      /pay or i\'m done/i,
      /without tokens.*won\'t talk/i
    ],
    requiresFinancial: true
  },
  {
    type: 'shame_pressure',
    patterns: [
      /tell everyone.*unless.*buy/i,
      /make you look bad.*if you don\'t/i,
      /expose you.*unless.*pay/i,
      /everyone will know.*without/i
    ],
    requiresFinancial: true
  },
  {
    type: 'guilt_trap',
    patterns: [
      /if you cared.*prove it financially/i,
      /real fans.*would pay/i,
      /show you care.*buy/i,
      /don\'t really love me.*unless.*tokens/i
    ],
    requiresFinancial: true
  },
  {
    type: 'status_threat',
    patterns: [
      /make you look bad publicly/i,
      /ruin your reputation.*unless/i,
      /tell everyone what you did/i,
      /expose your secrets.*pay/i
    ],
    requiresFinancial: false
  }
];

export class ExtortionDetector {
  private db: admin.firestore.Firestore;

  constructor() {
    this.db = admin.firestore();
  }

  async detectExtortion(
    messageContent: string,
    senderId: string,
    recipientId: string,
    chatContext?: string[]
  ): Promise<DetectionResult> {
    const result: DetectionResult = {
      isExtortion: false,
      confidence: 0,
      patterns: [],
      requiresImmediateAction: false,
      suggestedActions: [],
      evidenceSnippets: []
    };

    const normalizedContent = messageContent.toLowerCase().trim();

    const keywordMatch = this.checkKeywords(normalizedContent);
    if (keywordMatch.detected) {
      result.isExtortion = true;
      result.confidence = Math.max(result.confidence, keywordMatch.confidence);
      result.patterns.push(...keywordMatch.patterns);
      result.type = ExtortionType.FINANCIAL_BLACKMAIL;
      result.severity = ExtortionSeverity.CRITICAL;
      result.requiresImmediateAction = true;
      result.evidenceSnippets.push(messageContent);
    }

    const patternMatch = this.checkPatterns(normalizedContent);
    if (patternMatch.detected) {
      result.isExtortion = true;
      result.confidence = Math.max(result.confidence, patternMatch.confidence);
      result.patterns.push(...patternMatch.patterns);
      if (!result.type) {
        result.type = ExtortionType.EXPOSURE_THREAT;
        result.severity = ExtortionSeverity.HIGH;
      }
      result.requiresImmediateAction = true;
      result.evidenceSnippets.push(messageContent);
    }

    const emotionalMatch = await this.checkEmotionalBlackmail(
      normalizedContent,
      chatContext
    );
    if (emotionalMatch.detected) {
      result.isExtortion = true;
      result.confidence = Math.max(result.confidence, emotionalMatch.confidence);
      result.patterns.push(...emotionalMatch.patterns);
      if (!result.type) {
        result.type = ExtortionType.EMOTIONAL_COERCION;
        result.severity = ExtortionSeverity.MEDIUM;
      }
      result.evidenceSnippets.push(messageContent);
    }

    const contextMatch = await this.checkContextualThreats(
      normalizedContent,
      senderId,
      recipientId,
      chatContext
    );
    if (contextMatch.detected) {
      result.isExtortion = true;
      result.confidence = Math.max(result.confidence, contextMatch.confidence);
      result.patterns.push(...contextMatch.patterns);
      if (!result.severity) {
        result.severity = ExtortionSeverity.MEDIUM;
      }
    }

    if (result.isExtortion) {
      result.suggestedActions = this.determineSuggestedActions(
        result.severity!,
        result.type!
      );
    }

    return result;
  }

  private checkKeywords(content: string): {
    detected: boolean;
    confidence: number;
    patterns: string[];
  } {
    const detected = EXTORTION_KEYWORDS.some(keyword => 
      content.includes(keyword.toLowerCase())
    );

    return {
      detected,
      confidence: detected ? 0.95 : 0,
      patterns: detected ? ['direct_extortion_keyword'] : []
    };
  }

  private checkPatterns(content: string): {
    detected: boolean;
    confidence: number;
    patterns: string[];
  } {
    const matches = THREAT_PATTERNS.filter(pattern => pattern.test(content));
    
    return {
      detected: matches.length > 0,
      confidence: matches.length > 0 ? 0.85 + (matches.length * 0.05) : 0,
      patterns: matches.map((_, i) => `threat_pattern_${i}`)
    };
  }

  private async checkEmotionalBlackmail(
    content: string,
    context?: string[]
  ): Promise<{
    detected: boolean;
    confidence: number;
    patterns: string[];
  }> {
    const patterns: string[] = [];
    let maxConfidence = 0;
    let detected = false;

    for (const category of EMOTIONAL_BLACKMAIL) {
      const categoryMatches = category.patterns.filter(p => p.test(content));
      
      if (categoryMatches.length > 0) {
        detected = true;
        patterns.push(category.type);
        
        if (category.requiresFinancial) {
          const hasFinancialContext = this.hasFinancialContext(content, context);
          if (hasFinancialContext) {
            maxConfidence = Math.max(maxConfidence, 0.80);
          } else {
            maxConfidence = Math.max(maxConfidence, 0.60);
          }
        } else {
          maxConfidence = Math.max(maxConfidence, 0.75);
        }
      }
    }

    return { detected, confidence: maxConfidence, patterns };
  }

  private hasFinancialContext(content: string, context?: string[]): boolean {
    const financialKeywords = [
      'token', 'pay', 'money', 'buy', 'purchase', 'send', 'give', 'cost',
      'price', 'tip', 'donation', 'subscription', 'credit', 'wallet'
    ];

    const contentLower = content.toLowerCase();
    const hasInMessage = financialKeywords.some(kw => contentLower.includes(kw));
    
    if (hasInMessage) return true;

    if (context && context.length > 0) {
      const recentContext = context.slice(-5).join(' ').toLowerCase();
      return financialKeywords.some(kw => recentContext.includes(kw));
    }

    return false;
  }

  private async checkContextualThreats(
    content: string,
    senderId: string,
    recipientId: string,
    context?: string[]
  ): Promise<{
    detected: boolean;
    confidence: number;
    patterns: string[];
  }> {
    const threatIndicators = [
      'leak', 'expose', 'share', 'post', 'publish', 'tell', 'show',
      'reveal', 'release', 'distribute', 'send to', 'forward'
    ];

    const personalIdentifiers = [
      'your photos', 'your pictures', 'your messages', 'your videos',
      'our chat', 'our conversation', 'your secrets', 'what you said',
      'your family', 'your friends', 'your employer', 'your partner'
    ];

    let detected = false;
    const patterns: string[] = [];
    let confidence = 0;

    const hasThreatWord = threatIndicators.some(word => 
      content.toLowerCase().includes(word)
    );
    const hasPersonalRef = personalIdentifiers.some(phrase => 
      content.toLowerCase().includes(phrase)
    );

    if (hasThreatWord && hasPersonalRef) {
      detected = true;
      patterns.push('contextual_threat');
      confidence = 0.70;

      if (this.hasFinancialContext(content, context)) {
        confidence = 0.85;
        patterns.push('financial_context');
      }
    }

    return { detected, confidence, patterns };
  }

  private determineSuggestedActions(
    severity: ExtortionSeverity,
    type: ExtortionType
  ): any[] {
    const actions: any[] = [];

    switch (severity) {
      case ExtortionSeverity.CRITICAL:
        actions.push('FREEZE_ACCOUNT', 'PERMANENT_BAN', 'WITHHOLD_PAYOUTS', 'LEGAL_ESCALATION');
        break;
      case ExtortionSeverity.HIGH:
        actions.push('SUSPEND_ACCOUNT', 'WITHHOLD_PAYOUTS', 'IP_BLOCK');
        break;
      case ExtortionSeverity.MEDIUM:
        actions.push('FREEZE_ACCOUNT', 'WITHHOLD_PAYOUTS');
        break;
      case ExtortionSeverity.LOW:
        actions.push('FREEZE_ACCOUNT');
        break;
    }

    return actions;
  }

  async checkRevengeUpload(
    userId: string,
    contentHash: string,
    contentType: string,
    metadata?: any
  ): Promise<{
    blocked: boolean;
    reason?: string;
    victimId?: string;
  }> {
    const flaggedContent = await this.db
      .collection('flagged_content')
      .where('contentHash', '==', contentHash)
      .get();

    if (!flaggedContent.empty) {
      const doc = flaggedContent.docs[0];
      const data = doc.data();
      
      if (data.flagReason === 'private_material' || data.flagReason === 'revenge_content') {
        return {
          blocked: true,
          reason: 'Attempting to upload flagged private material',
          victimId: data.victimId
        };
      }
    }

    const userHistory = await this.db
      .collection('extortion_cases')
      .where('accusedId', '==', userId)
      .where('type', '==', ExtortionType.REVENGE_LEAK)
      .get();

    if (!userHistory.empty) {
      return {
        blocked: true,
        reason: 'User has history of revenge content attempts'
      };
    }

    return { blocked: false };
  }

  async analyzeUploadIntent(
    userId: string,
    uploadType: string,
    fileMetadata: any
  ): Promise<{
    suspicious: boolean;
    riskScore: number;
    flags: string[];
  }> {
    const flags: string[] = [];
    let riskScore = 0;

    if (fileMetadata.containsFaces && fileMetadata.faceCount > 1) {
      flags.push('multiple_faces_detected');
      riskScore += 0.2;
    }

    if (fileMetadata.isScreenshot) {
      flags.push('screenshot_upload');
      riskScore += 0.3;
    }

    if (fileMetadata.containsText) {
      const textContent = fileMetadata.extractedText?.toLowerCase() || '';
      const suspiciousTexts = ['chat', 'message', 'conversation', 'dm', 'private'];
      
      if (suspiciousTexts.some(text => textContent.includes(text))) {
        flags.push('contains_chat_context');
        riskScore += 0.4;
      }
    }

    const recentActivity = await this.db
      .collection('blocked_upload_attempts')
      .where('userId', '==', userId)
      .where('timestamp', '>', new Date(Date.now() - 24 * 60 * 60 * 1000))
      .get();

    if (recentActivity.size > 3) {
      flags.push('multiple_recent_blocks');
      riskScore += 0.5;
    }

    return {
      suspicious: riskScore > 0.5,
      riskScore: Math.min(riskScore, 1.0),
      flags
    };
  }

  async updateDetectionPatterns(
    patternType: string,
    pattern: string,
    effectiveness: number
  ): Promise<void> {
    const patternRef = this.db.collection('extortion_patterns').doc();
    
    await patternRef.set({
      patternType,
      pattern,
      confidence: effectiveness,
      active: true,
      detectionCount: 0,
      falsePositiveRate: 0,
      lastDetected: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }

  async recordFalsePositive(
    messageId: string,
    reason: string,
    reviewedBy: string
  ): Promise<void> {
    const message = await this.db
      .collection('blackmail_messages')
      .doc(messageId)
      .get();

    if (message.exists) {
      const data = message.data();
      const patterns = data?.detectedPatterns || [];

      for (const pattern of patterns) {
        const patternDocs = await this.db
          .collection('extortion_patterns')
          .where('pattern', '==', pattern)
          .get();

        for (const doc of patternDocs.docs) {
          const currentData = doc.data();
          const totalDetections = currentData.detectionCount || 0;
          const currentFPRate = currentData.falsePositiveRate || 0;
          
          const newFPRate = ((currentFPRate * totalDetections) + 1) / (totalDetections + 1);

          await doc.ref.update({
            falsePositiveRate: newFPRate,
            active: newFPRate < 0.2
          });
        }
      }
    }

    await this.db.collection('false_positives').add({
      messageId,
      reason,
      reviewedBy,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
  }
}

export const extortionDetector = new ExtortionDetector();