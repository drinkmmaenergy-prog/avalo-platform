/**
 * PACK 331 — AI Avatar Template Marketplace
 * Create, sell, and use AI visual templates
 * 
 * Revenue Model:
 * - Creator templates: 65/35 split (creator/Avalo)
 * - Official Avalo templates: 100% Avalo
 * - No tokenomics drift: Uses existing 0.20 PLN token price
 */

import { https } from 'firebase-functions/v2';
import { CallableRequest } from 'firebase-functions/v2/https';
import { db, generateId, serverTimestamp, increment } from './init';
import { z } from 'zod';
import { spendTokens } from './pack277-wallet-service';
import {
  AIAvatarTemplate,
  AIAvatarTemplatePurchase,
  CreateAvatarTemplateRequest,
  CreateAvatarTemplateResponse,
  PurchaseAvatarTemplateRequest,
  PurchaseAvatarTemplateResponse,
  ListAvatarTemplatesRequest,
  ListAvatarTemplatesResponse,
  GetCreatorStatsResponse,
  AVATAR_TEMPLATE_REVENUE_SPLIT,
  AVATAR_TEMPLATE_PRICE_LIMITS,
  AvatarStyle,
  GenderPresentation,
} from './types/pack331-ai-avatar-template.types';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const createTemplateSchema = z.object({
  ownerUserId: z.string().nullable(),
  name: z.string().min(3).max(100),
  description: z.string().min(10).max(1000),
  imageUrl: z.string().url(),
  style: z.enum(['REALISTIC', 'ANIME', 'ILLUSTRATION', 'OTHER']),
  genderPresentation: z.enum(['FEMININE', 'MASCULINE', 'ANDROGYNOUS', 'OTHER']),
  tags: z.array(z.string()).min(1).max(10),
  priceTokens: z.number().min(AVATAR_TEMPLATE_PRICE_LIMITS.MIN_TOKENS).max(AVATAR_TEMPLATE_PRICE_LIMITS.MAX_TOKENS),
});

const purchaseTemplateSchema = z.object({
  templateId: z.string().min(1),
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if user is verified 18+
 */
async function isUserVerified18Plus(userId: string): Promise<boolean> {
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return false;
    }
    
    const userData = userDoc.data();
    return userData?.verification?.age18 === true && 
           userData?.verification?.status === 'verified';
  } catch (error) {
    console.error('[isUserVerified18Plus] Error:', error);
    return false;
  }
}

/**
 * Check if user is admin
 */
async function isUserAdmin(userId: string): Promise<boolean> {
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return false;
    }
    
    const userData = userDoc.data();
    return userData?.roles?.admin === true;
  } catch (error) {
    console.error('[isUserAdmin] Error:', error);
    return false;
  }
}

/**
 * Validate image content (placeholder - integrate with PACK 329 content policy)
 */
async function validateImageContent(imageUrl: string): Promise<{ valid: boolean; reason?: string }> {
  // TODO: Integrate with PACK 329 content moderation
  // - Check for NSFW content
  // - Verify no child-like features
  // - Check for stolen celebrity faces
  // - Verify image quality
  
  // For now, basic validation
  if (!imageUrl || !imageUrl.startsWith('http')) {
    return { valid: false, reason: 'Invalid image URL' };
  }
  
  return { valid: true };
}

/**
 * Check if user has already purchased a template
 */
async function hasUserPurchasedTemplate(userId: string, templateId: string): Promise<boolean> {
  try {
    const purchaseQuery = await db
      .collection('aiAvatarTemplatePurchases')
      .where('buyerUserId', '==', userId)
      .where('templateId', '==', templateId)
      .limit(1)
      .get();
    
    return !purchaseQuery.empty;
  } catch (error) {
    console.error('[hasUserPurchasedTemplate] Error:', error);
    return false;
  }
}

// ============================================================================
// CREATE AI AVATAR TEMPLATE
// ============================================================================

/**
 * Create a new AI avatar template
 * Requires 18+ verification
 * All templates start in moderation queue
 */
