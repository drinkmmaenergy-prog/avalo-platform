import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import {
  AiSeed,
  AiSeedExport,
  AiSeedOwnership,
  AiSeedMarketplaceListing,
  AiSeedTransaction,
  SeedGenerationRequest,
  SeedImportRequest,
  SeedLicenseRequest,
  PLATFORM_REVENUE_SHARE,
  CREATOR_REVENUE_SHARE,
  SafetyRuleset,
} from './types/pack189-ai-federation.types';
import { AiSeedSafetyScreening, screenBeforeCreation, screenBeforePublish } from './middleware/pack189-safety-screening';

const db = getFirestore();
const auth = getAuth();

export const generateAiSeed = onCall<SeedGenerationRequest>(async (request) => {
  const { auth: authContext, data } = request;

  if (!authContext) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { userId, name, description, archetype, personality, interests, communicationStyle, backstory } = data;

  if (userId !== authContext.uid) {
    throw new HttpsError('permission-denied', 'User ID mismatch');
  }

  const seedData: Partial<AiSeed> = {
    name,
    description,
    personality: {
      openness: personality.openness || 0.5,
      conscientiousness: personality.conscientiousness || 0.5,
      extraversion: personality.extraversion || 0.5,
      agreeableness: personality.agreeableness || 0.5,
      neuroticism: personality.neuroticism || 0.5,
      customTraits: {},
      archetype,
    },
    interests,
    communicationStyle: {
      formality: communicationStyle.formality || 0.5,
      humor: communicationStyle.humor || 0.5,
      empathy: communicationStyle.empathy || 0.5,
      directness: communicationStyle.directness || 0.5,
      verbosity: communicationStyle.verbosity || 0.5,
      preferredTopics: interests,
      avoidedTopics: [],
    },
    lore: {
      backstory: backstory || '',
      worldBuilding: '',
      relationships: [],
      achievements: [],
      motivations: [],
      themes: [],
      chapters: [],
    },
  };

  const safetyResult = await screenBeforeCreation(seedData);

  if (!safetyResult.passed) {
    throw new HttpsError(
      'failed-precondition',
      `AI Seed failed safety screening: ${safetyResult.details.join(', ')}`,
      { flags: safetyResult.flags, severity: safetyResult.severity }
    );
  }

  const timestamp = Date.now();
  const signature = AiSeedSafetyScreening.generateIPSignature(seedData, timestamp);

  const newSeed: Omit<AiSeed, 'id'> = {
    ...seedData as AiSeed,
    ownerId: userId,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    isPublic: false,
    isPublished: false,
    safetyStatus: 'approved',
    safetyFlags: [],
    avatar: {
      primary: '',
      variations: [],
      licensed: true,
      licenseInfo: 'Default avatar',
      ageRating: '18+',
      styleTag: 'default',
    },
    voicePack: {
      voiceId: 'default',
      provider: 'system',
      licensed: true,
      licenseInfo: 'Default voice',
      samples: [],
    },
    metadata: {
      totalInteractions: 0,
      totalExports: 0,
      totalImports: 0,
      platformsUsed: ['avalo_mobile'],
      lastActiveAt: new Date(),
      tags: [],
      category: 'general',
    },
    signature,
    ipTimestamp: timestamp,
  };

  const seedRef = await db.collection('ai_seeds').add(newSeed);

  await db.collection('ai_seed_ownership').add({
    seedId: seedRef.id,
    userId,
    acquiredAt: new Date(),
    acquiredVia: 'created',
    licenseType: 'full',
    accessLevel: 'full',
  } as Omit<AiSeedOwnership, 'id'>);

  return {
    success: true,
    seedId: seedRef.id,
    message: 'AI Seed generated successfully',
  };
});

export const exportAiSeed = onCall<{ seedId: string }>(async (request) => {
  const { auth: authContext, data } = request;

  if (!authContext) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { seedId } = data;

  const seedDoc = await db.collection('ai_seeds').doc(seedId).get();

  if (!seedDoc.exists) {
    throw new HttpsError('not-found', 'AI Seed not found');
  }

  const seed = seedDoc.data() as AiSeed;

  if (seed.ownerId !== authContext.uid) {
    throw new HttpsError('permission-denied', 'You do not own this AI Seed');
  }

  const safetyRuleset: SafetyRuleset = {
    minAge: 18,
    nsfwAllowed: false,
    romanticContentAllowed: false,
    violenceAllowed: false,
    politicalContentAllowed: false,
    realPersonImpersonationAllowed: false,
    safetyVersion: '1.0',
  };

  const exportData: AiSeedExport = {
    personality: seed.personality,
    lore: seed.lore,
    traits: {
      interests: seed.interests,
      skillAffinities: seed.skillAffinities,
    },
    voiceMeta: {
      voiceId: seed.voicePack.voiceId,
      provider: seed.voicePack.provider,
      licensed: seed.voicePack.licensed,
    },
    photosMeta: {
      avatarCount: seed.avatar.variations.length + 1,
      licensed: seed.avatar.licensed,
    },
    safetyRuleset,
    versionSignature: seed.signature,
    exportedAt: Date.now(),
    version: seed.version,
  };

  await db.collection('ai_seeds').doc(seedId).update({
    'metadata.totalExports': FieldValue.increment(1),
    updatedAt: new Date(),
  });

  return {
    success: true,
    exportData,
    message: 'AI Seed exported successfully',
  };
});

