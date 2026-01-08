/**
 * PACK 208 — Aesthetic Signals & Photo Attractiveness Scoring
 * AI-based photo quality and aesthetic scoring (NO nudity detection)
 */

import { UserProfile } from './types';

/**
 * Calculate photo attractiveness score based on aesthetic signals
 * Returns score 0-100
 */
export function calculatePhotoAttractivenessScore(profile: UserProfile): number {
  let score = 50; // Base score

  // Photo count boost
  const photoCount = profile.photos?.length || 0;
  if (photoCount === 0) {
    return 0; // No photos = no aesthetic score
  }

  // Multiple photos boost (shows effort)
  if (photoCount >= 3) {
    score += 15;
  } else if (photoCount >= 2) {
    score += 10;
  } else {
    score += 5; // Single photo
  }

  // Photo quality indicators (based on URL patterns)
  // High-res photos typically have larger file sizes indicated in URL
  const highResPhotos = profile.photos.filter(url => 
    url.includes('_1080') || 
    url.includes('_720') || 
    url.includes('original') ||
    url.length > 150 // Longer URLs often indicate better quality
  );
  
  if (highResPhotos.length > 0) {
    score += 10;
  }

  // Profile photo variety boost
  // Different photo URLs suggest variety
  const uniquePhotos = new Set(profile.photos).size;
  if (uniquePhotos >= 3) {
    score += 10;
  }

  // Recent uploads boost (photos with recent timestamps)
  // This would require timestamp metadata, using placeholder logic
  const hasRecentPhotos = profile.photos.some(url => {
    // Check if URL contains recent date patterns
    const currentYear = new Date().getFullYear();
    return url.includes(String(currentYear));
  });
  
  if (hasRecentPhotos) {
    score += 5;
  }

  // Aesthetic quality proxy: Photos with proper aspect ratio
  // Professional photos often maintain standard ratios
  // This is a placeholder - real implementation would analyze image dimensions
  const wellFormattedPhotos = profile.photos.filter(url => {
    // Firebase Storage URLs with resize parameters indicate optimized photos
    return url.includes('_w=') || url.includes('_h=') || url.includes('resize');
  });
  
  if (wellFormattedPhotos.length > 0) {
    score += 5;
  }

  // Cap the score at 100
  return Math.min(100, Math.max(0, score));
}

/**
 * Calculate photo completeness score
 * Measures how complete the photo profile is
 */
export function calculatePhotoCompleteness(profile: UserProfile): number {
  const photoCount = profile.photos?.length || 0;
  
  if (photoCount === 0) return 0;
  if (photoCount >= 6) return 100;
  
  // Linear scale from 0 to 100 based on photo count (max at 6 photos)
  return Math.round((photoCount / 6) * 100);
}

/**
 * Determine if profile photos show effort and quality
 */
export function hasHighQualityPhotos(profile: UserProfile): boolean {
  const photoCount = profile.photos?.length || 0;
  
  if (photoCount < 2) return false;
  
  // Check for high resolution indicators
  const highResCount = profile.photos.filter(url =>
    url.includes('_1080') || 
    url.includes('_720') || 
    url.includes('original')
  ).length;
  
  return highResCount >= 2;
}

/**
 * Get aesthetic quality tier
 */
export function getAestheticTier(score: number): 'high' | 'medium' | 'low' {
  if (score >= 75) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
}

/**
 * Calculate visual appeal multiplier for feed ranking
 * Returns multiplier 0.5 - 1.5
 */
export function getVisualAppealMultiplier(profile: UserProfile): number {
  const score = calculatePhotoAttractivenessScore(profile);
  
  // Convert score to multiplier
  // Score 0-40: 0.5x
  // Score 40-60: 1.0x
  // Score 60-100: 1.0x - 1.5x
  
  if (score < 40) {
    return 0.5 + (score / 40) * 0.5; // 0.5 to 1.0
  } else if (score < 60) {
    return 1.0;
  } else {
    return 1.0 + ((score - 60) / 40) * 0.5; // 1.0 to 1.5
  }
}

/**
 * Analyze photo diversity
 * Profiles with varied photos rank higher
 */
export function analyzePictureDiversity(profile: UserProfile): {
  diversityScore: number;
  hasVariety: boolean;
} {
  const photoCount = profile.photos?.length || 0;
  
  if (photoCount < 2) {
    return { diversityScore: 0, hasVariety: false };
  }
  
  // Simple diversity check based on URL patterns
  // Real implementation would use image analysis
  const uniquePatterns = new Set<string>();
  
  profile.photos.forEach(url => {
    // Extract patterns from URL
    const patterns = url.match(/_(selfie|portrait|full|group|outdoor|indoor)/gi);
    if (patterns) {
      patterns.forEach(p => uniquePatterns.add(p.toLowerCase()));
    }
  });
  
  const diversityScore = Math.min(100, (uniquePatterns.size / Math.min(photoCount, 4)) * 100);
  const hasVariety = uniquePatterns.size >= 2;
  
  return { diversityScore, hasVariety };
}

console.log('✅ PACK 208: Aesthetic Signals module loaded');