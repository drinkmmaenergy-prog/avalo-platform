/**
 * PACK 180: Guardian Risk Detection Service
 * AI-powered conversation safety analysis and risk detection
 */

import { Timestamp } from 'firebase-admin/firestore';
import {
  RiskLevel,
  RiskCategory,
  RiskSignal,
  RiskDetectionResult,
  ConversationContext,
  MessageContext,
  BoundarySignal,
  BoundaryViolation,
  EscalationPattern,
  HarassmentPattern
} from '../types/guardian.types';

// ============================================================================
// Risk Detection Patterns
// ============================================================================

const RISK_PATTERNS = {
  // Misunderstanding escalation
  misunderstanding: [
    /you'?re lying/i,
    /that'?s not what (i|you) (meant|said)/i,
    /stop twisting my words/i,
    /you don'?t understand/i,
    /you'?re not listening/i
  ],
  
  // Increasing aggression
  aggression: [
    /fuck (you|off|this)/i,
    /shut (up|the fuck up)/i,
    /stupid|idiot|dumb/i,
    /hate you/i,
    /go to hell/i,
    /kill yourself/i
  ],
  
  // Manipulation pressure
  manipulation: [
    /if you (really )?loved me/i,
    /after (all|everything) (i|we)/i,
    /you owe me/i,
    /i did (so much|everything) for you/i,
    /you made me (do|feel)/i
  ],
  
  // Threat hints
  threats: [
    /you'?ll regret (this|it)/i,
    /you'?ll be sorry/i,
    /watch (out|your back)/i,
    /i know where you/i,
    /i'?ll (make|show) you/i,
    /consequences/i
  ],
  
  // Boundary words (STOP signals)
  boundaries: [
    /stop (it|this|messaging|contacting)/i,
    /leave me alone/i,
    /not interested/i,
    /don'?t (contact|message|text|call) me/i,
    /blocked/i,
    /no means no/i
  ],
  
  // Coercion
  coercion: [
    /you have to/i,
    /you must/i,
    /you need to (do|send|show)/i,
    /or else/i,
    /if you don'?t/i
  ],
  
  // Grooming indicators
  grooming: [
    /don'?t tell (anyone|your parents)/i,
    /our (little )?secret/i,
    /mature for your age/i,
    /special (relationship|connection)/i
  ],
  
  // Extortion/Blackmail
  extortion: [
    /i'?ll (tell|show|send|post)/i,
    /everyone will (know|see)/i,
    /your (family|friends|boss) will/i,
    /leaked|expose/i,
    /pay me|send money/i
  ]
};

// Sentiment analysis keywords
const NEGATIVE_KEYWORDS = [
  'hate', 'angry', 'mad', 'furious', 'disgusted', 'sick', 'tired',
  'frustrated', 'annoyed', 'irritated', 'pissed', 'upset'
];

const POSITIVE_KEYWORDS = [
  'love', 'happy', 'glad', 'excited', 'great', 'wonderful',
  'appreciate', 'thanks', 'understand', 'sorry'
];

// ============================================================================
// Risk Detection Service
// ============================================================================

export class GuardianRiskDetectionService {
  
