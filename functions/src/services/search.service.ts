/**
 * PACK 170 — Avalo Universal Search 3.0
 * Core search service with ethical ranking and safe-search enforcement
 */

import { db } from '../init';
import {
  SearchCategory,
  SearchIndexEntry,
  SearchQuery,
  SearchResult,
  SearchFilters,
  SearchSuggestion,
  SearchHistoryEntry,
  SearchLog,
  BannedSearchTerm,
  RankingFactors,
  DEFAULT_SEARCH_CONFIG,
  ContentFormat,
  PriceRange,
  DurationRange
} from '../types/search.types';

const BANNED_TERMS: BannedSearchTerm[] = [
  // Explicit sexual content
  { term: 'sex', type: 'partial', category: 'explicit', severity: 'block', createdAt: new Date() },
  { term: 'porn', type: 'partial', category: 'explicit', severity: 'block', createdAt: new Date() },
  { term: 'nude', type: 'partial', category: 'explicit', severity: 'block', createdAt: new Date() },
  { term: 'xxx', type: 'exact', category: 'explicit', severity: 'block', createdAt: new Date() },
  { term: 'nsfw', type: 'exact', category: 'explicit', severity: 'block', createdAt: new Date() },
  { term: 'escort', type: 'partial', category: 'explicit', severity: 'block', createdAt: new Date() },
  
  // Romantic/dating searches
  { term: 'dating', type: 'partial', category: 'romantic', severity: 'block', createdAt: new Date() },
  { term: 'hookup', type: 'partial', category: 'romantic', severity: 'block', createdAt: new Date() },
  { term: 'singles near', type: 'partial', category: 'romantic', severity: 'block', createdAt: new Date() },
  { term: 'find love', type: 'partial', category: 'romantic', severity: 'block', createdAt: new Date() },
  { term: 'romance', type: 'partial', category: 'romantic', severity: 'block', createdAt: new Date() },
  
  // Attractiveness-based searches
  { term: 'hot women', type: 'partial', category: 'attractiveness', severity: 'block', createdAt: new Date() },
  { term: 'hot men', type: 'partial', category: 'attractiveness', severity: 'block', createdAt: new Date() },
  { term: 'sexy', type: 'partial', category: 'attractiveness', severity: 'block', createdAt: new Date() },
  { term: 'attractive', type: 'partial', category: 'attractiveness', severity: 'block', createdAt: new Date() },
  { term: 'beautiful women', type: 'partial', category: 'attractiveness', severity: 'block', createdAt: new Date() },
  { term: 'beautiful men', type: 'partial', category: 'attractiveness', severity: 'block', createdAt: new Date() },
  
  // Safe alternatives
  { term: 'fitness bikini', type: 'partial', category: 'explicit', severity: 'suggest_alternative', alternative: 'fitness workouts', createdAt: new Date() }
];

export class SearchService {
  private static instance: SearchService;
  
  private constructor() {}
  
  static getInstance(): SearchService {
    if (!SearchService.instance) {
      SearchService.instance = new SearchService();
    }
    return SearchService.instance;
  }
  
  /**
   * Index an item for search
   */
  async indexItemForSearch(entry: Omit<SearchIndexEntry, 'updatedAt'>): Promise<void> {
    const indexEntry: SearchIndexEntry = {
      ...entry,
      updatedAt: new Date(),
      safetyScore: entry.safetyScore || 100,
      isExplicit: entry.isExplicit || false,
      isBanned: entry.isBanned || false
    };
    
    // Validate that forbidden fields are not present
    const forbiddenFields = ['attractivenessScore', 'giftingAmount', 'romanticScore', 'bodyMetrics'];
    for (const field of forbiddenFields) {
      if (field in indexEntry) {
        throw new Error(`Forbidden field "${field}" cannot be indexed`);
      }
    }
    
    // Apply safe-search filtering during indexing
    if (indexEntry.isExplicit || indexEntry.safetyScore < DEFAULT_SEARCH_CONFIG.minSafetyScore) {
      indexEntry.isBanned = true;
    }
    
    await db.collection('search_index').doc(indexEntry.id).set(indexEntry);
  }
  
  /**
   * Remove item from search index
   */
  async removeFromIndex(itemId: string): Promise<void> {
    await db.collection('search_index').doc(itemId).delete();
  }
  
  /**
   * Update search index entry
   */
  async updateIndexEntry(itemId: string, updates: Partial<SearchIndexEntry>): Promise<void> {
    await db.collection('search_index').doc(itemId).update({
      ...updates,
      updatedAt: new Date()
    });
  }
  
