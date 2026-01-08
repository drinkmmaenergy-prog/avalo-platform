/**
 * PACK 75 - Call Billing Engine
 * 
 * Handles per-minute billing for voice & video calls
 * Charges caller, pays creator (earner) with 65/35 split
 * 
 * NO FREE CALLS - all calls are paid, insufficient funds = graceful termination
 */

import { db, serverTimestamp } from './init.js';
import { Timestamp } from 'firebase-admin/firestore';
import { logEvent } from './observability.js';

interface CallSession {
  callId: string;
  callerUserId: string;
  calleeUserId: string;
  mode: 'VOICE' | 'VIDEO';
  tokensPerMinute: number;
  startedAt: Timestamp | null;
  endedAt: Timestamp | null;
  billedMinutes: number;
  totalTokensCharged: number;
  billingStatus: 'PENDING' | 'CHARGED' | 'FAILED' | 'PARTIALLY_CHARGED';
}

/**
 * Revenue split constants (65/35)
 * Matches existing platform split for PPM/chat
 */
const EARNER_SPLIT = 0.65;  // 65% to callee (creator/earner)
const AVALO_SPLIT = 0.35;   // 35% to Avalo

/**
 * Bill a completed call session
 * Charges caller's wallet, credits callee's earnings wallet
 */