  /**
   * Analyze conversation for safety risks
   */
  async analyzeConversation(
    context: ConversationContext,
    newMessage: MessageContext
  ): Promise<RiskDetectionResult> {
    const riskSignals: RiskSignal[] = [];
    
    // 1. Check for explicit risk patterns in new message
    const patternRisks = this.detectPatternRisks(newMessage.content);
    riskSignals.push(...patternRisks);
    
    // 2. Analyze sentiment trend
    const sentimentRisk = this.analyzeSentimentTrend(context, newMessage);
    if (sentimentRisk) riskSignals.push(sentimentRisk);
    
    // 3. Check for escalation pattern
    const escalationRisk = this.detectEscalation(context, newMessage);
    if (escalationRisk) riskSignals.push(escalationRisk);
    
    // 4. Check for boundary violations
    const boundaryRisk = this.detectBoundaryViolation(context, newMessage);
    if (boundaryRisk) riskSignals.push(boundaryRisk);
    
    // 5. Check for harassment pattern
    const harassmentRisk = this.detectHarassmentPattern(context, newMessage);
    if (harassmentRisk) riskSignals.push(harassmentRisk);
    
    // Calculate overall risk level
    const riskLevel = this.calculateRiskLevel(riskSignals);
    const shouldIntervene = riskLevel !== 'none' && riskLevel !== 'low';
    
    // Calculate confidence
    const confidence = riskSignals.length > 0
      ? riskSignals.reduce((sum, s) => sum + s.confidence, 0) / riskSignals.length
      : 0;
    
    return {
      riskLevel,
      riskSignals,
      shouldIntervene,
      recommendedIntervention: shouldIntervene ? this.recommendIntervention(riskLevel, riskSignals) : undefined,
      recommendedMeasures: shouldIntervene ? this.recommendCoolingMeasures(riskLevel, riskSignals) : undefined,
      confidence
    };
  }
  
  /**
   * Detect explicit risk patterns in message
   */
  private detectPatternRisks(content: string): RiskSignal[] {
    const signals: RiskSignal[] = [];
    
    // Check each risk category
    for (const [category, patterns] of Object.entries(RISK_PATTERNS)) {
      const matches: string[] = [];
      for (const pattern of patterns) {
        if (pattern.test(content)) {
          matches.push(pattern.toString());
        }
      }
      
      if (matches.length > 0) {
        const severity = this.calculatePatternSeverity(category as any, matches.length);
        signals.push({
          category: category as RiskCategory,
          confidence: Math.min(0.7 + (matches.length * 0.1), 0.95),
          indicators: matches,
          severity
        });
      }
    }
    
    return signals;
  }
  
  /**
   * Analyze sentiment trend across messages
   */
  private analyzeSentimentTrend(
    context: ConversationContext,
    newMessage: MessageContext
  ): RiskSignal | null {
    const recentMessages = context.messageHistory.slice(-5);
    const sentiments = recentMessages.map(m => this.calculateSentiment(m.content));
    const newSentiment = this.calculateSentiment(newMessage.content);
    
    // Check for rapid sentiment decline
    if (sentiments.length >= 3) {
      const avgRecent = sentiments.slice(-3).reduce((a, b) => a + b, 0) / 3;
      const decline = avgRecent - newSentiment;
      
      if (decline > 0.5 && newSentiment < -0.3) {
        return {
          category: 'misunderstanding_escalation',
          confidence: 0.6,
          indicators: ['rapid_sentiment_decline'],
          severity: Math.min(decline * 100, 80)
        };
      }
    }
    
    return null;
  }
  
  /**
   * Calculate message sentiment (-1 to 1)
   */
  private calculateSentiment(content: string): number {
    const lower = content.toLowerCase();
    let score = 0;
    
    // Count negative keywords
    for (const keyword of NEGATIVE_KEYWORDS) {
      if (lower.includes(keyword)) score -= 0.2;
    }
    
    // Count positive keywords
    for (const keyword of POSITIVE_KEYWORDS) {
      if (lower.includes(keyword)) score += 0.2;
    }
    
    // Check for all caps (aggression indicator)
    if (content === content.toUpperCase() && content.length > 10) {
      score -= 0.3;
    }
    
    // Check for excessive punctuation
    const exclamationCount = (content.match(/!/g) || []).length;
    if (exclamationCount > 2) score -= 0.1 * exclamationCount;
    
    return Math.max(-1, Math.min(1, score));
  }
  
  /**
   * Detect escalation pattern
   */
  private detectEscalation(
    context: ConversationContext,
    newMessage: MessageContext
  ): RiskSignal | null {
    const recentMessages = context.messageHistory.slice(-10);
    if (recentMessages.length < 3) return null;
    
    const pattern = this.analyzeEscalationPattern(recentMessages, newMessage);
    
    if (pattern.detected && pattern.escalationRate > 2) {
      return {
        category: 'increasing_aggression',
        confidence: 0.7,
        indicators: ['escalation_pattern_detected'],
        severity: Math.min(pattern.escalationRate * 15, 90)
      };
    }
    
    return null;
  }
  
