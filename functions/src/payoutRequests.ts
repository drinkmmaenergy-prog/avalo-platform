/**
 * PACK 83 — Creator Payout Requests & Compliance Layer
 * Cloud Functions for manual payout request system (no auto-withdrawal)
 * 
 * NON-NEGOTIABLE RULES:
 * - Token price per unit remains fixed (config-driven)
 * - Revenue split 65% creator / 35% Avalo (inherited from PACK 81)
 * - No bonuses, no free tokens, no discounts, no promo codes, no cashback
 * - Tokens deducted on payout request are permanent (locked)
 * - Refunds only for REJECTED requests
 * - No refunds on PAID payouts
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, serverTimestamp, increment, generateId } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { PAYOUT_CONFIG } from './config/payouts.config';
import { isUserVerifiedForPayouts } from './kyc';
import { onPayoutRequest } from './moderationCaseHooks';
import { enforceStepUpForPayoutMethod, enforceStepUpForPayoutRequest } from './pack96-twoFactorIntegrations';
import type {
  PayoutMethod,
  PayoutRequest,
  CreatePayoutMethodRequest,
  UpdatePayoutMethodRequest,
  CreatePayoutRequestParams,
  SetPayoutStatusParams,
  GetPayoutMethodsResponse,
  GetPayoutRequestsResponse,
  PayoutConfigResponse,
  validatePayoutMethodDetails,
} from './types/payouts.types';

// ============================================================================
// PAYOUT METHODS MANAGEMENT
// ============================================================================

/**
 * Create or update a payout method
 * Users can only manage their own payout methods
 */
export const payout_createOrUpdateMethod = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ methodId: string }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.auth.uid;
    const data: CreatePayoutMethodRequest | (UpdatePayoutMethodRequest & { userId: string }) = request.data;

    // Security: Users can only create/update their own methods
    if (data.userId !== userId) {
      throw new HttpsError('permission-denied', 'Cannot manage another user\'s payout methods');
    }

    // PACK 96: Step-up verification for payout method creation/modification
    try {
      const isUpdate = 'methodId' in data;
      await enforceStepUpForPayoutMethod(userId, isUpdate);
    } catch (error: any) {
      // Re-throw step-up requirement errors
      throw error;
    }

    try {
      // Check if this is an update or create
      const methodId = 'methodId' in data ? data.methodId : generateId();
      const methodRef = db.collection('payout_methods').doc(methodId);

      if ('methodId' in data) {
        // UPDATE existing method
        const existingDoc = await methodRef.get();
        if (!existingDoc.exists) {
          throw new HttpsError('not-found', 'Payout method not found');
        }

        const existingData = existingDoc.data() as PayoutMethod;
        if (existingData.userId !== userId) {
          throw new HttpsError('permission-denied', 'Cannot update another user\'s payout method');
        }

        const updateData: Partial<PayoutMethod> = {
          updatedAt: serverTimestamp() as Timestamp,
        };

        if (data.displayName) updateData.displayName = data.displayName;
        if (data.details) {
          // Merge details with existing
          updateData.details = { ...existingData.details, ...data.details };
        }
        if (data.isDefault !== undefined) {
          updateData.isDefault = data.isDefault;

          // If setting as default, unset other defaults
          if (data.isDefault) {
            const otherMethods = await db
              .collection('payout_methods')
              .where('userId', '==', userId)
              .where('isDefault', '==', true)
              .get();

            const batch = db.batch();
            otherMethods.docs.forEach((doc) => {
              if (doc.id !== methodId) {
                batch.update(doc.ref, { isDefault: false });
              }
            });
            batch.update(methodRef, updateData);
            await batch.commit();
          } else {
            await methodRef.update(updateData);
          }
        } else {
          await methodRef.update(updateData);
        }

        logger.info(`Updated payout method ${methodId} for user ${userId}`);
      } else {
        // CREATE new method
        const createData = data as CreatePayoutMethodRequest;

        // Validate method type
        if (!PAYOUT_CONFIG.SUPPORTED_PAYOUT_METHODS.includes(createData.type)) {
          throw new HttpsError('invalid-argument', `Unsupported payout method type: ${createData.type}`);
        }

        // Validate currency
        if (!PAYOUT_CONFIG.SUPPORTED_CURRENCIES.includes(createData.currency)) {
          throw new HttpsError('invalid-argument', `Unsupported currency: ${createData.currency}`);
        }

        // Validate details structure based on type
        const { validatePayoutMethodDetails } = await import('./types/payouts.types');
        if (!validatePayoutMethodDetails(createData.type, createData.details)) {
          throw new HttpsError('invalid-argument', `Invalid details for method type: ${createData.type}`);
        }

        // Check max methods per user
        const existingMethods = await db
          .collection('payout_methods')
          .where('userId', '==', userId)
          .get();

        if (existingMethods.size >= PAYOUT_CONFIG.MAX_PAYOUT_METHODS_PER_USER) {
          throw new HttpsError(
            'failed-precondition',
            `Maximum ${PAYOUT_CONFIG.MAX_PAYOUT_METHODS_PER_USER} payout methods allowed per user`
          );
        }

        const isDefault = createData.isDefault ?? existingMethods.empty;

        const newMethod: Omit<PayoutMethod, 'id'> = {
          userId,
          type: createData.type,
          displayName: createData.displayName,
          currency: createData.currency,
          details: createData.details,
          isDefault,
          createdAt: serverTimestamp() as Timestamp,
          updatedAt: serverTimestamp() as Timestamp,
        };

        // If setting as default, unset other defaults
        if (isDefault && !existingMethods.empty) {
          const batch = db.batch();
          existingMethods.docs.forEach((doc) => {
            batch.update(doc.ref, { isDefault: false });
          });
          batch.set(methodRef, newMethod);
          await batch.commit();
        } else {
          await methodRef.set(newMethod);
        }

        logger.info(`Created payout method ${methodId} for user ${userId}`, { type: createData.type });
      }

      return { methodId };
    } catch (error: any) {
      logger.error('Error creating/updating payout method', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', `Failed to save payout method: ${error.message}`);
    }
  }
);