export async function billCall(callId: string): Promise<void> {
  try {
    // Load call session
    const callDoc = await db.collection('call_sessions').doc(callId).get();
    
    if (!callDoc.exists) {
      throw new Error(`Call session ${callId} not found`);
    }

    const callData = callDoc.data() as CallSession;

    // Check if already billed
    if (callData.billingStatus === 'CHARGED' || callData.billingStatus === 'PARTIALLY_CHARGED') {
      console.log(`Call ${callId} already billed, skipping`);
      return;
    }

    // Validate call has started and ended
    if (!callData.startedAt || !callData.endedAt) {
      throw new Error(`Call ${callId} missing start or end time`);
    }

    // Calculate duration in seconds
    const startSeconds = callData.startedAt.toMillis() / 1000;
    const endSeconds = callData.endedAt.toMillis() / 1000;
    const durationSeconds = Math.max(0, endSeconds - startSeconds);

    // Calculate billable minutes (round up)
    const billedMinutes = Math.ceil(durationSeconds / 60);

    // Calculate required tokens
    const requiredTokens = billedMinutes * callData.tokensPerMinute;

    if (requiredTokens === 0) {
      // Call was too short (< 1 minute)
      await db.collection('call_sessions').doc(callId).update({
        billedMinutes: 0,
        totalTokensCharged: 0,
        billingStatus: 'CHARGED',
        lastUpdatedAt: serverTimestamp()
      });
      return;
    }

    // Fetch caller's wallet balance
    const callerWalletDoc = await db.collection('user_wallets').doc(callData.callerUserId).get();
    
    if (!callerWalletDoc.exists) {
      throw new Error(`Caller wallet ${callData.callerUserId} not found`);
    }

    const callerBalance = callerWalletDoc.data()?.tokenBalance || 0;

    // Perform billing transaction
    await db.runTransaction(async (transaction) => {
      // Re-read call session to ensure no concurrent billing
      const callDocInTxn = await transaction.get(db.collection('call_sessions').doc(callId));
      const callDataInTxn = callDocInTxn.data() as CallSession;

      if (callDataInTxn.billingStatus !== 'PENDING') {
        console.log(`Call ${callId} billing status changed, aborting transaction`);
        return;
      }

      let actualTokensCharged: number;
      let actualBilledMinutes: number;
      let finalBillingStatus: 'CHARGED' | 'PARTIALLY_CHARGED' | 'FAILED';

      if (callerBalance >= requiredTokens) {
        // Full charge
        actualTokensCharged = requiredTokens;
        actualBilledMinutes = billedMinutes;
        finalBillingStatus = 'CHARGED';

        // Deduct from caller
        transaction.update(db.collection('user_wallets').doc(callData.callerUserId), {
          tokenBalance: callerBalance - requiredTokens,
          lastUpdatedAt: serverTimestamp()
        });

        // Calculate earnings split
        const earnerAmount = Math.floor(requiredTokens * EARNER_SPLIT);
        const avaloAmount = requiredTokens - earnerAmount;

        // Credit callee's earnings wallet
        const calleeWalletRef = db.collection('user_wallets').doc(callData.calleeUserId);
        const calleeWalletDoc = await transaction.get(calleeWalletRef);
        
        if (calleeWalletDoc.exists) {
          const currentEarnings = calleeWalletDoc.data()?.earningsBalance || 0;
          transaction.update(calleeWalletRef, {
            earningsBalance: currentEarnings + earnerAmount,
            lastUpdatedAt: serverTimestamp()
          });
        } else {
          transaction.set(calleeWalletRef, {
            userId: callData.calleeUserId,
            earningsBalance: earnerAmount,
            tokenBalance: 0,
            createdAt: serverTimestamp(),
            lastUpdatedAt: serverTimestamp()
          });
        }

        // Log successful billing
        await logEvent({
          level: 'INFO',
          source: 'BACKEND',
          service: 'functions.calls',
          module: 'CALL_BILLING',
          message: `Call billed successfully: ${billedMinutes} minutes, ${requiredTokens} tokens`,
          context: {
            userId: callData.callerUserId,
            functionName: 'billCall'
          },
          details: {
            extra: {
              callId,
              billedMinutes,
              tokensCharged: requiredTokens,
              earnerAmount,
              avaloAmount
            }
          }
        });

      } else if (callerBalance > 0) {
        // Partial charge - use available balance
        actualTokensCharged = callerBalance;
        actualBilledMinutes = Math.floor(callerBalance / callData.tokensPerMinute);
        finalBillingStatus = 'PARTIALLY_CHARGED';

        // Deduct all available balance
        transaction.update(db.collection('user_wallets').doc(callData.callerUserId), {
          tokenBalance: 0,
          lastUpdatedAt: serverTimestamp()
        });

        // Calculate earnings split on partial charge
        const earnerAmount = Math.floor(actualTokensCharged * EARNER_SPLIT);

        // Credit callee's earnings wallet
        const calleeWalletRef = db.collection('user_wallets').doc(callData.calleeUserId);
        const calleeWalletDoc = await transaction.get(calleeWalletRef);
        
        if (calleeWalletDoc.exists) {
          const currentEarnings = calleeWalletDoc.data()?.earningsBalance || 0;
          transaction.update(calleeWalletRef, {
            earningsBalance: currentEarnings + earnerAmount,
            lastUpdatedAt: serverTimestamp()
          });
        } else {
          transaction.set(calleeWalletRef, {
            userId: callData.calleeUserId,
            earningsBalance: earnerAmount,
            tokenBalance: 0,
            createdAt: serverTimestamp(),
            lastUpdatedAt: serverTimestamp()
          });
        }

        // Log partial billing
        await logEvent({
          level: 'WARN',
          source: 'BACKEND',
          service: 'functions.calls',
          module: 'CALL_BILLING',
          message: `Call partially billed: insufficient funds`,
          context: {
            userId: callData.callerUserId,
            functionName: 'billCall'
          },
          details: {
            extra: {
              callId,
              requestedMinutes: billedMinutes,
              billedMinutes: actualBilledMinutes,
              requestedTokens: requiredTokens,
              availableTokens: callerBalance,
              tokensCharged: actualTokensCharged
            }
          }
        });

      } else {
        // No balance - billing failed
        actualTokensCharged = 0;
        actualBilledMinutes = 0;
        finalBillingStatus = 'FAILED';

        // Log billing failure
        await logEvent({
          level: 'ERROR',
          source: 'BACKEND',
          service: 'functions.calls',
          module: 'CALL_BILLING',
          message: `Call billing failed: zero balance`,
          context: {
            userId: callData.callerUserId,
            functionName: 'billCall'
          },
          details: {
            extra: {
              callId,
              requestedMinutes: billedMinutes,
              requestedTokens: requiredTokens
            }
          }
        });
      }

      // Update call session with billing results
      transaction.update(db.collection('call_sessions').doc(callId), {
        billedMinutes: actualBilledMinutes,
        totalTokensCharged: actualTokensCharged,
        billingStatus: finalBillingStatus,
        lastUpdatedAt: serverTimestamp()
      });
    });

  } catch (error: any) {
    // Log error
    await logEvent({
      level: 'ERROR',
      source: 'BACKEND',
      service: 'functions.calls',
      module: 'CALL_BILLING',
      message: `Call billing error: ${error.message}`,
      details: {
        stackSnippet: error.stack?.split('\n').slice(0, 10).join('\n'),
        extra: { callId }
      }
    });

    throw error;
  }
}

/**
 * Check if user has sufficient balance for a call
 * Used before starting a call
 */
export async function checkCallBalance(
  userId: string,
  tokensPerMinute: number,
  minimumMinutes: number = 1
): Promise<{ sufficient: boolean; balance: number; required: number }> {
  try {
    const walletDoc = await db.collection('user_wallets').doc(userId).get();
    
    const balance = walletDoc.exists ? (walletDoc.data()?.tokenBalance || 0) : 0;
    const required = tokensPerMinute * minimumMinutes;

    return {
      sufficient: balance >= required,
      balance,
      required
    };
  } catch (error) {
    console.error('Error checking call balance:', error);
    return {
      sufficient: false,
      balance: 0,
      required: tokensPerMinute * minimumMinutes
    };
  }
}