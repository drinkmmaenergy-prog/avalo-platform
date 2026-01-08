/**
 * PACK 109 — Campaign Attribution Tracking & Analytics
 * 
 * Public and admin endpoints for tracking campaign performance.
 * 
 * CRITICAL CONSTRAINTS:
 * - Tracking is read-only analytics ONLY
 * - No impact on tokenomics or revenue split
 * - No special advantages for partners
 * - All earnings follow standard 65/35 rules
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onRequest } from 'firebase-functions/v2/https';
import { db, generateId, serverTimestamp } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import {
  CampaignAttributionEvent,
  CampaignPerformanceMetrics,
  TalentPerformanceBreakdown,
  LogCampaignVisitRequest,
  LogCampaignVisitResponse,
  GetCampaignPerformanceRequest,
  GetCampaignPerformanceResponse,
  CreatorCampaignSummary,
  GetCreatorCampaignsResponse,
  PartnershipCampaign,
  TalentProfile,
  CampaignChannel,
  PartnershipErrorCode,
  PartnershipError,
} from './pack109-types';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Verify admin has required role for campaign analytics
 */
async function verifyAdminRole(authUid: string): Promise<void> {
  const adminDoc = await db.collection('admins').doc(authUid).get();
  
  if (!adminDoc.exists) {
    throw new HttpsError('permission-denied', 'Admin access required');
  }
  
  const adminData = adminDoc.data();
  const roles = adminData?.roles || [];
  
  if (!roles.includes('TALENT_MANAGER') && !roles.includes('ADMIN')) {
    throw new HttpsError(
      'permission-denied',
      'TALENT_MANAGER or ADMIN role required'
    );
  }
}

/**
 * Format date as YYYY-MM-DD
 */
function formatDateYMD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse date string to Date object
 */
function parseDate(dateStr: string): Date {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new HttpsError('invalid-argument', 'Invalid date format');
  }
  return date;
}

// ============================================================================
// SMART LINK HANDLER (PUBLIC)
// ============================================================================

/**
 * Handle campaign smart link visits
 * Route: /c/{campaignSlug}?t={talentId}
 * 
 * This is a public endpoint accessible without authentication
 */
export const handleCampaignSmartLink = onRequest(
  { region: 'europe-west3', cors: true },
  async (req, res) => {
    try {
      // Extract campaign slug from path
      const pathParts = req.path.split('/');
      const campaignSlug = pathParts[pathParts.length - 1] || pathParts[pathParts.length - 2];
      
      // Extract parameters
      const talentId = req.query.t as string;
      const utmSource = req.query.utm_source as string;
      const utmMedium = req.query.utm_medium as string;
      const utmCampaign = req.query.utm_campaign as string;
      
      if (!campaignSlug || !talentId) {
        res.status(400).send('Missing campaign slug or talent ID');
        return;
      }
      
      // Find campaign by slug
      const campaignsQuery = await db
        .collection('partnership_campaigns')
        .where('slug', '==', campaignSlug)
        .where('status', 'in', ['PLANNED', 'ACTIVE'])
        .limit(1)
        .get();
      
      if (campaignsQuery.empty) {
        res.status(404).send('Campaign not found');
        return;
      }
      
      const campaignDoc = campaignsQuery.docs[0];
      const campaign = campaignDoc.data() as PartnershipCampaign;
      
      // Verify talent is part of campaign
      if (!campaign.talentIds.includes(talentId)) {
        res.status(403).send('Talent not part of this campaign');
        return;
      }
      
      // Log visit event
      const eventId = generateId();
      const referrer = req.headers.referer || req.headers.referrer;
      const visitEvent: CampaignAttributionEvent = {
        id: eventId,
        campaignId: campaignDoc.id,
        talentId,
        eventType: 'VISIT',
        occurredAt: serverTimestamp(),
        metadata: {
          referrer: Array.isArray(referrer) ? referrer[0] : referrer,
          userAgent: req.headers['user-agent'],
          utmSource,
          utmMedium,
          utmCampaign,
        },
      };
      
      await db
        .collection('campaign_attribution_events')
        .doc(eventId)
        .set(visitEvent);
      
      logger.info(`Campaign visit logged: ${campaignSlug} via talent ${talentId}`);
      
      // Get talent's Avalo profile if available
      const talentDoc = await db.collection('talent_profiles').doc(talentId).get();
      const talentData = talentDoc.data() as TalentProfile;
      
      // Generate deep link to app
      let deepLink = 'https://avalo.app';
      
      if (talentData?.avaloUserId) {
        // Deep link to talent's profile in app
        deepLink = `avalo://profile/${talentData.avaloUserId}?ref=campaign_${campaignSlug}`;
      }
      
      // Redirect to app store or web landing page
      const userAgent = req.headers['user-agent']?.toLowerCase() || '';
      
      if (userAgent.includes('android')) {
        // Redirect to Play Store with fallback to web
        res.redirect(
          `https://play.google.com/store/apps/details?id=app.avalo&referrer=campaign_${campaignSlug}_talent_${talentId}`
        );
      } else if (userAgent.includes('iphone') || userAgent.includes('ipad')) {
        // Redirect to App Store with fallback to web
        res.redirect(
          `https://apps.apple.com/app/avalo/id123456789?pt=campaign_${campaignSlug}&ct=talent_${talentId}`
        );
      } else {
        // Redirect to web landing page with campaign context
        res.redirect(
          `https://avalo.app/join?campaign=${campaignSlug}&talent=${talentId}&utm_source=${utmSource || 'campaign'}&utm_medium=${utmMedium || 'web'}`
        );
      }
    } catch (error: any) {
      logger.error('Error handling campaign smart link', error);
      res.status(500).send('Internal server error');
    }
  }
);

