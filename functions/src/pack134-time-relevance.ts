/**
 * PACK 134 — Time-of-Day Relevance Ranker
 * 
 * Tracks user behavior patterns by time of day
 * Aligns content delivery to expected mood/intent
 * 
 * NO FOMO patterns or addiction mechanics
 * Non-invasive, predictable personalization
 */

import { Timestamp } from 'firebase-admin/firestore';
import { db } from './init';
import { logger } from 'firebase-functions/v2';
import {
  TimeOfDayPreferences,
  HourlyPattern,
  DayPattern,
  InterestCategory,
} from './types/pack134-types';

// ============================================================================
// TIME PATTERN TRACKING
// ============================================================================

/**
 * Record user session for time pattern analysis
 * 
 * @param userId - User ID
 * @param sessionData - Session information
 */
export async function recordSessionPattern(
  userId: string,
  sessionData: {
    startTime: Timestamp;
    endTime: Timestamp;
    categoriesViewed: InterestCategory[];
    engagementLevel: number; // 0-1
  }
): Promise<void> {
  const startHour = sessionData.startTime.toDate().getHours();
  const dayOfWeek = sessionData.startTime.toDate().toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase() as 
    'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';
  
  logger.info('[Pack134] Recording session pattern', {
    userId,
    hour: startHour,
    day: dayOfWeek,
    categories: sessionData.categoriesViewed,
  });
  
  // Get or create time preferences
  const prefsRef = db.collection('time_of_day_preferences').doc(userId);
  const prefsDoc = await prefsRef.get();
  
  let prefs: TimeOfDayPreferences;
  
  if (!prefsDoc.exists) {
    prefs = {
      userId,
      hourlyPatterns: [],
      weekdayPatterns: [],
      confidenceScore: 0.1,
      dataPoints: 0,
      updatedAt: Timestamp.now(),
    };
  } else {
    prefs = prefsDoc.data() as TimeOfDayPreferences;
  }
  
  // Update hourly pattern
  let hourPattern = prefs.hourlyPatterns.find(p => p.hour === startHour);
  if (!hourPattern) {
    hourPattern = {
      hour: startHour,
      preferredCategories: [],
      avgEngagement: 0,
      sessionCount: 0,
    };
    prefs.hourlyPatterns.push(hourPattern);
  }
  
  // Update hour pattern data
  hourPattern.avgEngagement = 
    (hourPattern.avgEngagement * hourPattern.sessionCount + sessionData.engagementLevel) /
    (hourPattern.sessionCount + 1);
  hourPattern.sessionCount++;
  
  // Update preferred categories for this hour
  for (const category of sessionData.categoriesViewed) {
    if (!hourPattern.preferredCategories.includes(category)) {
      hourPattern.preferredCategories.push(category);
    }
  }
  
  // Keep only top 5 categories per hour
  if (hourPattern.preferredCategories.length > 5) {
    hourPattern.preferredCategories = hourPattern.preferredCategories.slice(0, 5);
  }
  
  // Update weekday pattern
  let dayPattern = prefs.weekdayPatterns.find(p => p.day === dayOfWeek);
  if (!dayPattern) {
    dayPattern = {
      day: dayOfWeek,
      preferredCategories: [],
      avgEngagement: 0,
      sessionCount: 0,
    };
    prefs.weekdayPatterns.push(dayPattern);
  }
  
  // Update day pattern data
  dayPattern.avgEngagement = 
    (dayPattern.avgEngagement * dayPattern.sessionCount + sessionData.engagementLevel) /
    (dayPattern.sessionCount + 1);
  dayPattern.sessionCount++;
  
  // Update preferred categories for this day
  for (const category of sessionData.categoriesViewed) {
    if (!dayPattern.preferredCategories.includes(category)) {
      dayPattern.preferredCategories.push(category);
    }
  }
  
  // Keep only top 5 categories per day
  if (dayPattern.preferredCategories.length > 5) {
    dayPattern.preferredCategories = dayPattern.preferredCategories.slice(0, 5);
  }
  
  // Update global stats
  prefs.dataPoints++;
  prefs.confidenceScore = calculateTimeConfidence(prefs.dataPoints);
  prefs.updatedAt = Timestamp.now();
  
  // Save updated preferences
  await prefsRef.set(prefs);
}

