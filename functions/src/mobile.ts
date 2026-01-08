/**
 * mobile.ts - Mobile app specific functions
 * Stub implementations for Avalo Mobile App
 *
 * PACK 314: Enhanced with feature guards and country rollout
 */

import { onCall } from 'firebase-functions/v2/https';
import { HttpsError } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { enforceFeatureAccess } from './pack314-feature-guards';

/**
 * Get swipe candidates
 */
export const getSwipeCandidatesV1 = onCall(
  { region: "us-central1" },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError("unauthenticated", "User must be logged in");
    }

    // PACK 314: Enforce swipe feature access
    await enforceFeatureAccess(auth.uid, "swipe");

    const schema = z.object({
      limit: z.number().min(1).max(50).optional().default(10),
    });

    const data = schema.parse(request.data);

    // Mock candidates for now
    const mockCandidates = Array.from({ length: data.limit }, (_, i) => ({
      id: `user_${Date.now()}_${i}`,
      name: ["Anna", "Kasia", "Marta"][i % 3],
      age: 22 + (i % 8),
      bio: "Mock bio from backend",
      photos: [`https://picsum.photos/400/600?random=${i}`],
      distance: 1 + (i % 20),
    }));

    return {
      success: true,
      candidates: mockCandidates,
    };
  }
);

/**
 * Swipe Yes (like)
 */
export const swipeYesV1 = onCall(
  { region: "us-central1" },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError("unauthenticated", "User must be logged in");
    }

    const schema = z.object({
      targetUserId: z.string(),
    });

    const data = schema.parse(request.data);

    // Mock: 30% chance of match
    const isMatch = Math.random() < 0.3;

    return {
      success: true,
      isMatch,
      targetUserId: data.targetUserId,
    };
  }
);

/**
 * Swipe No (pass)
 */
export const swipeNoV1 = onCall(
  { region: "us-central1" },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError("unauthenticated", "User must be logged in");
    }

    const schema = z.object({
      targetUserId: z.string(),
    });

    const data = schema.parse(request.data);

    return {
      success: true,
      targetUserId: data.targetUserId,
    };
  }
);

/**
 * Get discovery profiles
 */
export const getDiscoveryProfilesV1 = onCall(
  { region: "us-central1" },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError("unauthenticated", "User must be logged in");
    }

    // PACK 314: Enforce discovery feature access
    await enforceFeatureAccess(auth.uid, "discovery");

    const schema = z.object({
      limit: z.number().min(1).max(50).optional().default(20),
      startAfter: z.string().optional(),
      filters: z.object({
        minAge: z.number().optional(),
        maxAge: z.number().optional(),
        maxDistance: z.number().optional(),
      }).optional(),
    });

    const data = schema.parse(request.data);

    // Mock profiles
    const mockProfiles = Array.from({ length: data.limit }, (_, i) => ({
      id: `discovery_${Date.now()}_${i}`,
      name: ["Anna", "Kasia", "Marta", "Ola"][i % 4],
      age: 22 + (i % 8),
      bio: "Mock discovery profile",
      photos: [`https://picsum.photos/400/600?random=${i + 100}`],
      distance: 1 + (i % 20),
      lastActive: ["1h ago", "2h ago", "Today"][i % 3],
    }));

    return {
      success: true,
      profiles: mockProfiles,
      hasMore: true,
    };
  }
);

/**
 * Get wallet balance
 */
export const getWalletBalanceV1 = onCall(
  { region: "us-central1" },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError("unauthenticated", "User must be logged in");
    }

    // Mock balance
    return {
      success: true,
      balance: 1234,
      currency: "tokens",
    };
  }
);

/**
 * Purchase tokens (placeholder for Stripe integration)
 */
export const purchaseTokensV1 = onCall(
  { region: "us-central1" },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError("unauthenticated", "User must be logged in");
    }

    const schema = z.object({
      priceId: z.string(),
    });

    const data = schema.parse(request.data);

    // Placeholder - in production, create Stripe payment intent
    return {
      success: true,
      message: "Payment processing not implemented yet",
      priceId: data.priceId,
    };
  }
);

/**
 * List AI Companions
 */
export const listAICompanionsV1 = onCall(
  { region: "us-central1" },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError("unauthenticated", "User must be logged in");
    }

    // PACK 314: Enforce AI companions feature access
    await enforceFeatureAccess(auth.uid, "aiCompanions");

    // Mock AI companions
    const companions = [
      {
        id: "ai_1",
        name: "Luna",
        avatar: "🌙",
        description: "Your supportive companion for late-night conversations",
        personality: ["Empathetic", "Wise", "Caring"],
        isActive: true,
      },
      {
        id: "ai_2",
        name: "Max",
        avatar: "⚡",
        description: "Energetic and fun personality for adventures",
        personality: ["Energetic", "Playful", "Optimistic"],
        isActive: true,
      },
      {
        id: "ai_3",
        name: "Sage",
        avatar: "🧙",
        description: "Philosophical discussions and deep thoughts",
        personality: ["Thoughtful", "Intellectual", "Calm"],
        isActive: false,
      },
    ];

    return {
      success: true,
      companions,
    };
  }
);

/**
 * Send message to AI Companion
 */
export const sendAIMessageV1 = onCall(
  { region: "us-central1" },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError("unauthenticated", "User must be logged in");
    }

    // PACK 314: Enforce AI companions feature access
    await enforceFeatureAccess(auth.uid, "aiCompanions");

    const schema = z.object({
      companionId: z.string(),
      content: z.string().min(1),
    });

    const data = schema.parse(request.data);

    // Mock AI response
    const responses = [
      "That's really interesting! Tell me more about that.",
      "I understand how you feel. It's completely normal to experience that.",
      "Have you considered looking at it from a different perspective?",
      "That sounds exciting! What are your thoughts on it?",
      "I'm here for you. How can I help you with that?",
    ];

    const randomResponse = responses[Math.floor(Math.random() * responses.length)];

    return {
      success: true,
      message: {
        id: `msg_${Date.now()}`,
        companionId: data.companionId,
        content: randomResponse,
        sender: "ai",
        timestamp: Date.now(),
      },
    };
  }
);

