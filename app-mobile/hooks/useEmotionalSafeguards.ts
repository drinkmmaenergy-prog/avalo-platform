import { useState, useEffect, useCallback } from 'react';
import { emotionalIntelligence } from '../lib/emotionalIntelligence';

interface EmotionalSafeguardsState {
  isMonitoring: boolean;
  attachmentRiskLevel: number;
  coolingModeActive: boolean;
  shouldBlockMonetization: boolean;
  lastReminderMessage: string | null;
}

export function useEmotionalSafeguards(conversationId: string) {
  const [state, setState] = useState<EmotionalSafeguardsState>({
    isMonitoring: false,
    attachmentRiskLevel: 0,
    coolingModeActive: false,
    shouldBlockMonetization: false,
    lastReminderMessage: null
  });

  useEffect(() => {
    emotionalIntelligence.startSession();
    setState(prev => ({ ...prev, isMonitoring: true }));

    const checkInterval = setInterval(async () => {
      const risk = await emotionalIntelligence.checkAttachmentRisk();
      if (risk.riskDetected && risk.severity === 'high' || risk.severity === 'critical') {
        const cooling = await emotionalIntelligence.applyCoolingStrategy(
          risk.severity as 'low' | 'medium' | 'high' | 'critical'
        );
        if (cooling.coolingApplied) {
          setState(prev => ({
            ...prev,
            coolingModeActive: true,
            lastReminderMessage: cooling.reminderMessage || null
          }));
        }
      }
    }, 10 * 60 * 1000);

    return () => {
      emotionalIntelligence.endSession();
      clearInterval(checkInterval);
      setState(prev => ({ ...prev, isMonitoring: false }));
    };
  }, [conversationId]);

  const trackMessage = useCallback(async (message: string, isFromAI: boolean) => {
    emotionalIntelligence.incrementMessageCount();

    if (isFromAI) {
      const validation = await emotionalIntelligence.validateAIMessage(
        message,
        `msg_${Date.now()}`
      );

      if (validation.blocked) {
        return {
          shouldBlock: true,
          replacementMessage: validation.replacementMessage
        };
      }
    }

    const analysis = emotionalIntelligence.analyzeMessageTone(message);
    const tracking = await emotionalIntelligence.trackEmotionalState(
      conversationId,
      analysis.intensity,
      analysis.toneType
    );

    setState(prev => ({
      ...prev,
      attachmentRiskLevel: tracking.attachmentRiskLevel,
      shouldBlockMonetization: emotionalIntelligence.shouldBlockMonetization(analysis)
    }));

    if (tracking.shouldTriggerCheck) {
      const risk = await emotionalIntelligence.checkAttachmentRisk();
      if (risk.riskDetected) {
        const cooling = await emotionalIntelligence.applyCoolingStrategy(
          risk.severity as 'low' | 'medium' | 'high' | 'critical'
        );
        if (cooling.coolingApplied) {
          setState(prev => ({
            ...prev,
            coolingModeActive: true,
            lastReminderMessage: cooling.reminderMessage || null
          }));
        }
      }
    }

    return {
      shouldBlock: false,
      attachmentRisk: tracking.attachmentRiskLevel,
      emotionalIntensity: analysis.intensity
    };
  }, [conversationId]);

  const resetCoolingMode = useCallback(() => {
    setState(prev => ({
      ...prev,
      coolingModeActive: false,
      lastReminderMessage: null
    }));
  }, []);

  return {
    ...state,
    trackMessage,
    resetCoolingMode
  };
}