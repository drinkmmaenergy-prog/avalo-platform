/**
 * PACK 389 — Real-Time Threat Detection Engine
 * Processes telemetry from all Avalo systems to identify security threats
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// Threat severity thresholds
const THREAT_SEVERITY = {
  LOW: 0.25,
  MEDIUM: 0.50,
  HIGH: 0.75,
  CRITICAL: 0.85
};

// Threat types
enum ThreatType {
  CREDENTIAL_STUFFING = 'credential_stuffing',
  BOT_AUTOMATION = 'bot_automation',
  PAYOUT_FRAUD = 'payout_fraud',
  IMPERSONATION = 'impersonation',
  UNDERAGE_ACCESS = 'underage_access',
  AI_COMPANION_FARM = 'ai_companion_farm',
  TICKET_LAUNDERING = 'ticket_laundering',
  MARKETPLACE_HARASSMENT = 'marketplace_harassment',
  ACCOUNT_TAKEOVER = 'account_takeover',
  DATA_SCRAPING = 'data_scraping',
  PAYMENT_FRAUD = 'payment_fraud',
  SPAM_ACTIVITY = 'spam_activity'
}

interface ThreatSignal {
  source: string;
  userId?: string;
  signalType: string;
  severity: number;
  metadata: any;
  timestamp: number;
}

interface SecurityAlert {
  type: ThreatType;
  severity: number;
  source: string;
  userId: string;
  riskSnapshot: {
    score: number;
    timestamp: number;
    signals: string[];
  };
  requiredAction: string;
  status: 'active' | 'investigating' | 'resolved' | 'false_positive';
  createdAt: FirebaseFirestore.Timestamp;
  resolvedAt?: FirebaseFirestore.Timestamp;
}

/**
 * Main threat stream processor
 * Aggregates signals from multiple sources and identifies threats
 */
export const pack389_threatStreamProcessor = async (
  signal: ThreatSignal
): Promise<void> => {
  try {
    console.log(`🔍 Processing threat signal: ${signal.signalType} from ${signal.source}`);
    
    // Analyze signal
    const threats = await analyzeSignal(signal);
    
    // Create alerts for identified threats
    for (const threat of threats) {
      if (threat.severity >= THREAT_SEVERITY.MEDIUM) {
        await createSecurityAlert(threat);
        
        // If critical, trigger immediate containment
        if (threat.severity >= THREAT_SEVERITY.CRITICAL) {
          await triggerImmediateContainment(threat);
        }
      }
    }
    
    // Update user risk score
    if (signal.userId) {
      await updateUserRiskScore(signal.userId, threats);
    }
    
    // Store signal for pattern analysis
    await storeSignal(signal);
    
  } catch (error) {
    console.error('Threat stream processor error:', error);
  }
};

/**
 * Analyze signal and identify potential threats
 */
async function analyzeSignal(signal: ThreatSignal): Promise<SecurityAlert[]> {
  const alerts: SecurityAlert[] = [];
  
  switch (signal.source) {
    case 'auth':
      alerts.push(...await analyzeAuthSignal(signal));
      break;
    case 'wallet':
      alerts.push(...await analyzeWalletSignal(signal));
      break;
    case 'chat':
      alerts.push(...await analyzeChatSignal(signal));
      break;
    case 'meeting':
      alerts.push(...await analyzeMeetingSignal(signal));
      break;
    case 'ai_companion':
      alerts.push(...await analyzeAICompanionSignal(signal));
      break;
    case 'kyc':
      alerts.push(...await analyzeKYCSignal(signal));
      break;
    case 'support':
      alerts.push(...await analyzeSupportSignal(signal));
      break;
    case 'store':
      alerts.push(...await analyzeStoreSignal(signal));
      break;
  }
  
  return alerts;
}

/**
 * Analyze authentication signals
 */
