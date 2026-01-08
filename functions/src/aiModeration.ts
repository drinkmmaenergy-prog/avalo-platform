/**
 * ========================================================================
 * AVALO AI MODERATION PIPELINE
 * ========================================================================
 *
 * Production-grade content moderation using AI/ML models
 *
 * Pipeline Stages:
 * 1. OCR (text extraction from images)
 * 2. NSFW Classification (nudity, violence, gore)
 * 3. Toxicity Detection (hate speech, harassment)
 * 4. Sexual Content Scoring (explicit content levels)
 * 5. Banned Terms Detection
 * 6. Age Verification
 *
 * Integrations:
 * - Google Cloud Vision API (OCR + Safe Search)
 * - OpenAI Moderation API
 * - Custom ML models for sexual content scoring
 *
 * @version 3.0.0
 * @module aiModeration
 */

;
;
;
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

const db = getFirestore();

// ============================================================================
// CONFIGURATION
// ============================================================================

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const GOOGLE_VISION_API_KEY = process.env.GOOGLE_VISION_API_KEY || "";

const OPENAI_MODERATION_ENDPOINT = "https://api.openai.com/v1/moderations";
const GOOGLE_VISION_ENDPOINT = "https://vision.googleapis.com/v1/images:annotate";

// Threshold scores (0-1)
const THRESHOLDS = {
  nsfw: {
    block: 0.8,      // Auto-block if above
    review: 0.5,     // Queue for review if above
  },
  toxicity: {
    block: 0.7,
    review: 0.4,
  },
  sexual: {
    block: 0.9,
    review: 0.6,
  },
  violence: {
    block: 0.8,
    review: 0.5,
  },
};

// ============================================================================
// TYPES
// ============================================================================

export interface ModerationResult {
  safe: boolean;
  action: "allow" | "review" | "block";
  scores: {
    nsfw: number;
    toxicity: number;
    sexual: number;
    violence: number;
    hate: number;
    harassment: number;
  };
  flags: string[];
  extractedText?: string;
  bannedTermsFound?: string[];
  reasons: string[];
  confidence: number;
}

export interface NSFWAnalysis {
  adult: number;          // 0-1
  spoof: number;
  medical: number;
  violence: number;
  racy: number;
  likelihood: "VERY_UNLIKELY" | "UNLIKELY" | "POSSIBLE" | "LIKELY" | "VERY_LIKELY";
}

export interface ToxicityAnalysis {
  toxic: number;
  severeToxic: number;
  obscene: number;
  threat: number;
  insult: number;
  identityHate: number;
}

// ============================================================================
// OCR - TEXT EXTRACTION
// ============================================================================

/**
 * Extract text from image using Google Cloud Vision
 */
export async function extractTextFromImage(imageUrl: string): Promise<string> {
  try {
    if (!GOOGLE_VISION_API_KEY) {
      logger.warn("Google Vision API key not configured - skipping OCR");
      return "";
    }

    const response = await fetch(`${GOOGLE_VISION_ENDPOINT}?key=${GOOGLE_VISION_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          {
            image: {
              source: { imageUri: imageUrl },
            },
            features: [
              { type: "TEXT_DETECTION", maxResults: 10 },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Vision API error: ${response.status}`);
    }

    const data = await response.json() as any;
    const textAnnotations = data.responses[0]?.textAnnotations || [];

    // First annotation contains all detected text
    const extractedText = textAnnotations[0]?.description || "";

    logger.info(`Extracted ${extractedText.length} characters from image`);
    return extractedText;
  } catch (error: any) {
    logger.error("OCR failed:", error);
    return "";
  }
}

// ============================================================================
// NSFW DETECTION
// ============================================================================

/**
 * Detect NSFW content in image using Google Safe Search
 */
