/**
 * PACK 175 — Cyberstalking & Location Safety Defender
 * Media Safety Auto-Blocking System
 * 
 * Automatically blocks invasive media requests that serve as surveillance tools.
 * Victims are protected, not interrogated.
 */

import * as admin from 'firebase-admin';
import {
  InvasiveMediaRequestType,
  BlockedMediaRequest,
} from './types/cyberstalking.types';

const db = admin.firestore();

// ============================================================================
// INVASIVE MEDIA REQUEST PATTERNS
// ============================================================================

/**
 * Patterns that indicate invasive media requests
 */
const INVASIVE_PATTERNS = {
  LIVE_PHOTO_PROOF: {
    keywords: [
      'send photo now',
      'take a picture',
      'send me a pic',
      'prove it with photo',
      'photo right now',
      'selfie now',
    ],
    requiresImmediate: true,
    severity: 'HIGH' as const,
  },
  ROOM_SCAN_DEMAND: {
    keywords: [
      'show me the room',
      'show your room',
      'let me see around you',
      'pan the camera',
      'show me where you are',
    ],
    requiresImmediate: false,
    severity: 'HIGH' as const,
  },
  COMPANION_PROOF: {
    keywords: [
      'who are you with',
      'show me who',
      'let me see them',
      'prove youre alone',
      'show whos there',
    ],
    requiresImmediate: true,
    severity: 'CRITICAL' as const,
  },
  SCREEN_SHARE_DEMAND: {
    keywords: [
      'share your screen',
      'show me your phone',
      'let me see your chats',
      'share your messages',
      'show your conversations',
    ],
    requiresImmediate: false,
    severity: 'CRITICAL' as const,
  },
  SCHEDULE_UPLOAD: {
    keywords: [
      'send your schedule',
      'upload your calendar',
      'share your plans',
      'tell me your schedule',
    ],
    requiresImmediate: false,
    severity: 'MEDIUM' as const,
  },
};

// ============================================================================
// AUTO-BLOCKING FUNCTIONS
// ============================================================================

/**
 * Analyze message content for invasive media requests
 */
export async function detectInvasiveMediaRequest(
  senderId: string,
  recipientId: string,
  messageContent: string
): Promise<{
  isInvasive: boolean;
  requestType?: InvasiveMediaRequestType;
  shouldBlock: boolean;
  educationRequired: boolean;
}> {
  try {
    const lowerContent = messageContent.toLowerCase();
    
    // Check each pattern type
    for (const [patternKey, pattern] of Object.entries(INVASIVE_PATTERNS)) {
      const matchesPattern = pattern.keywords.some(keyword => 
        lowerContent.includes(keyword)
      );
      
      if (matchesPattern) {
        const requestType = patternKey as InvasiveMediaRequestType;
        
        // Auto-block the request
        const blockResult = await blockMediaRequest(
          senderId,
          recipientId,
          requestType,
          messageContent
        );
        
        return {
          isInvasive: true,
          requestType,
          shouldBlock: true,
          educationRequired: blockResult.educationRequired,
        };
      }
    }
    
    return {
      isInvasive: false,
      shouldBlock: false,
      educationRequired: false,
    };
  } catch (error) {
    console.error('[MediaSafetyBlocking] Error detecting invasive request:', error);
    return {
      isInvasive: false,
      shouldBlock: false,
      educationRequired: false,
    };
  }
}

/**
 * Block invasive media request
 */