export const pack331_createAiAvatarTemplate = https.onCall(
  { region: 'europe-west3', memory: '512MiB' },
  async (request: CallableRequest): Promise<CreateAvatarTemplateResponse> => {
    try {
      if (!request.auth) {
        return { success: false, error: 'Authentication required' };
      }
      
      const userId = request.auth.uid;
      const data = request.data as CreateAvatarTemplateRequest;
      
      // Validate input
      const validation = createTemplateSchema.safeParse(data);
      if (!validation.success) {
        return { 
          success: false, 
          error: `Validation error: ${validation.error.message}` 
        };
      }
      
      // Check if creating official Avalo template (admin only)
      const isOfficialAvalo = data.ownerUserId === null;
      
      if (isOfficialAvalo) {
        const isAdmin = await isUserAdmin(userId);
        if (!isAdmin) {
          return { 
            success: false, 
            error: 'Only administrators can create official Avalo templates' 
          };
        }
      } else {
        // For user-created templates, verify 18+ and owner matches auth
        if (data.ownerUserId !== userId) {
          return { 
            success: false, 
            error: 'Owner user ID must match authenticated user' 
          };
        }
        
        const isVerified = await isUserVerified18Plus(userId);
        if (!isVerified) {
          return { 
            success: false, 
            error: 'You must be verified 18+ to create avatar templates' 
          };
        }
      }
      
      // Validate image content
      const contentCheck = await validateImageContent(data.imageUrl);
      if (!contentCheck.valid) {
        return { 
          success: false, 
          error: contentCheck.reason || 'Image failed content validation' 
        };
      }
      
      // Create template document
      const templateId = generateId();
      const now = serverTimestamp();
      
      const template: AIAvatarTemplate = {
        id: templateId,
        ownerUserId: data.ownerUserId,
        name: data.name,
        description: data.description,
        imageUrl: data.imageUrl,
        style: data.style as AvatarStyle,
        genderPresentation: data.genderPresentation as GenderPresentation,
        priceTokens: data.priceTokens,
        isActive: false, // Starts inactive pending review
        isOfficialAvalo: isOfficialAvalo,
        tags: data.tags,
        createdAt: now,
        updatedAt: now,
        stats: {
          totalPurchases: 0,
          totalEarningsTokens: 0,
          totalUsageSessions: 0,
        },
        moderationStatus: 'PENDING_REVIEW',
      };
      
      await db.collection('aiAvatarTemplates').doc(templateId).set(template);
      
      console.log(`[pack331_createAiAvatarTemplate] Created template ${templateId} by user ${userId}`);
      
      return {
        success: true,
        templateId,
      };
    } catch (error: any) {
      console.error('[pack331_createAiAvatarTemplate] Error:', error);
      return {
        success: false,
        error: error.message || 'Failed to create avatar template',
      };
    }
  }
);

// ============================================================================
// PURCHASE AI AVATAR TEMPLATE
// ============================================================================

/**
 * Purchase an AI avatar template
 * Handles revenue split: 65/35 (creator/Avalo) or 100% Avalo for official
 */