async function analyzeAuthSignal(signal: ThreatSignal): Promise<SecurityAlert[]> {
  const alerts: SecurityAlert[] = [];
  
  if (!signal.userId) return alerts;
  
  // Check for credential stuffing
  if (signal.signalType === 'failed_login') {
    const recentFailures = await db
      .collection('threatSignals')
      .where('userId', '==', signal.userId)
      .where('signalType', '==', 'failed_login')
      .where('timestamp', '>', Date.now() - 600000) // Last 10 minutes
      .get();
    
    if (recentFailures.size >= 5) {
      alerts.push({
        type: ThreatType.CREDENTIAL_STUFFING,
        severity: 0.7,
        source: 'auth',
        userId: signal.userId,
        riskSnapshot: {
          score: 0.7,
          timestamp: Date.now(),
          signals: ['multiple_failed_logins']
        },
        requiredAction: 'lockout',
        status: 'active',
        createdAt: admin.firestore.Timestamp.now()
      });
    }
  }
  
  // Check for account takeover indicators
  if (signal.signalType === 'login_from_new_device') {
    const deviceHistory = await db
      .collection('trustedDevices')
      .where('userId', '==', signal.userId)
      .get();
    
    if (deviceHistory.size === 0 && signal.metadata.accountAge < 86400000) {
      // New account, new device - suspicious
      alerts.push({
        type: ThreatType.ACCOUNT_TAKEOVER,
        severity: 0.6,
        source: 'auth',
        userId: signal.userId,
        riskSnapshot: {
          score: 0.6,
          timestamp: Date.now(),
          signals: ['new_account_new_device']
        },
        requiredAction: 'verify_identity',
        status: 'active',
        createdAt: admin.firestore.Timestamp.now()
      });
    }
  }
  
  return alerts;
}

/**
 * Analyze wallet/payment signals
 */
async function analyzeWalletSignal(signal: ThreatSignal): Promise<SecurityAlert[]> {
  const alerts: SecurityAlert[] = [];
  
  if (!signal.userId) return alerts;
  
  // Check for payout fraud patterns
  if (signal.signalType === 'payout_request') {
    const amount = signal.metadata.amount;
    const userDoc = await db.collection('users').doc(signal.userId).get();
    const userData = userDoc.data();
    
    // New account requesting large payout
    const accountAge = Date.now() - userData?.createdAt?.toMillis();
    if (accountAge < 7 * 24 * 60 * 60 * 1000 && amount > 1000) {
      alerts.push({
        type: ThreatType.PAYOUT_FRAUD,
        severity: 0.8,
        source: 'wallet',
        userId: signal.userId,
        riskSnapshot: {
          score: 0.8,
          timestamp: Date.now(),
          signals: ['new_account_large_payout']
        },
        requiredAction: 'freeze_wallet',
        status: 'active',
        createdAt: admin.firestore.Timestamp.now()
      });
    }
    
    // Multiple rapid payouts
    const recentPayouts = await db
      .collection('walletTransactions')
      .where('userId', '==', signal.userId)
      .where('type', '==', 'payout')
      .where('timestamp', '>', Date.now() - 3600000) // Last hour
      .get();
    
    if (recentPayouts.size >= 5) {
      alerts.push({
        type: ThreatType.PAYMENT_FRAUD,
        severity: 0.75,
        source: 'wallet',
        userId: signal.userId,
        riskSnapshot: {
          score: 0.75,
          timestamp: Date.now(),
          signals: ['rapid_multiple_payouts']
        },
        requiredAction: 'freeze_wallet',
        status: 'active',
        createdAt: admin.firestore.Timestamp.now()
      });
    }
  }
  
  return alerts;
}

/**
 * Analyze chat activity signals
 */