/**
 * Log campaign visit from mobile app
 * Callable function for in-app visit tracking
 */
export const logCampaignVisit = onCall(
  { region: 'europe-west3' },
  async (request): Promise<LogCampaignVisitResponse> => {
    const data = request.data as LogCampaignVisitRequest;
    
    if (!data.campaignSlug || !data.talentId) {
      throw new HttpsError('invalid-argument', 'Missing required fields');
    }
    
    try {
      // Find campaign by slug
      const campaignsQuery = await db
        .collection('partnership_campaigns')
        .where('slug', '==', data.campaignSlug)
        .where('status', 'in', ['PLANNED', 'ACTIVE'])
        .limit(1)
        .get();
      
      if (campaignsQuery.empty) {
        return {
          success: false,
          error: 'Campaign not found',
        };
      }
      
      const campaignDoc = campaignsQuery.docs[0];
      const campaign = campaignDoc.data() as PartnershipCampaign;
      
      // Verify talent is part of campaign
      if (!campaign.talentIds.includes(data.talentId)) {
        return {
          success: false,
          error: 'Talent not part of this campaign',
        };
      }
      
      // Log visit event
      const eventId = generateId();
      const visitEvent: CampaignAttributionEvent = {
        id: eventId,
        campaignId: campaignDoc.id,
        talentId: data.talentId,
        avaloUserId: request.auth?.uid,
        eventType: 'VISIT',
        occurredAt: serverTimestamp(),
        platform: data.platform,
        metadata: data.metadata,
      };
      
      await db
        .collection('campaign_attribution_events')
        .doc(eventId)
        .set(visitEvent);
      
      // Get talent's deep link
      const talentDoc = await db.collection('talent_profiles').doc(data.talentId).get();
      const talentData = talentDoc.data() as TalentProfile;
      
      let deepLink = 'avalo://home';
      if (talentData?.avaloUserId) {
        deepLink = `avalo://profile/${talentData.avaloUserId}?ref=campaign_${data.campaignSlug}`;
      }
      
      return {
        success: true,
        eventId,
        deepLink,
      };
    } catch (error: any) {
      logger.error('Error logging campaign visit', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

// ============================================================================
// CAMPAIGN EVENT LOGGING (INTERNAL)
// ============================================================================

/**
 * Log campaign signup event
 * Called internally when user completes signup from campaign
 */
export async function logCampaignSignup(
  campaignId: string,
  talentId: string,
  userId: string,
  region?: string
): Promise<void> {
  try {
    const eventId = generateId();
    const signupEvent: CampaignAttributionEvent = {
      id: eventId,
      campaignId,
      talentId,
      avaloUserId: userId,
      eventType: 'SIGNUP',
      occurredAt: serverTimestamp(),
      region,
    };
    
    await db
      .collection('campaign_attribution_events')
      .doc(eventId)
      .set(signupEvent);
    
    logger.info(`Campaign signup logged: ${campaignId} via talent ${talentId}`);
  } catch (error: any) {
    logger.error('Error logging campaign signup', error);
    // Don't throw - this is optional tracking
  }
}

/**
 * Log campaign follow event
 * Called when user follows talent on Avalo
 */
export async function logCampaignFollow(
  userId: string,
  creatorId: string
): Promise<void> {
  try {
    // Check if this creator is a talent in any active campaigns
    const talentDoc = await db
      .collection('talent_profiles')
      .where('avaloUserId', '==', creatorId)
      .limit(1)
      .get();
    
    if (talentDoc.empty) {
      return; // Not a campaign talent
    }
    
    const talentId = talentDoc.docs[0].id;
    
    // Find active campaigns for this talent
    const campaignsQuery = await db
      .collection('partnership_campaigns')
      .where('talentIds', 'array-contains', talentId)
      .where('status', '==', 'ACTIVE')
      .get();
    
    // Log follow event for each active campaign
    for (const campaignDoc of campaignsQuery.docs) {
      const eventId = generateId();
      const followEvent: CampaignAttributionEvent = {
        id: eventId,
        campaignId: campaignDoc.id,
        talentId,
        avaloUserId: userId,
        eventType: 'FOLLOW',
        occurredAt: serverTimestamp(),
      };
      
      await db
        .collection('campaign_attribution_events')
        .doc(eventId)
        .set(followEvent);
    }
    
    logger.info(`Campaign follow logged for talent ${talentId}`);
  } catch (error: any) {
    logger.error('Error logging campaign follow', error);
    // Don't throw - this is optional tracking
  }
}

/**
 * Log first paid interaction event
 * Called when user has first paid interaction with talent
 */
export async function logCampaignFirstPaidInteraction(
  userId: string,
  creatorId: string
): Promise<void> {
  try {
    // Check if this creator is a talent in any active campaigns
    const talentDoc = await db
      .collection('talent_profiles')
      .where('avaloUserId', '==', creatorId)
      .limit(1)
      .get();
    
    if (talentDoc.empty) {
      return; // Not a campaign talent
    }
    
    const talentId = talentDoc.docs[0].id;
    
    // Check if already logged
    const existingEvent = await db
      .collection('campaign_attribution_events')
      .where('talentId', '==', talentId)
      .where('avaloUserId', '==', userId)
      .where('eventType', '==', 'FIRST_PAID_INTERACTION')
      .limit(1)
      .get();
    
    if (!existingEvent.empty) {
      return; // Already logged
    }
    
    // Find active campaigns for this talent
    const campaignsQuery = await db
      .collection('partnership_campaigns')
      .where('talentIds', 'array-contains', talentId)
      .where('status', '==', 'ACTIVE')
      .get();
    
    // Log event for each active campaign
    for (const campaignDoc of campaignsQuery.docs) {
      const eventId = generateId();
      const paidEvent: CampaignAttributionEvent = {
        id: eventId,
        campaignId: campaignDoc.id,
        talentId,
        avaloUserId: userId,
        eventType: 'FIRST_PAID_INTERACTION',
        occurredAt: serverTimestamp(),
      };
      
      await db
        .collection('campaign_attribution_events')
        .doc(eventId)
        .set(paidEvent);
    }
    
    logger.info(`Campaign first paid interaction logged for talent ${talentId}`);
  } catch (error: any) {
    logger.error('Error logging campaign first paid interaction', error);
    // Don't throw - this is optional tracking
  }
}

// ============================================================================
// CAMPAIGN PERFORMANCE ANALYTICS (ADMIN)
// ============================================================================

/**
 * Get campaign performance metrics (admin-only)
 */
export const admin_getCampaignPerformance = onCall(
  { region: 'europe-west3' },
  async (request): Promise<GetCampaignPerformanceResponse> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    
    await verifyAdminRole(request.auth.uid);
    
    const data = request.data as GetCampaignPerformanceRequest;
    
    if (!data.campaignId) {
      throw new HttpsError('invalid-argument', 'campaignId required');
    }
    
    try {
      // Verify campaign exists
      const campaignDoc = await db
        .collection('partnership_campaigns')
        .doc(data.campaignId)
        .get();
      
      if (!campaignDoc.exists) {
        return {
          success: false,
          error: 'Campaign not found',
        };
      }
      
      const campaign = campaignDoc.data() as PartnershipCampaign;
      
      // Determine date range
      const endDate = data.toDate ? parseDate(data.toDate) : new Date();
      const startDate = data.fromDate
        ? parseDate(data.fromDate)
        : (campaign.startDate as Timestamp).toDate();
      
      // Fetch all attribution events for this campaign
      const eventsQuery = await db
        .collection('campaign_attribution_events')
        .where('campaignId', '==', data.campaignId)
        .where('occurredAt', '>=', Timestamp.fromDate(startDate))
        .where('occurredAt', '<=', Timestamp.fromDate(endDate))
        .get();
      
      // Aggregate metrics
      let visits = 0;
      let signups = 0;
      let follows = 0;
      let firstMessages = 0;
      let firstPaidInteractions = 0;
      
      const talentMetrics = new Map<string, {
        visits: number;
        signups: number;
        follows: number;
        firstMessages: number;
        firstPaidInteractions: number;
        regionBreakdown: Record<string, number>;
      }>();
      
      const regionMetrics: Record<string, {
        visits: number;
        signups: number;
        follows: number;
      }> = {};
      
      const channelMetrics: Partial<Record<CampaignChannel, {
        visits: number;
        signups: number;
        follows: number;
      }>> = {};
      
      eventsQuery.forEach((doc) => {
        const event = doc.data() as CampaignAttributionEvent;
        
        // Update overall metrics
        switch (event.eventType) {
          case 'VISIT':
            visits++;
            break;
          case 'SIGNUP':
            signups++;
            break;
          case 'FOLLOW':
            follows++;
            break;
          case 'FIRST_MESSAGE':
            firstMessages++;
            break;
          case 'FIRST_PAID_INTERACTION':
            firstPaidInteractions++;
            break;
        }
        
        // Update talent-specific metrics
        if (!talentMetrics.has(event.talentId)) {
          talentMetrics.set(event.talentId, {
            visits: 0,
            signups: 0,
            follows: 0,
            firstMessages: 0,
            firstPaidInteractions: 0,
            regionBreakdown: {},
          });
        }
        
        const talentMetric = talentMetrics.get(event.talentId)!;
        
        switch (event.eventType) {
          case 'VISIT':
            talentMetric.visits++;
            if (event.region) {
              talentMetric.regionBreakdown[event.region] =
                (talentMetric.regionBreakdown[event.region] || 0) + 1;
            }
            break;
          case 'SIGNUP':
            talentMetric.signups++;
            break;
          case 'FOLLOW':
            talentMetric.follows++;
            break;
          case 'FIRST_MESSAGE':
            talentMetric.firstMessages++;
            break;
          case 'FIRST_PAID_INTERACTION':
            talentMetric.firstPaidInteractions++;
            break;
        }
        
        // Update region metrics
        if (event.region) {
          if (!regionMetrics[event.region]) {
            regionMetrics[event.region] = { visits: 0, signups: 0, follows: 0 };
          }
          
          switch (event.eventType) {
            case 'VISIT':
              regionMetrics[event.region].visits++;
              break;
            case 'SIGNUP':
              regionMetrics[event.region].signups++;
              break;
            case 'FOLLOW':
              regionMetrics[event.region].follows++;
              break;
          }
        }
        
        // Update channel metrics
        if (event.platform) {
          if (!channelMetrics[event.platform]) {
            channelMetrics[event.platform] = { visits: 0, signups: 0, follows: 0 };
          }
          
          switch (event.eventType) {
            case 'VISIT':
              channelMetrics[event.platform]!.visits++;
              break;
            case 'SIGNUP':
              channelMetrics[event.platform]!.signups++;
              break;
            case 'FOLLOW':
              channelMetrics[event.platform]!.follows++;
              break;
          }
        }
      });
      
      // Build talent breakdown
      const byTalent: TalentPerformanceBreakdown[] = [];
      
      for (const [talentId, metrics] of Array.from(talentMetrics.entries())) {
        const talentDoc = await db.collection('talent_profiles').doc(talentId).get();
        const talentData = talentDoc.data() as TalentProfile;
        
        byTalent.push({
          talentId,
          talentName: talentData?.externalHandles?.instagram ||
                      talentData?.externalHandles?.tiktok ||
                      'Unknown',
          visits: metrics.visits,
          signups: metrics.signups,
          follows: metrics.follows,
          firstMessages: metrics.firstMessages,
          firstPaidInteractions: metrics.firstPaidInteractions,
          regionBreakdown: metrics.regionBreakdown,
        });
      }
      
      // Calculate conversion rates
      const visitToSignupRate = visits > 0 ? signups / visits : 0;
      const signupToFollowRate = signups > 0 ? follows / signups : 0;
      const followToPayerRate = follows > 0 ? firstPaidInteractions / follows : 0;
      
      const performanceMetrics: CampaignPerformanceMetrics = {
        campaignId: data.campaignId,
        periodStart: formatDateYMD(startDate),
        periodEnd: formatDateYMD(endDate),
        visits,
        signups,
        follows,
        firstMessages,
        firstPaidInteractions,
        visitToSignupRate,
        signupToFollowRate,
        followToPayerRate,
        byTalent,
        byRegion: regionMetrics,
        byChannel: channelMetrics,
        updatedAt: serverTimestamp(),
      };
      
      return {
        success: true,
        metrics: performanceMetrics,
      };
    } catch (error: any) {
      logger.error('Error getting campaign performance', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

// ============================================================================
// CREATOR-FACING CAMPAIGN INFO
// ============================================================================

/**
 * Get campaigns for creator (if they are a talent)
 */
export const getCreatorCampaigns = onCall(
  { region: 'europe-west3' },
  async (request): Promise<GetCreatorCampaignsResponse> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    
    const userId = request.auth.uid;
    
    try {
      // Check if user is a talent
      const talentQuery = await db
        .collection('talent_profiles')
        .where('avaloUserId', '==', userId)
        .limit(1)
        .get();
      
      if (talentQuery.empty) {
        return {
          success: true,
          campaigns: [],
        };
      }
      
      const talentId = talentQuery.docs[0].id;
      
      // Get campaigns for this talent
      const campaignsQuery = await db
        .collection('partnership_campaigns')
        .where('talentIds', 'array-contains', talentId)
        .where('status', 'in', ['PLANNED', 'ACTIVE', 'COMPLETED'])
        .get();
      
      const campaigns: CreatorCampaignSummary[] = [];
      
      for (const campaignDoc of campaignsQuery.docs) {
        const campaign = campaignDoc.data() as PartnershipCampaign;
        
        // Get metrics for this talent in this campaign
        const eventsQuery = await db
          .collection('campaign_attribution_events')
          .where('campaignId', '==', campaignDoc.id)
          .where('talentId', '==', talentId)
          .get();
        
        let visits = 0;
        let signups = 0;
        let follows = 0;
        let firstPaidInteractions = 0;
        
        eventsQuery.forEach((doc) => {
          const event = doc.data() as CampaignAttributionEvent;
          switch (event.eventType) {
            case 'VISIT':
              visits++;
              break;
            case 'SIGNUP':
              signups++;
              break;
            case 'FOLLOW':
              follows++;
              break;
            case 'FIRST_PAID_INTERACTION':
              firstPaidInteractions++;
              break;
          }
        });
        
        // Generate smart links
        const baseUrl = 'https://avalo.app/c/';
        const smartLinks = {
          web: `${baseUrl}${campaign.slug}?t=${talentId}`,
          tiktok: `${baseUrl}${campaign.slug}?t=${talentId}&utm_source=tiktok`,
          instagram: `${baseUrl}${campaign.slug}?t=${talentId}&utm_source=instagram`,
          youtube: `${baseUrl}${campaign.slug}?t=${talentId}&utm_source=youtube`,
        };
        
        campaigns.push({
          campaignId: campaignDoc.id,
          campaignName: campaign.name,
          description: campaign.description,
          objectives: campaign.objectives,
          startDate: (campaign.startDate as Timestamp).toDate(),
          endDate: (campaign.endDate as Timestamp).toDate(),
          status: campaign.status,
          smartLinks,
          metrics: {
            visits,
            signups,
            follows,
            firstPaidInteractions,
          },
        });
      }
      
      return {
        success: true,
        campaigns,
      };
    } catch (error: any) {
      logger.error('Error getting creator campaigns', error);
      throw new HttpsError('internal', error.message);
    }
  }
);