/**
 * TrustShield 2.0 - Content Classifier Engine
 * Phase 30A: Centralized Content Moderation System
 * 
 * CRITICAL: This module is 100% ADDITIVE.
 * - NO changes to monetization logic
 * - NO changes to pricing or revenue splits
 * - Graceful degradation on LLM failures
 * - Compatible with existing CSAM Shield
 * 
 * @module contentModerationEngine
 */

import { db, serverTimestamp, increment, generateId, arrayUnion } from './init';

// Simple logger
const logger = {
  info: (..._args: any[]) => {},
  warn: (..._args: any[]) => {},
  error: (..._args: any[]) => {},
};

// ============================================================================
// TYPES
// ============================================================================

export type ContentSource =
  | 'chat_message'
  | 'ai_chat_prompt'
  | 'profile_bio'
  | 'profile_headline'
  | 'post_caption'
  | 'live_description'
  | 'question'
  | 'answer'
  | 'goal_description'
  | 'drop_description'
  | 'meet_bio'
  | 'meet_rules'
  | 'report_reason';

export type ViolationCategory =
  | 'NONE'                  // safe
  | 'CSAM'                  // minors sexual – must stay compatible with CSAM Shield
  | 'MINORS_NON_SEXUAL'     // children in sensitive context, but not sexual
  | 'VIOLENCE'              // physical violence, threats
  | 'SELF_HARM'             // suicide, self-harm
  | 'HATE_SPEECH'           // racism, homophobia, etc.
  | 'BULLYING'              // harassing specific person
  | 'EXTREMISM'             // terrorism, extremism
  | 'ILLEGAL_ACTIVITY'      // drugs, crimes, etc.
  | 'SEX_FOR_COMPENSATION'  // escorting / "pay for sex"
  | 'EXPLICIT_NSFW'         // hardcore sexual content (18+)
  | 'SPAM_SCAM'             // spam, scams, phishing
  | 'OTHER';

export type ViolationSeverity = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type EnforcementAction =
  | 'ALLOW'
  | 'ALLOW_AND_LOG'
  | 'BLOCK_CONTENT'         // hard block text – no write to Firestore
  | 'FLAG_FOR_REVIEW'       // add to moderator queue
  | 'INCREMENT_RISK_SCORE'; // call trustEngine

export interface ModerationInput {
  userId: string;
  text: string;
  language?: string;          // e.g. "pl", "en"
  source: ContentSource;
  userCountryCode?: string;   // e.g. "PL", "US"
}

export interface ModerationResult {
  category: ViolationCategory;
  severity: ViolationSeverity;
  actions: EnforcementAction[];
  reasons: string[];
}

export interface ContentIncident {
  incidentId: string;
  userId: string;
  textSnippet: string;        // first 200 chars
  source: ContentSource;
  category: ViolationCategory;
  severity: ViolationSeverity;
  actions: EnforcementAction[];
  createdAt: any;             // Timestamp
  resolvedStatus: 'OPEN' | 'REVIEWED' | 'APPEALED' | 'CLOSED';
  reviewedBy?: string;
  reviewedAt?: any;           // Timestamp
}