async function blockMediaRequest(
  requesterId: string,
  victimId: string,
  requestType: InvasiveMediaRequestType,
  messageContent: string
): Promise<{
  blocked: boolean;
  educationRequired: boolean;
}> {
  try {
    const now = admin.firestore.Timestamp.now();
    const blockId = generateId();
    
    const blockedRequest: BlockedMediaRequest = {
      id: blockId,
      victimUserId: victimId,
      requesterId,
      requestType,
      blockedAt: now,
      autoBlocked: true,
      educationProvided: false,
    };
    
    // Store blocked request
    await db.collection('blocked_media_requests').doc(blockId).set(blockedRequest);
    
    // Check if this is first offense (education needed)
    const requestCount = await getMediaRequestCount(requesterId);
    const isFirstOffense = requestCount <= 1;
    
    // Log to stalking case if exists
    await linkToStalkingCase(requesterId, victimId, 'MEDIA_REQUEST', {
      requestType,
      messageContent: messageContent.substring(0, 100),
    });
    
    console.log(`[MediaSafetyBlocking] Blocked ${requestType} request from ${requesterId}`);
    
    return {
      blocked: true,
      educationRequired: isFirstOffense,
    };
  } catch (error) {
    console.error('[MediaSafetyBlocking] Error blocking media request:', error);
    return {
      blocked: false,
      educationRequired: false,
    };
  }
}

/**
 * Validate media share attempt
 */
export async function validateMediaShare(
  senderId: string,
  recipientId: string,
  mediaType: 'PHOTO' | 'VIDEO' | 'SCREEN' | 'LOCATION',
  context?: string
): Promise<{
  allowed: boolean;
  reason?: string;
  requiresConsent?: boolean;
}> {
  try {
    // Check if sender has recent invasive requests
    const recentRequests = await getRecentMediaRequests(senderId, 24); // Last 24 hours
    
    if (recentRequests.length > 0) {
      // User has been making invasive requests recently
      return {
        allowed: false,
        reason: 'Recent invasive media requests detected. Please respect privacy.',
        requiresConsent: true,
      };
    }
    
    // Check specific media types with extra scrutiny
    if (mediaType === 'SCREEN') {
      return {
        allowed: false,
        reason: 'Screen sharing for surveillance purposes is not allowed.',
      };
    }
    
    if (mediaType === 'LOCATION' && context?.includes('live')) {
      return {
        allowed: false,
        reason: 'Live location sharing must use official session-based sharing.',
      };
    }
    
    // Media share is allowed
    return {
      allowed: true,
    };
  } catch (error) {
    console.error('[MediaSafetyBlocking] Error validating media share:', error);
    return {
      allowed: true, // Fail open to not break legitimate uses
    };
  }
}

/**
 * Check if media request requires immediate response (surveillance indicator)
 */
export function isImmediateRequest(messageContent: string): boolean {
  const immediateKeywords = [
    'right now',
    'immediately',
    'now',
    'hurry',
    'quick',
    'asap',
    'this second',
  ];
  
  const lowerContent = messageContent.toLowerCase();
  return immediateKeywords.some(keyword => lowerContent.includes(keyword));
}

// ============================================================================
// EDUCATION & INTERVENTION
// ============================================================================

/**
 * Provide education about privacy and consent
 */
export async function provideMediaSafetyEducation(
  userId: string,
  requestType: InvasiveMediaRequestType
): Promise<void> {
  try {
    // Mark education as provided
    const educationDoc = await db.collection('media_safety_education').doc(userId).get();
    
    if (educationDoc.exists) {
      await educationDoc.ref.update({
        [`educationProvided.${requestType}`]: true,
        lastEducatedAt: admin.firestore.Timestamp.now(),
        educationCount: admin.firestore.FieldValue.increment(1),
      });
    } else {
      await db.collection('media_safety_education').doc(userId).set({
        userId,
        educationProvided: {
          [requestType]: true,
        },
        lastEducatedAt: admin.firestore.Timestamp.now(),
        educationCount: 1,
        createdAt: admin.firestore.Timestamp.now(),
      });
    }
    
    // Update blocked request to mark education provided
    const blockedRequests = await db.collection('blocked_media_requests')
      .where('requesterId', '==', userId)
      .where('requestType', '==', requestType)
      .where('educationProvided', '==', false)
      .limit(1)
      .get();
    
    if (!blockedRequests.empty) {
      await blockedRequests.docs[0].ref.update({
        educationProvided: true,
      });
    }
    
    console.log(`[MediaSafetyBlocking] Provided education to ${userId} about ${requestType}`);
  } catch (error) {
    console.error('[MediaSafetyBlocking] Error providing education:', error);
  }
}

