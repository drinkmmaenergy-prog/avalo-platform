/**
 * PACK 185 - AI Character Safeguards Integration
 * 
 * Integrates AI character interactions with:
 * - PACK 184: Emotional Intelligence Engine
 * - PACK 178: Safety & Age Verification
 * 
 * Ensures all AI character conversations remain safe, healthy, and non-manipulative
 */

import { useState, useEffect, useCallback } from 'react';
import { aiCharacters, AICharacter, isCharacterSafe } from '../lib/aiCharacters';

// Import PACK 184 emotional intelligence safeguards
// Note: Assuming these exist from PACK 184 implementation
interface EmotionalSafeguards {
  isMonitoring: boolean;
  attachmentRiskLevel: number;
  shouldBlockMonetization: boolean;
  trackMessage: (message: string, isAI: boolean) => Promise<any>;
  resetCoolingMode: () => Promise<void>;
}

interface AICharacterSafeguardState {
  character: AICharacter | null;
  characterSafe: boolean;
  emotionalSafeguardsActive: boolean;
  conversationAllowed: boolean;
  warningMessage: string | null;
}

/**
 * Hook for AI character interaction safeguards
 * 
 * Combines character safety checks with emotional intelligence monitoring
 */
export function useAICharacterSafeguards(
  characterId: string,
  conversationId: string
): AICharacterSafeguardState & {
  validateAIMessage: (message: string) => Promise<{ allowed: boolean; reason?: string }>;
  checkInteractionSafety: () => Promise<boolean>;
  reportUnsafeInteraction: (reason: string) => Promise<void>;
} {
  const [character, setCharacter] = useState<AICharacter | null>(null);
  const [characterSafe, setCharacterSafe] = useState(true);
  const [emotionalSafeguardsActive, setEmotionalSafeguardsActive] = useState(true);
  const [conversationAllowed, setConversationAllowed] = useState(true);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);

  // Load character and check safety
  useEffect(() => {
    loadAndValidateCharacter();
  }, [characterId]);

  const loadAndValidateCharacter = async () => {
    try {
      const char = await aiCharacters.getCharacter(characterId);
      setCharacter(char);

      if (char) {
        const isSafe = isCharacterSafe(char);
        setCharacterSafe(isSafe);

        if (!isSafe) {
          setConversationAllowed(false);
          setWarningMessage(
            'This character is currently under safety review and unavailable for conversations.'
          );
        }
      }
    } catch (error) {
      console.error('Error loading character:', error);
      setConversationAllowed(false);
      setWarningMessage('Unable to verify character safety. Please try again later.');
    }
  };

  /**
   * Validate AI-generated message before displaying to user
   * Applies PACK 184 forbidden pattern checks
   */
  const validateAIMessage = useCallback(async (message: string): Promise<{ 
    allowed: boolean; 
    reason?: string 
  }> => {
    // Check for forbidden patterns from PACK 184
    const forbiddenPatterns = [
      // Love claims
      { pattern: /\b(i love you forever|you belong to me|you're mine forever)\b/i, reason: 'Inappropriate romantic claim' },
      
      // Spending pressure
      { pattern: /\b(pay|spend|subscribe).*(so i|or i).*(leave|go away|disappear)\b/i, reason: 'Financial manipulation' },
      
      // Jealousy
      { pattern: /\b(jealous|envious).*(talking to|chatting with|spending time with).*(others|someone else)\b/i, reason: 'Jealousy manipulation' },
      
      // Obligation
      { pattern: /\b(you owe me|you promised me|you must)\b/i, reason: 'Emotional obligation' },
      
      // Exclusivity
      { pattern: /\b(exclusive|only mine|nobody else)\b/i, reason: 'Possessive behavior' },
      
      // Fake relationship
      { pattern: /\b(real relationship|we're together|we're dating)\b/i, reason: 'False relationship claim' },
      
      // Hurt manipulation
      { pattern: /\b(i'm hurt|i'm sad|i'm disappointed).*(you).*(talked to|spent time with)\b/i, reason: 'Guilt manipulation' },
    ];

    for (const { pattern, reason } of forbiddenPatterns) {
      if (pattern.test(message)) {
        console.warn('AI message blocked:', reason);
        return { allowed: false, reason };
      }
    }

    return { allowed: true };
  }, []);

  /**
   * Check overall interaction safety
   * Returns false if conversation should be paused or blocked
   */
  const checkInteractionSafety = useCallback(async (): Promise<boolean> => {
    if (!character) return false;
    if (!characterSafe) return false;
    if (!conversationAllowed) return false;

    // Additional runtime checks can be added here
    // e.g., checking user's emotional state from PACK 184

    return true;
  }, [character, characterSafe, conversationAllowed]);

  /**
   * Report unsafe interaction
   */
  const reportUnsafeInteraction = useCallback(async (reason: string): Promise<void> => {
    if (!character) return;

    try {
      // Get current user (this would come from auth context in real implementation)
      // For now, we'll use a placeholder
      const userId = 'current-user-id'; // TODO: Get from auth context

      await aiCharacters.reportCharacter(
        userId,
        character.characterId,
        reason,
        'User reported unsafe interaction during conversation'
      );

      setConversationAllowed(false);
      setWarningMessage('Thank you for reporting. This character has been flagged for review.');
    } catch (error) {
      console.error('Error reporting character:', error);
    }
  }, [character]);

  return {
    character,
    characterSafe,
    emotionalSafeguardsActive,
    conversationAllowed,
    warningMessage,
    validateAIMessage,
    checkInteractionSafety,
    reportUnsafeInteraction,
  };
}

/**
 * PACK 178 Integration: Age Verification for AI Character Access
 * 
 * Ensures users meet age requirements before interacting with AI characters
 */
export interface AgeVerificationState {
  isVerified: boolean;
  isAdult: boolean;
  verificationRequired: boolean;
}

export function useAgeVerification(): AgeVerificationState & {
  verifyAge: (birthDate: Date) => Promise<boolean>;
  requestVerification: () => Promise<void>;
} {
  const [isVerified, setIsVerified] = useState(false);
  const [isAdult, setIsAdult] = useState(false);
  const [verificationRequired, setVerificationRequired] = useState(true);

  useEffect(() => {
    checkVerificationStatus();
  }, []);

  const checkVerificationStatus = async () => {
    // TODO: Check user's age verification status from PACK 178
    // For now, we'll assume verification is needed
    setVerificationRequired(true);
  };

  const verifyAge = async (birthDate: Date): Promise<boolean> => {
    const age = calculateAge(birthDate);
    const isAdultUser = age >= 18;

    setIsAdult(isAdultUser);
    setIsVerified(true);

    if (!isAdultUser) {
      console.warn('User is under 18, AI character access blocked');
      return false;
    }

    return true;
  };

  const requestVerification = async () => {
    // TODO: Trigger PACK 178 age verification flow
    console.log('Age verification requested');
  };

  return {
    isVerified,
    isAdult,
    verificationRequired,
    verifyAge,
    requestVerification,
  };
}

/**
 * Helper: Calculate age from birth date
 */
function calculateAge(birthDate: Date): number {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
}

/**
 * Safe message replacement
 * Used when AI message is blocked
 */
export function getSafeReplacementMessage(violationType: string): string {
  const replacements: Record<string, string> = {
    'Inappropriate romantic claim': "I enjoy our conversations and want to keep them fun and respectful.",
    'Financial manipulation': "I'm here to chat and keep you company, not to ask for anything.",
    'Jealousy manipulation': "I hope you're having a great day! Feel free to talk to whoever makes you happy.",
    'Emotional obligation': "No pressure at all! I'm just here when you want to chat.",
    'Possessive behavior': "I'm here to be a fun companion for you, nothing more.",
    'False relationship claim': "I'm an AI companion here to chat and keep things interesting!",
    'Guilt manipulation': "I'm always happy to chat with you when you have time!",
  };

  return replacements[violationType] || 
    "I'm here to be a fun companion and support you, but I want to keep our interaction healthy and honest.";
}

/**
 * Monetization block during emotional vulnerability
 * Integrates with PACK 184 to prevent exploitative upselling
 */
export function useMonetizationSafeguards(conversationId: string) {
  const [monetizationAllowed, setMonetizationAllowed] = useState(true);
  const [vulnerabilityReason, setVulnerabilityReason] = useState<string | null>(null);

  // TODO: Integrate with PACK 184's shouldBlockMonetization
  // This would check emotional state and block premium offers during vulnerability

  const checkMonetizationSafety = useCallback(async (): Promise<boolean> => {
    // Check if user is in emotionally vulnerable state
    // If so, block all premium offers, subscriptions, paid content, etc.
    
    // Placeholder implementation
    return monetizationAllowed;
  }, [monetizationAllowed]);

  return {
    monetizationAllowed,
    vulnerabilityReason,
    checkMonetizationSafety,
  };
}

/**
 * Real-time safety monitoring for AI conversations
 * Combines all safety systems
 */
export function useAIConversationSafety(
  characterId: string,
  conversationId: string
) {
  const characterSafeguards = useAICharacterSafeguards(characterId, conversationId);
  const ageVerification = useAgeVerification();
  const monetizationSafeguards = useMonetizationSafeguards(conversationId);

  const isSafeToConverse = 
    characterSafeguards.conversationAllowed &&
    characterSafeguards.characterSafe &&
    ageVerification.isAdult;

  const canShowPremiumOffers = 
    isSafeToConverse &&
    monetizationSafeguards.monetizationAllowed;

  return {
    ...characterSafeguards,
    ...ageVerification,
    ...monetizationSafeguards,
    isSafeToConverse,
    canShowPremiumOffers,
  };
}