/**
 * Get all payout methods for a user
 */
export const payout_getMethods = onCall(
  { region: 'europe-west3' },
  async (request): Promise<GetPayoutMethodsResponse> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.data.userId || request.auth.uid;

    // Security: Users can only view their own methods
    if (userId !== request.auth.uid) {
      throw new HttpsError('permission-denied', 'Cannot access another user\'s payout methods');
    }

    try {
      const methodsSnapshot = await db
        .collection('payout_methods')
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .get();

      const methods: PayoutMethod[] = methodsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as PayoutMethod[];

      return { methods };
    } catch (error: any) {
      logger.error('Error fetching payout methods', error);
      throw new HttpsError('internal', `Failed to fetch payout methods: ${error.message}`);
    }
  }
);

/**
 * Delete a payout method
 */
export const payout_deleteMethod = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ success: boolean }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.auth.uid;
    const { methodId } = request.data;

    if (!methodId) {
      throw new HttpsError('invalid-argument', 'Method ID is required');
    }

    try {
      const methodRef = db.collection('payout_methods').doc(methodId);
      const methodDoc = await methodRef.get();

      if (!methodDoc.exists) {
        throw new HttpsError('not-found', 'Payout method not found');
      }

      const methodData = methodDoc.data() as PayoutMethod;
      if (methodData.userId !== userId) {
        throw new HttpsError('permission-denied', 'Cannot delete another user\'s payout method');
      }

      // Check if method is used in pending requests
      const pendingRequests = await db
        .collection('payout_requests')
        .where('methodId', '==', methodId)
        .where('status', 'in', ['PENDING', 'UNDER_REVIEW', 'APPROVED'])
        .limit(1)
        .get();

      if (!pendingRequests.empty) {
        throw new HttpsError(
          'failed-precondition',
          'Cannot delete method with pending payout requests'
        );
      }

      await methodRef.delete();
      logger.info(`Deleted payout method ${methodId} for user ${userId}`);

      return { success: true };
    } catch (error: any) {
      logger.error('Error deleting payout method', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', `Failed to delete payout method: ${error.message}`);
    }
  }
);

// ============================================================================
// PAYOUT REQUEST CREATION
// ============================================================================

/**
 * Create a payout request
 * This locks the requested tokens immediately in a transaction
 *
 * PACK 84: KYC verification required before payout requests
 */