export const pack331_purchaseAiAvatarTemplate = https.onCall(
  { region: 'europe-west3', memory: '512MiB' },
  async (request: CallableRequest): Promise<PurchaseAvatarTemplateResponse> => {
    try {
      if (!request.auth) {
        return { success: false, error: 'Authentication required' };
      }
      
      const buyerUserId = request.auth.uid;
      const data = request.data as PurchaseAvatarTemplateRequest;
      
      // Validate input
      const validation = purchaseTemplateSchema.safeParse(data);
      if (!validation.success) {
        return { 
          success: false, 
          error: `Validation error: ${validation.error.message}` 
        };
      }
      
      const { templateId } = data;
      
      // Get template
      const templateRef = db.collection('aiAvatarTemplates').doc(templateId);
      const templateDoc = await templateRef.get();
      
      if (!templateDoc.exists) {
        return { success: false, error: 'Template not found' };
      }
      
      const template = templateDoc.data() as AIAvatarTemplate;
      
      // Verify template is active
      if (!template.isActive) {
        return { success: false, error: 'This template is not available for purchase' };
      }
      
      // Check if user is trying to buy their own template
      if (template.ownerUserId === buyerUserId) {
        return { 
          success: false, 
          error: 'You cannot purchase your own template. It is automatically available to you.' 
        };
      }
      
      // Check if already purchased
      const alreadyPurchased = await hasUserPurchasedTemplate(buyerUserId, templateId);
      if (alreadyPurchased) {
        return { 
          success: false, 
          error: 'You have already purchased this template' 
        };
      }
      
      // Calculate revenue split
      const priceTokens = template.priceTokens;
      let ownerEarned = 0;
      let avaloEarned = 0;
      
      if (template.isOfficialAvalo) {
        // 100% to Avalo
        avaloEarned = priceTokens;
        ownerEarned = 0;
      } else {
        // 65/35 split
        ownerEarned = Math.floor(priceTokens * AVATAR_TEMPLATE_REVENUE_SPLIT.CREATOR_SHARE);
        avaloEarned = priceTokens - ownerEarned;
      }
      
      // Process payment using wallet service
      const spendResult = await spendTokens({
        userId: buyerUserId,
        amountTokens: priceTokens,
        source: 'DIGITAL_PRODUCT',
        relatedId: templateId,
        creatorId: template.ownerUserId || undefined,
        contextType: 'MEDIA_PURCHASE',
        contextRef: templateId,
        metadata: {
          templateName: template.name,
          isOfficialAvalo: template.isOfficialAvalo,
        },
      });
      
      if (!spendResult.success) {
        return { 
          success: false, 
          error: spendResult.error || 'Payment failed' 
        };
      }
      
      // Create purchase record
      const purchaseId = generateId();
      const now = serverTimestamp();
      
      const purchase: AIAvatarTemplatePurchase = {
        id: purchaseId,
        buyerUserId,
        templateId,
        purchasedAt: now,
        priceTokens,
        ownerUserId: template.ownerUserId,
        isOfficialAvalo: template.isOfficialAvalo,
      };
      
      await db.collection('aiAvatarTemplatePurchases').doc(purchaseId).set(purchase);
      
      // Update template stats
      await templateRef.update({
        'stats.totalPurchases': increment(1),
        'stats.totalEarningsTokens': increment(ownerEarned),
        updatedAt: serverTimestamp(),
      });
      
      console.log(
        `[pack331_purchaseAiAvatarTemplate] User ${buyerUserId} purchased template ${templateId} ` +
        `for ${priceTokens} tokens. Split: Owner=${ownerEarned}, Avalo=${avaloEarned}`
      );
      
      return {
        success: true,
        purchaseId,
        split: {
          ownerEarned,
          avaloEarned,
        },
      };
    } catch (error: any) {
      console.error('[pack331_purchaseAiAvatarTemplate] Error:', error);
      return {
        success: false,
        error: error.message || 'Failed to purchase avatar template',
      };
    }
  }
);

// ============================================================================
// LIST AVATAR TEMPLATES (MARKETPLACE)
// ============================================================================

/**
 * List avatar templates with filtering and sorting
 */
export const pack331_listAvatarTemplates = https.onCall(
  { region: 'europe-west3', memory: '512MiB' },
  async (request: CallableRequest): Promise<ListAvatarTemplatesResponse> => {
    try {
      if (!request.auth) {
        return { success: false, error: 'Authentication required' };
      }
      
      const data = request.data as ListAvatarTemplatesRequest;
      const filters = data.filters || {};
      const sort = data.sort || 'new';
      const limit = data.limit || 50;
      
      let query = db.collection('aiAvatarTemplates').where('isActive', '==', true);
      
      // Apply filters
      if (filters.style) {
        query = query.where('style', '==', filters.style) as any;
      }
      
      if (filters.genderPresentation) {
        query = query.where('genderPresentation', '==', filters.genderPresentation) as any;
      }
      
      if (filters.officialOnly) {
        query = query.where('isOfficialAvalo', '==', true) as any;
      }
      
      if (filters.creatorOnly) {
        query = query.where('isOfficialAvalo', '==', false) as any;
      }
      
      // Apply sorting
      switch (sort) {
        case 'popular':
          query = query.orderBy('stats.totalPurchases', 'desc') as any;
          break;
        case 'top_earning':
          query = query.orderBy('stats.totalEarningsTokens', 'desc') as any;
          break;
        case 'price_low':
          query = query.orderBy('priceTokens', 'asc') as any;
          break;
        case 'price_high':
          query = query.orderBy('priceTokens', 'desc') as any;
          break;
        case 'new':
        default:
          query = query.orderBy('createdAt', 'desc') as any;
          break;
      }
      
      query = query.limit(limit) as any;
      
      const snapshot = await query.get();
      const templates: AIAvatarTemplate[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      } as AIAvatarTemplate));
      
      // Apply additional filters (tags, price range) in memory
      let filteredTemplates = templates;
      
      if (filters.tags && filters.tags.length > 0) {
        filteredTemplates = filteredTemplates.filter(t => 
          filters.tags!.some(tag => t.tags.includes(tag))
        );
      }
      
      if (filters.priceMin !== undefined) {
        filteredTemplates = filteredTemplates.filter(t => t.priceTokens >= filters.priceMin!);
      }
      
      if (filters.priceMax !== undefined) {
        filteredTemplates = filteredTemplates.filter(t => t.priceTokens <= filters.priceMax!);
      }
      
      return {
        success: true,
        templates: filteredTemplates,
        total: filteredTemplates.length,
      };
    } catch (error: any) {
      console.error('[pack331_listAvatarTemplates] Error:', error);
      return {
        success: false,
        error: error.message || 'Failed to list avatar templates',
      };
    }
  }
);

