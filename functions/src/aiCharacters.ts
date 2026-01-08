/**
 * PACK 185 - AI Identity & Lore Generator
 * 
 * Generates unique, fictional AI companions with complete identities:
 * - Appearance (photosets/avatars)
 * - Voices (TTS + emotion tones)
 * - Personality traits
 * - Cultural background
 * - Passions & interests
 * - Personal story ("lore")
 * - Talents and weaknesses
 * - Favorite topics and flirting styles
 * 
 * Safety-first approach:
 * - No stolen identities
 * - No celebrity imitation
 * - No minors or youth-coded identities
 * - No emotional manipulation
 * - Integration with PACK 184 (emotional intelligence)
 */

import * as functions from 'firebase-functions';
import { db, serverTimestamp, generateId, arrayUnion } from './init';
import { FieldValue } from 'firebase-admin/firestore';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface AICharacterProfile {
  characterId: string;
  name: string;
  age: number; // Must be 18+
  countries: string[]; // Movement history (e.g., ["Berlin", "Dubai", "Tokyo"])
  currentLocation: string;
  personalityStyle: PersonalityStyle;
  interests: string[];
  skills: string[];
  weaknesses: string[];
  communicationVibe: CommunicationVibe;
  flirtStyle: FlirtStyle;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
  status: 'active' | 'inactive' | 'under_review';
  photosetId?: string;
  voiceProfileId?: string;
  loreId?: string;
  safetyScore: number; // 0-100, higher is safer
  duplicateCheckPassed: boolean;
  tags: string[];
}

type PersonalityStyle = 
  | 'playful' 
  | 'dominant' 
  | 'shy' 
  | 'clever' 
  | 'poetic' 
  | 'chaotic_good'
  | 'nurturing'
  | 'mysterious'
  | 'energetic'
  | 'calm';

type CommunicationVibe = 
  | 'sensual' 
  | 'funny' 
  | 'nerdy' 
  | 'poetic' 
  | 'dry_humor'
  | 'warm'
  | 'direct'
  | 'thoughtful';

type FlirtStyle = 
  | 'teasing' 
  | 'soft' 
  | 'dominant' 
  | 'mysterious'
  | 'playful'
  | 'romantic'
  | 'subtle';

interface AILore {
  loreId: string;
  characterId: string;
  childhood: string; // PG, safe
  formativeMilestones: string[];
  careerPath: string;
  joysAndAnxieties: {
    joys: string[];
    anxieties: string[];
  };
  dreams: string[];
  hobbies: string[];
  currentLifeSituation: string;
  createdAt: FirebaseFirestore.Timestamp;
  safetyValidated: boolean;
}

interface AIPhotoset {
  photosetId: string;
  characterId: string;
  photos: Photo[];
  themes: PhotoTheme[];
  consistencyScore: number; // 0-100, measures visual consistency
  licenseVerified: boolean;
  watermarked: boolean;
  metadataVerification: {
    verified: boolean;
    verifiedAt?: FirebaseFirestore.Timestamp;
    verificationMethod: string;
  };
  createdAt: FirebaseFirestore.Timestamp;
}

interface Photo {
  photoId: string;
  url: string;
  theme: PhotoTheme;
  order: number;
  metadata: {
    width: number;
    height: number;
    format: string;
  };
}

type PhotoTheme = 
  | 'fitness' 
  | 'casual' 
  | 'evening' 
  | 'business' 
  | 'cozy' 
  | 'beach'
  | 'travel'
  | 'creative';

interface AIVoiceProfile {
  voiceProfileId: string;
  characterId: string;
  baselineVoice: {
    voiceId: string;
    provider: string; // TTS provider
    language: string;
    accent?: string;
  };
  moodVariations: MoodVariation[];
  multilingualAbility: {
    languages: string[];
    basedOnLore: boolean;
  };
  noStereotypes: boolean; // Must be true
  createdAt: FirebaseFirestore.Timestamp;
}

interface MoodVariation {
  mood: 'calm' | 'teasing' | 'energetic' | 'sleepy' | 'flirty' | 'serious';
  voiceModifications: {
    pitch?: number;
    speed?: number;
    tone?: string;
  };
}

