/**
 * PACK 161 — Anti-Flirt Manipulation Detection
 * Prevents creators from gaming discovery through seductive content
 * 
 * VIOLATIONS:
 * - Seductive thumbnails
 * - Suggestive clothing angles
 * - "Click for attention" captions
 * - Parasocial flirt hooks
 */

import { db, serverTimestamp } from '../init';
import { Timestamp } from 'firebase-admin/firestore';
import { FlirtManipulationFlags } from '../types/smartSocialGraph.types';

// ============================================================================
// LOGGER
// ============================================================================

const logger = {
  info: (...args: any[]) => console.log('[AntiFlirt]', ...args),
  warn: (...args: any[]) => console.warn('[AntiFlirt]', ...args),
  error: (...args: any[]) => console.error('[AntiFlirt]', ...args),
};

// ============================================================================
// DETECTION PATTERNS
// ============================================================================

/**
 * Flirt manipulation caption patterns
 */
const FLIRT_CAPTION_PATTERNS = [
  // Direct flirting
  /\b(click|tap|swipe)\s+(if|to)\s+(you\s+like|want|interested|lonely|single)\b/i,
  /\b(dm|message)\s+me\s+(if|for|when)\s+(lonely|horny|want|need)\b/i,
  /\bmeet\s+(hot|sexy|beautiful|attractive)\s+(girls|guys|singles)\b/i,
  
  // Attention baiting
  /\b(give|show)\s+me\s+(attention|love|affection)\b/i,
  /\bi'm\s+(lonely|bored|waiting|available)\b/i,
  /\bwho\s+(wants|needs)\s+(company|attention|love)\b/i,
  
  // Parasocial hooks
  /\b(your|my)\s+(virtual|online)\s+(girlfriend|boyfriend|partner)\b/i,
  /\bi'll\s+be\s+your\s+(everything|baby|darling)\b/i,
  /\bpretend\s+(we're|i'm)\s+(together|dating|lovers)\b/i,
  
  // Clickbait flirt
  /\bsecret\s+(tips|tricks)\s+(to|for)\s+(attract|seduce|get)\b/i,
  /\bhow\s+to\s+(get|attract)\s+(girls|guys|attention)\b/i,
  /\b(18\+|nsfw)\s+content\s+(inside|below|here)\b/i,
];

/**
 * Seductive thumbnail keywords (for metadata/AI analysis)
 */
const SEDUCTIVE_THUMBNAIL_KEYWORDS = [
  'cleavage',
  'lingerie',
  'bikini',
  'bedroom',
  'seductive pose',
  'suggestive angle',
  'exposed skin',
  'provocative',
  'sensual',
  'intimate',
];

/**
 * Suggestive clothing angle keywords
 */
const SUGGESTIVE_CLOTHING_KEYWORDS = [
  'low cut',
  'revealing',
  'tight clothing',
  'body emphasis',
  'sexualized pose',
  'camera angle emphasis',
];

// ============================================================================
// DETECTION FUNCTIONS
// ============================================================================

/**
 * Detect flirt manipulation in content caption
 */
function detectFlirtCaption(caption: string): boolean {
  if (!caption) return false;
  
  for (const pattern of FLIRT_CAPTION_PATTERNS) {
    if (pattern.test(caption)) {
      logger.warn(`Flirt manipulation detected in caption: ${caption.substring(0, 50)}...`);
      return true;
    }
  }
  
  return false;
}

/**
 * Detect seductive thumbnail (requires AI/metadata analysis)
 * This is a placeholder - would integrate with AI vision API
 */
async function detectSeductiveThumbnail(
  thumbnailUrl: string,
  metadata?: Record<string, any>
): Promise<boolean> {
  // In production, would call AI vision API to analyze thumbnail
  // For now, check metadata tags if available
  
  if (metadata?.tags) {
    const tags = Array.isArray(metadata.tags) 
      ? metadata.tags.map((t: any) => String(t).toLowerCase())
      : [];
    
    for (const keyword of SEDUCTIVE_THUMBNAIL_KEYWORDS) {
      if (tags.some(tag => tag.includes(keyword))) {
        logger.warn(`Seductive thumbnail detected: ${keyword} in tags`);
        return true;
      }
    }
  }
  
  // Check if content rating is NSFW (indicator)
  if (metadata?.contentRating === 'NSFW_SOFT' || metadata?.contentRating === 'NSFW_STRONG') {
    logger.warn('Seductive thumbnail detected: NSFW content rating');
    return true;
  }
  
  return false;
}

/**
 * Detect suggestive clothing angles (requires AI/metadata analysis)
 */
