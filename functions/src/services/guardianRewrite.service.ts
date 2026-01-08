/**
 * PACK 180: Guardian Message Rewrite Service
 * AI-assisted message rewriting for de-escalation and better communication
 */

import { db as firestore } from '../init';
import { Timestamp } from 'firebase-admin/firestore';
import {
  GuardianRewriteRequest,
  RewriteIntent
} from '../types/guardian.types';

// ============================================================================
// Rewrite Templates and Strategies
// ============================================================================

interface RewriteStrategy {
  intent: RewriteIntent;
  templates: string[];
  guidelines: string[];
}

const REWRITE_STRATEGIES: Record<RewriteIntent, RewriteStrategy> = {
  calm_tone: {
    intent: 'calm_tone',
    templates: [
      'Remove aggressive punctuation and caps',
      'Replace harsh words with neutral alternatives',
      'Add softening language like "I think" or "maybe"',
      'Use "I feel" statements instead of "you" accusations'
    ],
    guidelines: [
      'Remove all caps',
      'Reduce exclamation marks',
      'Replace insults with neutral descriptions',
      'Add calm transitional phrases'
    ]
  },
  clarify_intent: {
    intent: 'clarify_intent',
    templates: [
      'What I meant to say was...',
      'Let me clarify what I was trying to communicate...',
      'I think there might be a misunderstanding. What I actually meant was...',
      'To be clear, my intention was...'
    ],
    guidelines: [
      'Start with acknowledgment of confusion',
      'Clearly state the intended message',
      'Avoid defensive language',
      'Be specific about what was misunderstood'
    ]
  },
  express_boundary: {
    intent: 'express_boundary',
    templates: [
      'I appreciate your interest, but I need to set a boundary here...',
      'I\'m not comfortable with...',
      'I need you to respect that...',
      'Going forward, I\'d prefer if...'
    ],
    guidelines: [
      'Be clear and direct',
      'Use "I" statements',
      'Avoid apologizing for the boundary',
      'State consequences if needed'
    ]
  },
  apologize: {
    intent: 'apologize',
    templates: [
      'I apologize for...',
      'I\'m sorry that I...',
      'I realize now that... and I regret it',
      'You\'re right, and I take responsibility for...'
    ],
    guidelines: [
      'Take clear responsibility',
      'Avoid "but" statements',
      'Be specific about what you\'re apologizing for',
      'Acknowledge impact on the other person'
    ]
  },
  decline_politely: {
    intent: 'decline_politely',
    templates: [
      'I appreciate the offer, but...',
      'Thank you for thinking of me, however...',
      'I\'m going to have to pass on this, but I appreciate...',
      'That\'s not something I\'m interested in, but thank you'
    ],
    guidelines: [
      'Thank them first',
      'Be clear but kind in the decline',
      'Don\'t over-explain',
      'Offer alternative if appropriate'
    ]
  }
};

// Word replacement maps for calming tone
const HARSH_TO_NEUTRAL: Record<string, string> = {
  'stupid': 'confusing',
  'idiot': 'mistaken',
  'dumb': 'unclear',
  'hate': 'dislike',
  'annoying': 'frustrating',
  'ridiculous': 'surprising',
  'insane': 'unexpected',
  'crazy': 'unusual',
  'pathetic': 'disappointing'
};

// ============================================================================
// Guardian Rewrite Service
// ============================================================================

export class GuardianRewriteService {
  
  /**
   * Request message rewrite
   */
  async requestRewrite(
    userId: string,
    conversationId: string,
    originalMessage: string,
    rewriteIntent: RewriteIntent
  ): Promise<GuardianRewriteRequest> {
    const requestData: Omit<GuardianRewriteRequest, 'requestId'> = {
      userId,
      conversationId,
      originalMessage,
      rewriteIntent,
      status: 'pending',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };
    
    const requestRef = await firestore.collection('guardian_rewrite_requests').add({
      ...requestData,
      requestId: ''
    });
    
    // Generate rewrites
    const rewriteResult = await this.generateRewrites(originalMessage, rewriteIntent);
    
    // Update with results
    await requestRef.update({
      requestId: requestRef.id,
      status: 'completed',
      rewrittenMessage: rewriteResult.primary,
      alternatives: rewriteResult.alternatives,
      completedAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    });
    
    const updatedDoc = await requestRef.get();
    return updatedDoc.data() as GuardianRewriteRequest;
  }
  
  /**
   * Generate message rewrites based on intent
   */
  private async generateRewrites(
    originalMessage: string,
    intent: RewriteIntent
  ): Promise<{ primary: string; alternatives: string[] }> {
    const strategy = REWRITE_STRATEGIES[intent];
    
    switch (intent) {
      case 'calm_tone':
        return this.rewriteCalmTone(originalMessage);
      
      case 'clarify_intent':
        return this.rewriteClarifyIntent(originalMessage);
      
      case 'express_boundary':
        return this.rewriteExpressBoundary(originalMessage);
      
      case 'apologize':
        return this.rewriteApologize(originalMessage);
      
      case 'decline_politely':
        return this.rewriteDeclinePolitely(originalMessage);
      
      default:
        return { primary: originalMessage, alternatives: [] };
    }
  }
  
