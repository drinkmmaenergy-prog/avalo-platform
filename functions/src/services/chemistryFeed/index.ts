/**
 * PACK 208 — Chemistry Feed AI
 * Main export module for adaptive attraction ranking
 */

export * from './types';
export * from './signalsAesthetic';
export * from './rankingModel';
export * from './feedEngine';

// Re-export main API
export { getFeed, invalidateCache, cleanupCache } from './feedEngine';
export { calculateChemistryScore } from './rankingModel';
export { calculatePhotoAttractivenessScore } from './signalsAesthetic';

console.log('✅ PACK 208: Chemistry Feed AI loaded');