/**
 * Get educational content for specific request type
 */
export function getEducationalContent(requestType: InvasiveMediaRequestType): {
  title: string;
  message: string;
  consequences: string[];
} {
  const content = {
    LIVE_PHOTO_PROOF: {
      title: 'Respect Privacy and Trust',
      message: 'Demanding immediate photo proof is a form of surveillance and control. Healthy relationships are built on trust, not constant proof.',
      consequences: [
        'This behavior violates platform privacy policies',
        'Repeated requests may result in account restrictions',
        'No one owes you proof of their activities',
      ],
    },
    ROOM_SCAN_DEMAND: {
      title: 'Privacy Boundaries Matter',
      message: 'Asking someone to show their surroundings is invasive and controlling. Everyone has a right to privacy in their personal space.',
      consequences: [
        'This is considered surveillance behavior',
        'May result in chat restrictions or timeout',
        'Respecting boundaries is essential',
      ],
    },
    COMPANION_PROOF: {
      title: 'Territorial Jealousy Is Not Acceptable',
      message: 'Demanding to see who someone is with is possessive and controlling. Everyone has the right to socialize freely.',
      consequences: [
        'This behavior may result in immediate restrictions',
        'Jealousy-based control is not tolerated',
        'Account may be flagged for review',
      ],
    },
    SCREEN_SHARE_DEMAND: {
      title: 'Digital Privacy Is Protected',
      message: 'Asking to see someone\'s messages or screen is a severe privacy violation. This type of surveillance is never acceptable.',
      consequences: [
        'This may result in immediate account suspension',
        'Private conversations are protected',
        'This behavior will be reported to moderation',
      ],
    },
    SCHEDULE_UPLOAD: {
      title: 'Control Over Time Is Not Allowed',
      message: 'Demanding to see someone\'s schedule is a control tactic. Everyone has the right to manage their time privately.',
      consequences: [
        'This behavior indicates unhealthy attachment',
        'May result in messaging restrictions',
        'Consider why you feel the need to monitor',
      ],
    },
  };
  
  return content[requestType] || {
    title: 'Respect Privacy',
    message: 'The request you made violates privacy boundaries.',
    consequences: ['This behavior is not allowed on the platform'],
  };
}

// ============================================================================
// REPORTING & CASE MANAGEMENT
// ============================================================================

/**
 * Link media request to existing stalking case
 */
async function linkToStalkingCase(
  stalkerId: string,
  victimId: string,
  evidenceType: string,
  evidence: any
): Promise<void> {
  try {
    // Find active stalking case
    const casesSnapshot = await db.collection('stalking_cases')
      .where('stalkerUserId', '==', stalkerId)
      .where('victimUserId', '==', victimId)
      .where('status', 'in', ['ACTIVE', 'ESCALATED'])
      .limit(1)
      .get();
    
    if (!casesSnapshot.empty) {
      const caseDoc = casesSnapshot.docs[0];
      const caseData = caseDoc.data();
      
      // Add media request to case evidence
      await caseDoc.ref.update({
        mediaRequests: admin.firestore.FieldValue.arrayUnion({
          type: evidenceType,
          evidence,
          timestamp: admin.firestore.Timestamp.now(),
        }),
        lastActivityAt: admin.firestore.Timestamp.now(),
      });
      
      console.log(`[MediaSafetyBlocking] Linked media request to case ${caseDoc.id}`);
    }
  } catch (error) {
    console.error('[MediaSafetyBlocking] Error linking to case:', error);
  }
}

/**
 * Get recent media requests by user
 */
async function getRecentMediaRequests(
  userId: string,
  hoursBack: number
): Promise<BlockedMediaRequest[]> {
  try {
    const cutoffTime = admin.firestore.Timestamp.fromMillis(
      Date.now() - hoursBack * 60 * 60 * 1000
    );
    
    const requestsSnapshot = await db.collection('blocked_media_requests')
      .where('requesterId', '==', userId)
      .where('blockedAt', '>=', cutoffTime)
      .get();
    
    return requestsSnapshot.docs.map(doc => doc.data() as BlockedMediaRequest);
  } catch (error) {
    console.error('[MediaSafetyBlocking] Error getting recent requests:', error);
    return [];
  }
}