export const payout_createRequest = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ requestId: string }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.auth.uid;
    const params: CreatePayoutRequestParams = request.data;

    // Security: Users can only create requests for themselves
    if (params.userId !== userId) {
      throw new HttpsError('permission-denied', 'Cannot create payout request for another user');
    }

    try {
      // PACK 96: Step-up verification for payout requests
      await enforceStepUpForPayoutRequest(userId);

      // PACK 84: KYC GATING - User must be verified to request payouts
      const isVerified = await isUserVerifiedForPayouts(userId);
      if (!isVerified) {
        throw new HttpsError(
          'failed-precondition',
          'KYC verification required to request payouts',
          { code: 'KYC_REQUIRED' }
        );
      }

      // Validate method exists and belongs to user
      const methodRef = db.collection('payout_methods').doc(params.methodId);
      const methodDoc = await methodRef.get();

      if (!methodDoc.exists) {
        throw new HttpsError('not-found', 'Payout method not found');
      }

      const method = methodDoc.data() as PayoutMethod;
      if (method.userId !== userId) {
        throw new HttpsError('permission-denied', 'Cannot use another user\'s payout method');
      }

      // Validate requested amount
      if (params.requestedTokens < PAYOUT_CONFIG.MIN_PAYOUT_TOKENS) {
        throw new HttpsError(
          'invalid-argument',
          `Minimum payout is ${PAYOUT_CONFIG.MIN_PAYOUT_TOKENS} tokens`
        );
      }

      if (params.requestedTokens <= 0 || !Number.isInteger(params.requestedTokens)) {
        throw new HttpsError('invalid-argument', 'Invalid token amount');
      }

      // Calculate fiat amount
      const requestedFiat = params.requestedTokens * PAYOUT_CONFIG.PAYOUT_TOKEN_TO_EUR_RATE;

      // Create request and lock tokens in a transaction
      const requestId = generateId();
      const balanceRef = db.collection('creator_balances').doc(userId);

      await db.runTransaction(async (transaction) => {
        const balanceDoc = await transaction.get(balanceRef);

        if (!balanceDoc.exists) {
          throw new HttpsError('failed-precondition', 'No creator balance found');
        }

        const balance = balanceDoc.data();
        const availableTokens = balance?.availableTokens || 0;

        // Validate sufficient balance
        if (availableTokens < params.requestedTokens) {
          throw new HttpsError(
            'failed-precondition',
            `Insufficient balance. Available: ${availableTokens} tokens, Requested: ${params.requestedTokens} tokens`
          );
        }

        // Create payout request
        const payoutRequest: Omit<PayoutRequest, 'id'> = {
          userId,
          methodId: params.methodId,
          status: 'PENDING',
          requestedTokens: params.requestedTokens,
          requestedFiat,
          currency: method.currency,
          tokenToFiatRate: PAYOUT_CONFIG.PAYOUT_TOKEN_TO_EUR_RATE,
          createdAt: serverTimestamp() as Timestamp,
          updatedAt: serverTimestamp() as Timestamp,
          metadata: {
            balanceBeforeRequest: availableTokens,
            balanceAfterRequest: availableTokens - params.requestedTokens,
          },
        };

        const requestRef = db.collection('payout_requests').doc(requestId);
        transaction.set(requestRef, payoutRequest);

        // Lock tokens by decreasing available balance
        transaction.update(balanceRef, {
          availableTokens: increment(-params.requestedTokens),
          updatedAt: serverTimestamp(),
        });
      });

      logger.info(`Created payout request ${requestId} for user ${userId}`, {
        requestedTokens: params.requestedTokens,
        requestedFiat,
        currency: method.currency,
      });

      // PACK 88: Create moderation case
      try {
        await onPayoutRequest(userId, requestId, params.requestedTokens, requestedFiat);
      } catch (error) {
        logger.error('Failed to create moderation case for payout request:', error);
        // Don't fail the request if case creation fails
      }

      return { requestId };
    } catch (error: any) {
      logger.error('Error creating payout request', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', `Failed to create payout request: ${error.message}`);
    }
  }
);

// ============================================================================
// PAYOUT REQUEST STATUS MANAGEMENT (ADMIN ONLY)
// ============================================================================

/**
 * Update payout request status (admin only)
 * Handles refunds for rejected requests
 */
