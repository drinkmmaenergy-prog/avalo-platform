/**
 * PACK 240: Truth or Dare — Premium Mode
 * React hook for Truth or Dare game state management with eligibility checks
 */

import { useState, useEffect, useCallback } from 'react';
import { 
  collection, 
  doc, 
  getDoc,
  setDoc, 
  updateDoc, 
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  TruthOrDareGameData,
  TruthOrDareChoice,
  TruthOrDareRound,
  TruthOrDareEligibility,
  TruthOrDareConsent,
  SafetyContext,
  checkTruthOrDareEligibility,
  getIntensityForChemistryTier,
  selectRandomPrompt,
  canPlayMicroGame,
} from '../types/microGames';

interface UseTruthOrDareProps {
  chatId: string;
  currentUserId: string;
  otherUserId: string;
}

interface UseTruthOrDareReturn {
  // Eligibility
  eligibility: TruthOrDareEligibility | null;
  isCheckingEligibility: boolean;
  consent: {
    currentUser: boolean;
    otherUser: boolean;
  };
  
  // Game state
  game: TruthOrDareGameData | null;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  checkEligibility: () => Promise<TruthOrDareEligibility>;
  updateConsent: (enabled: boolean) => Promise<void>;
  startGame: () => Promise<void>;
  makeChoice: (choice: TruthOrDareChoice) => Promise<void>;
  submitResponse: (response: string, responseType?: 'text' | 'voice' | 'photo') => Promise<void>;
  skipTurn: () => Promise<void>;
  endGame: () => Promise<void>;
}