async function detectSuggestiveAngles(
  thumbnailUrl: string,
  metadata?: Record<string, any>
): Promise<boolean> {
  // In production, would use pose detection AI
  // For now, check metadata
  
  if (metadata?.tags) {
    const tags = Array.isArray(metadata.tags)
      ? metadata.tags.map((t: any) => String(t).toLowerCase())
      : [];
    
    for (const keyword of SUGGESTIVE_CLOTHING_KEYWORDS) {
      if (tags.some(tag => tag.includes(keyword))) {
        logger.warn(`Suggestive angle detected: ${keyword} in tags`);
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Detect parasocial flirt hooks (pattern analysis)
 */
function detectParasocialHooks(caption: string, title?: string): boolean {
  const textToCheck = `${caption || ''} ${title || ''}`.toLowerCase();
  
  // Check for parasocial relationship language
  const parasocialPatterns = [
    /\b(your|my)\s+(virtual|online|digital)\s+(girlfriend|boyfriend|partner|lover)\b/,
    /\bi'll\s+(always\s+)?be\s+(here|there)\s+for\s+you\b/,
    /\bwe're\s+(together|in this|connected)\b/,
    /\bour\s+(relationship|connection|time together)\b/,
    /\byou\s+and\s+me\s+(forever|always|together)\b/,
  ];
  
  for (const pattern of parasocialPatterns) {
    if (pattern.test(textToCheck)) {
      logger.warn(`Parasocial hook detected: ${textToCheck.substring(0, 50)}...`);
      return true;
    }
  }
  
  return false;
}

// ============================================================================
// MAIN DETECTION FUNCTION
// ============================================================================

/**
 * Analyze content for flirt manipulation
 */
export async function detectFlirtManipulation(
  contentId: string,
  creatorId: string,
  data: {
    caption?: string;
    title?: string;
    thumbnailUrl?: string;
    metadata?: Record<string, any>;
  }
): Promise<FlirtManipulationFlags> {
  try {
    logger.info(`Analyzing content ${contentId} for flirt manipulation`);
    
    // Run all detection checks
    const [
      seductiveThumbnail,
      suggestiveAngles,
      clickbaitCaption,
      parasocialHooks,
    ] = await Promise.all([
      detectSeductiveThumbnail(data.thumbnailUrl || '', data.metadata),
      detectSuggestiveAngles(data.thumbnailUrl || '', data.metadata),
      Promise.resolve(detectFlirtCaption(data.caption || '')),
      Promise.resolve(detectParasocialHooks(data.caption || '', data.title)),
    ]);
    
    // Check if any violation detected
    const hasViolation = 
      seductiveThumbnail || 
      suggestiveAngles || 
      clickbaitCaption || 
      parasocialHooks;
    
    // Calculate confidence (how many checks triggered)
    const triggeredCount = [
      seductiveThumbnail,
      suggestiveAngles,
      clickbaitCaption,
      parasocialHooks,
    ].filter(Boolean).length;
    
    const confidence = (triggeredCount / 4) * 100;
    
    const flags: FlirtManipulationFlags = {
      contentId,
      creatorId,
      seductiveThumbnail,
      suggestiveClothingAngles: suggestiveAngles,
      clickbaitFlirtCaptions: clickbaitCaption,
      paraocialFlirtHooks: parasocialHooks,
      contentDemoted: false,
      safetyCaseOpened: false,
      detectedAt: serverTimestamp() as Timestamp,
      confidence,
    };
    
    // If violation detected, take action
    if (hasViolation) {
      await handleFlirtViolation(flags);
    }
    
    // Save detection result
    await db
      .collection('flirt_manipulation_flags')
      .doc(contentId)
      .set(flags);
    
    return flags;
  } catch (error) {
    logger.error('Error detecting flirt manipulation:', error);
    throw error;
  }
}

// ============================================================================
// VIOLATION HANDLING
// ============================================================================

/**
 * Handle detected flirt manipulation violation
 */
async function handleFlirtViolation(flags: FlirtManipulationFlags): Promise<void> {
  try {
    logger.warn(
      `Flirt manipulation detected for content ${flags.contentId} by creator ${flags.creatorId}` +
      ` (confidence: ${flags.confidence}%)`
    );
    
    // Determine action based on confidence
    if (flags.confidence >= 75) {
      // High confidence - demote content + open safety case
      await demoteContent(flags.contentId);
      await openSafetyCase(flags);
      
      flags.contentDemoted = true;
      flags.safetyCaseOpened = true;
      
      logger.warn(`Content ${flags.contentId} demoted and safety case opened`);
    } else if (flags.confidence >= 50) {
      // Medium confidence - demote content only
      await demoteContent(flags.contentId);
      
      flags.contentDemoted = true;
      
      logger.warn(`Content ${flags.contentId} demoted`);
    } else {
      // Low confidence - flag for review only
      await flagForReview(flags);
      
      logger.info(`Content ${flags.contentId} flagged for review`);
    }
  } catch (error) {
    logger.error('Error handling flirt violation:', error);
  }
}

/**
 * Demote content in discovery rankings
 */
async function demoteContent(contentId: string): Promise<void> {
  try {
    // Update content document to mark as demoted
    await db.collection('content').doc(contentId).update({
      'discovery.demoted': true,
      'discovery.demotedReason': 'FLIRT_MANIPULATION',
      'discovery.demotedAt': serverTimestamp(),
    });
    
    // Reduce creator's relevance score
    const contentDoc = await db.collection('content').doc(contentId).get();
    if (contentDoc.exists) {
      const creatorId = contentDoc.data()?.creatorId;
      if (creatorId) {
        await penalizeCreatorScore(creatorId);
      }
    }
  } catch (error) {
    logger.error('Error demoting content:', error);
  }
}

/**
 * Penalize creator's relevance score
 */
async function penalizeCreatorScore(creatorId: string): Promise<void> {
  try {
    const scoreRef = db.collection('creator_relevance_scores').doc(creatorId);
    const scoreDoc = await scoreRef.get();
    
    if (scoreDoc.exists) {
      const currentScore = scoreDoc.data()?.safetyScore || 70;
      const penalizedScore = Math.max(0, currentScore - 15); // -15 points penalty
      
      await scoreRef.update({
        safetyScore: penalizedScore,
        lastCalculated: serverTimestamp(),
      });
      
      logger.warn(`Creator ${creatorId} safety score reduced to ${penalizedScore}`);
    }
  } catch (error) {
    logger.error('Error penalizing creator score:', error);
  }
}

/**
 * Open safety case (integrates with PACK 153)
 */
async function openSafetyCase(flags: FlirtManipulationFlags): Promise<void> {
  try {
    const caseId = `flirt_${flags.contentId}_${Date.now()}`;
    
    // Create safety case document
    await db.collection('safety_cases').doc(caseId).set({
      caseId,
      type: 'FLIRT_MANIPULATION',
      contentId: flags.contentId,
      creatorId: flags.creatorId,
      status: 'OPEN',
      priority: flags.confidence >= 75 ? 'HIGH' : 'MEDIUM',
      evidence: {
        seductiveThumbnail: flags.seductiveThumbnail,
        suggestiveAngles: flags.suggestiveClothingAngles,
        clickbaitCaption: flags.clickbaitFlirtCaptions,
        parasocialHooks: flags.paraocialFlirtHooks,
        confidence: flags.confidence,
      },
      createdAt: serverTimestamp(),
      assignedTo: null,
      resolvedAt: null,
      resolution: null,
    });
    
    logger.info(`Safety case ${caseId} opened for flirt manipulation`);
  } catch (error) {
    logger.error('Error opening safety case:', error);
  }
}

/**
 * Flag content for manual review (low confidence cases)
 */
async function flagForReview(flags: FlirtManipulationFlags): Promise<void> {
  try {
    await db.collection('content_review_queue').add({
      contentId: flags.contentId,
      creatorId: flags.creatorId,
      reason: 'POTENTIAL_FLIRT_MANIPULATION',
      confidence: flags.confidence,
      flags: {
        seductiveThumbnail: flags.seductiveThumbnail,
        suggestiveAngles: flags.suggestiveClothingAngles,
        clickbaitCaption: flags.clickbaitFlirtCaptions,
        parasocialHooks: flags.paraocialFlirtHooks,
      },
      status: 'PENDING',
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    logger.error('Error flagging for review:', error);
  }
}

// ============================================================================
// BATCH SCANNING
// ============================================================================

/**
 * Scan all recent content for flirt manipulation
 * Used by background job
 */
export async function scanRecentContentForFlirts(hours: number = 24): Promise<{
  scanned: number;
  violations: number;
  demoted: number;
}> {
  let scanned = 0;
  let violations = 0;
  let demoted = 0;
  
  try {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - hours);
    const cutoffTimestamp = Timestamp.fromDate(cutoffDate);
    
    logger.info(`Scanning content published in last ${hours} hours`);
    
    // Query recent content
    const snapshot = await db
      .collection('content')
      .where('publishedAt', '>=', cutoffTimestamp)
      .where('discovery.demoted', '!=', true)
      .limit(500)
      .get();
    
    logger.info(`Found ${snapshot.size} recent content items to scan`);
    
    // Scan each item
    for (const doc of snapshot.docs) {
      const content = doc.data();
      scanned++;
      
      try {
        const flags = await detectFlirtManipulation(
          doc.id,
          content.creatorId || content.userId,
          {
            caption: content.caption || content.description,
            title: content.title,
            thumbnailUrl: content.thumbnailUrl,
            metadata: content.metadata,
          }
        );
        
        if (flags.seductiveThumbnail || 
            flags.suggestiveClothingAngles || 
            flags.clickbaitFlirtCaptions || 
            flags.paraocialFlirtHooks) {
          violations++;
          
          if (flags.contentDemoted) {
            demoted++;
          }
        }
      } catch (error) {
        logger.error(`Error scanning content ${doc.id}:`, error);
      }
    }
    
    logger.info(
      `Scan complete: ${scanned} scanned, ${violations} violations, ${demoted} demoted`
    );
    
    return { scanned, violations, demoted };
  } catch (error) {
    logger.error('Error scanning recent content:', error);
    return { scanned, violations, demoted };
  }
}

logger.info('✅ Anti-Flirt Manipulation Detection initialized');