export interface UserModerationStats {
  userId: string;
  lowSeverityCount: number;
  mediumSeverityCount: number;
  highSeverityCount: number;
  criticalSeverityCount: number;
  lastViolationAt: any;       // Timestamp
  blockedContentCount: number;
  totalIncidents: number;
  createdAt: any;             // Timestamp
  updatedAt: any;             // Timestamp
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Hard-block categories (always BLOCK_CONTENT + FLAG_FOR_REVIEW + INCREMENT_RISK_SCORE)
 */
const HARD_BLOCK_CATEGORIES: ViolationCategory[] = [
  'CSAM',
  'SEX_FOR_COMPENSATION',
  'EXTREMISM',
  'VIOLENCE',        // when severity HIGH/CRITICAL
  'SELF_HARM',       // when severity HIGH/CRITICAL
];

/**
 * Soft categories (ALLOW_AND_LOG + INCREMENT_RISK_SCORE, can degrade visibility later)
 */
const SOFT_CATEGORIES: ViolationCategory[] = [
  'HATE_SPEECH',
  'BULLYING',
  'ILLEGAL_ACTIVITY',
  'SPAM_SCAM',
  'MINORS_NON_SEXUAL',
  'EXPLICIT_NSFW', // allowed if age18Plus && 18+ zones, but still logged
];

/**
 * OpenAI API configuration
 */
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODERATION_ENDPOINT = 'https://api.openai.com/v1/moderations';
const OPENAI_CHAT_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

// ============================================================================
// CORE FUNCTION: moderateText
// ============================================================================

/**
 * Moderate text content using LLM classifier
 * 
 * This is the central moderation function that:
 * 1. Performs fast local checks
 * 2. Calls external LLM for classification
 * 3. Determines enforcement actions
 * 4. Never blocks on LLM failure (graceful degradation)
 * 
 * @param input - Moderation input
 * @returns Moderation result with category, severity, and actions
 */
export async function moderateText(
  input: ModerationInput
): Promise<ModerationResult> {
  
  // 1) Fast local checks: empty/short text → return SAFE
  if (!input.text || input.text.trim().length === 0) {
    return {
      category: 'NONE',
      severity: 'NONE',
      actions: ['ALLOW'],
      reasons: [],
    };
  }
  
  // Short text (< 3 chars) is usually safe
  if (input.text.trim().length < 3) {
    return {
      category: 'NONE',
      severity: 'NONE',
      actions: ['ALLOW'],
      reasons: [],
    };
  }
  
  // 2) Language detection fallback
  const language = input.language || detectLanguage(input.text);
  
  // 3) Call LLM classifier
  let category: ViolationCategory = 'NONE';
  let severity: ViolationSeverity = 'NONE';
  let reasons: string[] = [];
  
  try {
    // Try OpenAI classification
    const classification = await classifyWithOpenAI(input.text, language, input.source);
    category = classification.category;
    severity = classification.severity;
    reasons = classification.reasons;
    
    // If CSAM detected, also call CSAM Shield for compatibility
    if (category === 'CSAM') {
      try {
        const { evaluateTextForCsamRisk } = await import('./csamShield');
        const csamCheck = evaluateTextForCsamRisk(input.text, language);
        
        if (csamCheck.isFlagged) {
          // Use CSAM Shield's risk level if higher
          if (csamCheck.riskLevel === 'CRITICAL') {
            severity = 'CRITICAL';
          } else if (csamCheck.riskLevel === 'HIGH' && severity !== 'CRITICAL') {
            severity = 'HIGH';
          }
          reasons.push('CSAM Shield confirmation');
        }
      } catch (error) {
        logger.error('CSAM Shield check failed:', error);
      }
    }
  } catch (error) {
    // CRITICAL: Never block content purely because AI failed
    logger.error('LLM classification failed:', error);
    
    // Fallback to basic keyword detection
    const fallbackResult = fallbackKeywordDetection(input.text, language);
    category = fallbackResult.category;
    severity = fallbackResult.severity;
    reasons = ['Fallback detection (LLM unavailable)', ...fallbackResult.reasons];
    
    // If fallback also returns NONE, allow content
    if (category === 'NONE') {
      return {
        category: 'NONE',
        severity: 'NONE',
        actions: ['ALLOW'],
        reasons: ['LLM unavailable, fallback check passed'],
      };
    }
  }
  
  // 4) Determine enforcement actions based on category + severity
  const actions = determineEnforcementActions(category, severity);
  
  return {
    category,
    severity,
    actions,
    reasons,
  };
}

/**
 * Classify text using OpenAI
 */
async function classifyWithOpenAI(
  text: string,
  language: string,
  source: ContentSource
): Promise<{ category: ViolationCategory; severity: ViolationSeverity; reasons: string[] }> {
  
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }
  
  // Use GPT-4 mini for cost-effective classification
  const systemPrompt = `You are a content moderation AI for a dating/social platform. Classify the following text into ONE of these categories:

NONE - Safe content
CSAM - Child sexual abuse material or sexualization of minors
MINORS_NON_SEXUAL - References to children in sensitive contexts but not sexual
VIOLENCE - Physical violence, threats, graphic violence
SELF_HARM - Suicide, self-harm, eating disorders
HATE_SPEECH - Racism, homophobia, transphobia, religious hatred
BULLYING - Targeted harassment of individuals
EXTREMISM - Terrorism, violent extremism
ILLEGAL_ACTIVITY - Drug dealing, illegal weapons, crimes
SEX_FOR_COMPENSATION - Escorting, prostitution, "pay for sex"
EXPLICIT_NSFW - Hardcore sexual content (graphic descriptions)
SPAM_SCAM - Spam, scams, phishing, MLM schemes
OTHER - Other policy violations

Also assign a severity: NONE, LOW, MEDIUM, HIGH, or CRITICAL

Respond in JSON format:
{
  "category": "CATEGORY_NAME",
  "severity": "SEVERITY_LEVEL",
  "reasons": ["reason1", "reason2"]
}

Language: ${language}
Content source: ${source}
Be strict on CSAM, SEX_FOR_COMPENSATION, EXTREMISM. Be lenient on casual swearing.`;