  /**
   * Rewrite with calm tone
   */
  private rewriteCalmTone(message: string): { primary: string; alternatives: string[] } {
    // Remove all caps
    let calmed = message.toLowerCase();
    calmed = calmed.charAt(0).toUpperCase() + calmed.slice(1);
    
    // Replace harsh words
    for (const [harsh, neutral] of Object.entries(HARSH_TO_NEUTRAL)) {
      const regex = new RegExp(`\\b${harsh}\\b`, 'gi');
      calmed = calmed.replace(regex, neutral);
    }
    
    // Reduce excessive punctuation
    calmed = calmed.replace(/!{2,}/g, '.');
    calmed = calmed.replace(/\?{2,}/g, '?');
    
    // Convert "you are" accusations to "I feel" statements
    calmed = this.convertToIStatements(calmed);
    
    // Generate alternatives
    const alt1 = "I feel " + calmed.toLowerCase();
    const alt2 = "I think " + calmed.toLowerCase();
    const alt3 = "From my perspective, " + calmed.toLowerCase();
    
    return {
      primary: calmed,
      alternatives: [alt1, alt2, alt3]
    };
  }
  
  /**
   * Rewrite to clarify intent
   */
  private rewriteClarifyIntent(message: string): { primary: string; alternatives: string[] } {
    const primary = `What I meant to say was: ${message}`;
    
    const alternatives = [
      `Let me clarify - ${message}`,
      `I think there might be a misunderstanding. What I actually meant was: ${message}`,
      `To be clear, my intention was: ${message}`
    ];
    
    return { primary, alternatives };
  }
  
  /**
   * Rewrite to express boundary
   */
  private rewriteExpressBoundary(message: string): { primary: string; alternatives: string[] } {
    // Extract core boundary from message
    const coreBoundary = this.extractCoreBoundary(message);
    
    const primary = `I need to set a boundary here: ${coreBoundary}`;
    
    const alternatives = [
      `I'm not comfortable with ${coreBoundary.toLowerCase()}`,
      `I appreciate your interest, but I need you to respect that ${coreBoundary.toLowerCase()}`,
      `Going forward, I'd prefer if ${coreBoundary.toLowerCase()}`
    ];
    
    return { primary, alternatives };
  }
  
  /**
   * Rewrite to apologize
   */
  private rewriteApologize(message: string): { primary: string; alternatives: string[] } {
    // Extract what they're apologizing for
    const core = this.extractApologyCore(message);
    
    const primary = `I apologize for ${core}. I realize now that it was wrong, and I take full responsibility.`;
    
    const alternatives = [
      `I'm sorry that I ${core}. That wasn't right.`,
      `You're right to be upset. I ${core} and I regret it.`,
      `I take responsibility for ${core}. I should have known better.`
    ];
    
    return { primary, alternatives };
  }
  
  /**
   * Rewrite to decline politely
   */
  private rewriteDeclinePolitely(message: string): { primary: string; alternatives: string[] } {
    const primary = `I appreciate your offer, but I'm going to have to pass. Thank you for understanding.`;
    
    const alternatives = [
      `Thank you for thinking of me, but that's not something I'm interested in right now.`,
      `I'm flattered, but I'm not able to do that. I hope you understand.`,
      `I appreciate the invitation, but I'll have to decline. Thanks for asking though!`
    ];
    
    return { primary, alternatives };
  }
  
  /**
   * Convert "you" accusations to "I" statements
   */
  private convertToIStatements(message: string): string {
    // Common accusatory patterns
    message = message.replace(/you('re| are) (always|never) /gi, 'I feel like ');
    message = message.replace(/you (don't|do not) /gi, 'I notice ');
    message = message.replace(/you make me /gi, 'I feel ');
    
    return message;
  }
  
  /**
   * Extract core boundary from message
   */
  private extractCoreBoundary(message: string): string {
    // Try to extract the actual boundary being set
    const boundaryPatterns = [
      /stop (.*)/i,
      /don't (.*)/i,
      /no (.*)/i,
      /not (.*)/i
    ];
    
    for (const pattern of boundaryPatterns) {
      const match = message.match(pattern);
      if (match) {
        return match[1] || message;
      }
    }
    
    return message;
  }
  
  /**
   * Extract apology core
   */
  private extractApologyCore(message: string): string {
    // Try to extract what they're apologizing for
    const apologyPatterns = [
      /sorry (for |about |that )?(.*)/i,
      /apologize (for )?(.*)/i,
      /my fault (that |for )?(.*)/i
    ];
    
    for (const pattern of apologyPatterns) {
      const match = message.match(pattern);
      if (match) {
        return match[2] || match[1] || 'my behavior';
      }
    }
    
    return 'what I did';
  }
  
  /**
   * Accept rewrite
   */
  async acceptRewrite(requestId: string): Promise<void> {
    await firestore.collection('guardian_rewrite_requests').doc(requestId).update({
      status: 'accepted',
      userChoice: 'accepted',
      updatedAt: Timestamp.now()
    });
  }
  
  /**
   * Reject rewrite
   */
  async rejectRewrite(requestId: string): Promise<void> {
    await firestore.collection('guardian_rewrite_requests').doc(requestId).update({
      status: 'rejected',
      userChoice: 'rejected',
      updatedAt: Timestamp.now()
    });
  }
  
  /**
   * Get rewrite request
   */
  async getRewriteRequest(requestId: string): Promise<GuardianRewriteRequest | null> {
    const doc = await firestore.collection('guardian_rewrite_requests').doc(requestId).get();
    
    if (!doc.exists) {
      return null;
    }
    
    return doc.data() as GuardianRewriteRequest;
  }
}

// Export singleton instance
export const guardianRewriteService = new GuardianRewriteService();