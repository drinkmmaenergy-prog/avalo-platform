/**
 * PACK 239: Two Truths & One Lie Micro-Game
 * Custom hook for game state management
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
  Timestamp,
  serverTimestamp,
  FieldValue,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  MicroGameData,
  GameStatus,
  PlayerRound,
  GameStatement,
  TopicPreset,
  SafetyContext,
  canPlayMicroGame,
  shouldUnlockSparkTheme,
  shouldSuggestVoiceCall,
  shouldSuggestVideoCall,
  shouldSuggestCalendarEvent,
  MonetizationSuggestion,
  SparkTheme,
} from '../types/microGames';

// ============================================================================
// HOOK INTERFACE
// ============================================================================

interface UseMicroGameOptions {
  chatId: string;
  currentUserId: string;
  otherUserId: string;
}

interface UseMicroGameReturn {
  // State
  game: MicroGameData | null;
  isLoading: boolean;
  error: string | null;
  canPlay: boolean;
  sparkTheme: SparkTheme | null;
  
  // Actions
  initiateGame: () => Promise<void>;
  submitStatements: (statements: GameStatement[], topic?: TopicPreset) => Promise<void>;
  makeGuess: (lieId: string) => Promise<void>;
  switchToNextPlayer: () => Promise<void>;
  completeGame: () => Promise<void>;
  cancelGame: () => Promise<void>;
  
  // Monetization
  markVoiceCallSuggested: () => Promise<void>;
  markVideoCallSuggested: () => Promise<void>;
  markCalendarEventSuggested: () => Promise<void>;
  
  // Settings
  disableMicroGames: () => Promise<void>;
  blockMicroGamesInChat: () => Promise<void>;
}

// ============================================================================
// MAIN HOOK
// ============================================================================

export function useMicroGame({
  chatId,
  currentUserId,
  otherUserId,
}: UseMicroGameOptions): UseMicroGameReturn {
  const [game, setGame] = useState<MicroGameData | null>(null);
  const [sparkTheme, setSparkTheme] = useState<SparkTheme | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canPlay, setCanPlay] = useState(true);

  // ============================================================================
  // SAFETY CHECKS
  // ============================================================================

  useEffect(() => {
    const checkSafety = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', currentUserId));
        const chatDoc = await getDoc(doc(db, 'chats', chatId));
        
        if (!userDoc.exists() || !chatDoc.exists()) {
          setCanPlay(false);
          return;
        }

        const userData = userDoc.data();
        const chatData = chatDoc.data();

        // Check sleep mode
        const sleepModeDoc = await getDoc(
          doc(db, 'users', currentUserId, 'settings', 'sleepMode')
        );
        const sleepModeActive = sleepModeDoc.exists() && sleepModeDoc.data().isActive === true;

        // Check breakup recovery
        const breakupDoc = await getDoc(
          doc(db, 'users', currentUserId, 'settings', 'breakupRecovery')
        );
        const breakupActive = breakupDoc.exists() && breakupDoc.data().isActive === true;

        const safetyContext: SafetyContext = {
          userId: currentUserId,
          chatId,
          sleepModeActive,
          breakupRecoveryActive: breakupActive,
          safetyFlagBetweenUsers: chatData.safetyFlags?.[currentUserId] === true,
          underageSuspicion: chatData.underageSuspicion === true,
          stalkerRisk: chatData.stalkerRisk === true,
        };

        setCanPlay(canPlayMicroGame(safetyContext));
      } catch (err) {
        console.error('Error checking safety:', err);
        setCanPlay(false);
      }
    };

    checkSafety();
  }, [chatId, currentUserId]);

  // ============================================================================
  // SUBSCRIBE TO GAME STATE
  // ============================================================================

  useEffect(() => {
    const gamesRef = collection(db, 'chats', chatId, 'microGames');
    const q = query(
      gamesRef,
      where('gameType', '==', 'twoTruthsOneLie'),
      where('status', '!=', 'complete')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (!snapshot.empty) {
          const gameDoc = snapshot.docs[0];
          setGame({ ...gameDoc.data(), gameId: gameDoc.id } as MicroGameData);
        } else {
          setGame(null);
        }
        setIsLoading(false);
      },
      (err) => {
        console.error('Error subscribing to game:', err);
        setError(err.message);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [chatId]);

  // ============================================================================
  // SUBSCRIBE TO SPARK THEME
  // ============================================================================

  useEffect(() => {
    if (!game?.sparkThemeUnlocked) {
      setSparkTheme(null);
      return;
    }

    const themeRef = doc(db, 'chats', chatId, 'sparkTheme', 'active');
    const unsubscribe = onSnapshot(
      themeRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const theme = snapshot.data() as SparkTheme;
          // Check if expired
          const now = Timestamp.now();
          if (theme.expiresAt.toMillis() > now.toMillis()) {
            setSparkTheme(theme);
          } else {
            setSparkTheme(null);
          }
        } else {
          setSparkTheme(null);
        }
      },
      (err) => {
        console.error('Error subscribing to spark theme:', err);
      }
    );

    return () => unsubscribe();
  }, [chatId, game?.sparkThemeUnlocked]);

  // ============================================================================
  // INITIATE GAME
  // ============================================================================

  const initiateGame = useCallback(async () => {
    if (!canPlay) {
      setError('Micro-games are currently disabled due to safety settings');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const gameId = doc(collection(db, 'chats', chatId, 'microGames')).id;
      const newGame: any = {
        gameId,
        chatId,
        gameType: 'twoTruthsOneLie',
        status: 'idle',
        participants: [currentUserId, otherUserId],
        initiatorId: currentUserId,
        currentPlayerId: currentUserId,
        roundCount: 0,
        rounds: [],
        correctGuessStreak: 0,
        sparkThemeUnlocked: false,
        voiceCallSuggested: false,
        videoCallSuggested: false,
        calendarEventSuggested: false,
        createdAt: serverTimestamp(),
        lastPlayed: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await setDoc(doc(db, 'chats', chatId, 'microGames', gameId), newGame);
    } catch (err: any) {
      console.error('Error initiating game:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [chatId, currentUserId, otherUserId, canPlay]);

  // ============================================================================
  // SUBMIT STATEMENTS
  // ============================================================================

  const submitStatements = useCallback(
    async (statements: GameStatement[], topic?: TopicPreset) => {
      if (!game || game.status !== 'active') {
        setError('Game is not in active state');
        return;
      }

      if (game.currentPlayerId !== currentUserId) {
        setError('Not your turn');
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        const newRound: any = {
          playerId: currentUserId,
          statements,
          selectedTopic: topic,
          submittedAt: serverTimestamp(),
        };

        await updateDoc(doc(db, 'chats', chatId, 'microGames', game.gameId), {
          status: 'waitingForGuess',
          rounds: [...game.rounds, newRound],
          updatedAt: serverTimestamp(),
        });
      } catch (err: any) {
        console.error('Error submitting statements:', err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    },
    [game, chatId, currentUserId]
  );

  // ============================================================================
  // MAKE GUESS
  // ============================================================================

  const makeGuess = useCallback(
    async (lieId: string) => {
      if (!game || game.status !== 'waitingForGuess') {
        setError('Game is not waiting for a guess');
        return;
      }

      if (game.currentPlayerId === currentUserId) {
        setError('Cannot guess your own statements');
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        const currentRound = game.rounds[game.rounds.length - 1];
        const correctLie = currentRound.statements.find(s => s.isLie);
        const wasCorrect = correctLie?.id === lieId;

        // Update current round with guess
        const updatedRounds = [...game.rounds];
        const lastRoundUpdate: any = {
          ...currentRound,
          guessedLieId: lieId,
          guessedBy: currentUserId,
          guessedAt: serverTimestamp(),
          wasCorrect,
        };
        updatedRounds[updatedRounds.length - 1] = lastRoundUpdate;

        // Update correct guess streak
        let newStreak = game.correctGuessStreak;
        if (wasCorrect) {
          newStreak++;
        } else {
          newStreak = 0;
        }

        // Check if spark theme should be unlocked
        const shouldUnlock = shouldUnlockSparkTheme({
          ...game,
          correctGuessStreak: newStreak,
        });

        const updates: any = {
          status: 'revealing',
          rounds: updatedRounds,
          correctGuessStreak: newStreak,
          updatedAt: serverTimestamp(),
        };

        // Unlock spark theme if criteria met
        if (shouldUnlock) {
          updates.sparkThemeUnlocked = true;
          
          // Create spark theme document
          const sparkThemeData: any = {
            themeId: 'active',
            chatId,
            unlockedAt: serverTimestamp(),
            expiresAt: Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
            isActive: true,
            themeStyle: {
              gradient: ['#FF6B6B', '#FFA500', '#FFD700'],
              accentColor: '#FFD700',
              effectName: 'sparkles',
            },
          };
          
          await setDoc(
            doc(db, 'chats', chatId, 'sparkTheme', 'active'),
            sparkThemeData
          );
        }

        await updateDoc(doc(db, 'chats', chatId, 'microGames', game.gameId), updates);
      } catch (err: any) {
        console.error('Error making guess:', err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    },
    [game, chatId, currentUserId]
  );

  // ============================================================================
  // SWITCH TO NEXT PLAYER
  // ============================================================================

  const switchToNextPlayer = useCallback(async () => {
    if (!game || game.status !== 'revealing') {
      setError('Cannot switch players from current state');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Check if both players have completed a round
      const player1Rounds = game.rounds.filter(r => r.playerId === game.participants[0]);
      const player2Rounds = game.rounds.filter(r => r.playerId === game.participants[1]);

      if (player1Rounds.length > 0 && player2Rounds.length > 0 && 
          player1Rounds.length === player2Rounds.length) {
        // Both completed, move to complete
        await completeGame();
        return;
      }

      // Switch to other player
      const nextPlayerId = game.currentPlayerId === game.participants[0]
        ? game.participants[1]
        : game.participants[0];

      await updateDoc(doc(db, 'chats', chatId, 'microGames', game.gameId), {
        status: 'active',
        currentPlayerId: nextPlayerId,
        roundCount: game.roundCount + 1,
        updatedAt: serverTimestamp(),
      });
    } catch (err: any) {
      console.error('Error switching players:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [game, chatId]);

  // ============================================================================
  // COMPLETE GAME
  // ============================================================================

  const completeGame = useCallback(async () => {
    if (!game) return;

    try {
      setIsLoading(true);
      setError(null);

      const updates: any = {
        status: 'complete',
        completedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await updateDoc(doc(db, 'chats', chatId, 'microGames', game.gameId), updates);

      // Generate memory log if both players completed
      if (game.rounds.length >= 2) {
        // This would trigger a cloud function to create a memory log
        // For now, we'll just mark it in the game data
        await updateDoc(doc(db, 'chats', chatId, 'microGames', game.gameId), {
          memoryLogGenerated: true,
        });
      }
    } catch (err: any) {
      console.error('Error completing game:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [game, chatId]);

  // ============================================================================
  // CANCEL GAME
  // ============================================================================

  const cancelGame = useCallback(async () => {
    if (!game) return;

    try {
      setIsLoading(true);
      setError(null);

      await updateDoc(doc(db, 'chats', chatId, 'microGames', game.gameId), {
        status: 'complete',
        completedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err: any) {
      console.error('Error canceling game:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [game, chatId]);

  // ============================================================================
  // MONETIZATION TRIGGERS
  // ============================================================================

  const markVoiceCallSuggested = useCallback(async () => {
    if (!game || game.voiceCallSuggested) return;

    try {
      await updateDoc(doc(db, 'chats', chatId, 'microGames', game.gameId), {
        voiceCallSuggested: true,
        updatedAt: serverTimestamp(),
      });
    } catch (err: any) {
      console.error('Error marking voice call suggested:', err);
    }
  }, [game, chatId]);

  const markVideoCallSuggested = useCallback(async () => {
    if (!game || game.videoCallSuggested) return;

    try {
      await updateDoc(doc(db, 'chats', chatId, 'microGames', game.gameId), {
        videoCallSuggested: true,
        updatedAt: serverTimestamp(),
      });
    } catch (err: any) {
      console.error('Error marking video call suggested:', err);
    }
  }, [game, chatId]);

  const markCalendarEventSuggested = useCallback(async () => {
    if (!game || game.calendarEventSuggested) return;

    try {
      await updateDoc(doc(db, 'chats', chatId, 'microGames', game.gameId), {
        calendarEventSuggested: true,
        updatedAt: serverTimestamp(),
      });
    } catch (err: any) {
      console.error('Error marking calendar event suggested:', err);
    }
  }, [game, chatId]);

  // ============================================================================
  // SETTINGS
  // ============================================================================

  const disableMicroGames = useCallback(async () => {
    try {
      await setDoc(doc(db, 'users', currentUserId, 'settings', 'microGames'), {
        enabled: false,
        updatedAt: serverTimestamp(),
      });
    } catch (err: any) {
      console.error('Error disabling micro-games:', err);
    }
  }, [currentUserId]);

  const blockMicroGamesInChat = useCallback(async () => {
    try {
      await setDoc(doc(db, 'chats', chatId, 'microGameBlock', currentUserId), {
        userId: currentUserId,
        chatId,
        blocked: true,
        createdAt: serverTimestamp(),
      });
    } catch (err: any) {
      console.error('Error blocking micro-games in chat:', err);
    }
  }, [chatId, currentUserId]);

  // ============================================================================
  // RETURN
  // ============================================================================

  return {
    game,
    isLoading,
    error,
    canPlay,
    sparkTheme,
    initiateGame,
    submitStatements,
    makeGuess,
    switchToNextPlayer,
    completeGame,
    cancelGame,
    markVoiceCallSuggested,
    markVideoCallSuggested,
    markCalendarEventSuggested,
    disableMicroGames,
    blockMicroGamesInChat,
  };
}