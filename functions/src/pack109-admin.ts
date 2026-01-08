/**
 * PACK 109 — Admin Functions for Partnerships & Talent Management
 * 
 * Admin-only endpoints for managing partner organizations, talent profiles,
 * and partnership campaigns.
 * 
 * CRITICAL CONSTRAINTS:
 * - All functions require elevated admin roles
 * - All writes logged to business_audit_log
 * - No client/mobile write-access
 * - Zero impact on tokenomics or pricing
 * - Zero special advantages for partners
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, generateId, serverTimestamp } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { writeAuditLog } from './auditLogger';
import { AdminRole, AdminContext, AdminPermissions } from './types/adminTypes';
import {
  PartnerOrganization,
  TalentProfile,
  PartnershipCampaign,
  CreatePartnerRequest,
  UpdatePartnerRequest,
  CreateTalentProfileRequest,
  UpdateTalentProfileRequest,
  CreateCampaignRequest,
  UpdateCampaignRequest,
  PartnershipErrorCode,
  PartnershipError,
} from './pack109-types';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Verify admin has required role for partnership management
 */
async function verifyAdminRole(authUid: string): Promise<void> {
  const adminDoc = await db.collection('admins').doc(authUid).get();
  
  if (!adminDoc.exists) {
    throw new HttpsError('permission-denied', 'Admin access required');
  }
  
  const adminData = adminDoc.data();
  const roles = adminData?.roles || [];
  
  // Require ROLE_TALENT_MANAGER or ROLE_ADMIN
  if (!roles.includes('ROLE_TALENT_MANAGER') && !roles.includes('ROLE_ADMIN')) {
    throw new HttpsError(
      'permission-denied',
      'ROLE_TALENT_MANAGER or ROLE_ADMIN required'
    );
  }
}

/**
 * Get admin context for audit logging
 */
async function getAdminContext(authUid: string): Promise<AdminContext> {
  const adminDoc = await db.collection('admins').doc(authUid).get();
  const adminData = adminDoc.data();
  
  return {
    adminId: authUid,
    email: adminData?.email || null,
    roles: (adminData?.roles || []) as AdminRole[],
    permissions: (adminData?.permissions || {}) as AdminPermissions,
  };
}

/**
 * Validate and convert date input to Timestamp
 */
function parseDate(input: string | number): Timestamp {
  if (typeof input === 'number') {
    return Timestamp.fromMillis(input);
  }
  
  const date = new Date(input);
  if (isNaN(date.getTime())) {
    throw new HttpsError('invalid-argument', 'Invalid date format');
  }
  
  return Timestamp.fromDate(date);
}

/**
 * Generate URL-safe slug
 */
function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Validate campaign slug is unique
 */
async function validateCampaignSlug(slug: string, excludeCampaignId?: string): Promise<void> {
  const existingCampaign = await db
    .collection('partnership_campaigns')
    .where('slug', '==', slug)
    .limit(1)
    .get();
  
  if (!existingCampaign.empty) {
    const existingDoc = existingCampaign.docs[0];
    if (existingDoc.id !== excludeCampaignId) {
      throw new PartnershipError(
        PartnershipErrorCode.DUPLICATE_SLUG,
        `Campaign slug '${slug}' already exists`
      );
    }
  }
}

// ============================================================================
// PARTNER ORGANIZATION MANAGEMENT
// ============================================================================

/**
 * Create a new partner organization
 */