  const response = await fetch(OPENAI_CHAT_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text.substring(0, 1000) } // Limit to 1000 chars
      ],
      temperature: 0.1,
      max_tokens: 200,
    }),
  });
  
  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }
  
  const data = await response.json() as any;
  const content = data.choices[0]?.message?.content || '{}';
  
  // Parse JSON response
  try {
    const result = JSON.parse(content);
    return {
      category: result.category || 'NONE',
      severity: result.severity || 'NONE',
      reasons: result.reasons || [],
    };
  } catch (error) {
    logger.error('Failed to parse OpenAI response:', content);
    throw new Error('Invalid OpenAI response format');
  }
}

/**
 * Fallback keyword detection when LLM is unavailable
 */
function fallbackKeywordDetection(
  text: string,
  language: string
): { category: ViolationCategory; severity: ViolationSeverity; reasons: string[] } {
  
  const lowerText = text.toLowerCase();
  const reasons: string[] = [];
  
  // CSAM keywords (extremely sensitive)
  const csamKeywords = ['child porn', 'cp', 'pthc', 'preteen', 'underage sex'];
  for (const keyword of csamKeywords) {
    if (lowerText.includes(keyword)) {
      return {
        category: 'CSAM',
        severity: 'CRITICAL',
        reasons: ['CSAM keyword detected'],
      };
    }
  }
  
  // Sex for compensation keywords
  const escortKeywords = ['escort', 'escorting', 'prostitute', 'sex work', 'happy ending', 'donation roses'];
  for (const keyword of escortKeywords) {
    if (lowerText.includes(keyword)) {
      return {
        category: 'SEX_FOR_COMPENSATION',
        severity: 'HIGH',
        reasons: ['Escorting keyword detected'],
      };
    }
  }
  
  // Extremism keywords
  const extremismKeywords = ['jihad', 'terrorism', 'bomb making', 'school shooting'];
  for (const keyword of extremismKeywords) {
    if (lowerText.includes(keyword)) {
      return {
        category: 'EXTREMISM',
        severity: 'CRITICAL',
        reasons: ['Extremism keyword detected'],
      };
    }
  }
  
  // Violence keywords
  const violenceKeywords = ['kill you', 'murder you', 'i will hurt'];
  for (const keyword of violenceKeywords) {
    if (lowerText.includes(keyword)) {
      return {
        category: 'VIOLENCE',
        severity: 'HIGH',
        reasons: ['Violence threat detected'],
      };
    }
  }
  
  // Self-harm keywords
  const selfHarmKeywords = ['want to die', 'kill myself', 'suicide plan'];
  for (const keyword of selfHarmKeywords) {
    if (lowerText.includes(keyword)) {
      return {
        category: 'SELF_HARM',
        severity: 'HIGH',
        reasons: ['Self-harm content detected'],
      };
    }
  }
  
  // If no keywords matched, return NONE
  return {
    category: 'NONE',
    severity: 'NONE',
    reasons: [],
  };
}

/**
 * Detect language (simple heuristic)
 */
function detectLanguage(text: string): string {
  // Simple detection based on character patterns
  const plChars = ['ą', 'ć', 'ę', 'ł', 'ń', 'ó', 'ś', 'ź', 'ż'];
  const lowerText = text.toLowerCase();
  
  for (const char of plChars) {
    if (lowerText.includes(char)) {
      return 'pl';
    }
  }
  
  return 'en';
}

/**
 * Determine enforcement actions based on category and severity
 */
function determineEnforcementActions(
  category: ViolationCategory,
  severity: ViolationSeverity
): EnforcementAction[] {
  
  // NONE = no actions
  if (category === 'NONE' || severity === 'NONE') {
    return ['ALLOW'];
  }
  
  // Hard-block categories
  if (HARD_BLOCK_CATEGORIES.includes(category)) {
    // VIOLENCE and SELF_HARM only block at HIGH/CRITICAL
    if ((category === 'VIOLENCE' || category === 'SELF_HARM') && 
        (severity === 'LOW' || severity === 'MEDIUM')) {
      return ['ALLOW_AND_LOG', 'INCREMENT_RISK_SCORE'];
    }
    
    // Other hard-block categories always block
    return ['BLOCK_CONTENT', 'FLAG_FOR_REVIEW', 'INCREMENT_RISK_SCORE'];
  }
  
  // Soft categories
  if (SOFT_CATEGORIES.includes(category)) {
    // HIGH/CRITICAL severity → block
    if (severity === 'HIGH' || severity === 'CRITICAL') {
      return ['BLOCK_CONTENT', 'FLAG_FOR_REVIEW', 'INCREMENT_RISK_SCORE'];
    }
    
    // LOW/MEDIUM → log and track
    return ['ALLOW_AND_LOG', 'INCREMENT_RISK_SCORE'];
  }
  
  // OTHER category
  if (severity === 'HIGH' || severity === 'CRITICAL') {
    return ['BLOCK_CONTENT', 'FLAG_FOR_REVIEW', 'INCREMENT_RISK_SCORE'];
  }
  
  return ['ALLOW_AND_LOG', 'INCREMENT_RISK_SCORE'];
}

