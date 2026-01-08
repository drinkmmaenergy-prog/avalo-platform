/**
 * PACK 294 - Search & Discovery Filters
 * Profile Search Index Sync Functions
 * 
 * Keeps profileSearchIndex collection in sync with user profile changes
 */

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { ProfileSearchIndex } from './pack294-discovery-types';

const db = getFirestore();

/**
 * Sync profile search index when user profile is created/updated
 */
export const syncProfileSearchIndex = onDocumentWritten('users/{userId}', async (event) => {
    const change = event.data;
    const userId = event.params.userId;
    // If document is deleted, remove from search index
    if (!change.after.exists) {
      await db.collection('profileSearchIndex').doc(userId).delete();
      return;
    }
    
    const userData = change.after.data();
    if (!userData) return;
    
    // Build search index document
    const searchIndex: ProfileSearchIndex = {
      userId,
      
      // Basic data
      displayName: userData.displayName || userData.username || 'User',
      age: userData.age || 18,
      gender: userData.gender?.toUpperCase() || 'OTHER',
      orientation: userData.orientation?.toUpperCase() || 'OTHER',
      bio: userData.bio || '',
      
      // Location
      country: userData.location?.country || '',
      city: userData.location?.city || '',
      lat: userData.location?.coordinates?.lat || 0,
      lng: userData.location?.coordinates?.lng || 0,
      
      // Preferences
      lookingFor: userData.preferences?.lookingFor || [],
      minPreferredAge: userData.preferences?.ageMin || 18,
      maxPreferredAge: userData.preferences?.ageMax || 99,
      languages: userData.languages || [],
      
      // Interests (filter out political/religious)
      interests: filterInterests(userData.interests || []),
      
      // Status flags
      isVerified: userData.verification?.isVerified || false,
      hasProfilePhoto: (userData.photos?.length || 0) > 0,
      hasVideoIntro: userData.hasVideoIntro || false,
      incognito: userData.incognito || false,
      earnOn: userData.earnMode?.enabled || false,
      influencerBadge: userData.badges?.influencer || false,
      royalBadge: userData.subscription?.tier === 'royal',
      vipBadge: userData.subscription?.tier === 'vip',
      
      // Popularity & activity
      popularityScore: calculatePopularityScore(userData),
      recentActivityScore: calculateActivityScore(userData),
      lastActiveAt: userData.lastActive?.toDate()?.toISOString() || new Date().toISOString(),
      
      // Safety / risk
      riskScore: userData.riskScore || 0,
      banned: userData.banned || false,
      shadowBanned: userData.shadowBanned || false,
      
      // Metadata
      updatedAt: new Date().toISOString(),
    };
    
    // Write to search index
    await db.collection('profileSearchIndex').doc(userId).set(searchIndex);
    
    console.log(`Synced search index for user ${userId}`);
  });

/**
 * Sync search index when location changes
 */
export const syncLocationChange = onDocumentWritten('users/{userId}/location/current', async (event) => {
    const change = event.data;
    const userId = event.params.userId;
    
    if (!change.after.exists) return;
    
    const locationData = change.after.data();
    if (!locationData) return;
    
    // Update only location fields in search index
    await db.collection('profileSearchIndex').doc(userId).update({
      country: locationData.country || '',
      city: locationData.city || '',
      lat: locationData.coordinates?.lat || 0,
      lng: locationData.coordinates?.lng || 0,
      updatedAt: new Date().toISOString(),
    });
    
    console.log(`Updated location in search index for user ${userId}`);
  });

/**
 * Sync search index when verification status changes
 */
export const syncVerificationChange = onDocumentWritten('verifications/{userId}', async (event) => {
    const change = event.data;
    const userId = event.params.userId;
    
    if (!change.after.exists) return;
    
    const verificationData = change.after.data();
    if (!verificationData) return;
    
    // Update verification status in search index
    await db.collection('profileSearchIndex').doc(userId).update({
      isVerified: verificationData.status === 'verified',
      updatedAt: new Date().toISOString(),
    });
    
    console.log(`Updated verification in search index for user ${userId}`);
  });

/**
 * Sync search index when risk score changes
 */
export const syncRiskScoreChange = onDocumentWritten('riskProfiles/{userId}', async (event) => {
    const change = event.data;
    const userId = event.params.userId;
    
    if (!change.after.exists) return;
    
    const riskData = change.after.data();
    if (!riskData) return;
    
    // Update risk score in search index
    await db.collection('profileSearchIndex').doc(userId).update({
      riskScore: riskData.score || 0,
      banned: riskData.banned || false,
      shadowBanned: riskData.shadowBanned || false,
      updatedAt: new Date().toISOString(),
    });
    
    console.log(`Updated risk score in search index for user ${userId}`);
  });

/**
 * Filter out political and religious interests
 */
function filterInterests(interests: string[]): string[] {
  const bannedKeywords = [
    'politics', 'political', 'democrat', 'republican', 'conservative', 'liberal',
    'religion', 'religious', 'christian', 'muslim', 'jewish', 'buddhist', 'hindu',
    'atheist', 'church', 'mosque', 'temple', 'prayer', 'bible', 'quran', 'torah'
  ];
  
  return interests.filter(interest => {
    const lowerInterest = interest.toLowerCase();
    return !bannedKeywords.some(keyword => lowerInterest.includes(keyword));
  });
}

/**
 * Calculate popularity score based on engagement metrics
 */
function calculatePopularityScore(userData: any): number {
  let score = 50; // Base score
  
  // Factor in profile views
  const views = userData.metrics?.profileViews || 0;
  score += Math.min(views / 100, 20); // Max +20 from views
  
  // Factor in likes received
  const likes = userData.metrics?.likesReceived || 0;
  score += Math.min(likes / 50, 15); // Max +15 from likes
  
  // Factor in messages received
  const messages = userData.metrics?.messagesReceived || 0;
  score += Math.min(messages / 200, 10); // Max +10 from messages
  
  // Factor in followers (if applicable)
  const followers = userData.metrics?.followers || 0;
  score += Math.min(followers / 100, 5); // Max +5 from followers
  
  return Math.min(Math.round(score), 100);
}

/**
 * Calculate recent activity score
 */
function calculateActivityScore(userData: any): number {
  let score = 0;
  
  // Online status
  if (userData.presence?.status === 'online') {
    score += 50;
  } else if (userData.lastActive) {
    const hoursSinceActive = (Date.now() - userData.lastActive.toMillis()) / (1000 * 60 * 60);
    if (hoursSinceActive < 24) score += 40;
    else if (hoursSinceActive < 48) score += 30;
    else if (hoursSinceActive < 72) score += 20;
    else if (hoursSinceActive < 168) score += 10;
  }
  
  // Recent posts
  if (userData.metrics?.lastPostAt) {
    const hoursSincePost = (Date.now() - userData.metrics.lastPostAt.toMillis()) / (1000 * 60 * 60);
    if (hoursSincePost < 24) score += 30;
    else if (hoursSincePost < 48) score += 20;
    else if (hoursSincePost < 72) score += 10;
  }
  
  // Recent interactions
  if (userData.metrics?.lastInteractionAt) {
    const hoursSinceInteraction = (Date.now() - userData.metrics.lastInteractionAt.toMillis()) / (1000 * 60 * 60);
    if (hoursSinceInteraction < 24) score += 20;
  }
  
  return Math.min(score, 100);
}