/**
 * Calculate confidence score based on number of sessions
 */
function calculateTimeConfidence(dataPoints: number): number {
  if (dataPoints < 5) return 0.2;
  if (dataPoints < 10) return 0.4;
  if (dataPoints < 20) return 0.6;
  if (dataPoints < 50) return 0.8;
  return 1.0;
}

// ============================================================================
// TIME RELEVANCE RETRIEVAL
// ============================================================================

/**
 * Get user's time-of-day preferences
 * 
 * @param userId - User ID
 * @returns Time preferences or null
 */
export async function getTimeOfDayRelevance(
  userId: string
): Promise<TimeOfDayPreferences | null> {
  const prefsDoc = await db.collection('time_of_day_preferences').doc(userId).get();
  
  if (!prefsDoc.exists) {
    return null;
  }
  
  return prefsDoc.data() as TimeOfDayPreferences;
}

/**
 * Get preferred categories for current time
 * 
 * @param userId - User ID
 * @returns Array of preferred categories for current time
 */
export async function getCurrentTimePreferences(
  userId: string
): Promise<InterestCategory[]> {
  const prefs = await getTimeOfDayRelevance(userId);
  
  if (!prefs || prefs.confidenceScore < 0.4) {
    return []; // Not enough data
  }
  
  const currentHour = new Date().getHours();
  const hourPattern = prefs.hourlyPatterns.find(p => p.hour === currentHour);
  
  if (!hourPattern || hourPattern.sessionCount < 3) {
    return []; // Not enough data for this hour
  }
  
  return hourPattern.preferredCategories;
}

/**
 * Get time-of-day summary for user (for transparency)
 * 
 * @param userId - User ID
 * @returns Human-readable summary
 */
export async function getTimePatternSummary(userId: string): Promise<string> {
  const prefs = await getTimeOfDayRelevance(userId);
  
  if (!prefs || prefs.confidenceScore < 0.4) {
    return 'Not enough data to determine time patterns yet';
  }
  
  // Find most active hours
  const topHours = prefs.hourlyPatterns
    .filter(p => p.sessionCount >= 3)
    .sort((a, b) => b.sessionCount - a.sessionCount)
    .slice(0, 3);
  
  if (topHours.length === 0) {
    return 'Building your time pattern profile...';
  }
  
  const hourRanges = topHours.map(h => formatHour(h.hour));
  
  // Find most active days
  const topDays = prefs.weekdayPatterns
    .filter(p => p.sessionCount >= 2)
    .sort((a, b) => b.sessionCount - a.sessionCount)
    .slice(0, 3)
    .map(d => d.day);
  
  let summary = `You're most active `;
  
  if (hourRanges.length > 0) {
    summary += `around ${hourRanges.join(', ')}`;
  }
  
  if (topDays.length > 0) {
    summary += ` and on ${topDays.map(d => d.charAt(0) + d.slice(1).toLowerCase()).join(', ')}s`;
  }
  
  return summary;
}

/**
 * Format hour to user-friendly string
 */
function formatHour(hour: number): string {
  if (hour === 0) return 'midnight';
  if (hour === 12) return 'noon';
  if (hour < 12) return `${hour}am`;
  return `${hour - 12}pm`;
}

// ============================================================================
// TIME-BASED CONTENT SUGGESTIONS
// ============================================================================

/**
 * Get content type suggestions based on time of day
 * 
 * Examples:
 * - Morning: motivational, news, fitness
 * - Afternoon: educational, productivity
 * - Evening: entertainment, lifestyle
 * - Night: relaxation, creative
 */