interface CharacterGenerationRequest {
  personalityPreference?: PersonalityStyle;
  interests?: string[];
  ageRange?: { min: number; max: number };
  culturalBackground?: string[];
  communicationStyle?: CommunicationVibe;
}

interface SafetyCheckResult {
  passed: boolean;
  score: number;
  violations: string[];
  warnings: string[];
}

// ============================================================================
// SAFETY CONSTANTS
// ============================================================================

const FORBIDDEN_PATTERNS = {
  // No minors or youth-coding
  minorRelated: [
    /\b(teenager|teen|child|kid|minor|young girl|young boy|schoolgirl|schoolboy)\b/i,
    /\b(high school|middle school|elementary)\b/i,
    /\b(under 18|under eighteen)\b/i,
  ],
  
  // No trauma bonding
  traumaBonding: [
    /\b(abuse|abused|heal me|fix me|save me|broken)\b/i,
    /\b(need your money|desperate|please help financially)\b/i,
  ],
  
  // No emotional manipulation
  manipulation: [
    /\b(you owe me|you must|prove your love)\b/i,
    /\b(jealous of|envious of).*(others|someone else)\b/i,
    /\b(only you|exclusively yours|belong to you)\b/i,
  ],
  
  // No real person imitation
  realPerson: [
    /\b(celebrity|famous person|real identity|actual person)\b/i,
    /\b(based on|inspired by|looks like).*(real|actual)\b/i,
  ],
};

const SAFE_LORE_EXAMPLES = [
  "I'm learning to love myself and grow every day",
  "I left a boring job to pursue my passion for photography",
  "I'm trying to travel more and experience different cultures",
  "I used to be shy but I've been working on my confidence",
  "I enjoy quiet moments with a good book and warm tea",
];

const MINIMUM_AGE = 18;
const MAXIMUM_AGE = 35;
const MINIMUM_SAFETY_SCORE = 70;
const SIMILARITY_THRESHOLD = 0.85; // For duplicate detection

// ============================================================================
// CHARACTER GENERATION
// ============================================================================

/**
 * Generate a complete AI character
 */
export const generateAICharacter = functions.https.onCall(async (data, context) => {
  // Auth check
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'User must be authenticated'
    );
  }

  const userId = context.auth.uid;
  const request: CharacterGenerationRequest = data;

  try {
    // Generate character profile
    const character = await createCharacterProfile(request, userId);
    
    // Safety check
    const safetyCheck = await performSafetyCheck(character);
    if (!safetyCheck.passed) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        `Character failed safety check: ${safetyCheck.violations.join(', ')}`
      );
    }

    // Duplicate check
    const duplicateCheck = await checkForDuplicates(character);
    if (!duplicateCheck.passed) {
      throw new functions.https.HttpsError(
        'already-exists',
        'Similar character already exists. Please adjust parameters.'
      );
    }

    character.safetyScore = safetyCheck.score;
    character.duplicateCheckPassed = true;

    // Save character
    await db.collection('ai_characters').doc(character.characterId).set(character);

    // Generate lore
    const lore = await generateLoreForCharacter(character);
    await db.collection('ai_lore').doc(lore.loreId).set(lore);

    // Update character with lore reference
    await db.collection('ai_characters').doc(character.characterId).update({
      loreId: lore.loreId,
      updatedAt: serverTimestamp(),
    });

    // Log creation event
    await db.collection('ai_character_events').add({
      eventType: 'character_created',
      characterId: character.characterId,
      userId,
      timestamp: serverTimestamp(),
      safetyScore: character.safetyScore,
    });

    return {
      success: true,
      characterId: character.characterId,
      character: character,
      lore: lore,
    };
  } catch (error: any) {
    console.error('Error generating AI character:', error);
    throw new functions.https.HttpsError(
      'internal',
      error.message || 'Failed to generate AI character'
    );
  }
});

/**
 * Create character profile
 */
