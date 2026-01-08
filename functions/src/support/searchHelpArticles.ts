/**
 * PACK 300 - Search Help Articles
 * Cloud Function to search help articles by keyword
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {
  SearchHelpArticlesRequest,
  SearchHelpArticlesResponse,
  HelpSearchResult,
  HelpArticle,
} from '../../../shared/types/support';

const db = admin.firestore();

/**
 * Simple text search function
 * Searches in title, shortSummary, bodyMarkdown, and tags
 */
function calculateRelevance(article: HelpArticle, query: string): {
  score: number;
  matchedFields: string[];
} {
  const lowerQuery = query.toLowerCase();
  const queryWords = lowerQuery.split(/\s+/).filter((w) => w.length > 2);
  
  let score = 0;
  const matchedFields: string[] = [];
  
  // Title matches (highest weight)
  const titleLower = article.title.toLowerCase();
  let titleMatches = 0;
  for (const word of queryWords) {
    if (titleLower.includes(word)) titleMatches++;
  }
  if (titleMatches > 0) {
    score += titleMatches * 10;
    matchedFields.push('title');
  }
  
  // Exact title match bonus
  if (titleLower.includes(lowerQuery)) {
    score += 20;
  }
  
  // Summary matches (medium weight)
  const summaryLower = article.shortSummary.toLowerCase();
  let summaryMatches = 0;
  for (const word of queryWords) {
    if (summaryLower.includes(word)) summaryMatches++;
  }
  if (summaryMatches > 0) {
    score += summaryMatches * 5;
    matchedFields.push('shortSummary');
  }
  
  // Tags matches (medium weight)
  let tagMatches = 0;
  for (const tag of article.tags) {
    const tagLower = tag.toLowerCase();
    for (const word of queryWords) {
      if (tagLower.includes(word)) tagMatches++;
    }
  }
  if (tagMatches > 0) {
    score += tagMatches * 7;
    matchedFields.push('tags');
  }
  
  // Body matches (lower weight, but important)
  const bodyLower = article.bodyMarkdown.toLowerCase();
  let bodyMatches = 0;
  for (const word of queryWords) {
    if (bodyLower.includes(word)) bodyMatches++;
  }
  if (bodyMatches > 0) {
    score += bodyMatches * 2;
    matchedFields.push('body');
  }
  
  // Featured article boost
  if (article.isFeatured) {
    score += 5;
  }
  
  return {
    score,
    matchedFields: [...new Set(matchedFields)],
  };
}

export const searchHelpArticles = functions.https.onCall(
  async (data: SearchHelpArticlesRequest, context): Promise<SearchHelpArticlesResponse> => {
    try {
      // Authentication check
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User must be authenticated to search articles'
        );
      }

      const { query, locale, category, limit = 20 } = data;

      // Validation
      if (!query || query.trim().length === 0) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Search query cannot be empty'
        );
      }

      if (query.length > 200) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Search query too long (max 200 characters)'
        );
      }

      if (!locale) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Locale is required'
        );
      }

      // Build query
      let articlesQuery = db
        .collection('helpArticles')
        .where('locale', '==', locale)
        .where('isSearchable', '==', true);

      if (category) {
        articlesQuery = articlesQuery.where('category', '==', category);
      }

      // Get articles
      const snapshot = await articlesQuery.get();

      if (snapshot.empty) {
        return {
          success: true,
          results: [],
        };
      }

      // Calculate relevance for each article
      const results: HelpSearchResult[] = [];

      for (const doc of snapshot.docs) {
        const article = doc.data() as HelpArticle;
        const { score, matchedFields } = calculateRelevance(article, query);

        if (score > 0) {
          results.push({
            article,
            relevanceScore: score,
            matchedFields,
          });
        }
      }

      // Sort by relevance score (descending)
      results.sort((a, b) => b.relevanceScore - a.relevanceScore);

      // Apply limit
      const limitedResults = results.slice(0, limit);

      // Normalize scores to 0-1 range
      if (limitedResults.length > 0) {
        const maxScore = limitedResults[0].relevanceScore;
        for (const result of limitedResults) {
          result.relevanceScore = result.relevanceScore / maxScore;
        }
      }

      functions.logger.info('Help articles search completed', {
        query,
        locale,
        category,
        resultsCount: limitedResults.length,
      });

      return {
        success: true,
        results: limitedResults,
      };
    } catch (error: any) {
      functions.logger.error('Error searching help articles', {
        error: error.message,
        userId: context.auth?.uid,
      });

      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      throw new functions.https.HttpsError(
        'internal',
        'Failed to search help articles',
        error.message
      );
    }
  }
);