export const payout_setStatus = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ success: boolean }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    // TODO: Add admin role check when admin system is implemented
    // For now, this function exists but should only be called by backend/admin tools
    const reviewerId = request.auth.uid;
    const params: SetPayoutStatusParams = request.data;

    try {
      const requestRef = db.collection('payout_requests').doc(params.requestId);
      const requestDoc = await requestRef.get();

      if (!requestDoc.exists) {
        throw new HttpsError('not-found', 'Payout request not found');
      }

      const payoutRequest = requestDoc.data() as PayoutRequest;

      // Validate status transition
      const currentStatus = payoutRequest.status;
      const allowedTransitions = PAYOUT_CONFIG.ALLOWED_STATUS_TRANSITIONS[currentStatus] as readonly string[];

      if (!allowedTransitions.includes(params.newStatus)) {
        throw new HttpsError(
          'failed-precondition',
          `Invalid status transition from ${currentStatus} to ${params.newStatus}`
        );
      }

      // Handle rejection - refund locked tokens
      if (params.newStatus === 'REJECTED') {
        if (!params.rejectionReason) {
          throw new HttpsError('invalid-argument', 'Rejection reason is required');
        }

        const balanceRef = db.collection('creator_balances').doc(payoutRequest.userId);

        await db.runTransaction(async (transaction) => {
          // Update request status
          transaction.update(requestRef, {
            status: 'REJECTED',
            reviewedAt: serverTimestamp(),
            reviewerId,
            rejectionReason: params.rejectionReason,
            notes: params.notes || null,
            updatedAt: serverTimestamp(),
          });

          // Refund tokens to available balance
          transaction.update(balanceRef, {
            availableTokens: increment(payoutRequest.requestedTokens),
            updatedAt: serverTimestamp(),
          });
        });

        logger.info(`Rejected payout request ${params.requestId} and refunded ${payoutRequest.requestedTokens} tokens`, {
          userId: payoutRequest.userId,
          reason: params.rejectionReason,
        });
      } else {
        // Other status updates (no refund)
        const updateData: Partial<PayoutRequest> = {
          status: params.newStatus as any,
          updatedAt: serverTimestamp() as Timestamp,
        };

        if (params.newStatus !== 'PENDING') {
          updateData.reviewedAt = serverTimestamp() as Timestamp;
          updateData.reviewerId = reviewerId;
        }

        if (params.notes) {
          updateData.notes = params.notes;
        }

        await requestRef.update(updateData);

        logger.info(`Updated payout request ${params.requestId} to ${params.newStatus}`, {
          userId: payoutRequest.userId,
          reviewerId,
        });
      }

      return { success: true };
    } catch (error: any) {
      logger.error('Error updating payout request status', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', `Failed to update payout request: ${error.message}`);
    }
  }
);

// ============================================================================
// PAYOUT REQUEST QUERIES
// ============================================================================

/**
 * Get payout requests for a user
 */
export const payout_getRequests = onCall(
  { region: 'europe-west3' },
  async (request): Promise<GetPayoutRequestsResponse> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.data.userId || request.auth.uid;

    // Security: Users can only view their own requests
    if (userId !== request.auth.uid) {
      throw new HttpsError('permission-denied', 'Cannot access another user\'s payout requests');
    }

    const limit = Math.min(request.data.limit || 50, 100);
    const pageToken = request.data.pageToken;

    try {
      let query = db
        .collection('payout_requests')
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc');

      // Handle pagination
      if (pageToken) {
        const tokenDoc = await db.collection('payout_requests').doc(pageToken).get();
        if (tokenDoc.exists) {
          query = query.startAfter(tokenDoc);
        }
      }

      // Fetch one extra to determine if there are more
      const snapshot = await query.limit(limit + 1).get();

      const requests: PayoutRequest[] = [];
      let hasMore = false;
      let nextPageToken: string | undefined;

      snapshot.docs.forEach((doc, index) => {
        if (index < limit) {
          requests.push({ id: doc.id, ...doc.data() } as PayoutRequest);
        } else {
          hasMore = true;
          nextPageToken = doc.id;
        }
      });

      // Get total count
      const countSnapshot = await db
        .collection('payout_requests')
        .where('userId', '==', userId)
        .count()
        .get();

      return {
        requests,
        total: countSnapshot.data().count,
        hasMore,
        nextPageToken,
      };
    } catch (error: any) {
      logger.error('Error fetching payout requests', error);
      throw new HttpsError('internal', `Failed to fetch payout requests: ${error.message}`);
    }
  }
);

// ============================================================================
// PAYOUT CONFIGURATION
// ============================================================================

/**
 * Get payout configuration (read-only)
 */
export const payout_getConfig = onCall(
  { region: 'europe-west3' },
  async (request): Promise<PayoutConfigResponse> => {
    // No authentication required - this is public config
    return {
      minPayoutTokens: PAYOUT_CONFIG.MIN_PAYOUT_TOKENS,
      tokenToEurRate: PAYOUT_CONFIG.PAYOUT_TOKEN_TO_EUR_RATE,
      supportedMethods: [...PAYOUT_CONFIG.SUPPORTED_PAYOUT_METHODS],
      supportedCurrencies: [...PAYOUT_CONFIG.SUPPORTED_CURRENCIES],
    };
  }
);