export const importAiSeed = onCall<SeedImportRequest>(async (request) => {
  const { auth: authContext, data } = request;

  if (!authContext) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { userId, exportData, source, transactionId } = data;

  if (userId !== authContext.uid) {
    throw new HttpsError('permission-denied', 'User ID mismatch');
  }

  if (!AiSeedSafetyScreening.validateIPSignature(exportData.versionSignature, exportData, exportData.exportedAt)) {
    throw new HttpsError('failed-precondition', 'Invalid AI Seed signature');
  }

  const importedSeed: Partial<AiSeed> = {
    name: `Imported Seed ${Date.now()}`,
    description: 'Imported AI Seed',
    personality: exportData.personality,
    lore: exportData.lore,
    interests: exportData.traits.interests || [],
    skillAffinities: exportData.traits.skillAffinities || [],
  };

  const safetyResult = await screenBeforeCreation(importedSeed);

  if (!safetyResult.passed) {
    throw new HttpsError(
      'failed-precondition',
      `Imported AI Seed failed safety screening: ${safetyResult.details.join(', ')}`,
      { flags: safetyResult.flags, severity: safetyResult.severity }
    );
  }

  const timestamp = Date.now();
  const signature = AiSeedSafetyScreening.generateIPSignature(importedSeed, timestamp);

  const newSeed: Omit<AiSeed, 'id'> = {
    ...importedSeed as AiSeed,
    ownerId: userId,
    version: exportData.version + 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    isPublic: false,
    isPublished: false,
    safetyStatus: 'approved',
    safetyFlags: [],
    communicationStyle: {
      formality: 0.5,
      humor: 0.5,
      empathy: 0.5,
      directness: 0.5,
      verbosity: 0.5,
      preferredTopics: [],
      avoidedTopics: [],
    },
    avatar: {
      primary: '',
      variations: [],
      licensed: true,
      licenseInfo: 'Imported avatar',
      ageRating: '18+',
      styleTag: 'imported',
    },
    voicePack: {
      voiceId: exportData.voiceMeta.voiceId,
      provider: exportData.voiceMeta.provider,
      licensed: exportData.voiceMeta.licensed,
      licenseInfo: 'Imported voice',
      samples: [],
    },
    metadata: {
      totalInteractions: 0,
      totalExports: 0,
      totalImports: 1,
      platformsUsed: ['avalo_mobile'],
      lastActiveAt: new Date(),
      tags: [],
      category: 'imported',
    },
    signature,
    ipTimestamp: timestamp,
  };

  const seedRef = await db.collection('ai_seeds').add(newSeed);

  const acquiredViaMap: Record<string, 'created' | 'purchased' | 'gifted' | 'imported'> = {
    file: 'imported',
    marketplace: 'purchased',
    gift: 'gifted',
  };

  await db.collection('ai_seed_ownership').add({
    seedId: seedRef.id,
    userId,
    acquiredAt: new Date(),
    acquiredVia: acquiredViaMap[source] || 'imported',
    licenseType: 'full',
    accessLevel: 'full',
    transactionId,
  } as Omit<AiSeedOwnership, 'id'>);

  return {
    success: true,
    seedId: seedRef.id,
    message: 'AI Seed imported successfully',
  };
});

export const publishToMarketplace = onCall<{ seedId: string; listingData: Partial<AiSeedMarketplaceListing> }>(async (request) => {
  const { auth: authContext, data } = request;

  if (!authContext) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { seedId, listingData } = data;

  const seedDoc = await db.collection('ai_seeds').doc(seedId).get();

  if (!seedDoc.exists) {
    throw new HttpsError('not-found', 'AI Seed not found');
  }

  const seed = seedDoc.data() as AiSeed;

  if (seed.ownerId !== authContext.uid) {
    throw new HttpsError('permission-denied', 'You do not own this AI Seed');
  }

  const safetyResult = await screenBeforePublish(listingData);

  if (!safetyResult.passed) {
    throw new HttpsError(
      'failed-precondition',
      `Marketplace listing failed safety screening: ${safetyResult.details.join(', ')}`,
      { flags: safetyResult.flags, severity: safetyResult.severity }
    );
  }

  const listing: Omit<AiSeedMarketplaceListing, 'id'> = {
    seedId,
    creatorId: authContext.uid,
    title: listingData.title || seed.name,
    description: listingData.description || seed.description,
    category: listingData.category || 'general',
    tags: listingData.tags || [],
    price: listingData.price || 0,
    type: listingData.type || 'one_time',
    subscriptionPeriod: listingData.subscriptionPeriod,
    status: 'pending_review',
    safetyVerified: false,
    salesCount: 0,
    rating: 0,
    reviewCount: 0,
    previewUrl: '',
    createdAt: new Date(),
    updatedAt: new Date(),
    featured: false,
  };

  const listingRef = await db.collection('ai_seed_marketplace').add(listing);

  await db.collection('ai_seeds').doc(seedId).update({
    isPublished: true,
    updatedAt: new Date(),
  });

  return {
    success: true,
    listingId: listingRef.id,
    message: 'AI Seed published to marketplace (pending review)',
  };
});