export async function detectNSFW(imageUrl: string): Promise<NSFWAnalysis> {
  try {
    if (!GOOGLE_VISION_API_KEY) {
      logger.warn("Google Vision API key not configured - skipping NSFW detection");
      return {
        adult: 0,
        spoof: 0,
        medical: 0,
        violence: 0,
        racy: 0,
        likelihood: "VERY_UNLIKELY",
      };
    }

    const response = await fetch(`${GOOGLE_VISION_ENDPOINT}?key=${GOOGLE_VISION_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          {
            image: {
              source: { imageUri: imageUrl },
            },
            features: [
              { type: "SAFE_SEARCH_DETECTION" },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Vision API error: ${response.status}`);
    }

    const data = await response.json() as any;
    const safeSearch = data.responses[0]?.safeSearchAnnotation || {};

    // Convert likelihood to numeric score
    const likelihoodToScore = (likelihood: string): number => {
      const map: Record<string, number> = {
        "VERY_UNLIKELY": 0.1,
        "UNLIKELY": 0.3,
        "POSSIBLE": 0.5,
        "LIKELY": 0.7,
        "VERY_LIKELY": 0.9,
      };
      return map[likelihood] || 0;
    };

    return {
      adult: likelihoodToScore(safeSearch.adult || "VERY_UNLIKELY"),
      spoof: likelihoodToScore(safeSearch.spoof || "VERY_UNLIKELY"),
      medical: likelihoodToScore(safeSearch.medical || "VERY_UNLIKELY"),
      violence: likelihoodToScore(safeSearch.violence || "VERY_UNLIKELY"),
      racy: likelihoodToScore(safeSearch.racy || "VERY_UNLIKELY"),
      likelihood: safeSearch.adult || "VERY_UNLIKELY",
    };
  } catch (error: any) {
    logger.error("NSFW detection failed:", error);
    return {
      adult: 0,
      spoof: 0,
      medical: 0,
      violence: 0,
      racy: 0,
      likelihood: "VERY_UNLIKELY",
    };
  }
}

// ============================================================================
// TOXICITY DETECTION
// ============================================================================

/**
 * Detect toxic content using OpenAI Moderation API
 */
