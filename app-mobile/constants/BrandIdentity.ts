/**
 * PACK 204 — FIX (FINAL OVERWRITE)
 * Brand Identity System for Avalo
 *
 * Avalo is a premium dating & social lifestyle platform where people can
 * flirt, match, meet in real life and build chemistry — and creators can
 * also earn from their time, attention and presence.
 *
 * PACK 204 establishes the 4 Core Pillars that define Avalo's identity:
 * 1. Attraction - Chemistry drives everything
 * 2. Romance & Flirting - The purpose of the platform
 * 3. Premium Dating Experience - VIP, travel, lifestyle, quality
 * 4. Attention-Economy Monetization - Beauty and confidence have value
 */

export const BrandIdentity = {
  // Official Slogan (PACK 204)
  slogan: 'Avalo — Where attraction meets opportunity.',

  // Core Identity
  coreMessage:
    'Avalo is a premium dating & social lifestyle platform where people can flirt, match, meet in real life and build chemistry — and creators can also earn from their time, attention and presence.',

  // What's Allowed
  allowed: [
    'Dating',
    'Flirting',
    'Romance',
    'Seduction',
    'Real-life meetups (with safety)',
    'Earning for time, attention, presence and social connection',
  ],

  // What's Forbidden (for compliance)
  forbidden: [
    'Escorting',
    'Explicit sexual services',
    'Sexual acts for payment',
    'Minors (18+ age gate)',
    'Coercion / pressure / trafficking',
  ],

  // THE 4 PILLARS (PACK 204 - FINAL)
  pillars: {
    attraction: {
      name: 'Attraction',
      description: 'Avalo is driven by chemistry — users choose each other based on vibe, looks, personality and emotions.',
      feeling: 'chemistry, desire, magnetic energy',
      keywords: ['chemistry', 'desire', 'vibes', 'looks', 'personality', 'emotions', 'magnetic', 'attraction', 'spark'],
    },
    romanceFlirting: {
      name: 'Romance & Flirting',
      description: 'Flirting, seduction, attention and romantic excitement are not only allowed — they are the purpose.',
      feeling: 'romantic tension, seduction, excitement',
      keywords: ['flirting', 'romance', 'seduction', 'desire', 'passion', 'chemistry', 'attention', 'excitement', 'intimacy', 'connection'],
    },
    premiumDating: {
      name: 'Premium Dating Experience',
      description: 'VIP matching · travel dating · glamorous lifestyle · high-value attention · quality over quantity.',
      feeling: 'luxury, exclusivity, glamour',
      keywords: ['premium', 'luxury', 'VIP', 'exclusive', 'travel', 'lifestyle', 'glamorous', 'high-value', 'quality', 'sophisticated'],
    },
    attentionEconomy: {
      name: 'Attention-Economy Monetization',
      description: 'Beauty and confidence have value — users earn from time, chat, calls and social visibility. There is no shame in being admired or in admiring others.',
      feeling: 'empowerment, value, opportunity',
      keywords: ['earn', 'monetize', 'attention', 'beauty', 'confidence', 'time', 'chat', 'calls', 'visibility', 'value', 'income'],
    },
  },

  // Legacy Pillars (Maintained for backward compatibility)
  legacyPillars: {
    romance: {
      name: 'Romance',
      feeling: 'butterflies, chemistry',
      keywords: ['attraction', 'connection', 'chemistry', 'spark'],
    },
    lifestyle: {
      name: 'Lifestyle',
      feeling: 'nightlife, restaurants, travel',
      keywords: ['experiences', 'adventure', 'social', 'culture'],
    },
    freedom: {
      name: 'Freedom',
      feeling: 'self-expression',
      keywords: ['authentic', 'genuine', 'personal', 'individual'],
    },
    premium: {
      name: 'Premium',
      feeling: 'classy, confident, aesthetic',
      keywords: ['quality', 'refined', 'sophisticated', 'elevated'],
    },
    community: {
      name: 'Community',
      feeling: 'social belonging',
      keywords: ['together', 'connection', 'network', 'relationships'],
    },
    safety: {
      name: 'Safety',
      feeling: 'consent and control',
      keywords: ['protected', 'secure', 'respectful', 'trusted'],
    },
  },

  // Visual Identity - Brand Palette
  colors: {
    background: '#0C0714',
    accentPrimary: '#A62EFF',
    accentSecondary: '#FF47A3',
    text: '#FFFFFF',
    // Additional colors for UI consistency
    textSecondary: '#B8B8B8',
    textTertiary: '#6E6E6E',
    cardBackground: '#1C1C1E',
    cardBorder: '#2C2C2E',
    success: '#4ECDC4',
    warning: '#F39C12',
    error: '#FF6B6B',
  },

  // Brand Voice & Tone
  voice: {
    welcoming: 'Friendly and approachable, never intimidating',
    confident: 'Self-assured without being arrogant',
    premium: 'Quality-focused while remaining accessible',
    honest: 'Transparent about what we offer',
    respectful: 'Consent and safety are non-negotiable',
  },

  // Safety Messaging
  safetyMessage:
    'Romance and flirting are welcome — explicit sexual services are strictly prohibited.',

  // Navigation Categories (PACK 204 Update)
  navigation: {
    explorePeople: 'Explore People',
    connections: 'Connections',
    chemistry: 'Chemistry',
    meetUp: 'Meet Up',
    events: 'Events',
    creatorMode: 'Creator Mode',
  },

  // Ad Templates
  adTemplates: {
    general: [
      'Match, flirt, meet — and enjoy it.',
      'Dating, lifestyle and connection — the premium way.',
    ],
    creator: [
      'Earn from your time and presence — not sexual services.',
    ],
  },

  // What NOT to show (forbidden messaging - PACK 207 UPDATE)
  // REMOVED: Anti-dating/flirting messaging that contradicted platform identity
  // Avalo IS a dating platform - romance and flirting are core features
  forbiddenMessaging: [
    'sexual services',
    'escort',
    'prostitution',
    'explicit content',
    'nudity allowed',
    'sugar daddy / sugar baby',
    'paid sex',
  ],
} as const;

export type BrandColors = typeof BrandIdentity.colors;
export type BrandPillars = typeof BrandIdentity.pillars;