async function analyzeChatSignal(signal: ThreatSignal): Promise<SecurityAlert[]> {
  const alerts: SecurityAlert[] = [];
  
  if (!signal.userId) return alerts;
  
  // Check for bot activity (burst messaging)
  if (signal.signalType === 'message_burst') {
    const messagesPerMinute = signal.metadata.messagesPerMinute;
    
    if (messagesPerMinute > 30) {
      alerts.push({
        type: ThreatType.BOT_AUTOMATION,
        severity: 0.7,
        source: 'chat',
        userId: signal.userId,
        riskSnapshot: {
          score: 0.7,
          timestamp: Date.now(),
          signals: ['message_burst']
        },
        requiredAction: 'rate_limit',
        status: 'active',
        createdAt: admin.firestore.Timestamp.now()
      });
    }
  }
  
  // Check for marketplace harassment
  if (signal.signalType === 'harassment_detected') {
    alerts.push({
      type: ThreatType.MARKETPLACE_HARASSMENT,
      severity: 0.65,
      source: 'chat',
      userId: signal.userId,
      riskSnapshot: {
        score: 0.65,
        timestamp: Date.now(),
        signals: ['harassment_content']
      },
      requiredAction: 'suspend_chat',
      status: 'active',
      createdAt: admin.firestore.Timestamp.now()
    });
  }
  
  return alerts;
}

/**
 * Analyze meeting/event signals
 */
async function analyzeMeetingSignal(signal: ThreatSignal): Promise<SecurityAlert[]> {
  const alerts: SecurityAlert[] = [];
  
  if (!signal.userId) return alerts;
  
  // Check for ticket laundering
  if (signal.signalType === 'rapid_ticket_resales') {
    const resaleCount = signal.metadata.resaleCount;
    
    if (resaleCount > 10) {
      alerts.push({
        type: ThreatType.TICKET_LAUNDERING,
        severity: 0.75,
        source: 'meeting',
        userId: signal.userId,
        riskSnapshot: {
          score: 0.75,
          timestamp: Date.now(),
          signals: ['excessive_ticket_resales']
        },
        requiredAction: 'freeze_ticket_trading',
        status: 'active',
        createdAt: admin.firestore.Timestamp.now()
      });
    }
  }
  
  return alerts;
}

/**
 * Analyze AI Companion signals
 */
async function analyzeAICompanionSignal(signal: ThreatSignal): Promise<SecurityAlert[]> {
  const alerts: SecurityAlert[] = [];
  
  if (!signal.userId) return alerts;
  
  // Check for AI Companion farming
  if (signal.signalType === 'multiple_companions_created') {
    const companionCount = signal.metadata.count;
    
    if (companionCount > 20) {
      alerts.push({
        type: ThreatType.AI_COMPANION_FARM,
        severity: 0.8,
        source: 'ai_companion',
        userId: signal.userId,
        riskSnapshot: {
          score: 0.8,
          timestamp: Date.now(),
          signals: ['excessive_companion_creation']
        },
        requiredAction: 'freeze_ai_companions',
        status: 'active',
        createdAt: admin.firestore.Timestamp.now()
      });
    }
  }
  
  return alerts;
}

/**
 * Analyze KYC/AML signals
 */
async function analyzeKYCSignal(signal: ThreatSignal): Promise<SecurityAlert[]> {
  const alerts: SecurityAlert[] = [];
  
  if (!signal.userId) return alerts;
  
  // Check for underage access attempts
  if (signal.signalType === 'age_verification_failed') {
    alerts.push({
      type: ThreatType.UNDERAGE_ACCESS,
      severity: 0.9,
      source: 'kyc',
      userId: signal.userId,
      riskSnapshot: {
        score: 0.9,
        timestamp: Date.now(),
        signals: ['failed_age_verification']
      },
      requiredAction: 'permanent_ban',
      status: 'active',
      createdAt: admin.firestore.Timestamp.now()
    });
  }
  
  // Check for identity mismatches
  if (signal.signalType === 'identity_mismatch') {
    alerts.push({
      type: ThreatType.IMPERSONATION,
      severity: 0.85,
      source: 'kyc',
      userId: signal.userId,
      riskSnapshot: {
        score: 0.85,
        timestamp: Date.now(),
        signals: ['identity_document_mismatch']
      },
      requiredAction: 'freeze_account',
      status: 'active',
      createdAt: admin.firestore.Timestamp.now()
    });
  }
  
  return alerts;
}

