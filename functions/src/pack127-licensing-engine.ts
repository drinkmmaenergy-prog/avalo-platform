/**
 * PACK 127 — IP Licensing Management Engine
 * 
 * Handles business licensing for creator IP
 * 
 * NON-NEGOTIABLE RULES:
 * - Non-transferable, platform-only licenses
 * - No off-platform commercial usage rights
 * - No effect on token economy or discovery
 * - Cannot be resold or sub-licensed
 */

import { db, serverTimestamp, generateId } from './init';
import {
  IPLicense,
  CreateLicenseInput,
  LicenseType,
  LicenseStatus,
} from './pack127-types';

// ============================================================================
// LICENSE CREATION
// ============================================================================

/**
 * Create IP license for business use
 */
export async function createLicense(
  input: CreateLicenseInput
): Promise<IPLicense> {
  // Validate license creation
  await validateLicenseCreation(input);
  
  const licenseId = generateId();
  const startAt = new Date();
  const endAt = new Date(startAt.getTime() + input.durationDays * 24 * 60 * 60 * 1000);
  
  const license: IPLicense = {
    licenseId,
    ownerUserId: input.ownerUserId,
    licenseeId: input.licenseeId,
    licenseeType: input.licenseeType,
    assetRefs: input.assetRefs,
    licenseType: input.licenseType,
    scope: input.scope,
    restrictions: input.restrictions || [
      'Platform-only usage',
      'Non-transferable',
      'Cannot be sub-licensed',
    ],
    startAt: startAt as any,
    endAt: endAt as any,
    autoRenew: false,
    status: 'ACTIVE',
    
    // CRITICAL: No effect on token economy
    affectsMonetization: false,
    licenseFeePaid: false,
    
    // Transfer restrictions (always enforced)
    transferable: false,
    sublicensable: false,
    
    createdAt: serverTimestamp() as any,
    updatedAt: serverTimestamp() as any,
  };
  
  await db.collection('ip_licenses').doc(licenseId).set(license);
  
  // Notify owner and licensee
  await sendLicenseNotifications(license, 'GRANTED');
  
  return license;
}

/**
 * Validate license creation
 */
async function validateLicenseCreation(input: CreateLicenseInput): Promise<void> {
  // Verify owner owns all assets
  for (const assetRef of input.assetRefs) {
    const fingerprint = await db
      .collection('ip_fingerprints')
      .doc(assetRef)
      .get();
    
    if (!fingerprint.exists) {
      throw new Error(`Asset ${assetRef} not found`);
    }
    
    const fpData = fingerprint.data();
    if (fpData?.ownerUserId !== input.ownerUserId) {
      throw new Error(`User does not own asset ${assetRef}`);
    }
  }
  
  // Check if licensee exists
  const licensee = await db.collection('users').doc(input.licenseeId).get();
  if (!licensee.exists) {
    throw new Error('Licensee not found');
  }
  
  // Check for existing active license
  const existingLicense = await db
    .collection('ip_licenses')
    .where('ownerUserId', '==', input.ownerUserId)
    .where('licenseeId', '==', input.licenseeId)
    .where('status', '==', 'ACTIVE')
    .limit(1)
    .get();
  
  if (!existingLicense.empty) {
    // Check if any assets overlap
    const existingAssets = existingLicense.docs[0].data().assetRefs;
    const overlap = input.assetRefs.some(ref => existingAssets.includes(ref));
    
    if (overlap) {
      throw new Error('Active license already exists for some of these assets');
    }
  }
}

// ============================================================================
// LICENSE MANAGEMENT
// ============================================================================

/**
 * Revoke license
 */
export async function revokeLicense(
  licenseId: string,
  revokedBy: string,
  reason: string
): Promise<void> {
  const license = await getLicense(licenseId);
  if (!license) {
    throw new Error('License not found');
  }
  
  // Verify revocation authority
  if (revokedBy !== license.ownerUserId) {
    // Check if revokedBy is admin
    const admin = await db.collection('admins').doc(revokedBy).get();
    if (!admin.exists) {
      throw new Error('Unauthorized: Only license owner or admin can revoke');
    }
  }
  
  await db.collection('ip_licenses').doc(licenseId).update({
    status: 'REVOKED',
    revokedAt: serverTimestamp(),
    revokedBy,
    revocationReason: reason,
    updatedAt: serverTimestamp(),
  });
  
  // Notify parties
  await sendLicenseNotifications(license, 'REVOKED');
  
  console.log(`[Licensing] License ${licenseId} revoked by ${revokedBy}`);
}

/**
 * Suspend license temporarily
 */
export async function suspendLicense(
  licenseId: string,
  suspendedBy: string,
  reason: string,
  durationDays: number
): Promise<void> {
  const license = await getLicense(licenseId);
  if (!license) {
    throw new Error('License not found');
  }
  
  await db.collection('ip_licenses').doc(licenseId).update({
    status: 'SUSPENDED',
    updatedAt: serverTimestamp(),
    notes: `Suspended by ${suspendedBy}: ${reason}`,
  });
  
  console.log(`[Licensing] License ${licenseId} suspended for ${durationDays} days`);
}

