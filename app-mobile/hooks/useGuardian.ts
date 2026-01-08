/**
 * PACK 180: Guardian Integration Hook
 * Integrates Social Guardian with chat system
 */

import { useState, useEffect, useCallback } from 'react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot,
  orderBy,
  limit,
  Timestamp 
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '@/lib/firebase';
import { auth } from '@/lib/firebase';

interface GuardianIntervention {
  interventionId: string;
  conversationId: string;
  interventionType: 'soft_suggestion' | 'boundary_defense' | 'automatic_cooling' | 'conversation_freeze';
  message: string;
  suggestedActions: string[];
  riskLevel: string;
  createdAt: any;
  resolvedAt?: any;
}

interface CoolingSession {
  sessionId: string;
  conversationId: string;
  measures: Array<{
    measure: string;
    duration: number;
    reason: string;
  }>;
  expiresAt: any;
  status: 'active' | 'expired';
}

export function useGuardian(conversationId?: string) {
  const user = auth.currentUser;
  const [activeIntervention, setActiveIntervention] = useState<GuardianIntervention | null>(null);
  const [activeCooling, setActiveCooling] = useState<CoolingSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // Listen for interventions in current conversation
  useEffect(() => {
    if (!user || !conversationId) return;
    
    const interventionsRef = collection(db, 'guardian_interventions');
    const q = query(
      interventionsRef,
      where('conversationId', '==', conversationId),
      where('targetUserId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(1)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        const data = doc.data() as GuardianIntervention;
        
        // Only show if created in last 5 minutes and not resolved
        const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
        const createdAt = data.createdAt?.toMillis?.() || 0;
        
        if (createdAt > fiveMinutesAgo && !data.resolvedAt) {
          setActiveIntervention(data);
        }
      } else {
        setActiveIntervention(null);
      }
    });
    
    return () => unsubscribe();
  }, [user, conversationId]);
  
  // Listen for active cooling sessions
  useEffect(() => {
    if (!user || !conversationId) return;
    
    const coolingRef = collection(db, 'guardian_cooling_sessions');
    const now = Timestamp.now();
    const q = query(
      coolingRef,
      where('conversationId', '==', conversationId),
      where('userId', '==', user.uid),
      where('status', '==', 'active'),
      where('expiresAt', '>', now)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        setActiveCooling(doc.data() as CoolingSession);
      } else {
        setActiveCooling(null);
      }
    });
    
    return () => unsubscribe();
  }, [user, conversationId]);
  
  // Check if specific action is blocked by cooling
  const isActionBlocked = useCallback((actionType: 'message' | 'voice' | 'media' | 'call'): boolean => {
    if (!activeCooling) return false;
    
    const measureMap: Record<string, string> = {
      message: 'message_slowdown',
      voice: 'voice_disabled',
      media: 'media_disabled',
      call: 'call_disabled'
    };
    
    const requiredMeasure = measureMap[actionType];
    return activeCooling.measures.some(m => m.measure === requiredMeasure);
  }, [activeCooling]);
  
  // Resolve intervention
  const resolveIntervention = useCallback(async (
    interventionId: string,
    resolution: string,
    feedback?: string
  ) => {
    try {
      const functions = getFunctions();
      const resolve = httpsCallable(functions, 'resolveIntervention');
      await resolve({ interventionId, resolution, feedback });
      setActiveIntervention(null);
    } catch (error) {
      console.error('Error resolving intervention:', error);
      throw error;
    }
  }, []);
  
  // Request message rewrite
  const requestRewrite = useCallback(async (
    originalMessage: string,
    rewriteIntent: string
  ): Promise<{ rewrittenMessage: string; alternatives: string[] }> => {
    if (!conversationId) {
      throw new Error('No conversation ID');
    }
    
    setIsLoading(true);
    try {
      const functions = getFunctions();
      const rewrite = httpsCallable(functions, 'requestMessageRewrite');
      const result = await rewrite({
        conversationId,
        originalMessage,
        rewriteIntent
      });
      
      const data = result.data as any;
      return {
        rewrittenMessage: data.rewrittenMessage,
        alternatives: data.alternatives || []
      };
    } catch (error) {
      console.error('Error requesting rewrite:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [conversationId]);
  
  // Check cooling status
  const checkCoolingStatus = useCallback(async () => {
    if (!conversationId) return { isCooling: false, activeMeasures: [] };
    
    try {
      const functions = getFunctions();
      const checkStatus = httpsCallable(functions, 'checkCoolingStatus');
      const result = await checkStatus({ conversationId });
      return result.data as { isCooling: boolean; activeMeasures: string[] };
    } catch (error) {
      console.error('Error checking cooling status:', error);
      return { isCooling: false, activeMeasures: [] };
    }
  }, [conversationId]);
  
  // Dismiss intervention (continue with awareness)
  const dismissIntervention = useCallback(async () => {
    if (activeIntervention) {
      await resolveIntervention(
        activeIntervention.interventionId,
        'user_acknowledged'
      );
    }
  }, [activeIntervention, resolveIntervention]);
  
  // Handle intervention action
  const handleInterventionAction = useCallback(async (action: string) => {
    if (!activeIntervention) return;
    
    const resolutionMap: Record<string, string> = {
      'End conversation': 'user_took_action',
      'Take a break': 'user_took_action',
      'Report to safety team': 'escalated',
      'Block user': 'user_took_action',
      'Rephrase message': 'user_took_action',
      'Continue with awareness': 'user_acknowledged'
    };
    
    const resolution = resolutionMap[action] || 'user_took_action';
    await resolveIntervention(activeIntervention.interventionId, resolution);
    
    // Return the action for the component to handle
    return action;
  }, [activeIntervention, resolveIntervention]);
  
  return {
    // State
    activeIntervention,
    activeCooling,
    isLoading,
    isCooling: !!activeCooling,
    
    // Actions
    isActionBlocked,
    resolveIntervention,
    dismissIntervention,
    handleInterventionAction,
    requestRewrite,
    checkCoolingStatus
  };
}