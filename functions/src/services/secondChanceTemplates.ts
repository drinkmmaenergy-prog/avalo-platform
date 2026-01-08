/**
 * PACK 236 — Second Chance Mode
 * Emotional message templates for cold match revival
 * Non-pushy, romantic, context-aware messages
 */

import { 
  EmotionalMessageTemplate, 
  SecondChanceReason,
  SecondChanceActionType 
} from '../types/secondChance.types';

/**
 * Curated emotional message templates
 * Each template is designed to be:
 * - Non-pushy
 * - Non-cringe
 * - Emotionally resonant
 * - Context-aware
 * - Does not expose vulnerability
 */
export const EMOTIONAL_TEMPLATES: EmotionalMessageTemplate[] = [
  // MEMORY-BASED TEMPLATES
  {
    id: 'memory_rome',
    text: 'You two once talked about visiting Rome. Maybe now is a good moment to ask how life has been lately?',
    applicableReasons: ['memory', 'sentiment'],
    suggestedAction: 'deepQuestion',
    tone: 'nostalgic',
    priority: 10
  },
  {
    id: 'memory_shared_dream',
    text: 'Your conversation about {topic} felt special. Some stories deserve a second chapter.',
    applicableReasons: ['memory', 'sentiment'],
    suggestedAction: 'voiceNoteMemory',
    tone: 'romantic',
    priority: 9
  },
  {
    id: 'memory_connection',
    text: 'The connection you built was unique. Time does not have to be the end -- it can be a new beginning.',
    applicableReasons: ['memory', 'pastMomentum'],
    suggestedAction: 'deepQuestion',
    tone: 'friendly',
    priority: 8
  },

  // MOMENTUM-BASED TEMPLATES
  {
    id: 'momentum_vibe',
    text: 'Your vibe together was unmatched. What if the story is not over yet?',
    applicableReasons: ['pastMomentum', 'sentiment'],
    suggestedAction: 'videoCatchUp',
    tone: 'playful',
    priority: 10
  },
  {
    id: 'momentum_energy',
    text: 'Seven days is not the end. Maybe it is a new beginning.',
    applicableReasons: ['pastMomentum'],
    suggestedAction: 'voiceNoteMemory',
    tone: 'romantic',
    priority: 9
  },
  {
    id: 'momentum_chemistry',
    text: 'The chemistry you had does not just fade. Sometimes life gets busy -- but the spark stays.',
    applicableReasons: ['pastMomentum', 'highCompatibility'],
    suggestedAction: 'deepQuestion',
    tone: 'curious',
    priority: 8
  },

  // COMPATIBILITY-BASED TEMPLATES
  {
    id: 'compatibility_match',
    text: 'Some matches are too good to let go. Your compatibility was remarkable.',
    applicableReasons: ['highCompatibility'],
    suggestedAction: 'videoCatchUp',
    tone: 'romantic',
    priority: 10
  },
  {
    id: 'compatibility_rare',
    text: 'Finding someone who truly gets you is rare. This might be worth another try.',
    applicableReasons: ['highCompatibility', 'sentiment'],
    suggestedAction: 'deepQuestion',
    tone: 'friendly',
    priority: 9
  },
  {
    id: 'compatibility_special',
    text: 'What you had was special. Sometimes the universe needs a second chance too.',
    applicableReasons: ['highCompatibility', 'memory'],
    suggestedAction: 'voiceNoteMemory',
    tone: 'nostalgic',
    priority: 8
  },

  // MEETING-HISTORY TEMPLATES
  {
    id: 'meeting_almost',
    text: 'You almost met at {location}. Life interrupted, but what if it is not too late?',
    applicableReasons: ['meetingHistory'],
    suggestedAction: 'bookMeetup',
    tone: 'curious',
    priority: 10
  },
  {
    id: 'meeting_plan',
    text: 'Plans do not always work out the first time. Maybe now is the right moment to reconnect.',
    applicableReasons: ['meetingHistory'],
    suggestedAction: 'bookMeetup',
    tone: 'friendly',
    priority: 9
  },
  {
    id: 'meeting_intention',
    text: 'You both wanted to meet. That intention says something. Why not try again?',
    applicableReasons: ['meetingHistory', 'pastMomentum'],
    suggestedAction: 'bookMeetup',
    tone: 'playful',
    priority: 8
  },

  // SENTIMENT-BASED TEMPLATES (Deep conversations)
  {
    id: 'sentiment_depth',
    text: 'Your conversations went deeper than most. That kind of connection is worth revisiting.',
    applicableReasons: ['sentiment'],
    suggestedAction: 'deepQuestion',
    tone: 'romantic',
    priority: 10
  },
  {
    id: 'sentiment_real',
    text: 'What you shared felt real. Sometimes we need time to appreciate what we had.',
    applicableReasons: ['sentiment', 'memory'],
    suggestedAction: 'voiceNoteMemory',
    tone: 'nostalgic',
    priority: 9
  },
  {
    id: 'sentiment_genuine',
    text: 'Genuine connections do not come often. This one deserves another chance.',
    applicableReasons: ['sentiment', 'highCompatibility'],
    suggestedAction: 'videoCatchUp',
    tone: 'friendly',
    priority: 8
  },

  // CALENDAR-BASED TEMPLATES
  {
    id: 'calendar_timing',
    text: 'Timing was not perfect before. But maybe now is.',
    applicableReasons: ['meetingHistory', 'calendarHistory'],
    suggestedAction: 'bookMeetup',
    tone: 'curious',
    priority: 7
  },

  // GENERAL ROMANTIC TEMPLATES
  {
    id: 'general_serendipity',
    text: 'Some connections feel like serendipity. What if this is one of them?',
    applicableReasons: ['highCompatibility', 'memory', 'sentiment'],
    suggestedAction: 'deepQuestion',
    tone: 'romantic',
    priority: 7
  },
  {
    id: 'general_pause',
    text: 'Life pressed pause. But maybe it is time to press play again.',
    applicableReasons: ['pastMomentum', 'sentiment'],
    suggestedAction: 'voiceNoteMemory',
    tone: 'playful',
    priority: 7
  },
  {
    id: 'general_worth',
    text: 'Not every conversation is worth continuing. But this one was.',
    applicableReasons: ['sentiment', 'pastMomentum'],
    suggestedAction: 'deepQuestion',
    tone: 'friendly',
    priority: 6
  },

  // MICROTRANSACTION TEMPLATES (Gifts & Memory Frames)
  {
    id: 'gift_remember',
    text: 'Remember what you talked about? Send a small gift to show you still do.',
    applicableReasons: ['memory', 'sentiment'],
    suggestedAction: 'digitalGift',
    tone: 'romantic',
    priority: 6
  },
  {
    id: 'frame_capture',
    text: 'Your best moments together deserve to be captured. Unlock a Memory Frame to revisit them.',
    applicableReasons: ['memory', 'pastMomentum'],
    suggestedAction: 'memoryFrame',
    tone: 'nostalgic',
    priority: 5
  }
];