export const admin_createPartner = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    
    await verifyAdminRole(request.auth.uid);
    
    const data = request.data as CreatePartnerRequest;
    
    // Validate required fields
    if (!data.name || !data.type || !Array.isArray(data.contactEmails)) {
      throw new HttpsError('invalid-argument', 'Missing required fields');
    }
    
    try {
      const partnerId = generateId();
      const now = serverTimestamp();
      
      const partner: PartnerOrganization = {
        id: partnerId,
        name: data.name,
        type: data.type,
        contactEmails: data.contactEmails,
        contactHandles: data.contactHandles || {},
        active: true,
        notes: data.notes,
        createdAt: now,
        updatedAt: now,
      };
      
      await db.collection('partners').doc(partnerId).set(partner);
      
      // Audit log
      const adminContext = await getAdminContext(request.auth.uid);
      await writeAuditLog({
        admin: adminContext,
        targetType: 'PARTNER',
        targetId: partnerId,
        action: 'CREATE',
        severity: 'INFO',
        after: { name: partner.name, type: partner.type },
      });
      
      logger.info(`Partner created: ${partnerId} by ${request.auth.uid}`);
      
      return {
        success: true,
        partnerId,
        partner,
      };
    } catch (error: any) {
      logger.error('Error creating partner', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

/**
 * Update an existing partner organization
 */
export const admin_updatePartner = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    
    await verifyAdminRole(request.auth.uid);
    
    const data = request.data as UpdatePartnerRequest;
    
    if (!data.partnerId) {
      throw new HttpsError('invalid-argument', 'partnerId required');
    }
    
    try {
      const partnerRef = db.collection('partners').doc(data.partnerId);
      const partnerDoc = await partnerRef.get();
      
      if (!partnerDoc.exists) {
        throw new PartnershipError(
          PartnershipErrorCode.PARTNER_NOT_FOUND,
          'Partner not found'
        );
      }
      
      const before = partnerDoc.data();
      
      const updates: Partial<PartnerOrganization> = {
        updatedAt: serverTimestamp(),
      };
      
      if (data.name !== undefined) updates.name = data.name;
      if (data.type !== undefined) updates.type = data.type;
      if (data.contactEmails !== undefined) updates.contactEmails = data.contactEmails;
      if (data.contactHandles !== undefined) updates.contactHandles = data.contactHandles;
      if (data.active !== undefined) updates.active = data.active;
      if (data.notes !== undefined) updates.notes = data.notes;
      
      await partnerRef.update(updates);
      
      // Audit log
      const adminContext = await getAdminContext(request.auth.uid);
      await writeAuditLog({
        admin: adminContext,
        targetType: 'PARTNER',
        targetId: data.partnerId,
        action: 'UPDATE',
        severity: 'INFO',
        before: { name: before?.name, active: before?.active },
        after: { name: updates.name, active: updates.active },
      });
      
      logger.info(`Partner updated: ${data.partnerId} by ${request.auth.uid}`);
      
      return {
        success: true,
        partnerId: data.partnerId,
      };
    } catch (error: any) {
      logger.error('Error updating partner', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

/**
 * Get partner organization details
 */
export const admin_getPartner = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    
    await verifyAdminRole(request.auth.uid);
    
    const { partnerId } = request.data;
    
    if (!partnerId) {
      throw new HttpsError('invalid-argument', 'partnerId required');
    }
    
    try {
      const partnerDoc = await db.collection('partners').doc(partnerId).get();
      
      if (!partnerDoc.exists) {
        return {
          success: false,
          error: 'Partner not found',
        };
      }
      
      return {
        success: true,
        partner: partnerDoc.data(),
      };
    } catch (error: any) {
      logger.error('Error getting partner', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

// ============================================================================
// TALENT PROFILE MANAGEMENT
// ============================================================================

/**
 * Create a new talent profile
 */
export const admin_createTalentProfile = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    
    await verifyAdminRole(request.auth.uid);
    
    const data = request.data as CreateTalentProfileRequest;
    
    // Validate required fields
    if (!data.region || !Array.isArray(data.categories) || !data.status) {
      throw new HttpsError('invalid-argument', 'Missing required fields');
    }
    
    try {
      const talentId = generateId();
      const now = serverTimestamp();
      
      const talent: TalentProfile = {
        id: talentId,
        partnerId: data.partnerId,
        avaloUserId: data.avaloUserId,
        externalHandles: data.externalHandles || {},
        region: data.region,
        categories: data.categories,
        status: data.status,
        notes: data.notes,
        createdAt: now,
        updatedAt: now,
      };
      
      await db.collection('talent_profiles').doc(talentId).set(talent);
      
      // Audit log
      const adminContext = await getAdminContext(request.auth.uid);
      await writeAuditLog({
        admin: adminContext,
        targetType: 'TALENT',
        targetId: talentId,
        action: 'CREATE',
        severity: 'INFO',
        after: { 
          region: talent.region,
          status: talent.status,
          avaloUserId: talent.avaloUserId,
        },
      });
      
      logger.info(`Talent profile created: ${talentId} by ${request.auth.uid}`);
      
      return {
        success: true,
        talentId,
        talent,
      };
    } catch (error: any) {
      logger.error('Error creating talent profile', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

/**
 * Update an existing talent profile
 */
export const admin_updateTalentProfile = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    
    await verifyAdminRole(request.auth.uid);
    
    const data = request.data as UpdateTalentProfileRequest;
    
    if (!data.talentId) {
      throw new HttpsError('invalid-argument', 'talentId required');
    }
    
    try {
      const talentRef = db.collection('talent_profiles').doc(data.talentId);
      const talentDoc = await talentRef.get();
      
      if (!talentDoc.exists) {
        throw new PartnershipError(
          PartnershipErrorCode.TALENT_NOT_FOUND,
          'Talent profile not found'
        );
      }
      
      const before = talentDoc.data();
      
      const updates: Partial<TalentProfile> = {
        updatedAt: serverTimestamp(),
      };
      
      if (data.partnerId !== undefined) updates.partnerId = data.partnerId;
      if (data.avaloUserId !== undefined) updates.avaloUserId = data.avaloUserId;
      if (data.externalHandles !== undefined) updates.externalHandles = data.externalHandles;
      if (data.region !== undefined) updates.region = data.region;
      if (data.categories !== undefined) updates.categories = data.categories;
      if (data.status !== undefined) updates.status = data.status;
      if (data.notes !== undefined) updates.notes = data.notes;
      
      await talentRef.update(updates);
      
      // Audit log
      const adminContext = await getAdminContext(request.auth.uid);
      await writeAuditLog({
        admin: adminContext,
        targetType: 'TALENT',
        targetId: data.talentId,
        action: 'UPDATE',
        severity: 'INFO',
        before: { status: before?.status },
        after: { status: updates.status },
      });
      
      logger.info(`Talent profile updated: ${data.talentId} by ${request.auth.uid}`);
      
      return {
        success: true,
        talentId: data.talentId,
      };
    } catch (error: any) {
      logger.error('Error updating talent profile', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

/**
 * Get talent profile details
 */
export const admin_getTalentProfile = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    
    await verifyAdminRole(request.auth.uid);
    
    const { talentId } = request.data;
    
    if (!talentId) {
      throw new HttpsError('invalid-argument', 'talentId required');
    }
    
    try {
      const talentDoc = await db.collection('talent_profiles').doc(talentId).get();
      
      if (!talentDoc.exists) {
        return {
          success: false,
          error: 'Talent profile not found',
        };
      }
      
      return {
        success: true,
        talent: talentDoc.data(),
      };
    } catch (error: any) {
      logger.error('Error getting talent profile', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

// ============================================================================
// PARTNERSHIP CAMPAIGN MANAGEMENT
// ============================================================================

/**
 * Create a new partnership campaign
 */
export const admin_createPartnershipCampaign = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    
    await verifyAdminRole(request.auth.uid);
    
    const data = request.data as CreateCampaignRequest;
    
    // Validate required fields
    if (!data.name || !data.slug || !data.startDate || !data.endDate) {
      throw new HttpsError('invalid-argument', 'Missing required fields');
    }
    
    try {
      // Validate slug is unique
      const slug = generateSlug(data.slug);
      await validateCampaignSlug(slug);
      
      const campaignId = generateId();
      const now = serverTimestamp();
      
      const campaign: PartnershipCampaign = {
        id: campaignId,
        name: data.name,
        description: data.description || '',
        slug,
        objectives: data.objectives || [],
        startDate: parseDate(data.startDate),
        endDate: parseDate(data.endDate),
        regions: data.regions || [],
        channels: data.channels || [],
        status: 'PLANNED',
        partnerIds: data.partnerIds || [],
        talentIds: data.talentIds || [],
        trackingTags: data.trackingTags || [],
        createdAt: now,
        updatedAt: now,
      };
      
      await db.collection('partnership_campaigns').doc(campaignId).set(campaign);
      
      // Audit log
      const adminContext = await getAdminContext(request.auth.uid);
      await writeAuditLog({
        admin: adminContext,
        targetType: 'CAMPAIGN',
        targetId: campaignId,
        action: 'CREATE',
        severity: 'INFO',
        after: { 
          name: campaign.name,
          slug: campaign.slug,
          status: campaign.status,
        },
      });
      
      logger.info(`Campaign created: ${campaignId} by ${request.auth.uid}`);
      
      return {
        success: true,
        campaignId,
        campaign,
      };
    } catch (error: any) {
      logger.error('Error creating campaign', error);
      
      if (error instanceof PartnershipError) {
        throw new HttpsError('already-exists', error.message);
      }
      
      throw new HttpsError('internal', error.message);
    }
  }
);

/**
 * Update an existing partnership campaign
 */
export const admin_updatePartnershipCampaign = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    
    await verifyAdminRole(request.auth.uid);
    
    const data = request.data as UpdateCampaignRequest;
    
    if (!data.campaignId) {
      throw new HttpsError('invalid-argument', 'campaignId required');
    }
    
    try {
      const campaignRef = db.collection('partnership_campaigns').doc(data.campaignId);
      const campaignDoc = await campaignRef.get();
      
      if (!campaignDoc.exists) {
        throw new PartnershipError(
          PartnershipErrorCode.CAMPAIGN_NOT_FOUND,
          'Campaign not found'
        );
      }
      
      const before = campaignDoc.data();
      
      const updates: Partial<PartnershipCampaign> = {
        updatedAt: serverTimestamp(),
      };
      
      if (data.name !== undefined) updates.name = data.name;
      if (data.description !== undefined) updates.description = data.description;
      if (data.objectives !== undefined) updates.objectives = data.objectives;
      if (data.regions !== undefined) updates.regions = data.regions;
      if (data.channels !== undefined) updates.channels = data.channels;
      if (data.status !== undefined) updates.status = data.status;
      if (data.partnerIds !== undefined) updates.partnerIds = data.partnerIds;
      if (data.talentIds !== undefined) updates.talentIds = data.talentIds;
      if (data.trackingTags !== undefined) updates.trackingTags = data.trackingTags;
      
      if (data.slug !== undefined) {
        const slug = generateSlug(data.slug);
        await validateCampaignSlug(slug, data.campaignId);
        updates.slug = slug;
      }
      
      if (data.startDate !== undefined) {
        updates.startDate = parseDate(data.startDate);
      }
      
      if (data.endDate !== undefined) {
        updates.endDate = parseDate(data.endDate);
      }
      
      await campaignRef.update(updates);
      
      // Audit log
      const adminContext = await getAdminContext(request.auth.uid);
      await writeAuditLog({
        admin: adminContext,
        targetType: 'CAMPAIGN',
        targetId: data.campaignId,
        action: 'UPDATE',
        severity: 'INFO',
        before: { name: before?.name, status: before?.status },
        after: { name: updates.name, status: updates.status },
      });
      
      logger.info(`Campaign updated: ${data.campaignId} by ${request.auth.uid}`);
      
      return {
        success: true,
        campaignId: data.campaignId,
      };
    } catch (error: any) {
      logger.error('Error updating campaign', error);
      
      if (error instanceof PartnershipError) {
        throw new HttpsError('already-exists', error.message);
      }
      
      throw new HttpsError('internal', error.message);
    }
  }
);

/**
 * Get campaign details
 */
export const admin_getCampaign = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    
    await verifyAdminRole(request.auth.uid);
    
    const { campaignId } = request.data;
    
    if (!campaignId) {
      throw new HttpsError('invalid-argument', 'campaignId required');
    }
    
    try {
      const campaignDoc = await db.collection('partnership_campaigns').doc(campaignId).get();
      
      if (!campaignDoc.exists) {
        return {
          success: false,
          error: 'Campaign not found',
        };
      }
      
      return {
        success: true,
        campaign: campaignDoc.data(),
      };
    } catch (error: any) {
      logger.error('Error getting campaign', error);
      throw new HttpsError('internal', error.message);
    }
  }
);