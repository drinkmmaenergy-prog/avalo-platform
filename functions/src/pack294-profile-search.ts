/**
 * PACK 294 - Search & Discovery Filters
 * Profile Search by Name/Username Endpoint
 * 
 * Allows users to search for profiles by display name or username
 * Free access, respects safety constraints
 */

import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore, Query, DocumentData } from 'firebase-admin/firestore';
import {
  ProfileSearchQuery,
  ProfileSearchResponse,
  DiscoverySearchResult,
  DISCOVERY_CONSTANTS,
  ProfileSearchIndex,
} from './pack294-discovery-types';

const db = getFirestore();

/**
 * Profile Search Endpoint
 * GET /search/profiles?query=...&limit=...
 */
export const profileSearch = onRequest(
  {
    cors: true,
    region: 'europe-west3',
  },
  async (req, res) => {
    try {
      // Verify authentication
      const userId = req.headers.authorization?.split('Bearer ')[1];
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      
      // Parse query parameters
      const searchQuery = (req.query.query as string || '').trim();
      if (!searchQuery || searchQuery.length < 2) {
        res.status(400).json({ error: 'Query must be at least 2 characters' });
        return;
      }
      
      const limit = Math.min(
        parseInt(req.query.limit as string) || 20,
        DISCOVERY_CONSTANTS.MAX_LIMIT
      );
      
      // Normalize search query for better matching
      const normalizedQuery = searchQuery.toLowerCase();
      
      // Build Firestore query
      // Note: Firestore doesn't support full-text search natively
      // We use range queries for prefix matching on displayName
      let query: Query<DocumentData> = db.collection('profileSearchIndex');
      
      // ALWAYS enforce safety constraints
      query = query
        .where('banned', '==', false)
        .where('shadowBanned', '==', false)
        .where('incognito', '==', false)
        .where('age', '>=', DISCOVERY_CONSTANTS.DEFAULT_AGE_MIN)
        .where('riskScore', '<', DISCOVERY_CONSTANTS.RISK_BLOCK_THRESHOLD);
      
      // Use displayName for prefix search
      // Firestore range query: displayName >= query AND displayName < query + '\uf8ff'
      query = query
        .where('displayName', '>=', normalizedQuery)
        .where('displayName', '<', normalizedQuery + '\uf8ff')
        .orderBy('displayName')
        .limit(limit * 2); // Fetch extra for post-filtering
      
      // Execute query
      const snapshot = await query.get();
      
      // Process results
      const results: DiscoverySearchResult[] = [];
      
      for (const doc of snapshot.docs) {
        const profile = doc.data() as ProfileSearchIndex;
        
        // Skip the searcher themselves
        if (profile.userId === userId) continue;
        
        // Case-insensitive matching on display name
        const displayNameLower = profile.displayName.toLowerCase();
        if (!displayNameLower.includes(normalizedQuery)) continue;
        
        // Build result item
        const resultItem: DiscoverySearchResult = {
          userId: profile.userId,
          displayName: profile.displayName,
          age: profile.age,
          gender: profile.gender,
          city: profile.city,
          country: profile.country,
          distanceKm: null, // Distance not calculated for name search
          isVerified: profile.isVerified,
          influencerBadge: profile.influencerBadge,
          royalBadge: profile.royalBadge,
          vipBadge: profile.vipBadge,
          hasProfilePhoto: profile.hasProfilePhoto,
          hasVideoIntro: profile.hasVideoIntro,
          interests: profile.interests,
          popularityScore: profile.popularityScore,
          recentActivityScore: profile.recentActivityScore,
          lastActiveAt: profile.lastActiveAt,
        };
        
        results.push(resultItem);
        
        // Stop if we have enough results
        if (results.length >= limit) break;
      }
      
      // Sort by popularity (most popular first) for better UX
      results.sort((a, b) => b.popularityScore - a.popularityScore);
      
      // Build response
      const response: ProfileSearchResponse = {
        items: results,
      };
      
      res.status(200).json(response);
    } catch (error: any) {
      console.error('Profile search error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * Alternative: Username-specific search
 * GET /search/username?username=...
 * 
 * This would be used if usernames are stored separately
 * For now, we use displayName for search
 */
export const usernameSearch = onRequest(
  {
    cors: true,
    region: 'europe-west3',
  },
  async (req, res) => {
    try {
      // Verify authentication
      const userId = req.headers.authorization?.split('Bearer ')[1];
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      
      // Parse username
      const username = (req.query.username as string || '').trim().toLowerCase();
      if (!username) {
        res.status(400).json({ error: 'Username is required' });
        return;
      }
      
      // Query by exact username match (if username field exists)
      const query = db.collection('profileSearchIndex')
        .where('banned', '==', false)
        .where('shadowBanned', '==', false)
        .where('incognito', '==', false)
        .where('displayName', '==', username) // Assuming displayName stores username
        .limit(1);
      
      const snapshot = await query.get();
      
      if (snapshot.empty) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      
      const profile = snapshot.docs[0].data() as ProfileSearchIndex;
      
      // Skip if it's the searcher
      if (profile.userId === userId) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      
      // Build result
      const result: DiscoverySearchResult = {
        userId: profile.userId,
        displayName: profile.displayName,
        age: profile.age,
        gender: profile.gender,
        city: profile.city,
        country: profile.country,
        distanceKm: null,
        isVerified: profile.isVerified,
        influencerBadge: profile.influencerBadge,
        royalBadge: profile.royalBadge,
        vipBadge: profile.vipBadge,
        hasProfilePhoto: profile.hasProfilePhoto,
        hasVideoIntro: profile.hasVideoIntro,
        interests: profile.interests,
        popularityScore: profile.popularityScore,
        recentActivityScore: profile.recentActivityScore,
        lastActiveAt: profile.lastActiveAt,
      };
      
      res.status(200).json({ user: result });
    } catch (error: any) {
      console.error('Username search error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);