/**
 * PACK 380 — Global PR Engine
 * Automated + Manual Hybrid PR System
 * 
 * Features:
 * - Press release generation
 * - Press distribution
 * - Press monitoring
 * - Sentiment analysis
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';

const db = admin.firestore();

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface PressRelease {
  id: string;
  campaignId: string;
  title: string;
  subtitle: string;
  content: string;
  type: 'feature' | 'milestone' | 'safety' | 'earnings' | 'expansion' | 'partnership';
  tone: 'premium' | 'safety-first' | 'empowerment' | 'global';
  status: 'draft' | 'approved' | 'distributed' | 'archived';
  targetRegions: string[];
  languages: string[];
  mediaAssets: string[];
  createdBy: string;
  approvedBy?: string;
  distributedAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface PressContact {
  id: string;
  name: string;
  email: string;
  phone?: string;
  organization: string;
  role: string;
  regions: string[];
  topics: string[];
  tier: 'tier1' | 'tier2' | 'tier3';
  lastContactedAt?: Timestamp;
  responseRate: number;
  status: 'active' | 'inactive' | 'bounced' | 'unsubscribed';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface PressMention {
  id: string;
  source: string;
  sourceType: 'news' | 'blog' | 'social' | 'video' | 'podcast' | 'reddit' | 'forum';
  url: string;
  title: string;
  excerpt: string;
  author?: string;
  publishedAt: Timestamp;
  sentiment: 'positive' | 'neutral' | 'negative' | 'crisis';
  sentimentScore: number; // -1 to 1
  reach: number;
  engagement?: number;
  keywords: string[];
  regions: string[];
  language: string;
  isCrisis: boolean;
  notifiedAt?: Timestamp;
  createdAt: Timestamp;
}

interface PRCampaign {
  id: string;
  name: string;
  description: string;
  type: 'launch' | 'feature' | 'crisis' | 'milestone' | 'seasonal';
  status: 'planning' | 'active' | 'completed' | 'paused';
  startDate: Timestamp;
  endDate?: Timestamp;
  targetRegions: string[];
  pressReleases: string[];
  totalReach: number;
  totalMentions: number;
  sentimentAvg: number;
  budget?: number;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// PRESS RELEASE GENERATION
// ============================================================================

/**
 * Create and generate press release
 * Auto-generates compliant PR based on various triggers
 */
