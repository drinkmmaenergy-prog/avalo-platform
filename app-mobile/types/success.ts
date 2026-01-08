/**
 * PACK 101 — Creator Success Toolkit Types (Mobile)
 */

export type SuggestionCategory = 
  | 'PROFILE'
  | 'CONTENT'
  | 'MESSAGING'
  | 'ENGAGEMENT'
  | 'AUDIENCE';

export type SuggestionPriority = 'HIGH' | 'MEDIUM' | 'LOW';

export interface SuccessSuggestion {
  id: string;
  category: SuggestionCategory;
  title: string;
  body: string;
  priority: SuggestionPriority;
  helpArticleSlug?: string;
  actionLink?: string;
}

export interface SuccessScorecard {
  profileQuality: number;
  activity: number;
  consistency: number;
  responsiveness: number;
  contentMomentum: number;
  audienceLoyalty: number;
}

export interface CreatorSuccessSignals {
  updatedAt: string;
  scorecard: SuccessScorecard;
  suggestions: SuccessSuggestion[];
}