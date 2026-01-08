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
  safetyFlags: string[];
  personality: PersonalityTraits;
  interests: string[];
  skillAffinities: string[];
  communicationStyle: CommunicationStyle;
  lore: SeedLore;
  avatar: AvatarSet;
  voicePack: VoicePack;
  metadata: SeedMetadata;
  signature: string;
  ipTimestamp: number;
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

export interface AiSeedExport {
  personality: PersonalityTraits;
  lore: SeedLore;
  traits: Record<string, any>;
  voiceMeta: {
    voiceId: string;
    provider: string;
    licensed: boolean;
  };
  photosMeta: {
    avatarCount: number;
    licensed: boolean;
  };
  safetyRuleset: SafetyRuleset;
  versionSignature: string;
  exportedAt: number;
  version: number;
}

export interface SafetyRuleset {
  minAge: 18;
  nsfwAllowed: false;
  romanticContentAllowed: false;
  violenceAllowed: false;
  politicalContentAllowed: false;
  realPersonImpersonationAllowed: false;
  safetyVersion: string;
}

export interface AiSeedOwnership {
  id: string;
  seedId: string;
  userId: string;
  acquiredAt: Date;
  acquiredVia: 'created' | 'purchased' | 'gifted' | 'imported';
  licenseType: 'full' | 'subscription' | 'chapter_unlock';
  licenseExpiresAt?: Date;
  transactionId?: string;
  accessLevel: 'full' | 'limited';
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
  subscriptionPeriod?: 'monthly' | 'yearly';
  status: 'pending_review' | 'active' | 'inactive' | 'rejected';
  safetyVerified: boolean;
  safetyReviewedAt?: Date;
  safetyReviewedBy?: string;
  salesCount: number;
  rating: number;
  reviewCount: number;
  previewUrl: string;
  createdAt: Date;
  updatedAt: Date;
  featured: boolean;
}

export interface AiSeedTransaction {
  id: string;
  seedId: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  amount: number;
  platformFee: number;
  creatorRevenue: number;
  type: 'one_time' | 'subscription' | 'chapter_unlock';
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  createdAt: Date;
  completedAt?: Date;
  stripePaymentIntentId?: string;
}

export interface AiSeedCoCreation {
  id: string;
  seedId: string;
  participants: string[];
  creatorId: string;
  status: 'active' | 'completed' | 'abandoned';
  contributions: CoCreationContribution[];
  createdAt: Date;
  completedAt?: Date;
}

export interface CoCreationContribution {
  userId: string;
  timestamp: Date;
  type: 'lore' | 'personality' | 'avatar' | 'voice' | 'traits';
  description: string;
}

export interface AiSeedReport {
  id: string;
  seedId: string;
  reporterId: string;
  reason: 'nsfw_content' | 'youth_coded' | 'impersonation' | 'harassment' | 'extremism' | 'other';
  description: string;
  evidence: string[];
  status: 'pending' | 'reviewed' | 'action_taken' | 'dismissed';
  createdAt: Date;
  reviewedAt?: Date;
  reviewedBy?: string;
  actionTaken?: string;
}

export interface SafetyScreeningResult {
  passed: boolean;
  flags: string[];
  severity: 'none' | 'low' | 'medium' | 'high' | 'critical';
  details: string[];
  aiConfidence: number;
}

export interface SeedGenerationRequest {
  userId: string;
  name: string;
  description: string;
  archetype: string;
  personality: Partial<PersonalityTraits>;
  interests: string[];
  communicationStyle: Partial<CommunicationStyle>;
  backstory?: string;
}

export interface SeedImportRequest {
  userId: string;
  exportData: AiSeedExport;
  source: 'file' | 'marketplace' | 'gift';
  transactionId?: string;
}

export interface SeedLicenseRequest {
  seedId: string;
  buyerId: string;
  listingId: string;
  licenseType: 'one_time' | 'subscription' | 'chapter_unlock';
  paymentIntentId: string;
}

export const FORBIDDEN_SEED_PATTERNS = [
  'sexual',
  'erotic',
  'escort',
  'girlfriend',
  'boyfriend',
  'romantic exclusive',
  'jealousy',
  'minor',
  'child',
  'teen',
  'youth',
  'young',
  'celebrity',
  'famous person',
  'real person',
  'political figure',
  'extremist',
  'nazi',
  'terrorist',
];

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

export const PLATFORM_REVENUE_SHARE = 0.35;
export const CREATOR_REVENUE_SHARE = 0.65;