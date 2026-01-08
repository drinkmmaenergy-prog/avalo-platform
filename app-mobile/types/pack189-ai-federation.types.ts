export interface AiSeed {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  isPublic: boolean;
  isPublished: boolean;
  safetyStatus: 'pending' | 'approved' | 'rejected' | 'flagged';
  personality: PersonalityTraits;
  interests: string[];
  skillAffinities: string[];
  communicationStyle: CommunicationStyle;
  lore: SeedLore;
  avatar: AvatarSet;
  voicePack: VoicePack;
  metadata: SeedMetadata;
}

export interface PersonalityTraits {
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
  customTraits: Record<string, number>;
  archetype: string;
}

export interface CommunicationStyle {
  formality: number;
  humor: number;
  empathy: number;
  directness: number;
  verbosity: number;
  preferredTopics: string[];
  avoidedTopics: string[];
}

export interface SeedLore {
  backstory: string;
  worldBuilding: string;
  relationships: string[];
  achievements: string[];
  motivations: string[];
  themes: string[];
  chapters: LoreChapter[];
}

export interface LoreChapter {
  id: string;
  title: string;
  content: string;
  unlocked: boolean;
  price?: number;
  order: number;
}

export interface AvatarSet {
  primary: string;
  variations: string[];
  licensed: boolean;
  licenseInfo: string;
  ageRating: 'adult' | '18+';
  styleTag: string;
}

export interface VoicePack {
  voiceId: string;
  provider: string;
  licensed: boolean;
  licenseInfo: string;
  samples: string[];
}

export interface SeedMetadata {
  totalInteractions: number;
  totalExports: number;
  totalImports: number;
  platformsUsed: string[];
  lastActiveAt: Date;
  tags: string[];
  category: string;
}

export interface AiSeedMarketplaceListing {
  id: string;
  seedId: string;
  creatorId: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  price: number;
  type: 'one_time' | 'subscription' | 'chapter_unlock';
  status: 'pending_review' | 'active' | 'inactive' | 'rejected';
  salesCount: number;
  rating: number;
  reviewCount: number;
  previewUrl: string;
  createdAt: Date;
  featured: boolean;
}

export interface AiSeedOwnership {
  id: string;
  seedId: string;
  userId: string;
  acquiredAt: Date;
  acquiredVia: 'created' | 'purchased' | 'gifted' | 'imported';
  licenseType: 'full' | 'subscription' | 'chapter_unlock';
  accessLevel: 'full' | 'limited';
}

export const ALLOWED_SEED_ARCHETYPES = [
  'sci-fi mercenary captain',
  'fashion consultant',
  'poker AI coach',
  'cyberpunk DJ',
  'royal mage advisor',
  'space explorer',
  'mystery detective',
  'fantasy merchant',
  'tech guru',
  'wilderness guide',
  'ancient scholar',
  'cosmic philosopher',
  'urban legend',
  'time traveler',
  'interdimensional trader',
];