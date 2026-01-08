/**
 * PACK 180: Guardian Service
 * Main orchestration service for Social Guardian interventions
 */

import { db as firestore } from '../init';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { guardianRiskDetection } from './guardianRiskDetection.service';
import {
  GuardianIntervention,
  GuardianRiskEvent,
  GuardianCoolingSession,
  GuardianContext,
  GuardianAnalysis,
  ConversationContext,
  MessageContext,
  InterventionType,
  CoolingMeasure,
  CoolingMeasureConfig,
  RiskLevel,
  GuardianSettings
} from '../types/guardian.types';

// ============================================================================
// Guardian Service
// ============================================================================

export class GuardianService {
  
  /**
   * Analyze message and trigger intervention if needed
   */
  async analyzeAndIntervene(
    conversationId: string,
    userId: string,
    messageId: string,
    messageContent: string
  ): Promise<GuardianAnalysis | null> {
    try {
      // 1. Get guardian context
      const context = await this.getGuardianContext(conversationId, userId);
      
      // Check if guardian is enabled for user
      if (!context.userSettings.enabled) {
        return null;
      }
      
      // 2. Build conversation context
      const conversationContext = await this.buildConversationContext(conversationId);
      
      // 3. Create message context for new message
      const newMessage: MessageContext = {
        messageId,
        senderId: userId,
        content: messageContent,
        timestamp: Timestamp.now()
      };
      
      // 4. Analyze for risks
      const riskDetection = await guardianRiskDetection.analyzeConversation(
        conversationContext,
        newMessage
      );
      
      // 5. Create risk event
      if (riskDetection.riskLevel !== 'none') {
        await this.createRiskEvent(conversationId, userId, messageId, riskDetection, conversationContext);
      }
      
      // 6. Trigger intervention if needed
      if (riskDetection.shouldIntervene) {
        const intervention = await this.triggerIntervention(
          conversationId,
          userId,
          context.otherUserId,
          messageId,
          riskDetection
        );
        
        // 7. Apply cooling measures if recommended
        if (riskDetection.recommendedMeasures && riskDetection.recommendedMeasures.length > 0) {
          await this.applyCoolingMeasures(
            conversationId,
            userId,
            context.otherUserId,
            riskDetection.riskLevel,
            riskDetection.recommendedMeasures
          );
        }
      }
      
      // 8. Build analysis result
      const analysis: GuardianAnalysis = {
        riskDetection,
        recommendations: {
          shouldIntervene: riskDetection.shouldIntervene,
          interventionType: riskDetection.recommendedIntervention,
          message: this.generateInterventionMessage(riskDetection),
          suggestedActions: this.generateSuggestedActions(riskDetection),
          coolingMeasures: riskDetection.recommendedMeasures?.map(m => ({
            measure: m as CoolingMeasure,
            duration: this.getCoolingDuration(riskDetection.riskLevel),
            reason: 'Safety cooling period'
          }))
        }
      };
      
      return analysis;
      
    } catch (error) {
      console.error('Guardian analysis error:', error);
      return null;
    }
  }
  
  /**
   * Get guardian context for conversation
   */
  private async getGuardianContext(conversationId: string, userId: string): Promise<GuardianContext> {
    // Get conversation to find other participant
    const conversationRef = firestore.collection('conversations').doc(conversationId);
    const conversationDoc = await conversationRef.get();
    const conversationData = conversationDoc.data();
    
    const otherUserId = conversationData?.participants.find((p: string) => p !== userId) || '';
    
    // Get user settings
    const settingsRef = firestore.collection('guardian_settings').doc(userId);
    const settingsDoc = await settingsRef.get();
    const userSettings: GuardianSettings = settingsDoc.exists
      ? settingsDoc.data() as GuardianSettings
      : {
          userId,
          enabled: true,
          interventionLevel: 'moderate',
          autoRewriteSuggestions: true,
          notifyOnIntervention: true,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now()
        };
    
    // Get active cooling sessions
    const coolingSessions = await firestore
      .collection('guardian_cooling_sessions')
      .where('conversationId', '==', conversationId)
      .where('status', '==', 'active')
      .get();
    
    const activeCoolingSessions: GuardianCoolingSession[] = coolingSessions.docs.map(
      doc => doc.data() as GuardianCoolingSession
    );
    
    // Get recent interventions (last 24 hours)
    const oneDayAgo = Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000);
    const interventions = await firestore
      .collection('guardian_interventions')
      .where('conversationId', '==', conversationId)
      .where('createdAt', '>', oneDayAgo)
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get();
    
