/**
 * PACK 363 — Wallet Realtime Hook
 * 
 * Provides realtime wallet balance synchronization across:
 * - Chat spending (word buckets)
 * - Call charges
 * - Calendar & event bookings
 * - Refunds & payouts
 * - All wallet mutations
 */

import { useEffect, useState, useCallback } from 'react';
import { getRealtimeBus, RealtimeEvent } from '../lib/realtime/realtimeBus';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type TransactionType = 
  | 'chat_spend'
  | 'call_spend'
  | 'calendar_booking'
  | 'event_booking'
  | 'refund'
  | 'payout'
  | 'deposit'
  | 'withdrawal'
  | 'tip'
  | 'gift';

export type TransactionStatus = 
  | 'pending'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface WalletTransaction {
  id: string;
  userId: string;
  type: TransactionType;
  amount: number; // Can be negative for spending
  currency: string;
  status: TransactionStatus;
  description?: string;
  metadata?: Record<string, any>;
  createdAt: number;
  completedAt?: number;
}

export interface WalletBalance {
  userId: string;
  balance: number;
  currency: string;
  lastUpdated: number;
  lastTxId?: string;
}

export interface WalletRealtimeState {
  balance: WalletBalance | null;
  recentTransactions: WalletTransaction[];
  pendingTransactions: WalletTransaction[];
  isConnected: boolean;
  isSyncing: boolean;
}

export interface WalletRealtimeActions {
  refreshBalance: () => Promise<void>;
  acknowledgeTransaction: (txId: string) => void;
}

// ============================================================================
// WALLET REALTIME HOOK
// ============================================================================

