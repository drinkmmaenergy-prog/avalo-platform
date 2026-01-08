/**
 * Phase 26 - Creator Goals & Support Engine
 * Core logic for creator funding goals and supporter tracking
 *
 * IMPORTANT: This module only ADDS new goals functionality.
 * It does NOT modify ANY existing monetization, chat, call, or payout logic.
 */

import { db, serverTimestamp, increment, generateId } from './init';
import {
  CreatorGoal,
  GoalSupport,
  GoalSummary,
  GoalSupporter,
  CreateGoalPayload,
  UpdateGoalPayload,
  SupportGoalPayload,
  SupportGoalResponse,
  GetCreatorGoalsQuery,
  GetCreatorGoalsResponse,
  GetGoalSupportersQuery,
  GetGoalSupportersResponse,
  SuggestGoalDescriptionPayload,
  SuggestGoalDescriptionResponse,
  GOAL_CONSTRAINTS,
  GoalCategory,
  GoalStatus,
} from './types/goals';

// Simple error class for compatibility
class HttpsError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'HttpsError';
  }
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate goal title
 */
function validateTitle(title: string): void {
  if (!title || title.trim().length < GOAL_CONSTRAINTS.TITLE_MIN_LENGTH) {
    throw new HttpsError(
      'invalid-argument',
      `Title must be at least ${GOAL_CONSTRAINTS.TITLE_MIN_LENGTH} characters`
    );
  }
  if (title.length > GOAL_CONSTRAINTS.TITLE_MAX_LENGTH) {
    throw new HttpsError(
      'invalid-argument',
      `Title cannot exceed ${GOAL_CONSTRAINTS.TITLE_MAX_LENGTH} characters`
    );
  }
}

/**
 * Validate goal description
 */
function validateDescription(description: string): void {
  if (!description || description.trim().length < GOAL_CONSTRAINTS.DESCRIPTION_MIN_LENGTH) {
    throw new HttpsError(
      'invalid-argument',
      `Description must be at least ${GOAL_CONSTRAINTS.DESCRIPTION_MIN_LENGTH} characters`
    );
  }
  if (description.length > GOAL_CONSTRAINTS.DESCRIPTION_MAX_LENGTH) {
    throw new HttpsError(
      'invalid-argument',
      `Description cannot exceed ${GOAL_CONSTRAINTS.DESCRIPTION_MAX_LENGTH} characters`
    );
  }
}

/**
 * Validate target tokens
 */
function validateTargetTokens(targetTokens: number): void {
  if (targetTokens < GOAL_CONSTRAINTS.TARGET_MIN_TOKENS) {
    throw new HttpsError(
      'invalid-argument',
      `Target must be at least ${GOAL_CONSTRAINTS.TARGET_MIN_TOKENS} tokens`
    );
  }
  if (targetTokens > GOAL_CONSTRAINTS.TARGET_MAX_TOKENS) {
    throw new HttpsError(
      'invalid-argument',
      `Target cannot exceed ${GOAL_CONSTRAINTS.TARGET_MAX_TOKENS} tokens`
    );
  }
}

/**
 * Check if user can create goals (needs earn enabled)
 */
async function canCreateGoals(userId: string): Promise<boolean> {
  const userRef = db.collection('users').doc(userId);
  const userSnap = await userRef.get();

  if (!userSnap.exists) {
    return false;
  }

  const userData = userSnap.data();
  
  // Check if user has earn enabled
  const earnEnabled = userData?.modes?.earnFromChat || userData?.earnOnChat || false;
  
  // Check account status
  const accountStatus = userData?.accountStatus || 'active';
  const isActive = accountStatus === 'active';

  return earnEnabled && isActive;
}

/**
 * Count active goals for a creator
 */
async function countActiveGoals(creatorId: string): Promise<number> {
  const goalsSnap = await db
    .collection('creatorGoals')
    .where('creatorId', '==', creatorId)
    .where('isActive', '==', true)
    .get();

  return goalsSnap.size;
}

// ============================================================================
// CREATE GOAL
// ============================================================================

/**
 * Create a new creator goal
 */