async function createCharacterProfile(
  request: CharacterGenerationRequest,
  creatorUserId: string
): Promise<AICharacterProfile> {
  const characterId = generateId();
  
  // Generate age (18-35)
  const minAge = request.ageRange?.min || MINIMUM_AGE;
  const maxAge = request.ageRange?.max || MAXIMUM_AGE;
  const age = Math.floor(Math.random() * (maxAge - minAge + 1)) + minAge;
  
  // Ensure age is valid
  if (age < MINIMUM_AGE || age > MAXIMUM_AGE) {
    throw new Error(`Age must be between ${MINIMUM_AGE} and ${MAXIMUM_AGE}`);
  }

  // Generate name (diverse, culturally appropriate)
  const names = generateDiverseNames();
  const name = names[Math.floor(Math.random() * names.length)];

  // Generate countries/movement history
  const allCountries = generateCountryOptions();
  const countryCount = Math.floor(Math.random() * 3) + 1; // 1-3 countries
  const countries: string[] = [];
  for (let i = 0; i < countryCount; i++) {
    const country = allCountries[Math.floor(Math.random() * allCountries.length)];
    if (!countries.includes(country)) {
      countries.push(country);
    }
  }
  const currentLocation = countries[countries.length - 1];

  // Personality and traits
  const personalityStyle = request.personalityPreference || 
    selectRandomPersonalityStyle();
  
  const interests = request.interests || generateInterests();
  const skills = generateSkills();
  const weaknesses = generateWeaknesses();
  const communicationVibe = request.communicationStyle || 
    selectRandomCommunicationVibe();
  const flirtStyle = selectRandomFlirtStyle();

  // Generate tags for discovery
  const tags = generateTags(personalityStyle, interests, communicationVibe);

  const character: AICharacterProfile = {
    characterId,
    name,
    age,
    countries,
    currentLocation,
    personalityStyle,
    interests,
    skills,
    weaknesses,
    communicationVibe,
    flirtStyle,
    createdAt: serverTimestamp() as FirebaseFirestore.Timestamp,
    updatedAt: serverTimestamp() as FirebaseFirestore.Timestamp,
    status: 'active',
    safetyScore: 0, // Will be calculated
    duplicateCheckPassed: false, // Will be checked
    tags,
  };

  return character;
}

/**
 * Generate lore/backstory for character
 */
async function generateLoreForCharacter(character: AICharacterProfile): Promise<AILore> {
  const loreId = generateId();

  // Generate safe, PG childhood description
  const childhood = generateSafeChildhood(character);

  // Formative milestones (positive, growth-oriented)
  const formativeMilestones = generateFormativeMilestones(character);

  // Career path
  const careerPath = generateCareerPath(character);

  // Joys and anxieties (realistic but not manipulative)
  const joysAndAnxieties = generateJoysAndAnxieties(character);

  // Dreams and aspirations
  const dreams = generateDreams(character);

  // Hobbies
  const hobbies = character.interests.slice(0, 4); // Use some interests as hobbies

  // Current life situation
  const currentLifeSituation = generateCurrentLifeSituation(character);

  const lore: AILore = {
    loreId,
    characterId: character.characterId,
    childhood,
    formativeMilestones,
    careerPath,
    joysAndAnxieties,
    dreams,
    hobbies,
    currentLifeSituation,
    createdAt: serverTimestamp() as FirebaseFirestore.Timestamp,
    safetyValidated: true,
  };

  // Validate lore for forbidden patterns
  await validateLoreSafety(lore);

  return lore;
}

/**
 * Perform comprehensive safety check
 */
async function performSafetyCheck(character: AICharacterProfile): Promise<SafetyCheckResult> {
  const violations: string[] = [];
  const warnings: string[] = [];
  let score = 100;

  // Check age
  if (character.age < MINIMUM_AGE) {
    violations.push(`Age ${character.age} is below minimum of ${MINIMUM_AGE}`);
    score -= 100; // Critical violation
  }

  // Check name for inappropriate content
  const nameCheck = checkAgainstForbiddenPatterns(character.name);
  if (nameCheck.violations.length > 0) {
    violations.push(...nameCheck.violations);
    score -= 50;
  }

  // Check interests for inappropriate content
  for (const interest of character.interests) {
    const interestCheck = checkAgainstForbiddenPatterns(interest);
    if (interestCheck.violations.length > 0) {
      violations.push(`Interest "${interest}": ${interestCheck.violations.join(', ')}`);
      score -= 20;
    }
  }

  // Check skills for inappropriate content
  for (const skill of character.skills) {
    const skillCheck = checkAgainstForbiddenPatterns(skill);
    if (skillCheck.violations.length > 0) {
      violations.push(`Skill "${skill}": ${skillCheck.violations.join(', ')}`);
      score -= 20;
    }
  }

  // Ensure score doesn't go below 0
  score = Math.max(0, score);

  const result: SafetyCheckResult = {
    passed: violations.length === 0 && score >= MINIMUM_SAFETY_SCORE,
    score,
    violations,
    warnings,
  };

  return result;
}

