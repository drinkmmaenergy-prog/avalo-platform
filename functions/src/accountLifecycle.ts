/**
 * Account Lifecycle Management for Avalo
 *
 * Implements:
 * - Account suspension (pause account)
 * - Soft deletion (delete but remember preferences)
 * - Hard deletion (permanent deletion with safeguards)
 * - Profile template system for reactivation
 * - Status-based visibility controls
 *
 * IMPORTANT: All changes are additive-only. Does NOT modify existing
 * monetization logic, pricing, or Earn-to-Chat rules.
 */

import { db, serverTimestamp, generateId } from './init.js';
import { canWithdraw, getUserRiskProfile } from './trustEngine.js';
import { getPendingWithdrawals } from './payouts.js';

// Simple logger (no-op for now, can be replaced with actual logger later)
const logger = {
  info: (..._args: any[]) => {},
  warn: (..._args: any[]) => {},
  error: (..._args: any[]) => {},
};

// ============================================================================
// TYPES
// ============================================================================

export type AccountStatus = 'active' | 'suspended' | 'deleted_soft' | 'deleted_hard';

export interface AccountStatusUpdate {
  status: AccountStatus;
  suspendedAt?: any; // Timestamp
  deletedAt?: any; // Timestamp
  reason?: string;
  updatedBy?: string;
}

export interface ProfileTemplate {
  templateId: string;
  userId: string;
  
  // Non-personal behavioral preferences only
  preferences: {
    gender?: string;
    orientation?: string[];
    seekingGender?: string[];
    ageRangeMin?: number;
    ageRangeMax?: number;
    searchRadiusKm?: number | 'country';
    language?: string;
    
    // Mode preferences
    earnOnChat?: boolean;
    incognito?: boolean;
    passport?: boolean;
    
    // Notification preferences
    notifications?: {
      messages?: boolean;
      likes?: boolean;
      matches?: boolean;
      calls?: boolean;
      bookings?: boolean;
    };
  };
  
  createdAt: any; // Timestamp
  updatedAt: any; // Timestamp
  lastUsedAt?: any; // Timestamp
}

export interface DeletionBlocker {
  blocked: boolean;
  reasons: string[];
  details?: {
    activeEscrows?: number;
    pendingBookings?: number;
    pendingWithdrawals?: number;
    totalEscrowTokens?: number;
  };
}

// ============================================================================
// ACCOUNT SUSPENSION (PAUSE)
// ============================================================================

/**
 * Suspend (pause) user account
 * 
 * Effects:
 * - User hidden from discovery/swipe/search
 * - Cannot receive new chats, calls, bookings
 * - Existing balances and earnings preserved
 * - Can reactivate anytime
 */
export async function suspendAccount(
  userId: string,
  reason?: string
): Promise<{ success: boolean; message: string }> {
  
  const userRef = db.collection('users').doc(userId);
  const userSnap = await userRef.get();
  
  if (!userSnap.exists) {
    throw new Error('User not found');
  }
  
  const userData = userSnap.data();
  const currentStatus = userData?.accountStatus?.status || 'active';
  
  // Can't suspend if already deleted
  if (currentStatus === 'deleted_soft' || currentStatus === 'deleted_hard') {
    throw new Error('Cannot suspend deleted account');
  }
  
  // Update user status
  const statusUpdate: AccountStatusUpdate = {
    status: 'suspended',
    suspendedAt: serverTimestamp(),
    reason,
    updatedBy: userId
  };
  
  await userRef.update({
    'accountStatus': statusUpdate,
    updatedAt: serverTimestamp()
  });
  
  logger.info(`Account suspended: ${userId}`);
  
  return {
    success: true,
    message: 'Account paused successfully. You are now hidden from discovery.'
  };
}

/**
 * Reactivate suspended account
 */