/**
 * Get total count of media requests by user
 */
async function getMediaRequestCount(userId: string): Promise<number> {
  try {
    const requestsSnapshot = await db.collection('blocked_media_requests')
      .where('requesterId', '==', userId)
      .get();
    
    return requestsSnapshot.size;
  } catch (error) {
    console.error('[MediaSafetyBlocking] Error getting request count:', error);
    return 0;
  }
}

/**
 * Get user's blocked media requests
 */
export async function getUserBlockedMediaRequests(
  userId: string,
  role: 'victim' | 'requester'
): Promise<BlockedMediaRequest[]> {
  try {
    const field = role === 'victim' ? 'victimUserId' : 'requesterId';
    const requestsSnapshot = await db.collection('blocked_media_requests')
      .where(field, '==', userId)
      .orderBy('blockedAt', 'desc')
      .limit(50)
      .get();
    
    return requestsSnapshot.docs.map(doc => doc.data() as BlockedMediaRequest);
  } catch (error) {
    console.error('[MediaSafetyBlocking] Error getting blocked requests:', error);
    return [];
  }
}

/**
 * Check if user needs media safety education
 */
export async function needsMediaEducation(userId: string): Promise<{
  needsEducation: boolean;
  requestTypes: InvasiveMediaRequestType[];
}> {
  try {
    // Get requests that haven't had education provided
    const uneducatedRequests = await db.collection('blocked_media_requests')
      .where('requesterId', '==', userId)
      .where('educationProvided', '==', false)
      .get();
    
    if (uneducatedRequests.empty) {
      return {
        needsEducation: false,
        requestTypes: [],
      };
    }
    
    const requestTypesSet = new Set<InvasiveMediaRequestType>();
    uneducatedRequests.docs.forEach(doc => {
      requestTypesSet.add(doc.data().requestType as InvasiveMediaRequestType);
    });
    const requestTypes = Array.from(requestTypesSet);
    
    return {
      needsEducation: true,
      requestTypes,
    };
  } catch (error) {
    console.error('[MediaSafetyBlocking] Error checking education need:', error);
    return {
      needsEducation: false,
      requestTypes: [],
    };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate unique ID
 */
function generateId(): string {
  return db.collection('_').doc().id;
}

/**
 * Get media safety statistics for user
 */
export async function getMediaSafetyStats(userId: string): Promise<{
  totalRequestsBlocked: number;
  educationReceived: number;
  lastBlockedAt?: admin.firestore.Timestamp;
  mostFrequentType?: InvasiveMediaRequestType;
}> {
  try {
    const requests = await getUserBlockedMediaRequests(userId, 'requester');
    
    if (requests.length === 0) {
      return {
        totalRequestsBlocked: 0,
        educationReceived: 0,
      };
    }
    
    const educationDoc = await db.collection('media_safety_education').doc(userId).get();
    const educationCount = educationDoc.exists ? educationDoc.data()?.educationCount || 0 : 0;
    
    // Find most frequent type
    const typeCounts: Record<string, number> = {};
    requests.forEach(req => {
      typeCounts[req.requestType] = (typeCounts[req.requestType] || 0) + 1;
    });
    
    const mostFrequentType = Object.entries(typeCounts)
      .sort(([, a], [, b]) => b - a)[0]?.[0] as InvasiveMediaRequestType;
    
    return {
      totalRequestsBlocked: requests.length,
      educationReceived: educationCount,
      lastBlockedAt: requests[0]?.blockedAt,
      mostFrequentType,
    };
  } catch (error) {
    console.error('[MediaSafetyBlocking] Error getting stats:', error);
    return {
      totalRequestsBlocked: 0,
      educationReceived: 0,
    };
  }
}