  /**
   * Analyze for escalation pattern
   */
  private analyzeEscalationPattern(
    messages: MessageContext[],
    newMessage: MessageContext
  ): EscalationPattern {
    const sentiments = messages.map(m => this.calculateSentiment(m.content));
    const newSentiment = this.calculateSentiment(newMessage.content);
    
    // Calculate escalation rate (messages with declining sentiment)
    let escalationCount = 0;
    for (let i = 1; i < sentiments.length; i++) {
      if (sentiments[i] < sentiments[i - 1] - 0.2) {
        escalationCount++;
      }
    }
    
    const escalationRate = escalationCount / sentiments.length;
    const sentimentDrop = sentiments[0] - newSentiment;
    const aggressionIncrease = Math.max(0, -newSentiment * 100);
    
    return {
      detected: escalationRate > 0.3 && sentimentDrop > 0.3,
      startMessageId: messages[0].messageId,
      endMessageId: newMessage.messageId,
      escalationRate,
      sentimentDrop,
      aggressionIncrease
    };
  }
  
  /**
   * Detect boundary violation
   */
  private detectBoundaryViolation(
    context: ConversationContext,
    newMessage: MessageContext
  ): RiskSignal | null {
    // Look for boundary signals in previous messages
    const boundarySignal = this.findBoundarySignal(context.messageHistory);
    
    if (boundarySignal && boundarySignal.detected) {
      // Check if new message violates the boundary
      const timeSinceBoundary = newMessage.timestamp.toMillis() - boundarySignal.timestamp.toMillis();
      const messagesAfterBoundary = context.messageHistory.filter(
        m => m.timestamp.toMillis() > boundarySignal.timestamp.toMillis() &&
             m.senderId === newMessage.senderId
      ).length;
      
      if (messagesAfterBoundary >= 2 || (timeSinceBoundary < 300000 && messagesAfterBoundary >= 1)) {
        return {
          category: 'harassment_loops',
          confidence: 0.85,
          indicators: ['boundary_violation_detected', boundarySignal.boundaryType],
          severity: 85
        };
      }
    }
    
    return null;
  }
  