export async function reactivateAccount(
  userId: string
): Promise<{ success: boolean; message: string }> {
  
  const userRef = db.collection('users').doc(userId);
  const userSnap = await userRef.get();
  
  if (!userSnap.exists) {
    throw new Error('User not found');
  }
  
  const userData = userSnap.data();
  const currentStatus = userData?.accountStatus?.status;
  
  // Can only reactivate suspended accounts
  if (currentStatus !== 'suspended') {
    throw new Error('Account is not suspended');
  }
  
  // Restore to active status
  const statusUpdate: AccountStatusUpdate = {
    status: 'active',
    updatedBy: userId
  };
  
  await userRef.update({
    'accountStatus': statusUpdate,
    'accountStatus.suspendedAt': null,
    updatedAt: serverTimestamp()
  });
  
  logger.info(`Account reactivated: ${userId}`);
  
  return {
    success: true,
    message: 'Account reactivated! You are now visible in discovery.'
  };
}

// ============================================================================
// SOFT DELETION (WITH TEMPLATE)
// ============================================================================

/**
 * Soft delete account but save profile template for future use
 * 
 * This stores ONLY non-personal preferences:
 * - Gender/orientation preferences
 * - Search settings
 * - Mode preferences (earnOnChat, incognito, etc.)
 * - Notification settings
 * 
 * Does NOT store:
 * - Photos, name, bio, email, phone
 * - Real location, documents, verification data
 * - Any personally identifiable information
 */
export async function softDeleteAccount(
  userId: string,
  savePreferences: boolean = true
): Promise<{ success: boolean; message: string; templateSaved: boolean }> {
  
  const userRef = db.collection('users').doc(userId);
  const userSnap = await userRef.get();
  
  if (!userSnap.exists) {
    throw new Error('User not found');
  }
  
  const userData = userSnap.data();
  
  // Check if can delete (no active escrows, bookings, withdrawals)
  const blocker = await checkDeletionBlockers(userId);
  if (blocker.blocked) {
    throw new Error(
      `Cannot delete account: ${blocker.reasons.join(', ')}. ` +
      'Please close active chats and complete pending withdrawals first.'
    );
  }
  
  let templateSaved = false;
  
  // Save profile template if requested
  if (savePreferences) {
    await saveProfileTemplate(userId, userData);
    templateSaved = true;
  }
  
  // Update status to soft deleted
  const statusUpdate: AccountStatusUpdate = {
    status: 'deleted_soft',
    deletedAt: serverTimestamp(),
    reason: 'user_requested_soft_delete',
    updatedBy: userId
  };
  
  await userRef.update({
    'accountStatus': statusUpdate,
    
    // Clear personal data but keep user doc for template reference
    displayName: 'Deleted User',
    bio: '',
    photos: [],
    email: null,
    phone: null,
    
    updatedAt: serverTimestamp()
  });
  
  logger.info(`Account soft deleted: ${userId}, template saved: ${templateSaved}`);
  
  return {
    success: true,
    message: templateSaved 
      ? 'Account deleted. Your preferences have been saved for when you return.'
      : 'Account deleted.',
    templateSaved
  };
}

/**
 * Save profile template (non-personal preferences only)
 */