/**
 * Renew license
 */
export async function renewLicense(
  licenseId: string,
  additionalDays: number
): Promise<void> {
  const license = await getLicense(licenseId);
  if (!license) {
    throw new Error('License not found');
  }
  
  if (license.status !== 'ACTIVE' && license.status !== 'EXPIRED') {
    throw new Error('Cannot renew license in current status');
  }
  
  const currentEndDate = license.endAt.toDate();
  const newEndDate = new Date(currentEndDate.getTime() + additionalDays * 24 * 60 * 60 * 1000);
  
  await db.collection('ip_licenses').doc(licenseId).update({
    endAt: newEndDate,
    status: 'ACTIVE',
    updatedAt: serverTimestamp(),
  });
  
  console.log(`[Licensing] License ${licenseId} renewed until ${newEndDate}`);
}

/**
 * Check license expiry
 */
export async function checkLicenseExpiry(licenseId: string): Promise<{
  expired: boolean;
  daysRemaining: number;
}> {
  const license = await getLicense(licenseId);
  if (!license) {
    throw new Error('License not found');
  }
  
  const now = Date.now();
  const endTime = license.endAt.toMillis();
  const daysRemaining = Math.ceil((endTime - now) / (24 * 60 * 60 * 1000));
  
  const expired = now >= endTime;
  
  if (expired && license.status === 'ACTIVE') {
    // Auto-expire license
    await db.collection('ip_licenses').doc(licenseId).update({
      status: 'EXPIRED',
      updatedAt: serverTimestamp(),
    });
  }
  
  return { expired, daysRemaining };
}

// ============================================================================
// LICENSE VERIFICATION
// ============================================================================

/**
 * Verify license for asset usage
 */
export async function verifyLicense(
  licenseeId: string,
  assetRef: string
): Promise<{
  valid: boolean;
  license?: IPLicense;
  reason?: string;
}> {
  // Find active license for this asset
  const licenses = await db
    .collection('ip_licenses')
    .where('licenseeId', '==', licenseeId)
    .where('status', '==', 'ACTIVE')
    .get();
  
  for (const doc of licenses.docs) {
    const license = doc.data() as IPLicense;
    
    if (license.assetRefs.includes(assetRef)) {
      // Check expiry
      const { expired } = await checkLicenseExpiry(license.licenseId);
      
      if (expired) {
        return {
          valid: false,
          reason: 'License expired',
        };
      }
      
      return {
        valid: true,
        license,
      };
    }
  }
  
  return {
    valid: false,
    reason: 'No active license found',
  };
}

/**
 * Get license usage statistics
 */
export async function getLicenseUsageStats(licenseId: string): Promise<{
  totalUses: number;
  lastUsedAt?: Date;
  usageByAsset: Record<string, number>;
}> {
  // Track license usage (implementation depends on how licenses are used)
  // Placeholder implementation
  
  return {
    totalUses: 0,
    usageByAsset: {},
  };
}

// ============================================================================
// LICENSE QUERIES
// ============================================================================

/**
 * Get license by ID
 */
export async function getLicense(licenseId: string): Promise<IPLicense | null> {
  const doc = await db.collection('ip_licenses').doc(licenseId).get();
  
  if (!doc.exists) {
    return null;
  }
  
  return doc.data() as IPLicense;
}

/**
 * Get licenses owned by user
 */
export async function getLicensesOwnedByUser(userId: string): Promise<IPLicense[]> {
  const snapshot = await db
    .collection('ip_licenses')
    .where('ownerUserId', '==', userId)
    .orderBy('createdAt', 'desc')
    .get();
  
  return snapshot.docs.map(doc => doc.data() as IPLicense);
}

/**
 * Get licenses held by user/brand
 */
export async function getLicensesHeldByUser(userId: string): Promise<IPLicense[]> {
  const snapshot = await db
    .collection('ip_licenses')
    .where('licenseeId', '==', userId)
    .orderBy('createdAt', 'desc')
    .get();
  
  return snapshot.docs.map(doc => doc.data() as IPLicense);
}

/**
 * Get active licenses for asset
 */
export async function getActiveLicensesForAsset(assetRef: string): Promise<IPLicense[]> {
  const snapshot = await db
    .collection('ip_licenses')
    .where('assetRefs', 'array-contains', assetRef)
    .where('status', '==', 'ACTIVE')
    .get();
  
  return snapshot.docs.map(doc => doc.data() as IPLicense);
}

/**
 * Get expiring licenses
 */
export async function getExpiringLicenses(daysThreshold: number): Promise<IPLicense[]> {
  const thresholdDate = new Date(Date.now() + daysThreshold * 24 * 60 * 60 * 1000);
  
  const snapshot = await db
    .collection('ip_licenses')
    .where('status', '==', 'ACTIVE')
    .where('endAt', '<=', thresholdDate)
    .get();
  
  return snapshot.docs.map(doc => doc.data() as IPLicense);
}