  /**
   * Find boundary signal in message history
   */
  private findBoundarySignal(messages: MessageContext[]): BoundarySignal | null {
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      for (const pattern of RISK_PATTERNS.boundaries) {
        if (pattern.test(message.content)) {
          return {
            detected: true,
            boundaryType: this.categorizeBoundary(message.content),
            confidence: 0.9,
            messageId: message.messageId,
            timestamp: message.timestamp
          };
        }
      }
    }
    return null;
  }
  
  /**
   * Categorize boundary type
   */
  private categorizeBoundary(content: string): BoundarySignal['boundaryType'] {
    const lower = content.toLowerCase();
    if (/block|blocked/i.test(lower)) return 'block_threat';
    if (/stop|cease/i.test(lower)) return 'stop';
    if (/not interested|no thanks/i.test(lower)) return 'not_interested';
    if (/leave.*alone|go away/i.test(lower)) return 'leave_alone';
    return 'no';
  }
  
  /**
   * Detect harassment pattern
   */
  private detectHarassmentPattern(
    context: ConversationContext,
    newMessage: MessageContext
  ): RiskSignal | null {
    const senderMessages = context.messageHistory.filter(
      m => m.senderId === newMessage.senderId
    );
    
    if (senderMessages.length < 3) return null;
    
    const pattern = this.analyzeHarassmentPattern(senderMessages, newMessage);
    
    if (pattern.detected) {
      return {
        category: 'harassment_loops',
        confidence: 0.75,
        indicators: ['harassment_pattern_detected'],
        severity: Math.min(pattern.messageCount * 10, 90)
      };
    }
    
    return null;
  }
  
  /**
   * Analyze for harassment pattern
   */
  private analyzeHarassmentPattern(
    messages: MessageContext[],
    newMessage: MessageContext
  ): HarassmentPattern {
    if (messages.length < 2) {
      return { detected: false, messageCount: 0, timeSpan: 0, persistenceAfterBoundary: false, repetitiveContent: false };
    }
    
    const firstTimestamp = messages[0].timestamp.toMillis();
    const lastTimestamp = newMessage.timestamp.toMillis();
    const timeSpan = (lastTimestamp - firstTimestamp) / 1000; // seconds
    
    // Check for rapid messaging (more than 5 messages in 5 minutes)
    const rapidMessaging = messages.length >= 5 && timeSpan < 300;
    
    // Check for repetitive content
    const contents = messages.map(m => m.content.toLowerCase());
    const uniqueContents = new Set(contents);
    const repetitiveContent = uniqueContents.size < messages.length * 0.5;
    
    const detected = rapidMessaging || repetitiveContent;
    
    return {
      detected,
      messageCount: messages.length,
      timeSpan,
      persistenceAfterBoundary: false, // Checked separately
      repetitiveContent
    };
  }
  
  /**
   * Calculate pattern severity
   */
  private calculatePatternSeverity(category: RiskCategory, matchCount: number): number {
    const baseSeverity: Record<RiskCategory, number> = {
      misunderstanding_escalation: 30,
      increasing_aggression: 50,
      manipulation_pressure: 60,
      threat_hints: 80,
      harassment_loops: 70,
      coercion: 75,
      stalking: 85,
      extortion: 90,
      blackmail: 95,
      abuse_escalation: 80,
      grooming: 95
    };
    
    return Math.min(baseSeverity[category] + (matchCount * 10), 100);
  }
  
  /**
   * Calculate overall risk level
   */
  private calculateRiskLevel(signals: RiskSignal[]): RiskLevel {
    if (signals.length === 0) return 'none';
    
    const maxSeverity = Math.max(...signals.map(s => s.severity));
    const avgConfidence = signals.reduce((sum, s) => sum + s.confidence, 0) / signals.length;
    
    // Critical categories always result in high/critical risk
    const criticalCategories: RiskCategory[] = ['threat_hints', 'extortion', 'blackmail', 'grooming', 'stalking'];
    const hasCritical = signals.some(s => criticalCategories.includes(s.category));
    
    if (hasCritical || maxSeverity >= 85) return 'critical';
    if (maxSeverity >= 70 || (maxSeverity >= 60 && avgConfidence > 0.7)) return 'high';
    if (maxSeverity >= 50 || signals.length >= 3) return 'medium';
    if (maxSeverity >= 30) return 'low';
    
    return 'none';
  }
  
  /**
   * Recommend intervention type
   */
  private recommendIntervention(riskLevel: RiskLevel, signals: RiskSignal[]): any {
    const hasBoundaryViolation = signals.some(s => s.category === 'harassment_loops');
    const hasThreat = signals.some(s => ['threat_hints', 'extortion', 'blackmail'].includes(s.category));
    
    if (riskLevel === 'critical' || hasThreat) {
      return 'conversation_freeze';
    }
    
    if (riskLevel === 'high' || hasBoundaryViolation) {
      return 'boundary_defense';
    }
    
    if (riskLevel === 'medium') {
      return 'automatic_cooling';
    }
    
    return 'soft_suggestion';
  }
  
  /**
   * Recommend cooling measures
   */
  private recommendCoolingMeasures(riskLevel: RiskLevel, signals: RiskSignal[]): any[] {
    const measures: any[] = [];
    
    if (riskLevel === 'critical') {
      measures.push('conversation_frozen', 'call_disabled', 'voice_disabled', 'media_disabled');
    } else if (riskLevel === 'high') {
      measures.push('message_slowdown', 'voice_disabled', 'call_disabled');
    } else if (riskLevel === 'medium') {
      measures.push('message_slowdown');
    }
    
    return measures;
  }
}

// Export singleton instance
export const guardianRiskDetection = new GuardianRiskDetectionService();