async function saveProfileTemplate(
  userId: string,
  userData: any
): Promise<void> {
  
  const templateRef = db.collection('profileTemplates').doc(userId);
  
  const template: Partial<ProfileTemplate> = {
    templateId: userId,
    userId,
    preferences: {
      gender: userData.gender || undefined,
      orientation: userData.orientation || undefined,
      seekingGender: userData.seeking || undefined,
      ageRangeMin: userData.preferences?.ageMin || undefined,
      ageRangeMax: userData.preferences?.ageMax || undefined,
      searchRadiusKm: userData.searchAreaKm || undefined,
      language: userData.language || 'en',
      
      // Mode preferences
      earnOnChat: userData.modes?.earnFromChat || false,
      incognito: userData.modes?.incognito || false,
      passport: userData.modes?.passport || false,
      
      // Notification preferences (if they exist)
      notifications: userData.notificationSettings || undefined,
    },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  
  await templateRef.set(template, { merge: true });
  
  logger.info(`Profile template saved for user: ${userId}`);
}

/**
 * Load profile template for returning user
 */
export async function loadProfileTemplate(
  userId: string
): Promise<ProfileTemplate | null> {
  
  const templateRef = db.collection('profileTemplates').doc(userId);
  const templateSnap = await templateRef.get();
  
  if (!templateSnap.exists) {
    return null;
  }
  
  // Update last used timestamp
  await templateRef.update({
    lastUsedAt: serverTimestamp()
  });
  
  return templateSnap.data() as ProfileTemplate;
}

// ============================================================================
// HARD DELETION (PERMANENT)
// ============================================================================

/**
 * Permanently delete account
 * 
 * Only allowed if:
 * - No active escrows
 * - No pending bookings
 * - No pending withdrawals
 * 
 * Removes:
 * - User document (or anonymizes it)
 * - Profile template
 * - Follows existing safety/compliance patterns
 */
export async function hardDeleteAccount(
  userId: string
): Promise<{ success: boolean; message: string }> {
  
  const userRef = db.collection('users').doc(userId);
  const userSnap = await userRef.get();
  
  if (!userSnap.exists) {
    throw new Error('User not found');
  }
  
  // Check deletion blockers
  const blocker = await checkDeletionBlockers(userId);
  if (blocker.blocked) {
    throw new Error(
      `Cannot delete account permanently: ${blocker.reasons.join(', ')}. ` +
      `Details: ${JSON.stringify(blocker.details)}`
    );
  }
  
  // Mark as hard deleted
  const statusUpdate: AccountStatusUpdate = {
    status: 'deleted_hard',
    deletedAt: serverTimestamp(),
    reason: 'user_requested_hard_delete',
    updatedBy: userId
  };
  
  await userRef.update({
    'accountStatus': statusUpdate,
    
    // Anonymize all personal data
    displayName: 'Deleted User',
    email: null,
    phone: null,
    bio: '',
    photos: [],
    dob: null,
    location: null,
    instagram: null,
    
    updatedAt: serverTimestamp()
  });
  
  // Delete profile template if exists
  const templateRef = db.collection('profileTemplates').doc(userId);
  try {
    await templateRef.delete();
  } catch (error) {
    // Template might not exist, that's okay
    logger.info(`No template to delete for user: ${userId}`);
  }
  
  logger.info(`Account hard deleted: ${userId}`);
  
  return {
    success: true,
    message: 'Account permanently deleted. All your data has been removed.'
  };
}

// ============================================================================
// DELETION BLOCKERS
// ============================================================================

/**
 * Check if user can delete account
 * Blocks deletion if there are:
 * - Active chat escrows
 * - Pending calendar bookings
 * - Pending withdrawal requests
 */
export async function checkDeletionBlockers(
  userId: string
): Promise<DeletionBlocker> {
  
  const reasons: string[] = [];
  const details: any = {};
  
  // Check active chat escrows
  const activeChatsSnap = await db.collection('chats')
    .where('participants', 'array-contains', userId)
    .where('state', 'in', ['FREE_ACTIVE', 'PAID_ACTIVE', 'AWAITING_DEPOSIT'])
    .get();
  
  let totalEscrow = 0;
  for (const chatDoc of activeChatsSnap.docs) {
    const chat = chatDoc.data();
    if (chat.roles?.payerId === userId) {
      totalEscrow += chat.billing?.escrowBalance || 0;
    }
  }
  
  if (activeChatsSnap.size > 0) {
    reasons.push(`${activeChatsSnap.size} active chat(s)`);
    details.activeEscrows = activeChatsSnap.size;
    details.totalEscrowTokens = totalEscrow;
  }
  
  // Check pending bookings
  const pendingBookingsSnap = await db.collection('bookings')
    .where('status', 'in', ['pending', 'confirmed', 'in_progress'])
    .get();
  
  const userBookings = pendingBookingsSnap.docs.filter(doc => {
    const booking = doc.data();
    return booking.bookerId === userId || booking.creatorId === userId;
  });
  
  if (userBookings.length > 0) {
    reasons.push(`${userBookings.length} pending booking(s)`);
    details.pendingBookings = userBookings.length;
  }
  
  // Check pending withdrawals
  const pendingWithdrawals = await getPendingWithdrawals(50);
  const userWithdrawals = pendingWithdrawals.filter(w => w.userId === userId);
  
  if (userWithdrawals.length > 0) {
    reasons.push(`${userWithdrawals.length} pending withdrawal(s)`);
    details.pendingWithdrawals = userWithdrawals.length;
  }
  
  return {
    blocked: reasons.length > 0,
    reasons,
    details: reasons.length > 0 ? details : undefined
  };
}

// ============================================================================
// ACCOUNT STATUS CHECKS
// ============================================================================

/**
 * Check if user account is active (can use the app normally)
 */
export async function isAccountActive(userId: string): Promise<boolean> {
  const userSnap = await db.collection('users').doc(userId).get();
  
  if (!userSnap.exists) {
    return false;
  }
  
  const userData = userSnap.data();
  const status = userData?.accountStatus?.status || 'active';
  
  return status === 'active';
}

/**
 * Check if user is visible in discovery/swipe/search
 */
export async function isUserVisibleInDiscovery(userId: string): Promise<boolean> {
  const userSnap = await db.collection('users').doc(userId).get();
  
  if (!userSnap.exists) {
    return false;
  }
  
  const userData = userSnap.data();
  const status = userData?.accountStatus?.status || 'active';
  
  // Only active users are visible
  // suspended, deleted_soft, deleted_hard are all hidden
  return status === 'active';
}

/**
 * Get user account status
 */
export async function getAccountStatus(
  userId: string
): Promise<AccountStatusUpdate | null> {
  const userSnap = await db.collection('users').doc(userId).get();
  
  if (!userSnap.exists) {
    return null;
  }
  
  const userData = userSnap.data();
  return userData?.accountStatus || { status: 'active' };
}

/**
 * Filter users by account status
 * Used in discovery, search, feed queries
 */
export function filterActiveUsers(users: any[]): any[] {
  return users.filter(user => {
    const status = user.accountStatus?.status || 'active';
    return status === 'active';
  });
}

// ============================================================================
// USER-FACING ACCOUNT INFO
// ============================================================================

/**
 * Get account deletion eligibility info
 * Shows user what needs to be resolved before deletion
 */
export async function getDeletionEligibility(
  userId: string
): Promise<{
  canDelete: boolean;
  blockers: DeletionBlocker;
  warnings?: string[];
}> {
  
  const blockers = await checkDeletionBlockers(userId);
  const warnings: string[] = [];
  
  // Check wallet balance
  const walletRef = db.collection('users').doc(userId).collection('wallet').doc('current');
  const walletSnap = await walletRef.get();
  const wallet = walletSnap.data();
  const balance = wallet?.balance || 0;
  
  if (balance > 0) {
    warnings.push(
      `You have ${balance} tokens in your wallet. ` +
      'These will be lost if you delete your account. Consider withdrawing first.'
    );
  }
  
  return {
    canDelete: !blockers.blocked,
    blockers,
    warnings: warnings.length > 0 ? warnings : undefined
  };
}

// ============================================================================
// REACTIVATION FROM TEMPLATE
// ============================================================================

/**
 * Apply saved template preferences to user during onboarding
 * Call this after user completes basic registration
 */
export async function applyTemplatePreferences(
  userId: string
): Promise<{ applied: boolean; preferences?: ProfileTemplate['preferences'] }> {
  
  const template = await loadProfileTemplate(userId);
  
  if (!template) {
    return { applied: false };
  }
  
  const userRef = db.collection('users').doc(userId);
  
  // Apply preferences to user profile
  const updates: any = {
    updatedAt: serverTimestamp()
  };
  
  if (template.preferences.gender) {
    updates.gender = template.preferences.gender;
  }
  
  if (template.preferences.orientation) {
    updates.orientation = template.preferences.orientation;
  }
  
  if (template.preferences.seekingGender) {
    updates.seeking = template.preferences.seekingGender;
  }
  
  if (template.preferences.searchRadiusKm) {
    updates.searchAreaKm = template.preferences.searchRadiusKm;
  }
  
  if (template.preferences.language) {
    updates.language = template.preferences.language;
  }
  
  // Apply mode preferences
  updates['modes.earnFromChat'] = template.preferences.earnOnChat || false;
  updates['modes.incognito'] = template.preferences.incognito || false;
  updates['modes.passport'] = template.preferences.passport || false;
  
  // Apply notification preferences
  if (template.preferences.notifications) {
    updates.notificationSettings = template.preferences.notifications;
  }
  
  await userRef.update(updates);
  
  logger.info(`Applied template preferences for returning user: ${userId}`);
  
  return {
    applied: true,
    preferences: template.preferences
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  // Types are exported via export type declarations above
};