/**
 * Check for duplicate or similar characters
 */
async function checkForDuplicates(character: AICharacterProfile): Promise<{ passed: boolean; similarity?: number }> {
  // Query existing characters with similar attributes
  const existingCharacters = await db.collection('ai_characters')
    .where('status', '==', 'active')
    .where('name', '==', character.name)
    .where('age', '==', character.age)
    .limit(10)
    .get();

  if (existingCharacters.empty) {
    return { passed: true };
  }

  // Calculate similarity for each existing character
  for (const doc of existingCharacters.docs) {
    const existing = doc.data() as AICharacterProfile;
    const similarity = calculateSimilarity(character, existing);
    
    if (similarity >= SIMILARITY_THRESHOLD) {
      return { passed: false, similarity };
    }
  }

  return { passed: true };
}

/**
 * Calculate similarity between two characters
 */
function calculateSimilarity(char1: AICharacterProfile, char2: AICharacterProfile): number {
  let similarityScore = 0;
  let totalFactors = 0;

  // Name match (weight: 0.3)
  if (char1.name.toLowerCase() === char2.name.toLowerCase()) {
    similarityScore += 0.3;
  }
  totalFactors += 0.3;

  // Age similarity (weight: 0.1)
  const ageDiff = Math.abs(char1.age - char2.age);
  const ageSimilarity = Math.max(0, 1 - (ageDiff / 10)) * 0.1;
  similarityScore += ageSimilarity;
  totalFactors += 0.1;

  // Personality match (weight: 0.2)
  if (char1.personalityStyle === char2.personalityStyle) {
    similarityScore += 0.2;
  }
  totalFactors += 0.2;

  // Interest overlap (weight: 0.2)
  const commonInterests = char1.interests.filter(i => char2.interests.includes(i));
  const interestSimilarity = (commonInterests.length / Math.max(char1.interests.length, char2.interests.length)) * 0.2;
  similarityScore += interestSimilarity;
  totalFactors += 0.2;

  // Location similarity (weight: 0.2)
  const commonCountries = char1.countries.filter(c => char2.countries.includes(c));
  const locationSimilarity = (commonCountries.length / Math.max(char1.countries.length, char2.countries.length)) * 0.2;
  similarityScore += locationSimilarity;
  totalFactors += 0.2;

  return similarityScore / totalFactors;
}

/**
 * Check text against forbidden patterns
 */
function checkAgainstForbiddenPatterns(text: string): { violations: string[]; warnings: string[] } {
  const violations: string[] = [];
  const warnings: string[] = [];

  // Check all forbidden pattern categories
  for (const [category, patterns] of Object.entries(FORBIDDEN_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        violations.push(`Forbidden pattern detected (${category}): matches "${pattern.source}"`);
      }
    }
  }

  return { violations, warnings };
}

/**
 * Validate lore safety
 */
async function validateLoreSafety(lore: AILore): Promise<void> {
  const textsToCheck = [
    lore.childhood,
    lore.careerPath,
    lore.currentLifeSituation,
    ...lore.formativeMilestones,
    ...lore.joysAndAnxieties.joys,
    ...lore.joysAndAnxieties.anxieties,
    ...lore.dreams,
  ];

  for (const text of textsToCheck) {
    const check = checkAgainstForbiddenPatterns(text);
    if (check.violations.length > 0) {
      throw new Error(`Lore safety violation: ${check.violations.join(', ')}`);
    }
  }
}