/**
 * Template selection logic
 */
export class SecondChanceTemplateSelector {
  /**
   * Select the most appropriate template based on reason and context
   * @param reason - Why Second Chance was triggered
   * @param context - Additional context (topics discussed, location, etc.)
   * @returns Selected template with populated placeholders
   */
  static selectTemplate(
    reason: SecondChanceReason,
    context?: {
      topicDiscussed?: string;
      meetingLocation?: string;
      sharedInterest?: string;
    }
  ): EmotionalMessageTemplate {
    // Filter templates applicable to this reason
    let applicable = EMOTIONAL_TEMPLATES.filter(t => 
      t.applicableReasons.includes(reason)
    );

    if (applicable.length === 0) {
      // Fallback to general templates
      applicable = EMOTIONAL_TEMPLATES.filter(t =>
        t.applicableReasons.length > 2
      );
    }

    // Sort by priority (highest first)
    applicable.sort((a, b) => b.priority - a.priority);

    // Weighted random selection (favor higher priority)
    const weights = applicable.map(t => t.priority);
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    let random = Math.random() * totalWeight;

    let selectedTemplate = applicable[0];
    for (let i = 0; i < applicable.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        selectedTemplate = applicable[i];
        break;
      }
    }

    // Populate placeholders if context provided
    if (context) {
      selectedTemplate = { ...selectedTemplate };
      if (context.topicDiscussed) {
        selectedTemplate.text = selectedTemplate.text.replace(
          '{topic}',
          context.topicDiscussed
        );
      }
      if (context.meetingLocation) {
        selectedTemplate.text = selectedTemplate.text.replace(
          '{location}',
          context.meetingLocation
        );
      }
    }

    return selectedTemplate;
  }

  /**
   * Get action description for UI
   */
  static getActionDescription(action: SecondChanceActionType): string {
    const descriptions: Record<SecondChanceActionType, string> = {
      voiceNoteMemory: 'Send a voice note memory',
      videoCatchUp: 'Try a short video catch-up',
      deepQuestion: 'Ask a single deep question',
      bookMeetup: 'Book a small meetup',
      memoryFrame: 'Unlock a Memory Frame',
      digitalGift: 'Send a digital gift',
      rewriteFirstMessage: 'Rewrite the first message — start again with better energy'
    };
    return descriptions[action];
  }

  /**
   * Get action pricing info
   */
  static getActionPricing(action: SecondChanceActionType): {
    type: 'tokens' | 'per_word' | 'per_minute';
    amount: number | string;
  } {
    const pricing: Record<SecondChanceActionType, any> = {
      voiceNoteMemory: { type: 'per_minute', amount: '10 tokens/min' },
      videoCatchUp: { type: 'per_minute', amount: '20 tokens/min' },
      deepQuestion: { type: 'per_word', amount: '100-500 tokens (11/7 words)' },
      bookMeetup: { type: 'tokens', amount: 'venue-dependent' },
      memoryFrame: { type: 'tokens', amount: 50 },
      digitalGift: { type: 'tokens', amount: '100-500' },
      rewriteFirstMessage: { type: 'per_word', amount: '100-500 tokens (11/7 words)' }
    };
    return pricing[action];
  }

  /**
   * Validate template text for safety
   * Ensures no pushy, cringe, or vulnerable language
   */
  static validateTemplate(text: string): boolean {
    const forbiddenPhrases = [
      'say hi again',
      'miss you',
      'i need you',
      'give me another chance',
      'please',
      'discount',
      'free',
      'trial',
      'promotional',
      'limited time',
      'act now',
      'hurry'
    ];

    const lowerText = text.toLowerCase();
    return !forbiddenPhrases.some(phrase => lowerText.includes(phrase));
  }
}

/**
 * Export for use in Cloud Functions
 */
export const selectSecondChanceTemplate = SecondChanceTemplateSelector.selectTemplate;
export const getSecondChanceActionDescription = SecondChanceTemplateSelector.getActionDescription;
export const getSecondChanceActionPricing = SecondChanceTemplateSelector.getActionPricing;