export const createPressRelease = functions.https.onCall(async (data, context) => {
  // Auth check
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const userId = context.auth.uid;

  // Admin check
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  if (!userData?.role || !['admin', 'pr_manager'].includes(userData.role)) {
    throw new functions.https.HttpsError('permission-denied', 'Insufficient permissions');
  }

  const {
    campaignId,
    title,
    type,
    tone,
    targetRegions,
    languages,
    autoGenerate
  } = data;

  // Validate required fields
  if (!title || !type || !tone) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  try {
    // Generate content based on type and tone
    let content = '';
    let subtitle = '';

    if (autoGenerate) {
      const generated = await generatePressReleaseContent(type, tone, data.context || {});
      content = generated.content;
      subtitle = generated.subtitle;
    } else {
      content = data.content || '';
      subtitle = data.subtitle || '';
    }

    // Create press release document
    const pressReleaseRef = db.collection('pressReleases').doc();
    const pressRelease: PressRelease = {
      id: pressReleaseRef.id,
      campaignId: campaignId || '',
      title,
      subtitle,
      content,
      type,
      tone,
      status: 'draft',
      targetRegions: targetRegions || ['global'],
      languages: languages || ['en'],
      mediaAssets: data.mediaAssets || [],
      createdBy: userId,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };

    await pressReleaseRef.set(pressRelease);

    // Log activity
    await db.collection('auditLogs').add({
      userId,
      action: 'press_release_created',
      resource: 'pressRelease',
      resourceId: pressReleaseRef.id,
      metadata: { title, type },
      timestamp: Timestamp.now()
    });

    return {
      success: true,
      pressReleaseId: pressReleaseRef.id,
      pressRelease
    };
  } catch (error: any) {
    console.error('Error creating press release:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Generate press release content using AI/templates
 */
async function generatePressReleaseContent(
  type: string,
  tone: string,
  context: any
): Promise<{ content: string; subtitle: string }> {
  // Template-based generation (can be enhanced with AI)
  const templates: any = {
    feature: {
      premium: {
        subtitle: 'Avalo introduces innovative feature enhancing premium dating experience',
        content: `Avalo, the world's premier dating and creator platform, today announced {{featureName}}, 
a groundbreaking feature designed to elevate the user experience for premium members worldwide.

{{featureDescription}}

"This represents our continued commitment to innovation and user safety," said {{spokesperson}}, 
{{spokespersonTitle}}. "We're building the future of premium social connections."

The feature is now available to all users globally, with enhanced capabilities for Royal Club members.

About Avalo:
Avalo is a next-generation dating and creator economy platform, combining premium matchmaking with 
creator monetization tools. With industry-leading safety features and global reach, Avalo empowers 
millions of users to build meaningful connections.`
      },
      'safety-first': {
        subtitle: 'Avalo enhances user protection with advanced safety feature',
        content: `Avalo today launched {{featureName}}, a new safety enhancement designed to protect 
users and maintain the platform's commitment to the safest dating experience in the industry.

{{featureDescription}}

The feature leverages advanced technology to ensure all users can connect with confidence and peace of mind.

Safety remains Avalo's top priority, with continuous investment in protection systems and user wellbeing.`
      }
    },
    milestone: {
      premium: {
        subtitle: 'Avalo reaches significant milestone in global expansion',
        content: `Avalo today announced reaching {{milestone}}, marking a significant achievement 
in the company's mission to revolutionize modern dating and creator economy.

{{milestoneDetails}}

This milestone reflects strong user trust, platform quality, and continued growth across all markets.

Avalo continues to invest in innovation, safety, and creator support as it scales globally.`
      }
    },
    safety: {
      'safety-first': {
        subtitle: 'Avalo strengthens platform safety with comprehensive protection updates',
        content: `Avalo has implemented {{safetyUpdate}}, further reinforcing its position as 
the industry leader in user safety and protection.

{{updateDetails}}

"User safety is non-negotiable," said {{spokesperson}}. "We invest more in safety than any 
competitor because our users deserve nothing less."

These updates build on Avalo's existing safety infrastructure, which includes real-time monitoring, 
AI-powered protection, and 24/7 support teams.`
      }
    },
    earnings: {
      empowerment: {
        subtitle: 'Avalo creators achieve record earnings milestone',
        content: `Avalo today announced that creators on the platform have collectively earned 
{{earningsAmount}}, demonstrating the platform's commitment to creator economic empowerment.

{{earningsDetails}}

"We're building the most creator-friendly platform in the industry," said {{spokesperson}}. 
"Our creators' success is our success."

Avalo provides creators with multiple monetization tools including premium chat, calendar bookings, 
content sales, and Royal Club subscriptions.`
      }
    }
  };

  // Get template or use default
  const template = templates[type]?.[tone] || templates.feature.premium;

  // Replace variables with context data
  let content = template.content;
  let subtitle = template.subtitle;

  Object.keys(context).forEach(key => {
    const regex = new RegExp(`{{${key}}}`, 'g');
    content = content.replace(regex, context[key] || '');
    subtitle = subtitle.replace(regex, context[key] || '');
  });

  return { content, subtitle };
}

// ============================================================================
// PRESS DISTRIBUTION ENGINE
// ============================================================================

/**
 * Distribute press release to media contacts
 */
export const distributePressRelease = functions.https.onCall(async (data, context) => {
  // Auth check
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const userId = context.auth.uid;

  // Admin check
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  if (!userData?.role || !['admin', 'pr_manager'].includes(userData.role)) {
    throw new functions.https.HttpsError('permission-denied', 'Insufficient permissions');
  }

  const { pressReleaseId, targetTiers, customContacts } = data;

  if (!pressReleaseId) {
    throw new functions.https.HttpsError('invalid-argument', 'Press release ID required');
  }

  try {
    // Get press release
    const prDoc = await db.collection('pressReleases').doc(pressReleaseId).get();
    if (!prDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Press release not found');
    }

    const pressRelease = prDoc.data() as PressRelease;

    // Update status
    await prDoc.ref.update({
      status: 'distributed',
      distributedAt: Timestamp.now(),
      approvedBy: userId,
      updatedAt: Timestamp.now()
    });

    // Get target contacts
    let query = db.collection('pressContacts')
      .where('status', '==', 'active');

    if (targetTiers && targetTiers.length > 0) {
      query = query.where('tier', 'in', targetTiers);
    }

    const contactsSnapshot = await query.get();
    const contacts: PressContact[] = [];

    contactsSnapshot.forEach(doc => {
      const contact = doc.data() as PressContact;
      // Filter by region
      if (pressRelease.targetRegions.includes('global') || 
          contact.regions.some(r => pressRelease.targetRegions.includes(r))) {
        contacts.push(contact);
      }
    });

    // Add custom contacts
    if (customContacts && Array.isArray(customContacts)) {
      contacts.push(...customContacts);
    }

    // Create distribution records
    const distributionPromises = contacts.map(async contact => {
      const distRef = db.collection('pressReleases')
        .doc(pressReleaseId)
        .collection('distributions')
        .doc();

      return distRef.set({
        contactId: contact.id,
        contactEmail: contact.email,
        sentAt: Timestamp.now(),
        status: 'sent',
        opened: false,
        clicked: false
      });
    });

    await Promise.all(distributionPromises);

    // TODO: Integrate with email service to actually send emails
    // This would connect to services like SendGrid, Mailgun, etc.

    // Log activity
    await db.collection('auditLogs').add({
      userId,
      action: 'press_release_distributed',
      resource: 'pressRelease',
      resourceId: pressReleaseId,
      metadata: { 
        contactCount: contacts.length,
        title: pressRelease.title 
      },
      timestamp: Timestamp.now()
    });

    return {
      success: true,
      distributedCount: contacts.length,
      contacts: contacts.map(c => ({ id: c.id, name: c.name, organization: c.organization }))
    };
  } catch (error: any) {
    console.error('Error distributing press release:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ============================================================================
// PRESS MONITORING DAEMON
// ============================================================================

/**
 * Monitor press mentions and sentiment
 * Scheduled function that runs periodically
 */
export const pressMonitoringDaemon = functions.pubsub
  .schedule('every 30 minutes')
  .onRun(async (context) => {
    try {
      // Check feature flag
      const flagDoc = await db.collection('featureFlags').doc('pr.engine.enabled').get();
      if (!flagDoc.exists || !flagDoc.data()?.enabled) {
        console.log('PR engine disabled, skipping monitoring');
        return null;
      }

      // Get monitoring sources
      const sourcesSnapshot = await db.collection('monitoringSources')
        .where('type', '==', 'press')
        .where('active', '==', true)
        .get();

      const sources = sourcesSnapshot.docs.map(doc => doc.data());

      // TODO: Integrate with monitoring APIs (Google Alerts, Mention, Brand24, etc.)
      // For now, we'll create a placeholder system

      // Check for crisis triggers
      const crisisMentions = await db.collection('pressMentions')
        .where('isCrisis', '==', true)
        .where('notifiedAt', '==', null)
        .get();

      if (!crisisMentions.empty) {
        // Trigger crisis alerts
        for (const mention of crisisMentions.docs) {
          const mentionData = mention.data() as PressMention;
          
          // Notify crisis system (PACK 379)
          await db.collection('crisisAlerts').add({
            type: 'press_crisis',
            severity: 'high',
            source: mentionData.source,
            url: mentionData.url,
            sentiment: mentionData.sentiment,
            sentimentScore: mentionData.sentimentScore,
            excerpt: mentionData.excerpt,
            triggeredAt: Timestamp.now(),
            status: 'pending'
          });

          // Mark as notified
          await mention.ref.update({
            notifiedAt: Timestamp.now()
          });
        }
      }

      // Calculate daily sentiment scores
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const todayMentions = await db.collection('pressMentions')
        .where('publishedAt', '>=', Timestamp.fromDate(today))
        .get();

      let totalSentiment = 0;
      let mentionCount = 0;

      todayMentions.forEach(doc => {
        const mention = doc.data() as PressMention;
        totalSentiment += mention.sentimentScore;
        mentionCount++;
      });

      const avgSentiment = mentionCount > 0 ? totalSentiment / mentionCount : 0;

      // Store daily analytics
      await db.collection('prAnalytics').add({
        date: Timestamp.fromDate(today),
        mentionCount,
        avgSentiment,
        positiveCount: todayMentions.docs.filter(d => d.data().sentiment === 'positive').length,
        neutralCount: todayMentions.docs.filter(d => d.data().sentiment === 'neutral').length,
        negativeCount: todayMentions.docs.filter(d => d.data().sentiment === 'negative').length,
        crisisCount: todayMentions.docs.filter(d => d.data().isCrisis === true).length,
        createdAt: Timestamp.now()
      });

      console.log(`Press monitoring complete: ${mentionCount} mentions, avg sentiment: ${avgSentiment}`);
      return null;
    } catch (error) {
      console.error('Error in press monitoring daemon:', error);
      return null;
    }
  });

// ============================================================================
// PRESS MENTIONS
// ============================================================================

/**
 * Add press mention manually or via webhook
 */
export const addPressMention = functions.https.onCall(async (data, context) => {
  const {
    source,
    sourceType,
    url,
    title,
    excerpt,
    author,
    publishedAt,
    language
  } = data;

  if (!source || !url || !title) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  try {
    // Analyze sentiment
    const sentimentAnalysis = await analyzeSentiment(title + ' ' + excerpt);

    // Create mention
    const mentionRef = db.collection('pressMentions').doc();
    const mention: PressMention = {
      id: mentionRef.id,
      source,
      sourceType: sourceType || 'news',
      url,
      title,
      excerpt: excerpt || '',
      author,
      publishedAt: publishedAt ? Timestamp.fromMillis(publishedAt) : Timestamp.now(),
      sentiment: sentimentAnalysis.sentiment,
      sentimentScore: sentimentAnalysis.score,
      reach: data.reach || 0,
      engagement: data.engagement || 0,
      keywords: extractKeywords(title + ' ' + excerpt),
      regions: data.regions || ['global'],
      language: language || 'en',
      isCrisis: sentimentAnalysis.isCrisis,
      createdAt: Timestamp.now()
    };

    await mentionRef.set(mention);

    return {
      success: true,
      mentionId: mentionRef.id,
      sentiment: sentimentAnalysis
    };
  } catch (error: any) {
    console.error('Error adding press mention:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Analyze sentiment of text
 */
async function analyzeSentiment(text: string): Promise<{
  sentiment: 'positive' | 'neutral' | 'negative' | 'crisis';
  score: number;
  isCrisis: boolean;
}> {
  // Simple keyword-based sentiment analysis
  // In production, use services like Google Cloud Natural Language API, AWS Comprehend, etc.
  
  const lowerText = text.toLowerCase();
  
  // Crisis keywords
  const crisisKeywords = [
    'lawsuit', 'scandal', 'fraud', 'scam', 'investigation', 'illegal',
    'abuse', 'harass', 'predator', 'danger', 'unsafe', 'exploit',
    'lawsuit', 'sued', 'criminal', 'arrest', 'banned'
  ];

  const isCrisis = crisisKeywords.some(keyword => lowerText.includes(keyword));

  // Positive keywords
  const positiveKeywords = [
    'innovative', 'success', 'growth', 'award', 'best', 'leading',
    'safe', 'secure', 'revolutionary', 'excellent', 'amazing'
  ];

  // Negative keywords
  const negativeKeywords = [
    'issue', 'problem', 'concern', 'complaint', 'criticism', 'controversy',
    'fail', 'poor', 'bad', 'worst', 'terrible'
  ];

  let score = 0;

  positiveKeywords.forEach(keyword => {
    if (lowerText.includes(keyword)) score += 0.3;
  });

  negativeKeywords.forEach(keyword => {
    if (lowerText.includes(keyword)) score -= 0.3;
  });

  if (isCrisis) score -= 0.8;

  // Normalize score between -1 and 1
  score = Math.max(-1, Math.min(1, score));

  let sentiment: 'positive' | 'neutral' | 'negative' | 'crisis';
  if (isCrisis) {
    sentiment = 'crisis';
  } else if (score > 0.2) {
    sentiment = 'positive';
  } else if (score < -0.2) {
    sentiment = 'negative';
  } else {
    sentiment = 'neutral';
  }

  return { sentiment, score, isCrisis };
}

/**
 * Extract keywords from text
 */
function extractKeywords(text: string): string[] {
  const importantKeywords = [
    'avalo', 'dating', 'creator', 'safety', 'security', 'feature',
    'launch', 'expansion', 'global', 'premium', 'royal', 'monetization'
  ];

  const lowerText = text.toLowerCase();
  return importantKeywords.filter(keyword => lowerText.includes(keyword));
}

// ============================================================================
// PRESS CONTACTS MANAGEMENT
// ============================================================================

/**
 * Add press contact
 */
export const addPressContact = functions.https.onCall(async (data, context) => {
  // Auth check
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const userId = context.auth.uid;

  // Admin check
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  if (!userData?.role || !['admin', 'pr_manager'].includes(userData.role)) {
    throw new functions.https.HttpsError('permission-denied', 'Insufficient permissions');
  }

  const { name, email, organization, role, regions, topics, tier } = data;

  if (!name || !email || !organization) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  try {
    const contactRef = db.collection('pressContacts').doc();
    const contact: PressContact = {
      id: contactRef.id,
      name,
      email,
      phone: data.phone,
      organization,
      role: role || 'journalist',
      regions: regions || ['global'],
      topics: topics || [],
      tier: tier || 'tier3',
      responseRate: 0,
      status: 'active',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };

    await contactRef.set(contact);

    return {
      success: true,
      contactId: contactRef.id
    };
  } catch (error: any) {
    console.error('Error adding press contact:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});