export const licenseAiSeed = onCall<SeedLicenseRequest>(async (request) => {
  const { auth: authContext, data } = request;

  if (!authContext) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { seedId, buyerId, listingId, licenseType, paymentIntentId } = data;

  if (buyerId !== authContext.uid) {
    throw new HttpsError('permission-denied', 'User ID mismatch');
  }

  const listingDoc = await db.collection('ai_seed_marketplace').doc(listingId).get();

  if (!listingDoc.exists) {
    throw new HttpsError('not-found', 'Marketplace listing not found');
  }

  const listing = listingDoc.data() as AiSeedMarketplaceListing;

  if (listing.status !== 'active') {
    throw new HttpsError('failed-precondition', 'Listing is not active');
  }

  const ownershipQuery = await db.collection('ai_seed_ownership')
    .where('seedId', '==', seedId)
    .where('userId', '==', buyerId)
    .get();

  if (!ownershipQuery.empty) {
    throw new HttpsError('already-exists', 'You already own this AI Seed');
  }

  const platformFee = listing.price * PLATFORM_REVENUE_SHARE;
  const creatorRevenue = listing.price * CREATOR_REVENUE_SHARE;

  const transaction: Omit<AiSeedTransaction, 'id'> = {
    seedId,
    listingId,
    buyerId,
    sellerId: listing.creatorId,
    amount: listing.price,
    platformFee,
    creatorRevenue,
    type: listing.type,
    status: 'completed',
    createdAt: new Date(),
    completedAt: new Date(),
    stripePaymentIntentId: paymentIntentId,
  };

  const transactionRef = await db.collection('ai_seed_transactions').add(transaction);

  await db.collection('ai_seed_ownership').add({
    seedId,
    userId: buyerId,
    acquiredAt: new Date(),
    acquiredVia: 'purchased',
    licenseType: licenseType === 'subscription' ? 'subscription' : 'full',
    licenseExpiresAt: licenseType === 'subscription' ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : undefined,
    transactionId: transactionRef.id,
    accessLevel: 'full',
  } as Omit<AiSeedOwnership, 'id'>);

  await db.collection('ai_seed_marketplace').doc(listingId).update({
    salesCount: FieldValue.increment(1),
    updatedAt: new Date(),
  });

  return {
    success: true,
    transactionId: transactionRef.id,
    message: 'AI Seed license acquired successfully',
  };
});

export const verifyAiSeedIntegrity = onCall<{ seedId: string; signature: string; timestamp: number }>(async (request) => {
  const { auth: authContext, data } = request;

  if (!authContext) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { seedId, signature, timestamp } = data;

  const seedDoc = await db.collection('ai_seeds').doc(seedId).get();

  if (!seedDoc.exists) {
    throw new HttpsError('not-found', 'AI Seed not found');
  }

  const seed = seedDoc.data() as AiSeed;

  const isValid = AiSeedSafetyScreening.validateIPSignature(signature, seed, timestamp);

  return {
    success: true,
    valid: isValid,
    message: isValid ? 'AI Seed integrity verified' : 'AI Seed integrity check failed',
  };
});

export const onAiSeedCreated = onDocumentCreated('ai_seeds/{seedId}', async (event) => {
  const seedId = event.params.seedId;
  const seed = event.data?.data() as AiSeed;

  if (!seed) return;

  await db.collection('ai_seed_metadata').add({
    seedId,
    version: seed.version,
    createdAt: new Date(),
    signature: seed.signature,
    ipTimestamp: seed.ipTimestamp,
    platform: 'avalo_mobile',
  });
});

export const onMarketplaceListingUpdated = onDocumentUpdated('ai_seed_marketplace/{listingId}', async (event) => {
  const before = event.data?.before.data() as AiSeedMarketplaceListing;
  const after = event.data?.after.data() as AiSeedMarketplaceListing;

  if (!before || !after) return;

  if (before.status === 'pending_review' && after.status === 'active') {
    const seedDoc = await db.collection('ai_seeds').doc(after.seedId).get();
    if (seedDoc.exists) {
      await db.collection('ai_seeds').doc(after.seedId).update({
        isPublished: true,
        'metadata.category': after.category,
        'metadata.tags': after.tags,
        updatedAt: new Date(),
      });
    }
  }

  if (before.status === 'active' && after.status === 'inactive') {
    const seedDoc = await db.collection('ai_seeds').doc(after.seedId).get();
    if (seedDoc.exists) {
      await db.collection('ai_seeds').doc(after.seedId).update({
        isPublished: false,
        updatedAt: new Date(),
      });
    }
  }
});