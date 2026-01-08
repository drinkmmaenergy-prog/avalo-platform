/**
 * PACK 230: Post-Meeting Glow Engine - HTTP Endpoints
 */

import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { auth } from './init.js';
import {
  submitPostMeetingFeedback,
  submitEventFeedback,
  getActiveGlowState,
  getGlowActionSuggestions,
  dismissActionSuggestion,
  trackSuggestionInteraction,
  expireOldGlowStates
} from './pack-230-post-meeting-glow.js';

// ============================================================================
// HTTP ENDPOINTS
// ============================================================================

/**
 * Submit post-meeting feedback
 * POST /api/meetings/feedback
 */
export const submitMeetingFeedback = onRequest(
  {
    cors: true,
    region: 'europe-central2',
    memory: '512MiB'
  },
  async (req, res) => {
    try {
      // Verify authentication
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const token = authHeader.split('Bearer ')[1];
      const decodedToken = await auth.verifyIdToken(token);
      const userId = decodedToken.uid;

      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }

      const {
        bookingId,
        overallVibe,
        wouldMeetAgain,
        tags,
        selfieMismatchReported,
        selfieMismatchDetails,
        voluntaryRefundPercent
      } = req.body;

      // Validate required fields
      if (!bookingId || !overallVibe || !wouldMeetAgain) {
        res.status(400).json({ error: 'Missing required fields' });
        return;
      }

      const result = await submitPostMeetingFeedback({
        bookingId,
        userId,
        overallVibe,
        wouldMeetAgain,
        tags: tags || [],
        selfieMismatchReported,
        selfieMismatchDetails,
        voluntaryRefundPercent
      });

      if (!result.success) {
        res.status(400).json({ error: result.error });
        return;
      }

      res.status(200).json({
        success: true,
        feedbackId: result.feedbackId
      });
    } catch (error: any) {
      console.error('Error submitting meeting feedback:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * Submit event feedback
 * POST /api/events/feedback
 */
export const submitEventFeedbackEndpoint = onRequest(
  {
    cors: true,
    region: 'europe-central2',
    memory: '512MiB'
  },
  async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const token = authHeader.split('Bearer ')[1];
      const decodedToken = await auth.verifyIdToken(token);
      const userId = decodedToken.uid;

      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }

      const { eventId, eventVibe, wouldAttendAgain, connections } = req.body;

      if (!eventId || !eventVibe || wouldAttendAgain === undefined) {
        res.status(400).json({ error: 'Missing required fields' });
        return;
      }

      const result = await submitEventFeedback({
        eventId,
        userId,
        eventVibe,
        wouldAttendAgain,
        connections: connections || []
      });

      if (!result.success) {
        res.status(400).json({ error: result.error });
        return;
      }

      res.status(200).json({
        success: true,
        eventGlowId: result.eventGlowId
      });
    } catch (error: any) {
      console.error('Error submitting event feedback:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * Get user's active glow state
 * GET /api/glow/state
 */
export const getGlowState = onRequest(
  {
    cors: true,
    region: 'europe-central2',
    memory: '256MiB'
  },
  async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const token = authHeader.split('Bearer ')[1];
      const decodedToken = await auth.verifyIdToken(token);
      const userId = decodedToken.uid;

      if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }

      const glowState = await getActiveGlowState(userId);

      res.status(200).json({
        success: true,
        glowState
      });
    } catch (error: any) {
      console.error('Error getting glow state:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * Get user's glow action suggestions
 * GET /api/glow/suggestions
 */
export const getGlowSuggestions = onRequest(
  {
    cors: true,
    region: 'europe-central2',
    memory: '256MiB'
  },
  async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const token = authHeader.split('Bearer ')[1];
      const decodedToken = await auth.verifyIdToken(token);
      const userId = decodedToken.uid;

      if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }

      const suggestions = await getGlowActionSuggestions(userId);

      res.status(200).json({
        success: true,
        suggestions
      });
    } catch (error: any) {
      console.error('Error getting glow suggestions:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * Dismiss action suggestion
 * POST /api/glow/suggestions/:suggestionId/dismiss
 */
export const dismissSuggestion = onRequest(
  {
    cors: true,
    region: 'europe-central2',
    memory: '256MiB'
  },
  async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const token = authHeader.split('Bearer ')[1];
      await auth.verifyIdToken(token);

      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }

      const { suggestionId } = req.body;

      if (!suggestionId) {
        res.status(400).json({ error: 'Missing suggestionId' });
        return;
      }

      await dismissActionSuggestion(suggestionId);

      res.status(200).json({ success: true });
    } catch (error: any) {
      console.error('Error dismissing suggestion:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * Track suggestion interaction
 * POST /api/glow/suggestions/:suggestionId/interact
 */
export const interactWithSuggestion = onRequest(
  {
    cors: true,
    region: 'europe-central2',
    memory: '256MiB'
  },
  async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const token = authHeader.split('Bearer ')[1];
      await auth.verifyIdToken(token);

      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }

      const { suggestionId } = req.body;

      if (!suggestionId) {
        res.status(400).json({ error: 'Missing suggestionId' });
        return;
      }

      await trackSuggestionInteraction(suggestionId);

      res.status(200).json({ success: true });
    } catch (error: any) {
      console.error('Error tracking suggestion interaction:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// ============================================================================
// SCHEDULED FUNCTIONS
// ============================================================================

/**
 * Expire old glow states
 * Runs every hour
 */
export const expireGlowStates = onSchedule(
  {
    schedule: 'every 1 hours',
    timeZone: 'UTC',
    region: 'europe-central2',
    memory: '512MiB'
  },
  async (event) => {
    try {
      console.log('Starting glow state expiration job...');
      await expireOldGlowStates();
      console.log('Glow state expiration job completed');
    } catch (error) {
      console.error('Error in glow state expiration job:', error);
      throw error;
    }
  }
);