// ============================================================================
// AUTOMATED MAINTENANCE
// ============================================================================

/**
 * Auto-expire licenses (scheduled job)
 */
export async function autoExpireLicenses(): Promise<number> {
  const now = new Date();
  
  const expiredLicenses = await db
    .collection('ip_licenses')
    .where('status', '==', 'ACTIVE')
    .where('endAt', '<=', now)
    .get();
  
  let expiredCount = 0;
  
  for (const doc of expiredLicenses.docs) {
    await doc.ref.update({
      status: 'EXPIRED',
      updatedAt: serverTimestamp(),
    });
    
    const license = doc.data() as IPLicense;
    
    // Check auto-renew
    if (license.autoRenew) {
      // Auto-renew logic would go here
      console.log(`[Licensing] Auto-renewing license ${doc.id}`);
    } else {
      // Notify parties of expiration
      await sendLicenseNotifications(license, 'EXPIRED');
    }
    
    expiredCount++;
  }
  
  console.log(`[Licensing] Auto-expired ${expiredCount} licenses`);
  return expiredCount;
}

/**
 * Send expiry reminders (scheduled job)
 */
export async function sendExpiryReminders(): Promise<number> {
  // Send reminders 7 days before expiry
  const expiringLicenses = await getExpiringLicenses(7);
  
  let remindersSent = 0;
  
  for (const license of expiringLicenses) {
    await sendLicenseNotifications(license, 'EXPIRING_SOON');
    remindersSent++;
  }
  
  console.log(`[Licensing] Sent ${remindersSent} expiry reminders`);
  return remindersSent;
}

// ============================================================================
// NOTIFICATIONS
// ============================================================================

/**
 * Send license notifications
 */
async function sendLicenseNotifications(
  license: IPLicense,
  event: 'GRANTED' | 'REVOKED' | 'EXPIRED' | 'EXPIRING_SOON'
): Promise<void> {
  const messages = {
    GRANTED: {
      title: 'License Granted',
      message: `You have been granted a license for ${license.assetRefs.length} asset(s)`,
    },
    REVOKED: {
      title: 'License Revoked',
      message: 'A license has been revoked',
    },
    EXPIRED: {
      title: 'License Expired',
      message: 'A license has expired',
    },
    EXPIRING_SOON: {
      title: 'License Expiring Soon',
      message: 'A license will expire in 7 days',
    },
  };
  
  const msg = messages[event];
  
  // Notify owner
  await db.collection('ip_notifications').add({
    notificationId: generateId(),
    userId: license.ownerUserId,
    type: 'LICENSE_' + event,
    title: msg.title,
    message: msg.message,
    read: false,
    createdAt: serverTimestamp(),
    priority: event === 'REVOKED' ? 'HIGH' : 'NORMAL',
  });
  
  // Notify licensee
  await db.collection('ip_notifications').add({
    notificationId: generateId(),
    userId: license.licenseeId,
    type: 'LICENSE_' + event,
    title: msg.title,
    message: msg.message,
    read: false,
    createdAt: serverTimestamp(),
    priority: event === 'REVOKED' ? 'HIGH' : 'NORMAL',
  });
}

// ============================================================================
// LICENSE ANALYTICS
// ============================================================================

/**
 * Get licensing stats for user
 */
export async function getLicensingStats(userId: string): Promise<{
  licensesOwned: number;
  licensesHeld: number;
  activeLicenses: number;
  totalLicenseRevenue: number;
}> {
  const ownedLicenses = await getLicensesOwnedByUser(userId);
  const heldLicenses = await getLicensesHeldByUser(userId);
  
  const activeLicenses = ownedLicenses.filter(l => l.status === 'ACTIVE').length;
  
  // Calculate total license revenue (if tracked separately)
  const totalLicenseRevenue = ownedLicenses
    .filter(l => l.licenseFeePaid)
    .reduce((sum, l) => sum + (l.licenseFeeAmount || 0), 0);
  
  return {
    licensesOwned: ownedLicenses.length,
    licensesHeld: heldLicenses.length,
    activeLicenses,
    totalLicenseRevenue,
  };
}

/**
 * Get platform-wide licensing stats
 */
export async function getPlatformLicensingStats(): Promise<{
  totalLicenses: number;
  activeLicenses: number;
  expiredLicenses: number;
  revokedLicenses: number;
}> {
  const allLicenses = await db.collection('ip_licenses').get();
  
  const stats = {
    totalLicenses: allLicenses.size,
    activeLicenses: 0,
    expiredLicenses: 0,
    revokedLicenses: 0,
  };
  
  allLicenses.forEach(doc => {
    const license = doc.data() as IPLicense;
    
    switch (license.status) {
      case 'ACTIVE':
        stats.activeLicenses++;
        break;
      case 'EXPIRED':
        stats.expiredLicenses++;
        break;
      case 'REVOKED':
        stats.revokedLicenses++;
        break;
    }
  });
  
  return stats;
}