// ============================================================================
// GET CREATOR STATS
// ============================================================================

/**
 * Get creator's avatar template statistics
 */
export const pack331_getCreatorStats = https.onCall(
  { region: 'europe-west3', memory: '512MiB' },
  async (request: CallableRequest): Promise<GetCreatorStatsResponse> => {
    try {
      if (!request.auth) {
        return { success: false, error: 'Authentication required' };
      }
      
      const userId = request.auth.uid;
      
      // Get all templates by this creator
      const templatesQuery = await db
        .collection('aiAvatarTemplates')
        .where('ownerUserId', '==', userId)
        .get();
      
      const templates = templatesQuery.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      } as AIAvatarTemplate));
      
      const activeTemplates = templates.filter(t => t.isActive);
      
      const totalSales = templates.reduce((sum, t) => sum + t.stats.totalPurchases, 0);
      const totalEarningsTokens = templates.reduce((sum, t) => sum + t.stats.totalEarningsTokens, 0);
      
      const templateStats = templates.map(t => ({
        templateId: t.id,
        name: t.name,
        sales: t.stats.totalPurchases,
        earnings: t.stats.totalEarningsTokens,
        usageSessions: t.stats.totalUsageSessions,
      }));
      
      return {
        success: true,
        stats: {
          totalTemplates: templates.length,
          activeTemplates: activeTemplates.length,
          totalSales,
          totalEarningsTokens,
          templates: templateStats,
        },
      };
    } catch (error: any) {
      console.error('[pack331_getCreatorStats] Error:', error);
      return {
        success: false,
        error: error.message || 'Failed to get creator stats',
      };
    }
  }
);

// ============================================================================
// TRACK USAGE SESSION
// ============================================================================

/**
 * Track when a template is used in an AI session (analytics only)
 */
export const pack331_trackTemplateUsage = https.onCall(
  { region: 'europe-west3', memory: '256MiB' },
  async (request: CallableRequest): Promise<{ success: boolean; error?: string }> => {
    try {
      if (!request.auth) {
        return { success: false, error: 'Authentication required' };
      }
      
      const data = request.data;
      const templateId = data.templateId;
      
      if (!templateId) {
        return { success: false, error: 'Template ID required' };
      }
      
      // Increment usage counter (no payment involved)
      await db.collection('aiAvatarTemplates').doc(templateId).update({
        'stats.totalUsageSessions': increment(1),
        updatedAt: serverTimestamp(),
      });
      
      return { success: true };
    } catch (error: any) {
      console.error('[pack331_trackTemplateUsage] Error:', error);
      return {
        success: false,
        error: error.message || 'Failed to track template usage',
      };
    }
  }
);

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  pack331_createAiAvatarTemplate,
  pack331_purchaseAiAvatarTemplate,
  pack331_listAvatarTemplates,
  pack331_getCreatorStats,
  pack331_trackTemplateUsage,
};