/**
 * Analyze support ticket signals
 */
async function analyzeSupportSignal(signal: ThreatSignal): Promise<SecurityAlert[]> {
  const alerts: SecurityAlert[] = [];
  
  if (!signal.userId) return alerts;
  
  // Check for account takeover indicators in support tickets
  if (signal.signalType === 'password_reset_request') {
    const recentResets = await db
      .collection('threatSignals')
      .where('userId', '==', signal.userId)
      .where('signalType', '==', 'password_reset_request')
      .where('timestamp', '>', Date.now() - 3600000) // Last hour
      .get();
    
    if (recentResets.size >= 3) {
      alerts.push({
        type: ThreatType.ACCOUNT_TAKEOVER,
        severity: 0.7,
        source: 'support',
        userId: signal.userId,
        riskSnapshot: {
          score: 0.7,
          timestamp: Date.now(),
          signals: ['multiple_password_reset_attempts']
        },
        requiredAction: 'lockout',
        status: 'active',
        createdAt: admin.firestore.Timestamp.now()
      });
    }
  }
  
  return alerts;
}

/**
 * Analyze store/marketplace signals
 */
async function analyzeStoreSignal(signal: ThreatSignal): Promise<SecurityAlert[]> {
  const alerts: SecurityAlert[] = [];
  
  if (!signal.userId) return alerts;
  
  // Check for review manipulation
  if (signal.signalType === 'suspicious_review_pattern') {
    alerts.push({
      type: ThreatType.BOT_AUTOMATION,
      severity: 0.6,
      source: 'store',
      userId: signal.userId,
      riskSnapshot: {
        score: 0.6,
        timestamp: Date.now(),
        signals: ['review_manipulation']
      },
      requiredAction: 'suspend_store_access',
      status: 'active',
      createdAt: admin.firestore.Timestamp.now()
    });
  }
  
  // Check for data scraping
  if (signal.signalType === 'excessive_store_queries') {
    const queriesPerMinute = signal.metadata.queriesPerMinute;
    
    if (queriesPerMinute > 100) {
      alerts.push({
        type: ThreatType.DATA_SCRAPING,
        severity: 0.75,
        source: 'store',
        userId: signal.userId,
        riskSnapshot: {
          score: 0.75,
          timestamp: Date.now(),
          signals: ['excessive_api_queries']
        },
        requiredAction: 'rate_limit',
        status: 'active',
        createdAt: admin.firestore.Timestamp.now()
      });
    }
  }
  
  return alerts;
}

/**
 * Create security alert
 */
async function createSecurityAlert(alert: SecurityAlert): Promise<void> {
  try {
    await db.collection('securityAlerts').add(alert);
    console.log(`🚨 Security alert created: ${alert.type} (severity: ${alert.severity})`);
  } catch (error) {
    console.error('Failed to create security alert:', error);
  }
}

/**
 * Trigger immediate containment for critical threats
 */
async function triggerImmediateContainment(alert: SecurityAlert): Promise<void> {
  console.log(`🔒 CRITICAL THREAT - Triggering immediate containment for user ${alert.userId}`);
  
  // Import containment module
  // This will be implemented in pack389-containment.ts
  // await executeAccountContainment(alert.userId, alert.type, alert.severity);
}

/**
 * Update user risk score based on threats
 */
async function updateUserRiskScore(userId: string, threats: SecurityAlert[]): Promise<void> {
  if (threats.length === 0) return;
  
  try {
    const maxSeverity = Math.max(...threats.map(t => t.severity));
    
    await db.collection('users').doc(userId).update({
      riskScore: admin.firestore.FieldValue.increment(maxSeverity * 0.1),
      lastRiskUpdate: admin.firestore.Timestamp.now()
    });
  } catch (error) {
    console.error('Failed to update user risk score:', error);
  }
}