    const recentInterventions: GuardianIntervention[] = interventions.docs.map(
      doc => doc.data() as GuardianIntervention
    );
    
    return {
      conversationId,
      currentUserId: userId,
      otherUserId,
      userSettings,
      activeCoolingSessions: activeCoolingSessions,
      recentInterventions
    };
  }
  
  /**
   * Build conversation context from recent messages
   */
  private async buildConversationContext(conversationId: string): Promise<ConversationContext> {
    // Get recent messages (last 50)
    const messagesRef = firestore
      .collection('conversations')
      .doc(conversationId)
      .collection('messages')
      .orderBy('timestamp', 'desc')
      .limit(50);
    
    const messagesSnapshot = await messagesRef.get();
    const messages: MessageContext[] = messagesSnapshot.docs
      .map(doc => {
        const data = doc.data();
        return {
          messageId: doc.id,
          senderId: data.senderId,
          content: data.content || data.text || '',
          timestamp: data.timestamp || Timestamp.now(),
          replyToMessageId: data.replyTo
        };
      })
      .reverse(); // Chronological order
    
    // Get participants
    const conversationRef = firestore.collection('conversations').doc(conversationId);
    const conversationDoc = await conversationRef.get();
    const participants = conversationDoc.data()?.participants || [];
    
    return {
      conversationId,
      messageHistory: messages,
      participants,
      responsePatterns: []
    };
  }
  
  /**
   * Create risk event record
   */
  private async createRiskEvent(
    conversationId: string,
    userId: string,
    messageId: string,
    riskDetection: any,
    context: ConversationContext
  ): Promise<void> {
    const otherUserId = context.participants.find(p => p !== userId) || '';
    
    const eventData: Omit<GuardianRiskEvent, 'eventId'> = {
      conversationId,
      userId,
      targetUserId: otherUserId,
      riskSignals: riskDetection.riskSignals,
      riskLevel: riskDetection.riskLevel,
      messageSnapshot: {
        messageId,
        content: context.messageHistory.find(m => m.messageId === messageId)?.content || '',
        contextMessages: context.messageHistory.slice(-5).map(m => m.messageId)
      },
      detectionMethod: 'pattern_analysis',
      timestamp: Timestamp.now(),
      interventionTriggered: riskDetection.shouldIntervene
    };
    
    const eventRef = await firestore.collection('guardian_risk_events').add({
      ...eventData,
      eventId: '' // Will be set by Firestore
    });
    
    await eventRef.update({ eventId: eventRef.id });
  }
  
  /**
   * Trigger intervention
   */
  private async triggerIntervention(
    conversationId: string,
    userId: string,
    targetUserId: string,
    messageId: string,
    riskDetection: any
  ): Promise<GuardianIntervention> {
    const interventionType: InterventionType = riskDetection.recommendedIntervention || 'soft_suggestion';
    const primaryRiskSignal = riskDetection.riskSignals[0];
    
    const interventionData: Omit<GuardianIntervention, 'interventionId'> = {
      conversationId,
      userId,
      targetUserId,
      interventionType,
      riskCategory: primaryRiskSignal.category,
      riskLevel: riskDetection.riskLevel,
      triggerMessageId: messageId,
      message: this.generateInterventionMessage(riskDetection),
      suggestedActions: this.generateSuggestedActions(riskDetection),
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };
    
    const interventionRef = await firestore.collection('guardian_interventions').add({
      ...interventionData,
      interventionId: '' // Will be set by Firestore
    });
    
    await interventionRef.update({ interventionId: interventionRef.id });
    
    return {
      ...interventionData,
      interventionId: interventionRef.id
    } as GuardianIntervention;
  }
  
  /**
   * Apply cooling measures
   */
  private async applyCoolingMeasures(
    conversationId: string,
    userId: string,
    affectedUserId: string,
    riskLevel: RiskLevel,
    measures: any[]
  ): Promise<void> {
    const duration = this.getCoolingDuration(riskLevel);
    
    const measureConfigs: CoolingMeasureConfig[] = measures.map(m => ({
      measure: m as CoolingMeasure,
      duration,
      reason: this.getCoolingReason(riskLevel)
    }));
    
    const sessionData: Omit<GuardianCoolingSession, 'sessionId'> = {
      conversationId,
      userId,
      affectedUserId,
      measures: measureConfigs,
      reason: this.getCoolingReason(riskLevel),
      riskLevel,
      status: 'active',
      createdAt: Timestamp.now(),
      expiresAt: Timestamp.fromMillis(Date.now() + duration * 1000),
      acknowledged: false,
      updatedAt: Timestamp.now()
    };
    
    const sessionRef = await firestore.collection('guardian_cooling_sessions').add({
      ...sessionData,
      sessionId: '' // Will be set by Firestore
    });
    
    await sessionRef.update({ sessionId: sessionRef.id });
  }
  
  /**
   * Generate intervention message
   */
  private generateInterventionMessage(riskDetection: any): string {
    const riskLevel = riskDetection.riskLevel;
    const primarySignal = riskDetection.riskSignals[0];
    
    if (riskLevel === 'critical') {
      return "For your safety, this conversation has been temporarily paused. If you feel unsafe, please use the safety center or contact support.";
    }
    
    if (riskLevel === 'high') {
      if (primarySignal.category === 'harassment_loops') {
        return "It looks like boundaries may have been set. Would you like help managing this conversation?";
      }
      return "This conversation appears to be escalating. Would you like to take a break or get help de-escalating?";
    }
    
    if (riskLevel === 'medium') {
      if (primarySignal.category === 'misunderstanding_escalation') {
        return "It seems there might be a misunderstanding. Would you like help clarifying or rephrasing?";
      }
      return "The conversation is getting tense. Would you like suggestions for cooling down?";
    }
    
    return "Would you like help keeping this conversation respectful?";
  }
  
  /**
   * Generate suggested actions
   */
  private generateSuggestedActions(riskDetection: any): string[] {
    const actions: string[] = [];
    const riskLevel = riskDetection.riskLevel;
    
    if (riskLevel === 'critical' || riskLevel === 'high') {
      actions.push('End conversation');
      actions.push('Report to safety team');
      actions.push('Block user');
    }
    
    if (riskLevel === 'medium' || riskLevel === 'high') {
      actions.push('Take a break');
      actions.push('Rephrase message');
    }
    
    actions.push('Continue with awareness');
    
    return actions;
  }
  
  /**
   * Get cooling duration based on risk level (in seconds)
   */
  private getCoolingDuration(riskLevel: RiskLevel): number {
    const durations: Record<RiskLevel, number> = {
      none: 0,
      low: 0,
      medium: 300, // 5 minutes
      high: 900, // 15 minutes
      critical: 3600 // 1 hour
    };
    
    return durations[riskLevel] || 300;
  }
  
  /**
   * Get cooling reason
   */
  private getCoolingReason(riskLevel: RiskLevel): string {
    if (riskLevel === 'critical') {
      return 'Critical safety risk detected - cooling period required';
    }
    if (riskLevel === 'high') {
      return 'High-risk escalation detected - temporary cooling measures applied';
    }
    return 'Conversation cooling period for safety';
  }
  
  /**
   * Resolve intervention
   */
  async resolveIntervention(
    interventionId: string,
    resolution: string,
    feedback?: string
  ): Promise<void> {
    await firestore.collection('guardian_interventions').doc(interventionId).update({
      resolvedAt: Timestamp.now(),
      resolution,
      userFeedback: feedback || null,
      updatedAt: Timestamp.now()
    });
  }
  
  /**
   * Check if cooling is active for user in conversation
   */
  async isUserCooling(conversationId: string, userId: string): Promise<boolean> {
    const sessions = await firestore
      .collection('guardian_cooling_sessions')
      .where('conversationId', '==', conversationId)
      .where('userId', '==', userId)
      .where('status', '==', 'active')
      .where('expiresAt', '>', Timestamp.now())
      .limit(1)
      .get();
    
    return !sessions.empty;
  }
  
  /**
   * Get active cooling measures for user
   */
  async getActiveCoolingMeasures(
    conversationId: string,
    userId: string
  ): Promise<CoolingMeasure[]> {
    const sessions = await firestore
      .collection('guardian_cooling_sessions')
      .where('conversationId', '==', conversationId)
      .where('userId', '==', userId)
      .where('status', '==', 'active')
      .where('expiresAt', '>', Timestamp.now())
      .get();
    
    const allMeasures: CoolingMeasure[] = [];
    sessions.docs.forEach(doc => {
      const data = doc.data() as GuardianCoolingSession;
      data.measures.forEach(m => allMeasures.push(m.measure));
    });
    
    return Array.from(new Set(allMeasures));
  }
}

// Export singleton instance
export const guardianService = new GuardianService();