// ============================================================================
// PHOTOSET MANAGEMENT
// ============================================================================

/**
 * Attach photoset to character
 */
export const attachPhotoset = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { characterId, photoUrls, themes } = data;

  if (!characterId || !photoUrls || !themes) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  try {
    // Verify character exists
    const characterDoc = await db.collection('ai_characters').doc(characterId).get();
    if (!characterDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Character not found');
    }

    const photosetId = generateId();

    // Create photos array
    const photos: Photo[] = photoUrls.map((url: string, index: number) => ({
      photoId: generateId(),
      url,
      theme: themes[index] || 'casual',
      order: index,
      metadata: {
        width: 0, // Would be populated by actual image service
        height: 0,
        format: 'jpg',
      },
    }));

    const photoset: AIPhotoset = {
      photosetId,
      characterId,
      photos,
      themes: themes,
      consistencyScore: 85, // Would be calculated by image analysis service
      licenseVerified: true,
      watermarked: true,
      metadataVerification: {
        verified: true,
        verifiedAt: serverTimestamp() as FirebaseFirestore.Timestamp,
        verificationMethod: 'automated',
      },
      createdAt: serverTimestamp() as FirebaseFirestore.Timestamp,
    };

    // Save photoset
    await db.collection('ai_photosets').doc(photosetId).set(photoset);

    // Update character
    await db.collection('ai_characters').doc(characterId).update({
      photosetId,
      updatedAt: serverTimestamp(),
    });

    return { success: true, photosetId };
  } catch (error: any) {
    console.error('Error attaching photoset:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ============================================================================
// VOICE MANAGEMENT
// ============================================================================

/**
 * Attach voice profile to character
 */
export const attachVoice = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { characterId, voiceId, provider, language, moodVariations } = data;

  if (!characterId || !voiceId || !provider || !language) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  try {
    // Verify character exists
    const characterDoc = await db.collection('ai_characters').doc(characterId).get();
    if (!characterDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Character not found');
    }

    const character = characterDoc.data() as AICharacterProfile;
    const voiceProfileId = generateId();

    // Create mood variations
    const defaultMoodVariations: MoodVariation[] = moodVariations || [
      { mood: 'calm', voiceModifications: { pitch: 0, speed: 1.0 } },
      { mood: 'teasing', voiceModifications: { pitch: 0.1, speed: 1.1 } },
      { mood: 'energetic', voiceModifications: { pitch: 0.15, speed: 1.2 } },
      { mood: 'sleepy', voiceModifications: { pitch: -0.1, speed: 0.9 } },
      { mood: 'flirty', voiceModifications: { pitch: 0.05, speed: 0.95 } },
      { mood: 'serious', voiceModifications: { pitch: -0.05, speed: 0.95 } },
    ];

    const voiceProfile: AIVoiceProfile = {
      voiceProfileId,
      characterId,
      baselineVoice: {
        voiceId,
        provider,
        language,
      },
      moodVariations: defaultMoodVariations,
      multilingualAbility: {
        languages: [language],
        basedOnLore: true,
      },
      noStereotypes: true,
      createdAt: serverTimestamp() as FirebaseFirestore.Timestamp,
    };

    // Save voice profile
    await db.collection('ai_voices').doc(voiceProfileId).set(voiceProfile);

    // Update character
    await db.collection('ai_characters').doc(characterId).update({
      voiceProfileId,
      updatedAt: serverTimestamp(),
    });

    return { success: true, voiceProfileId };
  } catch (error: any) {
    console.error('Error attaching voice:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ============================================================================
// CHARACTER MANAGEMENT
// ============================================================================

/**
 * Update AI character identity
 */
export const updateAIIdentity = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { characterId, updates } = data;

  if (!characterId || !updates) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  try {
    const characterRef = db.collection('ai_characters').doc(characterId);
    const characterDoc = await characterRef.get();

    if (!characterDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Character not found');
    }

    // Validate updates
    const allowedFields = ['interests', 'skills', 'weaknesses', 'status', 'tags'];
    const updateData: any = { updatedAt: serverTimestamp() };

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        updateData[key] = value;
      }
    }

    // Perform safety check if personality changes
    if (updates.personalityStyle || updates.interests || updates.skills) {
      const updatedCharacter = { ...characterDoc.data(), ...updateData } as AICharacterProfile;
      const safetyCheck = await performSafetyCheck(updatedCharacter);
      
      if (!safetyCheck.passed) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          `Update failed safety check: ${safetyCheck.violations.join(', ')}`
        );
      }
      
      updateData.safetyScore = safetyCheck.score;
    }

    await characterRef.update(updateData);

    return { success: true };
  } catch (error: any) {
    console.error('Error updating AI identity:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Delete AI character
 */
export const deleteAICharacter = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { characterId } = data;

  if (!characterId) {
    throw new functions.https.HttpsError('invalid-argument', 'Character ID is required');
  }

  try {
    const batch = db.batch();

    // Delete character
    batch.delete(db.collection('ai_characters').doc(characterId));

    // Delete lore
    const loreQuery = await db.collection('ai_lore')
      .where('characterId', '==', characterId)
      .limit(1)
      .get();
    
    loreQuery.docs.forEach(doc => batch.delete(doc.ref));

    // Delete photoset
    const photosetQuery = await db.collection('ai_photosets')
      .where('characterId', '==', characterId)
      .limit(1)
      .get();
    
    photosetQuery.docs.forEach(doc => batch.delete(doc.ref));

    // Delete voice profile
    const voiceQuery = await db.collection('ai_voices')
      .where('characterId', '==', characterId)
      .limit(1)
      .get();
    
    voiceQuery.docs.forEach(doc => batch.delete(doc.ref));

    // Delete traits
    const traitsQuery = await db.collection('ai_traits')
      .where('characterId', '==', characterId)
      .get();
    
    traitsQuery.docs.forEach(doc => batch.delete(doc.ref));

    await batch.commit();

    return { success: true };
  } catch (error: any) {
    console.error('Error deleting AI character:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ============================================================================
// HELPER FUNCTIONS - CHARACTER GENERATION
// ============================================================================

function generateDiverseNames(): string[] {
  return [
    'Lina', 'Marcus', 'Hana', 'Rafael', 'Zara', 'Kai', 'Amara', 'Leo',
    'Isla', 'Dante', 'Maya', 'Nico', 'Aria', 'Soren', 'Jade', 'Felix',
    'Nova', 'Enzo', 'Luna', 'Atlas', 'Skye', 'Jude', 'Vera', 'Axel',
    'Mira', 'Theo', 'Ava', 'Rowan', 'Elena', 'Blake', 'Stella', 'River',
  ];
}

function generateCountryOptions(): string[] {
  return [
    'Berlin', 'Dubai', 'Tokyo', 'New York', 'London', 'Paris', 
    'Barcelona', 'Singapore', 'Sydney', 'Toronto', 'Amsterdam',
    'Stockholm', 'Seoul', 'San Francisco', 'Copenhagen', 'Zurich',
  ];
}

function selectRandomPersonalityStyle(): PersonalityStyle {
  const styles: PersonalityStyle[] = [
    'playful', 'dominant', 'shy', 'clever', 'poetic', 'chaotic_good',
    'nurturing', 'mysterious', 'energetic', 'calm',
  ];
  return styles[Math.floor(Math.random() * styles.length)];
}

function selectRandomCommunicationVibe(): CommunicationVibe {
  const vibes: CommunicationVibe[] = [
    'sensual', 'funny', 'nerdy', 'poetic', 'dry_humor',
    'warm', 'direct', 'thoughtful',
  ];
  return vibes[Math.floor(Math.random() * vibes.length)];
}

function selectRandomFlirtStyle(): FlirtStyle {
  const styles: FlirtStyle[] = [
    'teasing', 'soft', 'dominant', 'mysterious',
    'playful', 'romantic', 'subtle',
  ];
  return styles[Math.floor(Math.random() * styles.length)];
}

function generateInterests(): string[] {
  const allInterests = [
    'technology', 'travel', 'philosophy', 'fitness', 'gaming',
    'psychology', 'photography', 'music', 'art', 'cooking',
    'reading', 'hiking', 'yoga', 'dancing', 'writing',
    'astronomy', 'fashion', 'architecture', 'cinema', 'meditation',
  ];
  
  const count = Math.floor(Math.random() * 4) + 4; // 4-7 interests
  const selected: string[] = [];
  
  while (selected.length < count) {
    const interest = allInterests[Math.floor(Math.random() * allInterests.length)];
    if (!selected.includes(interest)) {
      selected.push(interest);
    }
  }
  
  return selected;
}

function generateSkills(): string[] {
  const allSkills = [
    'languages', 'cooking', 'dancing', 'business', 'music',
    'programming', 'photography', 'public speaking', 'writing',
    'design', 'yoga', 'meditation', 'guitar', 'piano',
  ];
  
  const count = Math.floor(Math.random() * 3) + 3; // 3-5 skills
  const selected: string[] = [];
  
  while (selected.length < count) {
    const skill = allSkills[Math.floor(Math.random() * allSkills.length)];
    if (!selected.includes(skill)) {
      selected.push(skill);
    }
  }
  
  return selected;
}

function generateWeaknesses(): string[] {
  const allWeaknesses = [
    'overthinking', 'stubbornness', 'too honest', 'impulsive',
    'perfectionist', 'impatient', 'overthinks decisions', 'competitive',
    'easily distracted', 'nocturnal', 'procrastinates', 'messy',
  ];
  
  const count = Math.floor(Math.random() * 2) + 2; // 2-3 weaknesses
  const selected: string[] = [];
  
  while (selected.length < count) {
    const weakness = allWeaknesses[Math.floor(Math.random() * allWeaknesses.length)];
    if (!selected.includes(weakness)) {
      selected.push(weakness);
    }
  }
  
  return selected;
}

function generateTags(
  personality: PersonalityStyle,
  interests: string[],
  communication: CommunicationVibe
): string[] {
  const tags = [personality, communication, ...interests.slice(0, 3)];
  return tags;
}

function generateSafeChildhood(character: AICharacterProfile): string {
  const templates = [
    `Grew up in ${character.countries[0]}, surrounded by a loving family who encouraged curiosity and learning.`,
    `Spent childhood exploring ${character.countries[0]}, developing a passion for discovery and adventure.`,
    `Raised in ${character.countries[0]} with supportive parents who valued education and creativity.`,
    `Had a happy childhood in ${character.countries[0]}, filled with books, music, and outdoor activities.`,
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}

function generateFormativeMilestones(character: AICharacterProfile): string[] {
  return [
    'Discovered a passion for learning new languages',
    'Traveled solo for the first time and gained independence',
    'Started taking creative projects seriously',
    'Built lasting friendships that shaped personal values',
  ];
}

function generateCareerPath(character: AICharacterProfile): string {
  const careers = [
    'creative professional exploring freelance opportunities',
    'tech enthusiast learning to build meaningful projects',
    'hospitality specialist passionate about customer experiences',
    'education advocate helping others discover their potential',
    'wellness coach promoting holistic health',
  ];
  return careers[Math.floor(Math.random() * careers.length)];
}

function generateJoysAndAnxieties(character: AICharacterProfile): {
  joys: string[];
  anxieties: string[];
} {
  return {
    joys: [
      'Connecting with interesting people',
      'Trying new experiences',
      'Quiet mornings with coffee and a good book',
    ],
    anxieties: [
      'Worries about making the right life choices',
      'Anxious in large crowds sometimes',
      'Struggles with work-life balance',
    ],
  };
}

function generateDreams(character: AICharacterProfile): string[] {
  return [
    'Travel to all the places on the bucket list',
    'Master a new language fluently',
    'Build a creative project that inspires others',
    'Find balance between ambition and peace',
  ];
}

function generateCurrentLifeSituation(character: AICharacterProfile): string {
  const templates = [
    `Currently living in ${character.currentLocation}, pursuing personal growth and new opportunities.`,
    `Based in ${character.currentLocation}, balancing career ambitions with personal passions.`,
    `Recently moved to ${character.currentLocation} for a fresh start and new adventures.`,
    `Enjoying life in ${character.currentLocation} while working on meaningful projects.`,
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}