/**
 * Store signal for pattern analysis
 */
async function storeSignal(signal: ThreatSignal): Promise<void> {
  try {
    await db.collection('threatSignals').add({
      ...signal,
      timestamp: admin.firestore.Timestamp.fromMillis(signal.timestamp),
      processed: true,
      processedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (error) {
    console.error('Failed to store threat signal:', error);
  }
}

/**
 * Cloud Function: Ingest threat signal
 */
export const ingestThreatSignal = functions.https.onCall(async (data, context) => {
  const signal: ThreatSignal = {
    source: data.source,
    userId: data.userId || context.auth?.uid,
    signalType: data.signalType,
    severity: data.severity || 0.5,
    metadata: data.metadata || {},
    timestamp: Date.now()
  };
  
  await pack389_threatStreamProcessor(signal);
  
  return { success: true };
});

/**
 * Firestore Trigger: Process new auth attempts
 */
export const processAuthAttempt = functions.firestore
  .document('authAttempts/{attemptId}')
  .onCreate(async (snap, context) => {
    const attempt = snap.data();
    
    const signal: ThreatSignal = {
      source: 'auth',
      userId: attempt.userId,
      signalType: attempt.success ? 'successful_login' : 'failed_login',
      severity: attempt.success ? 0.1 : 0.5,
      metadata: {
        ipAddress: attempt.ipAddress,
        deviceId: attempt.deviceId,
        accountAge: attempt.accountAge
      },
      timestamp: Date.now()
    };
    
    await pack389_threatStreamProcessor(signal);
  });

/**
 * Firestore Trigger: Process wallet transactions
 */
export const processWalletTransaction = functions.firestore
  .document('walletTransactions/{transactionId}')
  .onCreate(async (snap, context) => {
    const transaction = snap.data();
    
    if (transaction.type === 'payout') {
      const signal: ThreatSignal = {
        source: 'wallet',
        userId: transaction.userId,
        signalType: 'payout_request',
        severity: 0.6,
        metadata: {
          amount: transaction.amount,
          destination: transaction.destination
        },
        timestamp: Date.now()
      };
      
      await pack389_threatStreamProcessor(signal);
    }
  });

/**
 * Scheduled: Run pattern analysis
 */
export const runThreatPatternAnalysis = functions.pubsub
  .schedule('every 15 minutes')
  .onRun(async (context) => {
    console.log('🔍 Running threat pattern analysis...');
    
    // Analyze patterns across all recent signals
    const recentSignals = await db
      .collection('threatSignals')
      .where('timestamp', '>', admin.firestore.Timestamp.fromMillis(Date.now() - 900000)) // Last 15 min
      .get();
    
    // Group signals by user
    const userSignals = new Map<string, any[]>();
    
    recentSignals.forEach(doc => {
      const signal = doc.data();
      if (signal.userId) {
        if (!userSignals.has(signal.userId)) {
          userSignals.set(signal.userId, []);
        }
        userSignals.get(signal.userId)!.push(signal);
      }
    });
    
    // Detect coordinated attacks or patterns
    for (const [userId, signals] of userSignals) {
      if (signals.length > 10) {
        console.log(`⚠️ High activity detected for user ${userId}: ${signals.length} signals`);
        
        // Could indicate coordinated attack or automation
        const signal: ThreatSignal = {
          source: 'pattern_analysis',
          userId,
          signalType: 'high_activity_pattern',
          severity: 0.7,
          metadata: {
            signalCount: signals.length,
            sources: [...new Set(signals.map((s: any) => s.source))]
          },
          timestamp: Date.now()
        };
        
        await pack389_threatStreamProcessor(signal);
      }
    }
    
    console.log('✅ Threat pattern analysis complete');
  });