export function useWalletRealtime(
  userId: string
): [WalletRealtimeState, WalletRealtimeActions] {
  
  const [state, setState] = useState<WalletRealtimeState>({
    balance: null,
    recentTransactions: [],
    pendingTransactions: [],
    isConnected: false,
    isSyncing: false
  });

  const realtimeBus = getRealtimeBus();

  // ==========================================================================
  // SUBSCRIPTION SETUP
  // ==========================================================================

  useEffect(() => {
    if (!userId) return;

    // Load initial balance
    loadInitialBalance();

    // Subscribe to wallet events
    const unsubscribe = realtimeBus.subscribe<any>(
      'wallet',
      handleRealtimeEvent,
      { 
        resourceId: userId,
        filters: { 'payload.userId': userId }
      }
    );

    // Check connection status
    const connectionStatus = realtimeBus.getStatus();
    setState(prev => ({ ...prev, isConnected: connectionStatus === 'connected' }));

    // Monitor connection changes
    const connectionInterval = setInterval(() => {
      const status = realtimeBus.getStatus();
      setState(prev => ({ ...prev, isConnected: status === 'connected' }));
    }, 5000);

    return () => {
      unsubscribe();
      clearInterval(connectionInterval);
    };
  }, [userId]);

  // ==========================================================================
  // INITIAL BALANCE LOAD
  // ==========================================================================

  const loadInitialBalance = async () => {
    try {
      setState(prev => ({ ...prev, isSyncing: true }));

      const walletDoc = await getDoc(doc(db, 'wallets', userId));
      
      if (walletDoc.exists()) {
        const data = walletDoc.data();
        
        setState(prev => ({
          ...prev,
          balance: {
            userId,
            balance: data.balance || 0,
            currency: data.currency || 'USD',
            lastUpdated: data.lastUpdated?.toMillis?.() || Date.now(),
            lastTxId: data.lastTxId
          },
          isSyncing: false
        }));
      } else {
        // No wallet yet, set default
        setState(prev => ({
          ...prev,
          balance: {
            userId,
            balance: 0,
            currency: 'USD',
            lastUpdated: Date.now()
          },
          isSyncing: false
        }));
      }
    } catch (error) {
      console.error('[useWalletRealtime] Load balance error:', error);
      setState(prev => ({ ...prev, isSyncing: false }));
    }
  };

  // ==========================================================================
  // EVENT HANDLER
  // ==========================================================================

  const handleRealtimeEvent = useCallback((event: RealtimeEvent) => {
    switch (event.type) {
      case 'balance_update':
        handleBalanceUpdate(event.payload);
        break;
      
      case 'transaction_created':
        handleTransactionCreated(event.payload);
        break;
      
      case 'transaction_completed':
        handleTransactionCompleted(event.payload);
        break;
      
      case 'transaction_failed':
        handleTransactionFailed(event.payload);
        break;
      
      default:
        console.log('[useWalletRealtime] Unknown event type:', event.type);
    }
  }, []);

  // ==========================================================================
  // BALANCE UPDATE HANDLER
  // ==========================================================================

  const handleBalanceUpdate = (payload: any) => {
    // Ensure this update is for the current user
    if (payload.userId !== userId) return;

    setState(prev => {
      // Check if this is a newer update
      if (
        prev.balance &&
        payload.lastTxId === prev.balance.lastTxId
      ) {
        return prev; // Skip duplicate update
      }

      return {
        ...prev,
        balance: {
          userId: payload.userId,
          balance: payload.newBalance,
          currency: payload.currency || prev.balance?.currency || 'USD',
          lastUpdated: payload.timestamp || Date.now(),
          lastTxId: payload.lastTxId
        }
      };
    });
  };

  // ==========================================================================
  // TRANSACTION HANDLERS
  // ==========================================================================

  const handleTransactionCreated = (payload: any) => {
    if (payload.userId !== userId) return;

    const transaction: WalletTransaction = {
      id: payload.txId,
      userId: payload.userId,
      type: payload.type,
      amount: payload.amount,
      currency: payload.currency || 'USD',
      status: 'pending',
      description: payload.description,
      metadata: payload.metadata,
      createdAt: payload.timestamp || Date.now()
    };

    setState(prev => ({
      ...prev,
      pendingTransactions: [transaction, ...prev.pendingTransactions]
    }));
  };

  const handleTransactionCompleted = (payload: any) => {
    if (payload.userId !== userId) return;

    setState(prev => {
      // Move from pending to recent
      const pendingTx = prev.pendingTransactions.find(tx => tx.id === payload.txId);
      
      if (pendingTx) {
        const completedTx: WalletTransaction = {
          ...pendingTx,
          status: 'completed',
          completedAt: payload.timestamp || Date.now()
        };

        return {
          ...prev,
          pendingTransactions: prev.pendingTransactions.filter(tx => tx.id !== payload.txId),
          recentTransactions: [
            completedTx,
            ...prev.recentTransactions
          ].slice(0, 50) // Keep last 50
        };
      }

      // Transaction not in pending (might have been created elsewhere)
      const newTx: WalletTransaction = {
        id: payload.txId,
        userId: payload.userId,
        type: payload.type,
        amount: payload.amount,
        currency: payload.currency || 'USD',
        status: 'completed',
        description: payload.description,
        metadata: payload.metadata,
        createdAt: payload.createdAt || Date.now(),
        completedAt: payload.timestamp || Date.now()
      };

      return {
        ...prev,
        recentTransactions: [
          newTx,
          ...prev.recentTransactions
        ].slice(0, 50)
      };
    });
  };

  const handleTransactionFailed = (payload: any) => {
    if (payload.userId !== userId) return;

    setState(prev => ({
      ...prev,
      pendingTransactions: prev.pendingTransactions.map(tx =>
        tx.id === payload.txId
          ? { ...tx, status: 'failed', metadata: { ...tx.metadata, error: payload.error } }
          : tx
      )
    }));
  };

  // ==========================================================================
  // ACTIONS: REFRESH BALANCE
  // ==========================================================================

  const refreshBalance = useCallback(async () => {
    await loadInitialBalance();
  }, [userId]);

  // ==========================================================================
  // ACTIONS: ACKNOWLEDGE TRANSACTION
  // ==========================================================================

  const acknowledgeTransaction = useCallback((txId: string) => {
    // Remove transaction from recent list (user has seen it)
    setState(prev => ({
      ...prev,
      recentTransactions: prev.recentTransactions.filter(tx => tx.id !== txId)
    }));
  }, []);

  // ==========================================================================
  // RETURN STATE & ACTIONS
  // ==========================================================================

  return [
    state,
    {
      refreshBalance,
      acknowledgeTransaction
    }
  ];
}

// ============================================================================
// HELPER: FORMAT CURRENCY
// ============================================================================

export function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency
  }).format(amount);
}

// ============================================================================
// HELPER: GET TRANSACTION DISPLAY NAME
// ============================================================================

export function getTransactionDisplayName(type: TransactionType): string {
  const displayNames: Record<TransactionType, string> = {
    chat_spend: 'Chat Message',
    call_spend: 'Voice/Video Call',
    calendar_booking: 'Calendar Booking',
    event_booking: 'Event Booking',
    refund: 'Refund',
    payout: 'Payout',
    deposit: 'Deposit',
    withdrawal: 'Withdrawal',
    tip: 'Tip',
    gift: 'Gift'
  };
  return displayNames[type] || type;
}

export default useWalletRealtime;
