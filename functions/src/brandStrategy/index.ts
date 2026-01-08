import { https, logger } from 'firebase-functions/v2';
import { defineSecret } from 'firebase-functions/params';
import {
  generateStrategyProfile,
  generateContentCalendar,
  generateRoadmap,
  updateStrategyWithAnalytics,
  logStrategyInteraction,
} from './strategyFunctions';
import {
  GenerateStrategyProfileRequest,
  GenerateContentCalendarRequest,
  GenerateRoadmapRequest,
  UpdateStrategyWithAnalyticsRequest,
} from '../types/brandStrategy';

const REGION = 'europe-west1';

/**
 * Generate a brand strategy profile for a creator
 */
export const createStrategyProfile = https.onCall(
  {
    region: REGION,
    cors: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    try {
      const data = request.data as GenerateStrategyProfileRequest;

      if (data.creatorId !== uid) {
        throw new https.HttpsError(
          'permission-denied',
          'Cannot create strategy profile for another user'
        );
      }

      const profile = await generateStrategyProfile(data);

      logger.info('Strategy profile created', { profileId: profile.id, creatorId: uid });

      return { success: true, profile };
    } catch (error: any) {
      logger.error('Error creating strategy profile', { error: error.message, uid });
      throw new https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Generate content calendar for a creator
 */
export const createContentCalendar = https.onCall(
  {
    region: REGION,
    cors: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    try {
      const data = request.data as GenerateContentCalendarRequest;

      const plan = await generateContentCalendar(data);

      if (plan.creatorId !== uid) {
        throw new https.HttpsError(
          'permission-denied',
          'Cannot create calendar for another user'
        );
      }

      logger.info('Content calendar created', { planId: plan.id, creatorId: uid });

      return { success: true, plan };
    } catch (error: any) {
      logger.error('Error creating content calendar', { error: error.message, uid });
      throw new https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Generate career roadmap for a creator
 */
export const createCareerRoadmap = https.onCall(
  {
    region: REGION,
    cors: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    try {
      const data = request.data as GenerateRoadmapRequest;

      const roadmap = await generateRoadmap(data);

      if (roadmap.creatorId !== uid) {
        throw new https.HttpsError(
          'permission-denied',
          'Cannot create roadmap for another user'
        );
      }

      logger.info('Career roadmap created', { roadmapId: roadmap.id, creatorId: uid });

      return { success: true, roadmap };
    } catch (error: any) {
      logger.error('Error creating career roadmap', { error: error.message, uid });
      throw new https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Update strategy with analytics data
 */
export const updateStrategyAnalytics = https.onCall(
  {
    region: REGION,
    cors: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    try {
      const data = request.data as UpdateStrategyWithAnalyticsRequest;

      const insights = await updateStrategyWithAnalytics(data);

      logger.info('Strategy updated with analytics', {
        profileId: data.profileId,
        insightCount: insights.length,
        creatorId: uid,
      });

      return { success: true, insights };
    } catch (error: any) {
      logger.error('Error updating strategy with analytics', { error: error.message, uid });
      throw new https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Log strategy interaction
 */
export const recordStrategyInteraction = https.onCall(
  {
    region: REGION,
    cors: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    try {
      const data = request.data;

      if (data.creatorId !== uid) {
        throw new https.HttpsError(
          'permission-denied',
          'Cannot log interaction for another user'
        );
      }

      await logStrategyInteraction(data);

      logger.info('Strategy interaction logged', {
        profileId: data.profileId,
        type: data.interactionType,
        creatorId: uid,
      });

      return { success: true };
    } catch (error: any) {
      logger.error('Error logging strategy interaction', { error: error.message, uid });
      throw new https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Get strategy profile
 */
export const getStrategyProfile = https.onCall(
  {
    region: REGION,
    cors: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    try {
      const { profileId } = request.data;

      const { db } = await import('../init');
      const profileDoc = await db.collection('ai_strategy_profiles').doc(profileId).get();

      if (!profileDoc.exists) {
        throw new https.HttpsError('not-found', 'Strategy profile not found');
      }

      const profile = profileDoc.data();
      if (profile?.creatorId !== uid) {
        throw new https.HttpsError(
          'permission-denied',
          'Cannot access another user\'s strategy profile'
        );
      }

      return { success: true, profile };
    } catch (error: any) {
      logger.error('Error getting strategy profile', { error: error.message, uid });
      throw new https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Get content calendar
 */
export const getContentCalendar = https.onCall(
  {
    region: REGION,
    cors: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    try {
      const { planId } = request.data;

      const { db } = await import('../init');
      const planDoc = await db.collection('content_strategy_plans').doc(planId).get();

      if (!planDoc.exists) {
        throw new https.HttpsError('not-found', 'Content calendar not found');
      }

      const plan = planDoc.data();
      if (plan?.creatorId !== uid) {
        throw new https.HttpsError(
          'permission-denied',
          'Cannot access another user\'s content calendar'
        );
      }

      return { success: true, plan };
    } catch (error: any) {
      logger.error('Error getting content calendar', { error: error.message, uid });
      throw new https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Get career roadmap
 */
export const getCareerRoadmap = https.onCall(
  {
    region: REGION,
    cors: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    try {
      const { roadmapId } = request.data;

      const { db } = await import('../init');
      const roadmapDoc = await db.collection('brand_roadmaps').doc(roadmapId).get();

      if (!roadmapDoc.exists) {
        throw new https.HttpsError('not-found', 'Career roadmap not found');
      }

      const roadmap = roadmapDoc.data();
      if (roadmap?.creatorId !== uid) {
        throw new https.HttpsError(
          'permission-denied',
          'Cannot access another user\'s career roadmap'
        );
      }

      return { success: true, roadmap };
    } catch (error: any) {
      logger.error('Error getting career roadmap', { error: error.message, uid });
      throw new https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Get strategy insights
 */
export const getStrategyInsights = https.onCall(
  {
    region: REGION,
    cors: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    try {
      const { profileId, limit = 10 } = request.data;

      const { db } = await import('../init');
      const insightsSnapshot = await db
        .collection('strategy_insights')
        .where('profileId', '==', profileId)
        .where('creatorId', '==', uid)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();

      const insights = insightsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));

      return { success: true, insights };
    } catch (error: any) {
      logger.error('Error getting strategy insights', { error: error.message, uid });
      throw new https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Update calendar item status
 */
export const updateCalendarItemStatus = https.onCall(
  {
    region: REGION,
    cors: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    try {
      const { planId, itemId, status } = request.data;

      const { db } = await import('../init');
      const planDoc = await db.collection('content_strategy_plans').doc(planId).get();

      if (!planDoc.exists) {
        throw new https.HttpsError('not-found', 'Content calendar not found');
      }

      const plan = planDoc.data();
      if (plan?.creatorId !== uid) {
        throw new https.HttpsError(
          'permission-denied',
          'Cannot modify another user\'s content calendar'
        );
      }

      const calendar = plan.contentCalendar || [];
      const itemIndex = calendar.findIndex((item: any) => item.id === itemId);

      if (itemIndex === -1) {
        throw new https.HttpsError('not-found', 'Calendar item not found');
      }

      calendar[itemIndex].status = status;

      await db.collection('content_strategy_plans').doc(planId).update({
        contentCalendar: calendar,
        updatedAt: new Date(),
      });

      logger.info('Calendar item status updated', { planId, itemId, status, creatorId: uid });

      return { success: true };
    } catch (error: any) {
      logger.error('Error updating calendar item status', { error: error.message, uid });
      throw new https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Update milestone status
 */
export const updateMilestoneStatus = https.onCall(
  {
    region: REGION,
    cors: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    try {
      const { roadmapId, milestoneId, status, completedDate } = request.data;

      const { db } = await import('../init');
      const roadmapDoc = await db.collection('brand_roadmaps').doc(roadmapId).get();

      if (!roadmapDoc.exists) {
        throw new https.HttpsError('not-found', 'Career roadmap not found');
      }

      const roadmap = roadmapDoc.data();
      if (roadmap?.creatorId !== uid) {
        throw new https.HttpsError(
          'permission-denied',
          'Cannot modify another user\'s career roadmap'
        );
      }

      const phases = roadmap.phases || [];
      let updated = false;

      for (const phase of phases) {
        const milestoneIndex = phase.milestones.findIndex((m: any) => m.id === milestoneId);
        if (milestoneIndex !== -1) {
          phase.milestones[milestoneIndex].status = status;
          if (completedDate && status === 'completed') {
            phase.milestones[milestoneIndex].completedDate = completedDate;
          }
          updated = true;
          break;
        }
      }

      if (!updated) {
        throw new https.HttpsError('not-found', 'Milestone not found');
      }

      await db.collection('brand_roadmaps').doc(roadmapId).update({
        phases,
        updatedAt: new Date(),
      });

      logger.info('Milestone status updated', { roadmapId, milestoneId, status, creatorId: uid });

      return { success: true };
    } catch (error: any) {
      logger.error('Error updating milestone status', { error: error.message, uid });
      throw new https.HttpsError('internal', error.message);
    }
  }
);