  /**
   * Check if search query contains banned terms
   */
  private checkBannedTerms(query: string): { blocked: boolean; alternative?: string } {
    const lowerQuery = query.toLowerCase();
    
    for (const banned of BANNED_TERMS) {
      let isMatch = false;
      
      if (banned.type === 'exact') {
        isMatch = lowerQuery === banned.term.toLowerCase();
      } else if (banned.type === 'partial') {
        isMatch = lowerQuery.includes(banned.term.toLowerCase());
      } else if (banned.type === 'regex') {
        const regex = new RegExp(banned.term, 'i');
        isMatch = regex.test(lowerQuery);
      }
      
      if (isMatch && banned.severity === 'block') {
        return { blocked: true };
      }
      
      if (isMatch && banned.severity === 'suggest_alternative' && banned.alternative) {
        return { blocked: false, alternative: banned.alternative };
      }
    }
    
    return { blocked: false };
  }
  
  /**
   * Calculate ranking score based on ethical factors
   */
  private calculateRanking(
    entry: SearchIndexEntry,
    query: string,
    userInterests: string[]
  ): number {
    const factors: RankingFactors = {
      interestMatch: this.calculateInterestMatch(entry, userInterests),
      qualityScore: entry.qualityScore,
      engagement: this.calculateEngagement(entry),
      recency: this.calculateRecency(entry),
      completionRate: entry.completionRate || 0,
      safetyScore: entry.safetyScore
    };
    
    // Weighted ranking formula (no attractiveness or spending factors)
    const weights = {
      interestMatch: 0.35,
      qualityScore: 0.25,
      engagement: 0.15,
      recency: 0.10,
      completionRate: 0.10,
      safetyScore: 0.05
    };
    
    const score =
      factors.interestMatch * weights.interestMatch +
      factors.qualityScore * weights.qualityScore +
      factors.engagement * weights.engagement +
      factors.recency * weights.recency +
      factors.completionRate * weights.completionRate +
      factors.safetyScore * weights.safetyScore;
    
    // Apply query relevance boost
    const titleMatch = entry.title.toLowerCase().includes(query.toLowerCase());
    const descMatch = entry.description.toLowerCase().includes(query.toLowerCase());
    const tagMatch = entry.tags.some(tag => tag.toLowerCase().includes(query.toLowerCase()));
    
    let relevanceBoost = 0;
    if (titleMatch) relevanceBoost += 20;
    if (descMatch) relevanceBoost += 10;
    if (tagMatch) relevanceBoost += 15;
    
    return Math.min(100, score + relevanceBoost);
  }
  
  /**
   * Calculate interest match score
   */
  private calculateInterestMatch(entry: SearchIndexEntry, userInterests: string[]): number {
    if (userInterests.length === 0) {
      return entry.interestMatchScore || 50;
    }
    
    const matchingTags = entry.tags.filter(tag =>
      userInterests.some(interest => 
        tag.toLowerCase().includes(interest.toLowerCase()) ||
        interest.toLowerCase().includes(tag.toLowerCase())
      )
    );
    
    const matchPercentage = (matchingTags.length / Math.max(entry.tags.length, 1)) * 100;
    return Math.min(100, matchPercentage * 1.2);
  }
  
  /**
   * Calculate engagement score (SFW only)
   */
  private calculateEngagement(entry: SearchIndexEntry): number {
    let score = 0;
    
    if (entry.participationCount) {
      score += Math.min(50, (entry.participationCount / 100) * 50);
    }
    
    if (entry.completionRate) {
      score += entry.completionRate * 0.5;
    }
    
    return Math.min(100, score);
  }
  
  /**
   * Calculate recency score
   */
  private calculateRecency(entry: SearchIndexEntry): number {
    const now = new Date().getTime();
    const created = new Date(entry.createdAt).getTime();
    const lastActive = entry.lastActiveAt ? new Date(entry.lastActiveAt).getTime() : created;
    
    const daysSinceActive = (now - lastActive) / (1000 * 60 * 60 * 24);
    
    if (daysSinceActive < 1) return 100;
    if (daysSinceActive < 7) return 90;
    if (daysSinceActive < 30) return 70;
    if (daysSinceActive < 90) return 50;
    return 30;
  }
  