export async function createGoal(
  userId: string,
  payload: CreateGoalPayload
): Promise<CreatorGoal> {
  // Phase 30A: TrustShield 2.0 - Content Moderation for goal description
  try {
    const { moderateText, logModerationIncident } = await import('./contentModerationEngine');
    
    // Check title and description
    const titleModeration = await moderateText({
      userId,
      text: payload.title,
      source: 'goal_description',
    });
    
    if (titleModeration.actions.includes('BLOCK_CONTENT')) {
      await logModerationIncident({ userId, text: payload.title, source: 'goal_description' }, titleModeration);
      throw new HttpsError('failed-precondition', 'CONTENT_BLOCKED_POLICY_VIOLATION');
    }
    
    if (titleModeration.actions.includes('ALLOW_AND_LOG') || titleModeration.actions.includes('FLAG_FOR_REVIEW')) {
      logModerationIncident({ userId, text: payload.title, source: 'goal_description' }, titleModeration).catch(() => {});
    }
    
    const descModeration = await moderateText({
      userId,
      text: payload.description,
      source: 'goal_description',
    });
    
    if (descModeration.actions.includes('BLOCK_CONTENT')) {
      await logModerationIncident({ userId, text: payload.description, source: 'goal_description' }, descModeration);
      throw new HttpsError('failed-precondition', 'CONTENT_BLOCKED_POLICY_VIOLATION');
    }
    
    if (descModeration.actions.includes('ALLOW_AND_LOG') || descModeration.actions.includes('FLAG_FOR_REVIEW')) {
      logModerationIncident({ userId, text: payload.description, source: 'goal_description' }, descModeration).catch(() => {});
    }
  } catch (error: any) {
    // If it's our policy error, re-throw it
    if (error.name === 'HttpsError' && error.message === 'CONTENT_BLOCKED_POLICY_VIOLATION') {
      throw error;
    }
    // Otherwise, non-blocking
    console.error('Content moderation check failed:', error);
  }
  
  // Validate permissions
  const canCreate = await canCreateGoals(userId);
  if (!canCreate) {
    throw new HttpsError(
      'failed-precondition',
      'You must have earn mode enabled to create goals'
    );
  }

  // Check active goals limit
  const activeCount = await countActiveGoals(userId);
  if (activeCount >= GOAL_CONSTRAINTS.MAX_ACTIVE_GOALS) {
    throw new HttpsError(
      'failed-precondition',
      `You can only have ${GOAL_CONSTRAINTS.MAX_ACTIVE_GOALS} active goals at once`
    );
  }

  // Validate inputs
  validateTitle(payload.title);
  validateDescription(payload.description);
  validateTargetTokens(payload.targetTokens);

  // Validate deadline if provided
  if (payload.deadline) {
    const deadlineDate = new Date(payload.deadline);
    if (deadlineDate <= new Date()) {
      throw new HttpsError('invalid-argument', 'Deadline must be in the future');
    }
  }

  // Create goal
  const goalId = generateId();
  const now = new Date();

  const goal: CreatorGoal = {
    goalId,
    creatorId: userId,
    title: payload.title.trim(),
    description: payload.description.trim(),
    category: payload.category,
    targetTokens: payload.targetTokens,
    currentTokens: 0,
    deadline: payload.deadline ? new Date(payload.deadline) : null,
    createdAt: now,
    updatedAt: now,
    closedAt: null,
    isActive: true,
    status: 'active',
    supportersCount: 0,
    metadata: {},
  };

  await db.collection('creatorGoals').doc(goalId).set({
    ...goal,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return goal;
}

// ============================================================================
// UPDATE GOAL
// ============================================================================

/**
 * Update an existing goal
 */
export async function updateGoal(
  userId: string,
  goalId: string,
  payload: UpdateGoalPayload
): Promise<void> {
  const goalRef = db.collection('creatorGoals').doc(goalId);
  const goalSnap = await goalRef.get();

  if (!goalSnap.exists) {
    throw new HttpsError('not-found', 'Goal not found');
  }

  const goal = goalSnap.data() as CreatorGoal;

  // Check ownership
  if (goal.creatorId !== userId) {
    throw new HttpsError('permission-denied', 'You can only update your own goals');
  }

  // Check if goal is active
  if (!goal.isActive) {
    throw new HttpsError('failed-precondition', 'Cannot update inactive goal');
  }

  // Build updates
  const updates: any = {
    updatedAt: serverTimestamp(),
  };

  if (payload.title !== undefined) {
    validateTitle(payload.title);
    updates.title = payload.title.trim();
  }

  if (payload.description !== undefined) {
    validateDescription(payload.description);
    updates.description = payload.description.trim();
  }

  if (payload.category !== undefined) {
    updates.category = payload.category;
  }

  if (payload.deadline !== undefined) {
    if (payload.deadline) {
      const deadlineDate = new Date(payload.deadline);
      if (deadlineDate <= new Date()) {
        throw new HttpsError('invalid-argument', 'Deadline must be in the future');
      }
      updates.deadline = deadlineDate;
    } else {
      updates.deadline = null;
    }
  }

  // Note: targetTokens cannot be changed after any support is received
  if (goal.currentTokens > 0) {
    // Cannot change target after support received
    if (payload.title === undefined && payload.description === undefined && 
        payload.category === undefined && payload.deadline === undefined) {
      throw new HttpsError(
        'failed-precondition',
        'No valid fields to update'
      );
    }
  }

  await goalRef.update(updates);
}

// ============================================================================
// CLOSE GOAL
// ============================================================================

/**
 * Close a goal (mark as completed or cancelled)
 */
export async function closeGoal(
  userId: string,
  goalId: string
): Promise<void> {
  const goalRef = db.collection('creatorGoals').doc(goalId);
  const goalSnap = await goalRef.get();

  if (!goalSnap.exists) {
    throw new HttpsError('not-found', 'Goal not found');
  }

  const goal = goalSnap.data() as CreatorGoal;

  // Check ownership
  if (goal.creatorId !== userId) {
    throw new HttpsError('permission-denied', 'You can only close your own goals');
  }

  // Check if already closed
  if (!goal.isActive) {
    throw new HttpsError('failed-precondition', 'Goal is already closed');
  }

  // Determine status based on progress
  const status: GoalStatus = 
    goal.currentTokens >= goal.targetTokens ? 'completed' : 'cancelled';

  await goalRef.update({
    isActive: false,
    status,
    closedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

// ============================================================================
// SUPPORT GOAL
// ============================================================================

/**
 * Support a goal with tokens
 */
export async function supportGoal(
  viewerId: string,
  payload: SupportGoalPayload
): Promise<SupportGoalResponse> {
  const { goalId, amountTokens, deviceId, ipHash } = payload;

  // Validate support amount
  if (amountTokens < GOAL_CONSTRAINTS.SUPPORT_MIN_TOKENS) {
    throw new HttpsError(
      'invalid-argument',
      `Minimum support is ${GOAL_CONSTRAINTS.SUPPORT_MIN_TOKENS} tokens`
    );
  }
  if (amountTokens > GOAL_CONSTRAINTS.SUPPORT_MAX_TOKENS) {
    throw new HttpsError(
      'invalid-argument',
      `Maximum support is ${GOAL_CONSTRAINTS.SUPPORT_MAX_TOKENS} tokens`
    );
  }

  // Get goal
  const goalRef = db.collection('creatorGoals').doc(goalId);
  const goalSnap = await goalRef.get();

  if (!goalSnap.exists) {
    throw new HttpsError('not-found', 'Goal not found');
  }

  const goal = goalSnap.data() as CreatorGoal;

  // Check if goal is active
  if (!goal.isActive) {
    throw new HttpsError('failed-precondition', 'This goal is no longer active');
  }

  // Check creator is not supporting their own goal
  if (goal.creatorId === viewerId) {
    throw new HttpsError('failed-precondition', 'You cannot support your own goal');
  }

  // Check viewer account status
  const viewerRef = db.collection('users').doc(viewerId);
  const viewerSnap = await viewerRef.get();

  if (!viewerSnap.exists) {
    throw new HttpsError('not-found', 'User not found');
  }

  const viewerData = viewerSnap.data();
  const accountStatus = viewerData?.accountStatus || 'active';
  if (accountStatus !== 'active') {
    throw new HttpsError('failed-precondition', 'Your account is not active');
  }

  // Check age restriction (18+)
  const isAdult = viewerData?.age >= 18 || viewerData?.age18Plus === true;
  if (!isAdult) {
    throw new HttpsError('failed-precondition', 'You must be 18+ to support goals');
  }

  // Check viewer has sufficient tokens
  const walletRef = db.collection('users').doc(viewerId).collection('wallet').doc('current');
  const walletSnap = await walletRef.get();
  const wallet = walletSnap.exists ? walletSnap.data() : null;
  const balance = wallet?.balance || 0;

  if (balance < amountTokens) {
    throw new HttpsError('failed-precondition', 'Insufficient tokens');
  }

  // Calculate revenue split (70% creator, 30% Avalo)
  const creatorAmount = Math.floor(amountTokens * GOAL_CONSTRAINTS.CREATOR_SPLIT);
  const avaloAmount = amountTokens - creatorAmount;

  // Create support record
  const supportId = generateId();
  const support: GoalSupport = {
    supportId,
    goalId,
    creatorId: goal.creatorId,
    supporterId: viewerId,
    amountTokens,
    creatorReceived: creatorAmount,
    avaloReceived: avaloAmount,
    createdAt: new Date(),
    metadata: { deviceId, ipHash },
  };

  // Execute transaction
  await db.runTransaction(async (transaction) => {
    // Deduct from viewer
    transaction.update(walletRef, {
      balance: increment(-amountTokens),
      lastUpdated: serverTimestamp(),
    });

    // Add to creator earnings
    const creatorWalletRef = db
      .collection('users')
      .doc(goal.creatorId)
      .collection('wallet')
      .doc('current');
    
    const creatorWallet = await transaction.get(creatorWalletRef);
    if (!creatorWallet.exists) {
      transaction.set(creatorWalletRef, {
        balance: creatorAmount,
        earned: creatorAmount,
        lastUpdated: serverTimestamp(),
      });
    } else {
      transaction.update(creatorWalletRef, {
        balance: increment(creatorAmount),
        earned: increment(creatorAmount),
        lastUpdated: serverTimestamp(),
      });
    }

    // Record support
    transaction.set(
      db.collection('goalSupports').doc(supportId),
      {
        ...support,
        createdAt: serverTimestamp(),
      }
    );

    // Update goal statistics
    const currentGoal = await transaction.get(goalRef);
    const currentData = currentGoal.data() as CreatorGoal;
    // Track unique supporters (store in a separate field for counting)
    const supportersRef = db.collection('goalSupporters').doc(`${goalId}_${viewerId}`);
    const supporterExists = await transaction.get(supportersRef);
    const isNewSupporter = !supporterExists.exists;

    if (isNewSupporter) {
      transaction.set(supportersRef, {
        goalId,
        supporterId: viewerId,
        firstSupportAt: serverTimestamp(),
      });
    }

    transaction.update(goalRef, {
      currentTokens: increment(amountTokens),
      supportersCount: isNewSupporter ? increment(1) : goalRef.get(),
      'metadata.lastSupportAt': serverTimestamp(),
      'metadata.firstSupportAt': currentData.currentTokens === 0 ? serverTimestamp() : currentData.metadata?.firstSupportAt,
      updatedAt: serverTimestamp(),
    });

    // Record transaction
    const txId = generateId();
    transaction.set(db.collection('transactions').doc(txId), {
      userId: viewerId,
      type: 'goal_support',
      amount: -amountTokens,
      metadata: {
        goalId,
        creatorId: goal.creatorId,
        supportId,
        creatorReceived: creatorAmount,
        avaloReceived: avaloAmount,
      },
      createdAt: serverTimestamp(),
    });
  });

  // Get updated goal for response
  const updatedGoalSnap = await goalRef.get();
  const updatedGoal = updatedGoalSnap.data() as CreatorGoal;

  // Record ranking action (best effort - don't fail if this fails)
  try {
    const { recordRankingAction } = await import('./rankingEngine');
    await recordRankingAction({
      type: 'tip', // Goals count as tips for ranking
      creatorId: goal.creatorId,
      payerId: viewerId,
      points: amountTokens, // 1 point per token
      tokensAmount: amountTokens,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Failed to record ranking action for goal support:', error);
  }

  // Record risk event (best effort)
  try {
    const { recordRiskEvent } = await import('./trustEngine');
    await recordRiskEvent({
      userId: viewerId,
      eventType: 'chat', // Use 'chat' as closest match for risk tracking
      metadata: {
        goalId,
        creatorId: goal.creatorId,
        amountTokens,
        deviceId,
        ipHash,
      },
    });
  } catch (error) {
    console.error('Failed to record risk event for goal support:', error);
  }

  // Get new balance
  const newWalletSnap = await walletRef.get();
  const newBalance = newWalletSnap.data()?.balance || 0;

  return {
    success: true,
    supportId,
    goalId,
    amountTokens,
    creatorReceived: creatorAmount,
    avaloReceived: avaloAmount,
    newBalance,
    goalProgress: {
      currentTokens: updatedGoal.currentTokens,
      targetTokens: updatedGoal.targetTokens,
      progressPercentage: Math.min(
        100,
        Math.floor((updatedGoal.currentTokens / updatedGoal.targetTokens) * 100)
      ),
    },
  };
}

// ============================================================================
// GET CREATOR GOALS
// ============================================================================

/**
 * Get creator's goals
 */
export async function getCreatorGoals(
  query: GetCreatorGoalsQuery,
  viewerId?: string
): Promise<GetCreatorGoalsResponse> {
  const { creatorId, includeInactive = false, limit = 10, offset = 0 } = query;

  // Build query
  let goalsQuery = db.collection('creatorGoals').where('creatorId', '==', creatorId);

  if (!includeInactive) {
    goalsQuery = goalsQuery.where('isActive', '==', true);
  }

  goalsQuery = goalsQuery.orderBy('createdAt', 'desc').limit(limit).offset(offset);

  const goalsSnap = await goalsQuery.get();

  // Check visibility (account status, blocking)
  const creatorRef = db.collection('users').doc(creatorId);
  const creatorSnap = await creatorRef.get();

  if (!creatorSnap.exists) {
    throw new HttpsError('not-found', 'Creator not found');
  }

  const creatorData = creatorSnap.data();
  const accountStatus = creatorData?.accountStatus || 'active';

  // If viewer is not the creator, check account status
  if (viewerId !== creatorId && accountStatus !== 'active') {
    return {
      goals: [],
      total: 0,
      activeCount: 0,
    };
  }

  // Check if viewer has blocked or been blocked by creator
  if (viewerId && viewerId !== creatorId) {
    // Check blocking (simplified - in production, check blocks collection)
    const blockedByCreator = false; // Implement blocking check
    const blockedCreator = false; // Implement blocking check

    if (blockedByCreator || blockedCreator) {
      return {
        goals: [],
        total: 0,
        activeCount: 0,
      };
    }
  }

  // Build summaries
  const goals: GoalSummary[] = [];
  let activeCount = 0;

  for (const doc of goalsSnap.docs) {
    const goal = doc.data() as CreatorGoal;

    if (goal.isActive) {
      activeCount++;
    }

    const progressPercentage = Math.min(
      100,
      Math.floor((goal.currentTokens / goal.targetTokens) * 100)
    );

    let daysRemaining: number | null = null;
    if (goal.deadline) {
      const now = new Date();
      const deadline = new Date(goal.deadline);
      const diffMs = deadline.getTime() - now.getTime();
      daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    }

    goals.push({
      goalId: goal.goalId,
      creatorId: goal.creatorId,
      title: goal.title,
      category: goal.category,
      targetTokens: goal.targetTokens,
      currentTokens: goal.currentTokens,
      progressPercentage,
      supportersCount: goal.supportersCount,
      daysRemaining,
      status: goal.status,
      isActive: goal.isActive,
    });
  }

  return {
    goals,
    total: goals.length,
    activeCount,
  };
}

// ============================================================================
// GET GOAL SUPPORTERS
// ============================================================================

/**
 * Get goal supporters (top supporters list)
 */
export async function getGoalSupporters(
  query: GetGoalSupportersQuery
): Promise<GetGoalSupportersResponse> {
  const { goalId, limit = 10, offset = 0 } = query;

  // Get all supports for this goal
  const supportsSnap = await db
    .collection('goalSupports')
    .where('goalId', '==', goalId)
    .orderBy('createdAt', 'desc')
    .get();

  // Aggregate by supporter
  const supporterMap = new Map<string, { totalSupport: number; supportCount: number; lastSupportAt: Date }>();

  for (const doc of supportsSnap.docs) {
    const support = doc.data() as GoalSupport;
    const existing = supporterMap.get(support.supporterId) || {
      totalSupport: 0,
      supportCount: 0,
      lastSupportAt: support.createdAt,
    };

    existing.totalSupport += support.amountTokens;
    existing.supportCount += 1;
    if (support.createdAt > existing.lastSupportAt) {
      existing.lastSupportAt = support.createdAt;
    }

    supporterMap.set(support.supporterId, existing);
  }

  // Sort by total support
  const sortedSupporters = Array.from(supporterMap.entries())
    .sort((a, b) => b[1].totalSupport - a[1].totalSupport)
    .slice(offset, offset + limit);

  // Build supporter info
  const supporters: GoalSupporter[] = [];

  for (const [supporterId, data] of sortedSupporters) {
    const userRef = db.collection('users').doc(supporterId);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      continue;
    }

    const userData = userSnap.data();
    const accountStatus = userData?.accountStatus || 'active';
    const isVisible = accountStatus === 'active';

    supporters.push({
      supporterId,
      displayName: isVisible ? (userData?.displayName || userData?.name || 'Anonymous') : 'Anonymous',
      avatar: isVisible ? userData?.avatar || userData?.profilePicture : undefined,
      totalSupport: data.totalSupport,
      supportCount: data.supportCount,
      lastSupportAt: data.lastSupportAt,
      isVisible,
    });
  }

  return {
    supporters,
    total: supporterMap.size,
  };
}

// ============================================================================
// AI DESCRIPTION SUGGESTION
// ============================================================================

/**
 * Suggest a goal description using AI
 */
export async function suggestGoalDescription(
  userId: string,
  payload: SuggestGoalDescriptionPayload
): Promise<SuggestGoalDescriptionResponse> {
  const { title, category, approximateTargetTokens } = payload;

  // Fallback descriptions by category
  const fallbackDescriptions: Record<GoalCategory, string> = {
    equipment: `Chcę zebrać ${approximateTargetTokens} tokenów na nowy sprzęt do tworzenia lepszej jakości treści. Pomóż mi ulepszyć jakość produkcji!`,
    lifestyle: `Zbieram ${approximateTargetTokens} tokenów na pokrycie codziennych wydatków, abym mógł skupić się na tworzeniu treści dla Was. Każde wsparcie się liczy!`,
    travel: `Planuję podróż i potrzebuję ${approximateTargetTokens} tokenów. Chcę pokazać Wam niesamowite miejsca i podzielić się swoimi przygodami!`,
    content: `Zbieram ${approximateTargetTokens} tokenów na produkcję nowych, jeszcze lepszych treści. Pomóżcie mi tworzyć content, który Was zachwyci!`,
    other: `Mam cel: zebrać ${approximateTargetTokens} tokenów na "${title}". Każde wsparcie przybliża mnie do realizacji tego marzenia. Dziękuję!`,
  };

  // Try AI generation (optional - can be implemented later)
  try {
    // For now, use fallback
    // In future, integrate with OpenAI/Anthropic API
    throw new Error('AI not implemented yet');
  } catch (error) {
    // Use fallback
    return {
      suggestedDescription: fallbackDescriptions[category],
      fallback: true,
    };
  }
}
