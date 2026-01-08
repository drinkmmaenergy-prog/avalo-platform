/**
 * PACK 174 - Message Filtering
 * Filter messages for fraud, scams, and manipulation patterns
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, generateId } from '../init';
import { MessageFilterResult } from './types';

const FORBIDDEN_PATTERNS = [
  /send.*tokens?.*outside.*avalo/i,
  /send.*crypto.*outside.*avalo/i,
  /send.*money.*outside.*avalo/i,
  /invest.*(?:in|this).*(?:coin|token|crypto)/i,
  /give.*(?:me|us).*your.*(?:card|iban|bank)/i,
  /avalo.*staff.*(?:disable|suspend).*account.*unless.*pay/i,
  /pay.*(?:me|or).*(?:i|will).*(?:leak|expose|share).*(?:photos?|videos?)/i,
  /(?:i|we).*(?:will|would).*love.*you.*if.*(?:keep|continue).*spending/i,
  /(?:i|i'm).*in.*love.*with.*you.*help.*(?:me|with).*money/i,
  /password.*reset.*link.*click.*here/i,
  /verify.*account.*click.*here/i,
  /claim.*prize.*enter.*details/i,
];

const ROMANCE_FRAUD_PATTERNS = [
  /love.*you.*(?:need|want).*(?:money|help|cash)/i,
  /prove.*love.*(?:send|give|pay)/i,
  /relationship.*(?:needs|requires).*financial.*support/i,
  /if.*you.*(?:loved|cared).*you.*would.*(?:send|pay|give)/i,
  /stop.*spending.*(?:i|will).*(?:leave|ignore|block)/i,
];

const PHISHING_PATTERNS = [
  /urgent.*security.*alert/i,
  /account.*suspended.*verify.*now/i,
  /click.*here.*to.*(?:verify|confirm|activate)/i,
  /reset.*password.*immediately/i,
  /unusual.*activity.*detected/i,
];

/**
 * Filter message for fraud patterns
 */
export const filterMessage = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { content, recipientId, context } = request.data;

  if (!content) {
    throw new HttpsError('invalid-argument', 'Message content is required');
  }

  const result = analyzeMessage(content);

  if (result.blocked) {
    await logBlockedMessage(userId, recipientId, content, result, context);

    if (result.severity === 'critical') {
      await applyAutoRestriction(userId, result.fraudType, result.reason);
    }
  }

  return result;
});

/**
 * Analyze message content
 */
function analyzeMessage(content: string): MessageFilterResult {
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(content)) {
      return {
        blocked: true,
        reason: 'Contains forbidden fraud pattern',
        fraudType: determineFraudType(content) as any,
        severity: 'critical',
        warningMessage: 'This message has been blocked as it violates our fraud protection policies.',
      };
    }
  }

  for (const pattern of ROMANCE_FRAUD_PATTERNS) {
    if (pattern.test(content)) {
      return {
        blocked: true,
        reason: 'Contains romance fraud pattern',
        fraudType: 'romance_fraud',
        severity: 'high',
        warningMessage: 'This message has been blocked due to emotional manipulation and financial exploitation patterns.',
      };
    }
  }

  for (const pattern of PHISHING_PATTERNS) {
    if (pattern.test(content)) {
      return {
        blocked: true,
        reason: 'Contains phishing attempt',
        fraudType: 'phishing',
        severity: 'critical',
        warningMessage: 'This message has been blocked as it appears to be a phishing attempt.',
      };
    }
  }

  const warningPatterns = [
    /buy.*to.*receive/i,
    /spend.*more.*to.*unlock/i,
    /gift.*required.*for.*response/i,
  ];

  for (const pattern of warningPatterns) {
    if (pattern.test(content)) {
      return {
        blocked: false,
        reason: 'Contains concerning pattern',
        severity: 'medium',
        warningMessage: 'Warning: This message may contain transactional manipulation. Please exercise caution.',
      };
    }
  }

  return {
    blocked: false,
  };
}

/**
 * Determine fraud type from content
 */
function determineFraudType(content: string): 'crypto_trap' | 'phishing' | 'romance_fraud' | 'financial_blackmail' | 'payment_fraud' | 'generic_fraud' {
  const lowerContent = content.toLowerCase();

  if (lowerContent.includes('crypto') || lowerContent.includes('token') || lowerContent.includes('coin')) {
    return 'crypto_trap';
  }
  if (lowerContent.includes('password') || lowerContent.includes('verify') || lowerContent.includes('account')) {
    return 'phishing';
  }
  if (lowerContent.includes('love') && (lowerContent.includes('money') || lowerContent.includes('send'))) {
    return 'romance_fraud';
  }
  if (lowerContent.includes('leak') || lowerContent.includes('expose')) {
    return 'financial_blackmail';
  }
  if (lowerContent.includes('card') || lowerContent.includes('bank') || lowerContent.includes('iban')) {
    return 'payment_fraud';
  }

  return 'generic_fraud';
}

/**
 * Log blocked message
 */
async function logBlockedMessage(
  senderId: string,
  recipientId: string,
  content: string,
  result: MessageFilterResult,
  context: any
): Promise<void> {
  const logId = generateId();

  await db.collection('crypto_scam_logs').add({
    id: logId,
    userId: senderId,
    targetUserId: recipientId,
    scamType: result.fraudType || 'unknown',
    severity: result.severity || 'medium',
    content,
    context,
    blocked: result.blocked,
    actionTaken: 'blocked_message',
    createdAt: new Date(),
  });
}

/**
 * Apply automatic restriction
 */
async function applyAutoRestriction(
  userId: string,
  fraudType: string | undefined,
  reason: string | undefined
): Promise<void> {
  await db.collection('fraud_mitigation_actions').add({
    id: generateId(),
    userId,
    caseId: 'auto_message_filter',
    actionType: 'temp_restriction',
    reason: reason || `Automatic restriction for ${fraudType}`,
    duration: 24 * 60 * 60 * 1000,
    appliedAt: new Date(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });
}