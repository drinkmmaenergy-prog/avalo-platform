/**
 * PACK 98 — IN-APP HELP CENTER, GUIDED ONBOARDING & CONTEXTUAL EDUCATION
 * Backend implementation for help center, articles, and categories
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {
  HelpArticle,
  HelpCategory,
  GetHelpCategoriesRequest,
  GetHelpCategoriesResponse,
  GetHelpArticlesByCategoryRequest,
  GetHelpArticlesByCategoryResponse,
  SearchHelpArticlesRequest,
  SearchHelpArticlesResponse,
  GetHelpArticleBySlugRequest,
  GetHelpArticleBySlugResponse,
  CreateOrUpdateHelpArticleRequest,
  CreateOrUpdateHelpCategoryRequest,
  UserTipsState,
  UserOnboardingState,
  DismissTipRequest,
  GetUserTipsRequest,
  GetUserTipsResponse,
  MarkOnboardingCompleteRequest,
  GetOnboardingStateResponse,
} from './pack98-help-types';

const db = admin.firestore();

// ============================================================================
// PUBLIC HELP CENTER ENDPOINTS
// ============================================================================

/**
 * Get all help categories
 * Public endpoint - returns categories in specified language
 */
export const getHelpCategories = functions.https.onCall(
  async (
    data: GetHelpCategoriesRequest,
    context
  ): Promise<GetHelpCategoriesResponse> => {
    const { language } = data;

    try {
      const categoriesSnapshot = await db
        .collection('help_categories')
        .orderBy('order', 'asc')
        .get();

      const categories: HelpCategory[] = categoriesSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as HelpCategory[];

      return { categories };
    } catch (error: any) {
      console.error('[HelpCenter] Error getting categories:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Get articles by category
 * Public endpoint with pagination
 */
export const getHelpArticlesByCategory = functions.https.onCall(
  async (
    data: GetHelpArticlesByCategoryRequest,
    context
  ): Promise<GetHelpArticlesByCategoryResponse> => {
    const { categorySlug, language, limit = 20, cursor } = data;

    try {
      // Find category by slug
      const categorySnapshot = await db
        .collection('help_categories')
        .where('slug', '==', categorySlug)
        .limit(1)
        .get();

      if (categorySnapshot.empty) {
        throw new functions.https.HttpsError('not-found', 'Category not found');
      }

      const categoryId = categorySnapshot.docs[0].id;

      // Build query
      let query = db
        .collection('help_articles')
        .where('categoryId', '==', categoryId)
        .where('language', '==', language)
        .orderBy('isFeatured', 'desc')
        .orderBy('updatedAt', 'desc')
        .limit(limit + 1);

      // Apply cursor if provided
      if (cursor) {
        const cursorDoc = await db.collection('help_articles').doc(cursor).get();
        if (cursorDoc.exists) {
          query = query.startAfter(cursorDoc);
        }
      }

      const articlesSnapshot = await query.get();
      const articles: HelpArticle[] = [];
      let nextCursor: string | undefined;
      let hasMore = false;

      articlesSnapshot.docs.forEach((doc, index) => {
        if (index < limit) {
          articles.push({
            id: doc.id,
            ...doc.data(),
          } as HelpArticle);
        } else {
          hasMore = true;
          nextCursor = doc.id;
        }
      });

      return { articles, nextCursor, hasMore };
    } catch (error: any) {
      console.error('[HelpCenter] Error getting articles by category:', error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Search help articles
 * Public endpoint with text search and pagination
 */
export const searchHelpArticles = functions.https.onCall(
  async (
    data: SearchHelpArticlesRequest,
    context
  ): Promise<SearchHelpArticlesResponse> => {
    const { query, language, limit = 20, cursor } = data;

    if (!query || query.trim().length === 0) {
      return { articles: [], hasMore: false };
    }

    try {
      const searchTerms = query.toLowerCase().trim().split(/\s+/);

      // Build query for articles in specified language
      let articlesQuery = db
        .collection('help_articles')
        .where('language', '==', language)
        .orderBy('updatedAt', 'desc')
        .limit(limit + 1);

      // Apply cursor if provided
      if (cursor) {
        const cursorDoc = await db.collection('help_articles').doc(cursor).get();
        if (cursorDoc.exists) {
          articlesQuery = articlesQuery.startAfter(cursorDoc);
        }
      }

      const articlesSnapshot = await articlesQuery.get();
      const articles: HelpArticle[] = [];
      let nextCursor: string | undefined;
      let hasMore = false;

      // Client-side filtering for text search
      // In production, consider using Algolia or similar for better search
      articlesSnapshot.docs.forEach((doc, index) => {
        if (index >= limit) {
          hasMore = true;
          nextCursor = doc.id;
          return;
        }

        const article = { id: doc.id, ...doc.data() } as HelpArticle;
        const searchText = `${article.title} ${article.content} ${article.tags.join(' ')}`.toLowerCase();

        // Check if all search terms are present
        const matches = searchTerms.every((term) => searchText.includes(term));

        if (matches) {
          articles.push(article);
        }
      });

      return { articles, nextCursor, hasMore };
    } catch (error: any) {
      console.error('[HelpCenter] Error searching articles:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Get single article by slug
 * Public endpoint
 */
export const getHelpArticleBySlug = functions.https.onCall(
  async (
    data: GetHelpArticleBySlugRequest,
    context
  ): Promise<GetHelpArticleBySlugResponse> => {
    const { slug, language } = data;

    try {
      const articleSnapshot = await db
        .collection('help_articles')
        .where('slug', '==', slug)
        .where('language', '==', language)
        .limit(1)
        .get();

      if (articleSnapshot.empty) {
        return { article: null };
      }

      const doc = articleSnapshot.docs[0];
      const article: HelpArticle = {
        id: doc.id,
        ...doc.data(),
      } as HelpArticle;

      return { article };
    } catch (error: any) {
      console.error('[HelpCenter] Error getting article by slug:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

// ============================================================================
// ADMIN ENDPOINTS
// ============================================================================

/**
 * Create or update help article (admin only)
 */
export const admin_createOrUpdateHelpArticle = functions.https.onCall(
  async (data: CreateOrUpdateHelpArticleRequest, context) => {
    // Check authentication
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    // TODO: Add admin role check
    // const userDoc = await db.collection('users').doc(context.auth.uid).get();
    // if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
    //   throw new functions.https.HttpsError('permission-denied', 'Admin access required');
    // }

    const { id, slug, categoryId, title, content, language, tags, isFeatured, platform } = data;

    try {
      // Verify category exists
      const categoryDoc = await db.collection('help_categories').doc(categoryId).get();
      if (!categoryDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Category not found');
      }

      const now = admin.firestore.Timestamp.now();
      const articleData = {
        slug,
        categoryId,
        title,
        content,
        language,
        tags,
        isFeatured,
        platform,
        updatedAt: now,
      };

      if (id) {
        // Update existing article
        await db.collection('help_articles').doc(id).update(articleData);
        return { success: true, articleId: id };
      } else {
        // Create new article
        const articleRef = await db.collection('help_articles').add({
          ...articleData,
          createdAt: now,
        });
        return { success: true, articleId: articleRef.id };
      }
    } catch (error: any) {
      console.error('[HelpCenter] Error creating/updating article:', error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Create or update help category (admin only)
 */
export const admin_createOrUpdateHelpCategory = functions.https.onCall(
  async (data: CreateOrUpdateHelpCategoryRequest, context) => {
    // Check authentication
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    // TODO: Add admin role check
    // const userDoc = await db.collection('users').doc(context.auth.uid).get();
    // if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
    //   throw new functions.https.HttpsError('permission-denied', 'Admin access required');
    // }

    const { id, slug, title, order } = data;

    try {
      const now = admin.firestore.Timestamp.now();
      const categoryData = {
        slug,
        title,
        order,
        updatedAt: now,
      };

      if (id) {
        // Update existing category
        await db.collection('help_categories').doc(id).update(categoryData);
        return { success: true, categoryId: id };
      } else {
        // Create new category
        const categoryRef = await db.collection('help_categories').add({
          ...categoryData,
          createdAt: now,
        });
        return { success: true, categoryId: categoryRef.id };
      }
    } catch (error: any) {
      console.error('[HelpCenter] Error creating/updating category:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

// ============================================================================
// USER TIPS & ONBOARDING STATE
// ============================================================================

/**
 * Dismiss a contextual tip
 */
export const dismissContextualTip = functions.https.onCall(
  async (data: DismissTipRequest, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const { tipId } = data;
    const userId = context.auth.uid;

    try {
      const tipsStateRef = db.collection('user_tips_state').doc(userId);
      const tipsStateDoc = await tipsStateRef.get();

      if (!tipsStateDoc.exists) {
        // Create new tips state document
        await tipsStateRef.set({
          userId,
          dismissedTips: [tipId],
          updatedAt: admin.firestore.Timestamp.now(),
        });
      } else {
        // Update existing document
        await tipsStateRef.update({
          dismissedTips: admin.firestore.FieldValue.arrayUnion(tipId),
          updatedAt: admin.firestore.Timestamp.now(),
        });
      }

      return { success: true };
    } catch (error: any) {
      console.error('[HelpCenter] Error dismissing tip:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Get user's dismissed tips state
 */
export const getUserTipsState = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const userId = context.auth.uid;

  try {
    const tipsStateDoc = await db.collection('user_tips_state').doc(userId).get();

    if (!tipsStateDoc.exists) {
      return { dismissedTips: [] };
    }

    const tipsState = tipsStateDoc.data() as UserTipsState;
    return { dismissedTips: tipsState.dismissedTips || [] };
  } catch (error: any) {
    console.error('[HelpCenter] Error getting tips state:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Mark onboarding as complete
 */
export const markOnboardingComplete = functions.https.onCall(
  async (data: MarkOnboardingCompleteRequest, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const { type } = data;
    const userId = context.auth.uid;

    if (!['general', 'monetization'].includes(type)) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid onboarding type');
    }

    try {
      const onboardingRef = db.collection('user_onboarding_state').doc(userId);
      const now = admin.firestore.Timestamp.now();

      const updateData: any = {
        userId,
        updatedAt: now,
      };

      if (type === 'general') {
        updateData.hasSeenGeneralOnboarding = true;
        updateData.generalOnboardingCompletedAt = now;
      } else if (type === 'monetization') {
        updateData.hasAcceptedMonetizationIntro = true;
        updateData.monetizationIntroAcceptedAt = now;
      }

      await onboardingRef.set(updateData, { merge: true });

      return { success: true };
    } catch (error: any) {
      console.error('[HelpCenter] Error marking onboarding complete:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Get user's onboarding state
 */
export const getOnboardingState = functions.https.onCall(
  async (data, context): Promise<GetOnboardingStateResponse> => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const userId = context.auth.uid;

    try {
      const onboardingDoc = await db.collection('user_onboarding_state').doc(userId).get();

      if (!onboardingDoc.exists) {
        return {
          hasSeenGeneralOnboarding: false,
          hasAcceptedMonetizationIntro: false,
        };
      }

      const onboardingState = onboardingDoc.data() as UserOnboardingState;
      return {
        hasSeenGeneralOnboarding: onboardingState.hasSeenGeneralOnboarding || false,
        hasAcceptedMonetizationIntro: onboardingState.hasAcceptedMonetizationIntro || false,
      };
    } catch (error: any) {
      console.error('[HelpCenter] Error getting onboarding state:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);