  /**
   * Apply search filters
   */
  private applyFilters(entry: SearchIndexEntry, filters: SearchFilters): boolean {
    // Safe search always enabled
    if (entry.isExplicit || entry.isBanned) {
      return false;
    }
    
    if (filters.safeSearchEnabled && entry.safetyScore < DEFAULT_SEARCH_CONFIG.minSafetyScore) {
      return false;
    }
    
    // Category filter
    if (filters.categories && filters.categories.length > 0) {
      if (!filters.categories.includes(entry.category)) {
        return false;
      }
    }
    
    // Region filter
    if (filters.region && entry.region) {
      if (!entry.region.toLowerCase().includes(filters.region.toLowerCase())) {
        return false;
      }
    }
    
    // Country filter
    if (filters.country && entry.country) {
      if (entry.country.toLowerCase() !== filters.country.toLowerCase()) {
        return false;
      }
    }
    
    // Language filter
    if (filters.language && entry.language) {
      if (entry.language.toLowerCase() !== filters.language.toLowerCase()) {
        return false;
      }
    }
    
    // Price filter
    if (filters.priceRange) {
      const price = entry.priceTokens || 0;
      switch (filters.priceRange) {
        case PriceRange.FREE:
          if (price > 0) return false;
          break;
        case PriceRange.UNDER_100:
          if (price >= 100) return false;
          break;
        case PriceRange.UNDER_500:
          if (price >= 500) return false;
          break;
        case PriceRange.UNDER_1000:
          if (price >= 1000) return false;
          break;
        case PriceRange.OVER_1000:
          if (price < 1000) return false;
          break;
      }
    }
    
    // Free only filter
    if (filters.freeOnly && (entry.priceTokens || 0) > 0) {
      return false;
    }
    
    // Format filter
    if (filters.format && filters.format.length > 0 && entry.format) {
      if (!filters.format.includes(entry.format)) {
        return false;
      }
    }
    
    // Duration filter
    if (filters.duration && entry.duration) {
      const duration = entry.duration;
      switch (filters.duration) {
        case DurationRange.SHORT:
          if (duration >= 30) return false;
          break;
        case DurationRange.MEDIUM:
          if (duration < 30 || duration >= 120) return false;
          break;
        case DurationRange.LONG:
          if (duration < 120) return false;
          break;
      }
    }
    
    // Verified only filter
    if (filters.verifiedOnly && !entry.creatorVerified) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Execute universal search
   */
  async searchUniversal(searchQuery: SearchQuery, userInterests: string[] = []): Promise<SearchResult[]> {
    // Check for banned terms
    const bannedCheck = this.checkBannedTerms(searchQuery.query);
    if (bannedCheck.blocked) {
      throw new Error('Search query contains prohibited terms');
    }
    
    // If alternative suggested, modify query
    const actualQuery = bannedCheck.alternative || searchQuery.query;
    
    // Log search
    await this.logSearch(searchQuery);
    
    // Query search index
    let query = db.collection('search_index')
      .where('isBanned', '==', false)
      .where('isExplicit', '==', false);
    
    // Apply category filter if specified
    if (searchQuery.category) {
      query = query.where('category', '==', searchQuery.category);
    }
    
    const snapshot = await query.limit(DEFAULT_SEARCH_CONFIG.maxResults).get();
    
    const entries: SearchIndexEntry[] = [];
    snapshot.forEach(doc => {
      entries.push(doc.data() as SearchIndexEntry);
    });
    
    // Filter and rank results
    const filteredEntries = entries
      .filter(entry => this.applyFilters(entry, searchQuery.filters))
      .filter(entry => {
        const q = actualQuery.toLowerCase();
        return (
          entry.title.toLowerCase().includes(q) ||
          entry.description.toLowerCase().includes(q) ||
          entry.tags.some(tag => tag.toLowerCase().includes(q)) ||
          entry.creatorName?.toLowerCase().includes(q)
        );
      });
    
    // Calculate ranking for each entry
    const rankedResults = filteredEntries
      .map(entry => ({
        entry,
        score: this.calculateRanking(entry, actualQuery, userInterests)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(searchQuery.offset, searchQuery.offset + searchQuery.limit);
    
    // Convert to search results
    return rankedResults.map(({ entry, score }) => this.toSearchResult(entry, score));
  }
  
  /**
   * Convert index entry to search result
   */
  private toSearchResult(entry: SearchIndexEntry, relevanceScore: number): SearchResult {
    return {
      id: entry.id,
      category: entry.category,
      title: entry.title,
      description: entry.description,
      thumbnailUrl: undefined,
      creatorId: entry.creatorId,
      creatorName: entry.creatorName,
      creatorAvatar: undefined,
      relevanceScore,
      qualityScore: entry.qualityScore,
      format: entry.format,
      priceTokens: entry.priceTokens,
      duration: entry.duration,
      region: entry.region,
      language: entry.language,
      metadata: {
        participantCount: entry.participationCount,
        completionRate: entry.completionRate,
        isVerified: entry.creatorVerified,
        createdAt: entry.createdAt
      }
    };
  }
  
  /**
   * Get autocomplete suggestions
   */
  async getAutocompleteSuggestions(
    userId: string,
    query: string,
    limit: number = DEFAULT_SEARCH_CONFIG.autocompleteMaxResults
  ): Promise<SearchSuggestion[]> {
    if (query.length < DEFAULT_SEARCH_CONFIG.autocompleteMinLength) {
      return [];
    }
    
    // Check for banned terms
    const bannedCheck = this.checkBannedTerms(query);
    if (bannedCheck.blocked) {
      return [];
    }
    
    const suggestions: SearchSuggestion[] = [];
    
    // Get recent searches
    const recentSearches = await db
      .collection('search_history')
      .where('userId', '==', userId)
      .orderBy('timestamp', 'desc')
      .limit(5)
      .get();
    
    recentSearches.forEach(doc => {
      const data = doc.data() as SearchHistoryEntry;
      if (data.query.toLowerCase().includes(query.toLowerCase())) {
        suggestions.push({
          text: data.query,
          category: data.category,
          type: 'recent'
        });
      }
    });
    
    // Get popular searches (from aggregated data)
    const popularSearches = await db
      .collection('search_categories')
      .doc('popular_queries')
      .get();
    
    if (popularSearches.exists) {
      const popular = popularSearches.data()?.queries || [];
      popular
        .filter((q: string) => q.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 5)
        .forEach((q: string) => {
          suggestions.push({
            text: q,
            type: 'popular'
          });
        });
    }
    
    // Get matching creators
    const creators = await db
      .collection('search_index')
      .where('category', '==', SearchCategory.CREATORS)
      .where('isBanned', '==', false)
      .limit(3)
      .get();
    
    creators.forEach(doc => {
      const data = doc.data() as SearchIndexEntry;
      if (data.creatorName?.toLowerCase().includes(query.toLowerCase())) {
        suggestions.push({
          text: data.creatorName,
          category: SearchCategory.CREATORS,
          type: 'creator'
        });
      }
    });
    
    // Deduplicate and limit
    const unique = suggestions
      .filter((s, i, arr) => arr.findIndex(x => x.text === s.text) === i)
      .slice(0, limit);
    
    return unique;
  }
  
  /**
   * Log search query
   */
  private async logSearch(searchQuery: SearchQuery): Promise<void> {
    const log: SearchLog = {
      id: db.collection('search_logs').doc().id,
      userId: searchQuery.userId,
      query: searchQuery.query,
      category: searchQuery.category,
      filters: searchQuery.filters,
      results: 0,
      timestamp: new Date(),
      platform: searchQuery.platform
    };
    
    await db.collection('search_logs').doc(log.id).set(log);
  }
  
  /**
   * Record search query in history
   */
  async recordSearchQuery(
    userId: string,
    query: string,
    category: SearchCategory | undefined,
    filters: SearchFilters,
    resultCount: number
  ): Promise<void> {
    const historyEntry: SearchHistoryEntry = {
      userId,
      query,
      category,
      filters,
      resultCount,
      timestamp: new Date()
    };
    
    const docId = `${userId}_${Date.now()}`;
    await db.collection('search_history').doc(docId).set(historyEntry);
  }
  
  /**
   * Get user search history
   */
  async getSearchHistory(userId: string, limit: number = 50): Promise<SearchHistoryEntry[]> {
    const snapshot = await db
      .collection('search_history')
      .where('userId', '==', userId)
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();
    
    const history: SearchHistoryEntry[] = [];
    snapshot.forEach(doc => {
      history.push(doc.data() as SearchHistoryEntry);
    });
    
    return history;
  }
  
  /**
   * Clear user search history
   */
  async clearSearchHistory(userId: string): Promise<void> {
    const snapshot = await db
      .collection('search_history')
      .where('userId', '==', userId)
      .get();
    
    const batch = db.batch();
    snapshot.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
  }
  
  /**
   * Delete specific search history entry
   */
  async deleteSearchHistoryEntry(userId: string, entryId: string): Promise<void> {
    await db.collection('search_history').doc(entryId).delete();
  }
}

export const searchService = SearchService.getInstance();