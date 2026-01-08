/**
 * PACK 98 — IN-APP HELP CENTER, GUIDED ONBOARDING & CONTEXTUAL EDUCATION
 * Type definitions for help center, onboarding, and contextual tips
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// HELP ARTICLES & CATEGORIES
// ============================================================================

export type HelpArticleLanguage = 'en' | 'pl';

export interface HelpArticle {
  id: string;
  slug: string;
  categoryId: string;
  title: string;
  content: string;
  language: HelpArticleLanguage;
  tags: string[];
  isFeatured: boolean;
  platform: 'MOBILE' | 'WEB' | 'BOTH';
  updatedAt: Timestamp;
  createdAt: Timestamp;
}

export interface HelpCategory {
  id: string;
  slug: string;
  title: string;
  order: number;
  updatedAt: Timestamp;
  createdAt: Timestamp;
}

// ============================================================================
// USER TIPS STATE
// ============================================================================

export interface UserTipsState {
  userId: string;
  dismissedTips: string[];
  updatedAt: Timestamp;
}

// ============================================================================
// ONBOARDING STATE
// ============================================================================

export interface UserOnboardingState {
  userId: string;
  hasSeenGeneralOnboarding: boolean;
  hasAcceptedMonetizationIntro: boolean;
  generalOnboardingCompletedAt?: Timestamp;
  monetizationIntroAcceptedAt?: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

export interface GetHelpCategoriesRequest {
  language: HelpArticleLanguage;
}

export interface GetHelpCategoriesResponse {
  categories: HelpCategory[];
}

export interface GetHelpArticlesByCategoryRequest {
  categorySlug: string;
  language: HelpArticleLanguage;
  limit?: number;
  cursor?: string;
}

export interface GetHelpArticlesByCategoryResponse {
  articles: HelpArticle[];
  nextCursor?: string;
  hasMore: boolean;
}

export interface SearchHelpArticlesRequest {
  query: string;
  language: HelpArticleLanguage;
  limit?: number;
  cursor?: string;
}

export interface SearchHelpArticlesResponse {
  articles: HelpArticle[];
  nextCursor?: string;
  hasMore: boolean;
}

export interface GetHelpArticleBySlugRequest {
  slug: string;
  language: HelpArticleLanguage;
}

export interface GetHelpArticleBySlugResponse {
  article: HelpArticle | null;
}

// ============================================================================
// ADMIN REQUEST TYPES
// ============================================================================

export interface CreateOrUpdateHelpArticleRequest {
  id?: string;
  slug: string;
  categoryId: string;
  title: string;
  content: string;
  language: HelpArticleLanguage;
  tags: string[];
  isFeatured: boolean;
  platform: 'MOBILE' | 'WEB' | 'BOTH';
}

export interface CreateOrUpdateHelpCategoryRequest {
  id?: string;
  slug: string;
  title: string;
  order: number;
}

// ============================================================================
// CONTEXTUAL TIPS
// ============================================================================

export interface DismissTipRequest {
  tipId: string;
}

export interface GetUserTipsRequest {
  screenId: string;
}

export interface GetUserTipsResponse {
  tips: Array<{
    id: string;
    title: string;
    body: string;
    dismissed: boolean;
  }>;
}

// ============================================================================
// ONBOARDING
// ============================================================================

export interface MarkOnboardingCompleteRequest {
  type: 'general' | 'monetization';
}

export interface GetOnboardingStateResponse {
  hasSeenGeneralOnboarding: boolean;
  hasAcceptedMonetizationIntro: boolean;
}