// ============================================================================
// LOGGING & MONITORING
// ============================================================================

/**
 * Log moderation incident to Firestore
 * Only logs if category != NONE
 */
export async function logModerationIncident(
  input: ModerationInput,
  result: ModerationResult
): Promise<void> {
  
  // Don't log safe content
  if (result.category === 'NONE') {
    return;
  }
  
  const incidentId = generateId();
  
  const incident: ContentIncident = {
    incidentId,
    userId: input.userId,
    textSnippet: input.text.substring(0, 200),
    source: input.source,
    category: result.category,
    severity: result.severity,
    actions: result.actions,
    createdAt: serverTimestamp(),
    resolvedStatus: 'OPEN',
  };
  
  await db.collection('contentIncidents').doc(incidentId).set(incident);
  
  // Update user moderation stats
  await updateUserModerationStats(input.userId, result, input.source);
  
  logger.warn(`Content incident logged: ${incidentId} for user ${input.userId} (${result.category}/${result.severity})`);
}

/**
 * Update user moderation stats
 */
async function updateUserModerationStats(
  userId: string,
  result: ModerationResult,
  source: ContentSource
): Promise<void> {
  
  const statsRef = db.collection('userModerationStats').doc(userId);
  const statsSnap = await statsRef.get();
  
  if (!statsSnap.exists) {
    // Create new stats document
    const newStats: UserModerationStats = {
      userId,
      lowSeverityCount: result.severity === 'LOW' ? 1 : 0,
      mediumSeverityCount: result.severity === 'MEDIUM' ? 1 : 0,
      highSeverityCount: result.severity === 'HIGH' ? 1 : 0,
      criticalSeverityCount: result.severity === 'CRITICAL' ? 1 : 0,
      lastViolationAt: serverTimestamp(),
      blockedContentCount: result.actions.includes('BLOCK_CONTENT') ? 1 : 0,
      totalIncidents: 1,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    
    await statsRef.set(newStats);
  } else {
    // Update existing stats
    const updates: any = {
      lastViolationAt: serverTimestamp(),
      totalIncidents: increment(1),
      updatedAt: serverTimestamp(),
    };
    
    if (result.severity === 'LOW') {
      updates.lowSeverityCount = increment(1);
    } else if (result.severity === 'MEDIUM') {
      updates.mediumSeverityCount = increment(1);
    } else if (result.severity === 'HIGH') {
      updates.highSeverityCount = increment(1);
    } else if (result.severity === 'CRITICAL') {
      updates.criticalSeverityCount = increment(1);
    }
    
    if (result.actions.includes('BLOCK_CONTENT')) {
      updates.blockedContentCount = increment(1);
    }
    
    await statsRef.update(updates);
  }
  
  // If INCREMENT_RISK_SCORE action, call trust engine
  if (result.actions.includes('INCREMENT_RISK_SCORE')) {
    try {
      const { recordRiskEvent } = await import('./trustEngine');
      await recordRiskEvent({
        userId,
        eventType: 'chat', // Use 'chat' as generic event type
        metadata: {
          contentViolation: true,
          category: result.category,
          severity: result.severity,
        },
      });
    } catch (error) {
      logger.error('Failed to record risk event:', error);
    }
  }
  
  // Call account status engine for violations (Phase 30C-1)
  if (result.category !== 'NONE') {
    try {
      const { onContentViolation } = await import('./accountStatusEngine');
      await onContentViolation(
        userId,
        result.category,
        result.severity,
        source
      );
    } catch (error) {
      logger.error('Failed to apply account sanctions:', error);
    }
  }
}

/**
 * Get user moderation stats
 */
export async function getUserModerationStats(userId: string): Promise<UserModerationStats | null> {
  const statsSnap = await db.collection('userModerationStats').doc(userId).get();
  
  if (!statsSnap.exists) {
    return null;
  }
  
  return statsSnap.data() as UserModerationStats;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  moderateText,
  logModerationIncident,
  getUserModerationStats,
};