export function useTruthOrDare({
  chatId,
  currentUserId,
  otherUserId,
}: UseTruthOrDareProps): UseTruthOrDareReturn {
  const [game, setGame] = useState<TruthOrDareGameData | null>(null);
  const [eligibility, setEligibility] = useState<TruthOrDareEligibility | null>(null);
  const [consent, setConsent] = useState({ currentUser: false, otherUser: false });
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingEligibility, setIsCheckingEligibility] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ============================================================================
  // REAL-TIME GAME STATE
  // ============================================================================

  useEffect(() => {
    const gamesRef = collection(db, 'chats', chatId, 'microGames');
    const q = query(
      gamesRef,
      where('gameType', '==', 'truthOrDare'),
      where('status', 'in', ['idle', 'active', 'waitingForGuess', 'revealing', 'switching']),
      orderBy('createdAt', 'desc'),
      limit(1)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (!snapshot.empty) {
          const gameData = snapshot.docs[0].data() as TruthOrDareGameData;
          setGame(gameData);
          
          // Check for auto-shutoff (20 minutes without reply)
          if (gameData.autoShutoffAt && Timestamp.now().toMillis() > gameData.autoShutoffAt.toMillis()) {
            endGame();
          }
        } else {
          setGame(null);
        }
      },
      (err) => {
        console.error('Error listening to Truth or Dare game:', err);
        setError(err.message);
      }
    );

    return () => unsubscribe();
  }, [chatId]);

  // ============================================================================
  // CONSENT TRACKING
  // ============================================================================

  useEffect(() => {
    const loadConsent = async () => {
      try {
        const [currentUserDoc, otherUserDoc] = await Promise.all([
          getDoc(doc(db, 'users', currentUserId, 'microGames', 'truthOrDareConsent')),
          getDoc(doc(db, 'users', otherUserId, 'microGames', 'truthOrDareConsent')),
        ]);

        setConsent({
          currentUser: currentUserDoc.exists() && currentUserDoc.data()?.enabled === true,
          otherUser: otherUserDoc.exists() && otherUserDoc.data()?.enabled === true,
        });
      } catch (err) {
        console.error('Error loading consent:', err);
      }
    };

    loadConsent();
  }, [currentUserId, otherUserId]);

  // ============================================================================
  // CHECK ELIGIBILITY
  // ============================================================================

  const checkEligibility = useCallback(async (): Promise<TruthOrDareEligibility> => {
    setIsCheckingEligibility(true);
    setError(null);

    try {
      // Fetch chat data for paid words and chemistry
      const chatDoc = await getDoc(doc(db, 'chats', chatId));
      if (!chatDoc.exists()) {
        throw new Error('Chat not found');
      }

      const chatData = chatDoc.data();
      
      // Fetch PACK 238 chemistry boosters data
      const chemistryDoc = await getDoc(doc(db, 'chats', chatId, 'analytics', 'chemistry'));
      const chemistryData = chemistryDoc.exists() ? chemistryDoc.data() : {};
      
      // Calculate eligibility
      const paidWordsExchanged = chatData.paidMessageCount || 0;
      const chemistryBoostersTriggered = chemistryData.boostersTriggered || 0;
      const chemistryTier = chemistryData.tier || 0;

      // Check safety context
      const safetyContext: SafetyContext = {
        userId: currentUserId,
        chatId,
        sleepModeActive: chatData.sleepMode?.isActive || false,
        breakupRecoveryActive: chatData.breakupRecovery?.isActive || false,
        safetyFlagBetweenUsers: chatData.safetyFlags?.[currentUserId] === true,
        underageSuspicion: chatData.underageSuspicion === true,
        stalkerRisk: chatData.stalkerRisk === true,
      };

      const hasSafetyFlags = !canPlayMicroGame(safetyContext);
      const bothUsersConsented = consent.currentUser && consent.otherUser;

      const result = checkTruthOrDareEligibility(
        paidWordsExchanged,
        chemistryBoostersTriggered,
        hasSafetyFlags,
        bothUsersConsented,
        chemistryTier
      );

      setEligibility(result);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to check eligibility';
      setError(message);
      throw err;
    } finally {
      setIsCheckingEligibility(false);
    }
  }, [chatId, currentUserId, consent]);

  // ============================================================================
  // UPDATE CONSENT
  // ============================================================================

  const updateConsent = useCallback(async (enabled: boolean): Promise<void> => {
    try {
      const consentDoc: TruthOrDareConsent = {
        userId: currentUserId,
        enabled,
        ...(enabled ? { enabledAt: serverTimestamp() as Timestamp } : { disabledAt: serverTimestamp() as Timestamp }),
      };

      await setDoc(
        doc(db, 'users', currentUserId, 'microGames', 'truthOrDareConsent'),
        consentDoc,
        { merge: true }
      );

      setConsent(prev => ({ ...prev, currentUser: enabled }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update consent';
      setError(message);
      throw err;
    }
  }, [currentUserId]);

  // ============================================================================
  // START GAME
  // ============================================================================

  const startGame = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      // Verify eligibility first
      const eligible = await checkEligibility();
      if (!eligible.isEligible) {
        throw new Error(`Not eligible: ${eligible.reasons.join(', ')}`);
      }

      const intensity = getIntensityForChemistryTier(eligible.chemistryTier);
      const gameId = `truthOrDare_${Date.now()}`;
      const now = serverTimestamp() as Timestamp;
      
      // Create 20-minute auto-shutoff timestamp
      const autoShutoffAt = Timestamp.fromMillis(Date.now() + 20 * 60 * 1000);

      const newGame: TruthOrDareGameData = {
        gameId,
        chatId,
        gameType: 'truthOrDare',
        status: 'idle',
        participants: [currentUserId, otherUserId],
        initiatorId: currentUserId,
        currentPlayerId: currentUserId,
        roundCount: 0,
        rounds: [],
        intensity,
        autoShutoffAt,
        totalResponseTime: 0,
        correctGuessStreak: 0,
        sparkThemeUnlocked: false,
        voiceCallSuggested: false,
        videoCallSuggested: false,
        calendarEventSuggested: false,
        eligibilitySnapshot: {
          paidWordsExchanged: eligible.paidWordsExchanged,
          chemistryBoostersTriggered: eligible.chemistryBoostersTriggered,
          chemistryTier: eligible.chemistryTier,
        },
        createdAt: now,
        lastPlayed: now,
        updatedAt: now,
      };

      await setDoc(doc(db, 'chats', chatId, 'microGames', gameId), newGame);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start game';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [chatId, currentUserId, otherUserId, checkEligibility]);

  // ============================================================================
  // MAKE CHOICE (Truth or Dare)
  // ============================================================================

  const makeChoice = useCallback(async (choice: TruthOrDareChoice): Promise<void> => {
    if (!game) throw new Error('No active game');
    if (game.currentPlayerId !== currentUserId) {
      throw new Error('Not your turn');
    }

    setIsLoading(true);
    setError(null);

    try {
      // Select random prompt based on intensity
      const usedPromptIds = game.rounds.map(r => r.prompt.id);
      const prompt = selectRandomPrompt(choice, game.intensity, usedPromptIds);
      
      if (!prompt) {
        throw new Error('No available prompts for this intensity level');
      }

      const newRound: TruthOrDareRound = {
        roundNumber: game.roundCount + 1,
        playerId: currentUserId,
        choice,
        prompt,
      };

      await updateDoc(doc(db, 'chats', chatId, 'microGames', game.gameId), {
        status: 'active',
        rounds: [...game.rounds, newRound],
        roundCount: game.roundCount + 1,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to make choice';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [game, chatId, currentUserId]);

  // ============================================================================
  // SUBMIT RESPONSE
  // ============================================================================

  const submitResponse = useCallback(async (
    response: string,
    responseType: 'text' | 'voice' | 'photo' = 'text'
  ): Promise<void> => {
    if (!game) throw new Error('No active game');
    if (game.rounds.length === 0) throw new Error('No active round');

    const currentRound = game.rounds[game.rounds.length - 1];
    if (currentRound.playerId !== currentUserId) {
      throw new Error('Not your turn');
    }

    setIsLoading(true);
    setError(null);

    try {
      const updatedRounds = [...game.rounds];
      updatedRounds[updatedRounds.length - 1] = {
        ...currentRound,
        response,
        responseType,
        completedAt: serverTimestamp() as Timestamp,
      };

      // Switch to other player
      const nextPlayerId = currentUserId === game.participants[0] 
        ? game.participants[1] 
        : game.participants[0];

      // Check if monetization should be suggested
      const updates: any = {
        rounds: updatedRounds,
        currentPlayerId: nextPlayerId,
        status: 'switching',
        updatedAt: serverTimestamp(),
        autoShutoffAt: Timestamp.fromMillis(Date.now() + 20 * 60 * 1000), // Reset shutoff timer
      };

      // Monetization triggers based on prompt target
      if (currentRound.prompt.monetizationTarget === 'voice_call' && !game.voiceCallSuggested) {
        updates.voiceCallSuggested = true;
      }
      if (currentRound.prompt.monetizationTarget === 'video_call' && !game.videoCallSuggested) {
        updates.videoCallSuggested = true;
      }
      if (currentRound.prompt.monetizationTarget === 'calendar' && !game.calendarEventSuggested) {
        updates.calendarEventSuggested = true;
      }

      await updateDoc(doc(db, 'chats', chatId, 'microGames', game.gameId), updates);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit response';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [game, chatId, currentUserId]);

  // ============================================================================
  // SKIP TURN
  // ============================================================================

  const skipTurn = useCallback(async (): Promise<void> => {
    if (!game) throw new Error('No active game');

    setIsLoading(true);
    setError(null);

    try {
      const updatedRounds = [...game.rounds];
      if (updatedRounds.length > 0) {
        updatedRounds[updatedRounds.length - 1] = {
          ...updatedRounds[updatedRounds.length - 1],
          skipped: true,
          completedAt: serverTimestamp() as Timestamp,
        };
      }

      const nextPlayerId = currentUserId === game.participants[0] 
        ? game.participants[1] 
        : game.participants[0];

      await updateDoc(doc(db, 'chats', chatId, 'microGames', game.gameId), {
        rounds: updatedRounds,
        currentPlayerId: nextPlayerId,
        status: 'switching',
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to skip turn';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [game, chatId, currentUserId]);

  // ============================================================================
  // END GAME
  // ============================================================================

  const endGame = useCallback(async (): Promise<void> => {
    if (!game) return;

    setIsLoading(true);
    setError(null);

    try {
      await updateDoc(doc(db, 'chats', chatId, 'microGames', game.gameId), {
        status: 'complete',
        completedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to end game';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [game, chatId]);

  return {
    eligibility,
    isCheckingEligibility,
    consent,
    game,
    isLoading,
    error,
    checkEligibility,
    updateConsent,
    startGame,
    makeChoice,
    submitResponse,
    skipTurn,
    endGame,
  };
}