export function getTimeBasedContentSuggestions(hour?: number): InterestCategory[] {
  const currentHour = hour !== undefined ? hour : new Date().getHours();
  
  // Morning (6am - 11am)
  if (currentHour >= 6 && currentHour < 12) {
    return ['fitness', 'self_improvement', 'education', 'health_wellness'];
  }
  
  // Afternoon (12pm - 5pm)
  if (currentHour >= 12 && currentHour < 17) {
    return ['business', 'technology', 'education', 'food_cooking'];
  }
  
  // Evening (5pm - 10pm)
  if (currentHour >= 17 && currentHour < 22) {
    return ['entertainment', 'lifestyle', 'movies_tv', 'music'];
  }
  
  // Night (10pm - 6am)
  return ['art_creative', 'books_reading', 'music', 'photography'];
}

/**
 * Check if it's a good time to show specific content type
 * Prevents showing intense/stressful content at inappropriate times
 * 
 * @param contentType - Content category
 * @param hour - Hour of day (0-23)
 * @returns Whether content is appropriate for time
 */
export function isAppropriateTimeForContent(
  contentType: InterestCategory,
  hour?: number
): boolean {
  const currentHour = hour !== undefined ? hour : new Date().getHours();
  
  // Don't show intense/stressful content late at night
  const intenseCategories: InterestCategory[] = ['business', 'education'];
  if (intenseCategories.includes(contentType) && (currentHour >= 22 || currentHour < 6)) {
    return false;
  }
  
  // Don't show relaxation content during work hours
  const relaxationCategories: InterestCategory[] = ['entertainment', 'gaming'];
  if (relaxationCategories.includes(contentType) && currentHour >= 9 && currentHour < 17) {
    return false; // Optional: can be configurable
  }
  
  return true; // Most content is fine anytime
}

// ============================================================================
// ANALYTICS & INSIGHTS
// ============================================================================

/**
 * Get time pattern insights for user (for personalization dashboard)
 * 
 * @param userId - User ID
 * @returns Insights about user's time patterns
 */
export async function getTimePatternInsights(userId: string): Promise<{
  mostActiveHours: number[];
  mostActiveDays: string[];
  morningPreferences: InterestCategory[];
  eveningPreferences: InterestCategory[];
  confidenceLevel: string;
} | null> {
  const prefs = await getTimeOfDayRelevance(userId);
  
  if (!prefs || prefs.confidenceScore < 0.4) {
    return null;
  }
  
  // Most active hours
  const mostActiveHours = prefs.hourlyPatterns
    .filter(p => p.sessionCount >= 3)
    .sort((a, b) => b.sessionCount - a.sessionCount)
    .slice(0, 3)
    .map(p => p.hour);
  
  // Most active days
  const mostActiveDays = prefs.weekdayPatterns
    .filter(p => p.sessionCount >= 2)
    .sort((a, b) => b.sessionCount - a.sessionCount)
    .slice(0, 3)
    .map(p => p.day);
  
  // Morning preferences (6am - 12pm)
  const morningHours = prefs.hourlyPatterns.filter(p => p.hour >= 6 && p.hour < 12);
  const morningPreferences = Array.from(new Set(
    morningHours.flatMap(h => h.preferredCategories)
  )).slice(0, 3);
  
  // Evening preferences (5pm - 11pm)
  const eveningHours = prefs.hourlyPatterns.filter(p => p.hour >= 17 && p.hour < 23);
  const eveningPreferences = Array.from(new Set(
    eveningHours.flatMap(h => h.preferredCategories)
  )).slice(0, 3);
  
  // Confidence level
  let confidenceLevel: string;
  if (prefs.confidenceScore >= 0.8) {
    confidenceLevel = 'High';
  } else if (prefs.confidenceScore >= 0.6) {
    confidenceLevel = 'Medium';
  } else {
    confidenceLevel = 'Low';
  }
  
  return {
    mostActiveHours,
    mostActiveDays,
    morningPreferences,
    eveningPreferences,
    confidenceLevel,
  };
}