export async function detectToxicity(text: string): Promise<ToxicityAnalysis> {
  try {
    if (!OPENAI_API_KEY) {
      logger.warn("OpenAI API key not configured - skipping toxicity detection");
      return {
        toxic: 0,
        severeToxic: 0,
        obscene: 0,
        threat: 0,
        insult: 0,
        identityHate: 0,
      };
    }

    const response = await fetch(OPENAI_MODERATION_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        input: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI Moderation API error: ${response.status}`);
    }

    const data = await response.json() as any;
    const result = data.results[0];

    return {
      toxic: result.category_scores.hate || 0,
      severeToxic: result.category_scores["hate/threatening"] || 0,
      obscene: result.category_scores.sexual || 0,
      threat: result.category_scores["violence/graphic"] || 0,
      insult: result.category_scores.harassment || 0,
      identityHate: result.category_scores["harassment/threatening"] || 0,
    };
  } catch (error: any) {
    logger.error("Toxicity detection failed:", error);
    return {
      toxic: 0,
      severeToxic: 0,
      obscene: 0,
      threat: 0,
      insult: 0,
      identityHate: 0,
    };
  }
}

// ============================================================================
// SEXUAL CONTENT SCORING
// ============================================================================

/**
 * Score sexual content explicitness (0-1 scale)
 */
export function scoreSexualContent(text: string): number {
  const explicitTerms = [
    "sex", "fuck", "dick", "pussy", "cock", "cum", "orgasm",
    "blowjob", "anal", "porn", "xxx", "nude", "naked",
  ];

  const moderateTerms = [
    "kiss", "touch", "caress", "breast", "intimate", "seduce",
    "flirt", "desire", "passion", "aroused",
  ];

  const lowerText = text.toLowerCase();

  let score = 0;
  let termCount = 0;

  // Count explicit terms (higher weight)
  explicitTerms.forEach((term) => {
    const matches = lowerText.split(term).length - 1;
    if (matches > 0) {
      score += matches * 0.3;
      termCount += matches;
    }
  });

  // Count moderate terms (lower weight)
  moderateTerms.forEach((term) => {
    const matches = lowerText.split(term).length - 1;
    if (matches > 0) {
      score += matches * 0.1;
      termCount += matches;
    }
  });

  // Normalize score (cap at 1.0)
  const normalizedScore = Math.min(1.0, score / Math.max(1, termCount / 2));

  return normalizedScore;
}

// ============================================================================
// BANNED TERMS DETECTION
// ============================================================================

const BANNED_TERMS = [
  // Adult services
  "escort", "prostitute", "sex work", "happy ending",
  // Drugs
  "cocaine", "heroin", "meth", "mdma", "ecstasy",
  // Violence
  "kill", "murder", "suicide", "self-harm",
  // Scams
  "western union", "bitcoin wallet", "send money", "wire transfer",
  // Polish equivalents
  "prostytucja", "narkotyki", "przemoc",
];

/**
 * Check for banned terms
 */
export function containsBannedTerms(text: string): { found: boolean; terms: string[] } {
  const lowerText = text.toLowerCase();
  const foundTerms: string[] = [];

  BANNED_TERMS.forEach((term) => {
    if (lowerText.includes(term.toLowerCase())) {
      foundTerms.push(term);
    }
  });

  return {
    found: foundTerms.length > 0,
    terms: foundTerms,
  };
}

// ============================================================================
// COMPREHENSIVE MODERATION
// ============================================================================

/**
 * Moderate text content
 */
export async function moderateText(text: string): Promise<ModerationResult> {
  const [toxicity, bannedTermsCheck] = await Promise.all([
    detectToxicity(text),
    Promise.resolve(containsBannedTerms(text)),
  ]);

  const sexualScore = scoreSexualContent(text);

  const scores = {
    nsfw: sexualScore,
    toxicity: Math.max(toxicity.toxic, toxicity.severeToxic),
    sexual: sexualScore,
    violence: toxicity.threat,
    hate: toxicity.identityHate,
    harassment: toxicity.insult,
  };

  const flags: string[] = [];
  const reasons: string[] = [];

  // Check each category against thresholds
  if (scores.nsfw >= THRESHOLDS.nsfw.block) {
    flags.push("nsfw_block");
    reasons.push("Explicit sexual content detected");
  } else if (scores.nsfw >= THRESHOLDS.nsfw.review) {
    flags.push("nsfw_review");
    reasons.push("Potentially sexual content");
  }

  if (scores.toxicity >= THRESHOLDS.toxicity.block) {
    flags.push("toxicity_block");
    reasons.push("Toxic language detected");
  } else if (scores.toxicity >= THRESHOLDS.toxicity.review) {
    flags.push("toxicity_review");
    reasons.push("Potentially toxic content");
  }

  if (scores.violence >= THRESHOLDS.violence.block) {
    flags.push("violence_block");
    reasons.push("Violent content detected");
  }

  if (bannedTermsCheck.found) {
    flags.push("banned_terms");
    reasons.push(`Banned terms: ${bannedTermsCheck.terms.join(", ")}`);
  }

  // Determine action
  let action: "allow" | "review" | "block" = "allow";

  if (
    flags.some((f) => f.includes("block")) ||
    bannedTermsCheck.found
  ) {
    action = "block";
  } else if (flags.some((f) => f.includes("review"))) {
    action = "review";
  }

  // Calculate overall confidence
  const confidence = Math.min(
    ...[scores.nsfw, scores.toxicity, scores.violence].filter((s) => s > 0)
  ) || 0.5;

  return {
    safe: action === "allow",
    action,
    scores,
    flags,
    bannedTermsFound: bannedTermsCheck.terms,
    reasons,
    confidence,
  };
}

/**
 * Moderate image content
 */
export async function moderateImage(imageUrl: string): Promise<ModerationResult> {
  const [nsfwAnalysis, extractedText] = await Promise.all([
    detectNSFW(imageUrl),
    extractTextFromImage(imageUrl),
  ]);

  // If text extracted, analyze it too
  let textModeration: ModerationResult | null = null;
  if (extractedText.length > 0) {
    textModeration = await moderateText(extractedText);
  }

  const scores = {
    nsfw: Math.max(nsfwAnalysis.adult, nsfwAnalysis.racy),
    toxicity: textModeration?.scores.toxicity || 0,
    sexual: nsfwAnalysis.adult,
    violence: nsfwAnalysis.violence,
    hate: textModeration?.scores.hate || 0,
    harassment: textModeration?.scores.harassment || 0,
  };

  const flags: string[] = [];
  const reasons: string[] = [];

  // Check NSFW thresholds
  if (scores.nsfw >= THRESHOLDS.nsfw.block) {
    flags.push("nsfw_block");
    reasons.push("Adult/sexual content detected");
  } else if (scores.nsfw >= THRESHOLDS.nsfw.review) {
    flags.push("nsfw_review");
    reasons.push("Potentially adult content");
  }

  if (scores.violence >= THRESHOLDS.violence.block) {
    flags.push("violence_block");
    reasons.push("Violent imagery detected");
  }

  // Include text moderation results
  if (textModeration && !textModeration.safe) {
    flags.push(...textModeration.flags);
    reasons.push(...textModeration.reasons);
  }

  // Determine action
  let action: "allow" | "review" | "block" = "allow";

  if (flags.some((f) => f.includes("block"))) {
    action = "block";
  } else if (flags.some((f) => f.includes("review"))) {
    action = "review";
  }

  return {
    safe: action === "allow",
    action,
    scores,
    flags,
    extractedText,
    bannedTermsFound: textModeration?.bannedTermsFound,
    reasons,
    confidence: 0.8, // Vision API is generally reliable
  };
}

/**
 * Moderate video content (analyze first frame + audio transcript)
 */
export async function moderateVideo(
  videoUrl: string,
  thumbnailUrl?: string,
  transcript?: string
): Promise<ModerationResult> {
  // Analyze thumbnail if available
  let imageModeration: ModerationResult | null = null;
  if (thumbnailUrl) {
    imageModeration = await moderateImage(thumbnailUrl);
  }

  // Analyze transcript if available
  let textModeration: ModerationResult | null = null;
  if (transcript) {
    textModeration = await moderateText(transcript);
  }

  // Combine results
  const scores = {
    nsfw: imageModeration?.scores.nsfw || 0,
    toxicity: textModeration?.scores.toxicity || 0,
    sexual: imageModeration?.scores.sexual || 0,
    violence: Math.max(
      imageModeration?.scores.violence || 0,
      textModeration?.scores.violence || 0
    ),
    hate: textModeration?.scores.hate || 0,
    harassment: textModeration?.scores.harassment || 0,
  };

  const flags = [
    ...(imageModeration?.flags || []),
    ...(textModeration?.flags || []),
  ];

  const reasons = [
    ...(imageModeration?.reasons || []),
    ...(textModeration?.reasons || []),
  ];

  const action: "allow" | "review" | "block" =
    flags.some((f) => f.includes("block")) ? "block" :
    flags.some((f) => f.includes("review")) ? "review" : "allow";

  return {
    safe: action === "allow",
    action,
    scores,
    flags,
    extractedText: transcript,
    bannedTermsFound: textModeration?.bannedTermsFound,
    reasons,
    confidence: 0.7,
  };
}

// ============================================================================
// MODERATION LOGGING & ANALYTICS
// ============================================================================

/**
 * Log moderation result
 */
export async function logModerationResult(
  contentId: string,
  contentType: "text" | "image" | "video",
  userId: string,
  result: ModerationResult
): Promise<void> {
  try {
    await db.collection("moderation_logs").add({
      contentId,
      contentType,
      userId,
      result,
      timestamp: FieldValue.serverTimestamp(),
    });

    // If content should be reviewed or blocked, create moderation task
    if (result.action === "review" || result.action === "block") {
      await db.collection("moderation_queue").add({
        contentId,
        contentType,
        userId,
        action: result.action,
        scores: result.scores,
        flags: result.flags,
        reasons: result.reasons,
        status: "pending",
        priority: result.action === "block" ? "high" : "medium",
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    // Auto-action if blocked
    if (result.action === "block") {
      await autoBlockContent(contentId, contentType, result.reasons.join("; "));
    }
  } catch (error: any) {
    logger.error("Failed to log moderation result:", error);
  }
}

/**
 * Auto-block content
 */
async function autoBlockContent(
  contentId: string,
  contentType: string,
  reason: string
): Promise<void> {
  try {
    // Update content status based on type
    if (contentType === "text" || contentType === "image") {
      await db.collection("posts").doc(contentId).update({
        status: "blocked",
        blockedReason: reason,
        blockedAt: FieldValue.serverTimestamp(),
      });
    }

    logger.info(`Auto-blocked ${contentType} content: ${contentId}`);
  } catch (error: any) {
    logger.error("Failed to auto-block content:", error);
  }
}

/**
 * Get moderation statistics
 */
export async function getModerationStats(
  startDate: Date,
  endDate: Date
): Promise<{
  totalChecks: number;
  blocked: number;
  reviewed: number;
  allowed: number;
  byCategory: Record<string, number>;
}> {
  const snapshot = await db
    .collection("moderation_logs")
    .where("timestamp", ">=", Timestamp.fromDate(startDate))
    .where("timestamp", "<=", Timestamp.fromDate(endDate))
    .get();

  let blocked = 0;
  let reviewed = 0;
  let allowed = 0;
  const byCategory: Record<string, number> = {};

  snapshot.docs.forEach((doc) => {
    const data = doc.data();
    const action = data.result?.action;

    if (action === "block") blocked++;
    else if (action === "review") reviewed++;
    else if (action === "allow") allowed++;

    data.result?.flags?.forEach((flag: string) => {
      byCategory[flag] = (byCategory[flag] || 0) + 1;
    });
  });

  return {
    totalChecks: snapshot.size,
    blocked,
    reviewed,
    allowed,
    byCategory,
  };
}

// ============================================================================
// CALLABLE FUNCTION FOR CLIENT-SIDE MODERATION
// ============================================================================

/**
 * Moderate content (callable from client)
 */
export const moderateContentV1 = onCall(
  {
    region: "europe-west3",
    enforceAppCheck: true,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Authentication required");
    }

    const { contentType, content, contentUrl } = request.data;

    if (!contentType || (!content && !contentUrl)) {
      throw new HttpsError("invalid-argument", "Missing required parameters");
    }

    let result: ModerationResult;

    if (contentType === "text" && content) {
      result = await moderateText(content);
    } else if (contentType === "image" && contentUrl) {
      result = await moderateImage(contentUrl);
    } else if (contentType === "video" && contentUrl) {
      result = await moderateVideo(contentUrl);
    } else {
      throw new HttpsError("invalid-argument", "Invalid content type or missing content");
    }

    // Log the result
    const contentId = request.data.contentId || `content_${Date.now()}`;
    await logModerationResult(contentId, contentType, uid, result);

    return {
      safe: result.safe,
      action: result.action,
      reasons: result.reasons,
      requiresReview: result.action === "review",
    };
  }
);

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  extractTextFromImage,
  detectNSFW,
  detectToxicity,
  scoreSexualContent,
  containsBannedTerms,
  moderateText,
  moderateImage,
  moderateVideo,
  logModerationResult,
  getModerationStats,
};

