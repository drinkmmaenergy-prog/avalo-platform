/**
 * PACK 170 — Avalo Universal Search 3.0
 * API endpoints for universal search functionality
 */

import { Request, Response } from 'express';
import { searchService } from '../services/search.service';
import {
  SearchQuery,
  SearchCategory,
  SearchFilters,
  DEFAULT_SEARCH_CONFIG
} from '../types/search.types';

/**
 * Universal search endpoint
 * POST /api/search
 */
export async function searchUniversal(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.uid;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const {
      query,
      category,
      filters = {},
      limit = DEFAULT_SEARCH_CONFIG.defaultLimit,
      offset = 0,
      userInterests = []
    } = req.body;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      res.status(400).json({ error: 'Search query is required' });
      return;
    }

    // Ensure safe search is always enabled
    const searchFilters: SearchFilters = {
      ...filters,
      safeSearchEnabled: true
    };

    const searchQuery: SearchQuery = {
      userId,
      query: query.trim(),
      category: category as SearchCategory | undefined,
      filters: searchFilters,
      limit: Math.min(limit, DEFAULT_SEARCH_CONFIG.maxResults),
      offset,
      timestamp: new Date(),
      platform: req.headers['x-platform'] as 'mobile' | 'web' | 'desktop' || 'web'
    };

    const results = await searchService.searchUniversal(searchQuery, userInterests);

    // Record search in history
    await searchService.recordSearchQuery(
      userId,
      searchQuery.query,
      searchQuery.category,
      searchFilters,
      results.length
    );

    res.json({
      success: true,
      results,
      count: results.length,
      query: searchQuery.query,
      hasMore: results.length === searchQuery.limit
    });
  } catch (error: any) {
    console.error('Search error:', error);
    
    if (error.message === 'Search query contains prohibited terms') {
      res.status(400).json({
        error: 'Invalid search query',
        message: 'Your search contains terms that are not allowed on Avalo'
      });
      return;
    }
    
    res.status(500).json({ error: 'Search failed', message: error.message });
  }
}

/**
 * Get autocomplete suggestions
 * GET /api/search/autocomplete?q=query
 */
export async function getAutocompleteSuggestions(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.uid;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const query = req.query.q as string;
    const limit = parseInt(req.query.limit as string) || DEFAULT_SEARCH_CONFIG.autocompleteMaxResults;

    if (!query || query.length < DEFAULT_SEARCH_CONFIG.autocompleteMinLength) {
      res.json({ suggestions: [] });
      return;
    }

    const suggestions = await searchService.getAutocompleteSuggestions(userId, query, limit);

    res.json({ suggestions });
  } catch (error: any) {
    console.error('Autocomplete error:', error);
    res.status(500).json({ error: 'Autocomplete failed', message: error.message });
  }
}

/**
 * Get search history
 * GET /api/search/history
 */
export async function getSearchHistory(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.uid;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const limit = parseInt(req.query.limit as string) || 50;
    const history = await searchService.getSearchHistory(userId, limit);

    res.json({ history });
  } catch (error: any) {
    console.error('Get search history error:', error);
    res.status(500).json({ error: 'Failed to get search history', message: error.message });
  }
}

/**
 * Clear search history
 * DELETE /api/search/history
 */
export async function clearSearchHistory(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.uid;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await searchService.clearSearchHistory(userId);

    res.json({ success: true, message: 'Search history cleared' });
  } catch (error: any) {
    console.error('Clear search history error:', error);
    res.status(500).json({ error: 'Failed to clear search history', message: error.message });
  }
}

/**
 * Delete specific search history entry
 * DELETE /api/search/history/:entryId
 */
export async function deleteSearchHistoryEntry(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.uid;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { entryId } = req.params;
    if (!entryId) {
      res.status(400).json({ error: 'Entry ID is required' });
      return;
    }

    await searchService.deleteSearchHistoryEntry(userId, entryId);

    res.json({ success: true, message: 'Search history entry deleted' });
  } catch (error: any) {
    console.error('Delete search history entry error:', error);
    res.status(500).json({ error: 'Failed to delete search history entry', message: error.message });
  }
}

/**
 * Index an item for search (admin/creator only)
 * POST /api/search/index
 */
export async function indexItem(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.uid;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const {
      id,
      category,
      title,
      description,
      tags,
      language,
      creatorId,
      creatorName,
      creatorVerified,
      region,
      country,
      format,
      skillLevel,
      duration,
      priceTokens,
      interestMatchScore,
      qualityScore,
      completionRate,
      participationCount,
      safetyScore,
      isExplicit,
      isBanned
    } = req.body;

    // Validate required fields
    if (!id || !category || !title || !description || !language) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    await searchService.indexItemForSearch({
      id,
      category,
      title,
      description,
      tags: tags || [],
      language,
      creatorId,
      creatorName,
      creatorVerified: creatorVerified || false,
      region,
      country,
      format,
      skillLevel,
      duration,
      priceTokens,
      interestMatchScore: interestMatchScore || 50,
      qualityScore: qualityScore || 50,
      completionRate,
      participationCount,
      safetyScore: safetyScore || 100,
      isExplicit: isExplicit || false,
      isBanned: isBanned || false,
      createdAt: new Date(),
      lastActiveAt: new Date()
    });

    res.json({ success: true, message: 'Item indexed successfully' });
  } catch (error: any) {
    console.error('Index item error:', error);
    res.status(500).json({ error: 'Failed to index item', message: error.message });
  }
}

/**
 * Remove item from search index (admin/creator only)
 * DELETE /api/search/index/:itemId
 */
export async function removeFromIndex(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.uid;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { itemId } = req.params;
    if (!itemId) {
      res.status(400).json({ error: 'Item ID is required' });
      return;
    }

    await searchService.removeFromIndex(itemId);

    res.json({ success: true, message: 'Item removed from index' });
  } catch (error: any) {
    console.error('Remove from index error:', error);
    res.status(500).json({ error: 'Failed to remove item from index', message: error.message });
  }
}

/**
 * Get search categories
 * GET /api/search/categories
 */
export async function getSearchCategories(req: Request, res: Response): Promise<void> {
  try {
    const categories = Object.values(SearchCategory).map(cat => ({
      value: cat,
      label: cat.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    }));

    res.json({ categories });
  } catch (error: any) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Failed to get categories', message: error.message });
  }
}