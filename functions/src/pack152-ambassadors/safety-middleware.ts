/**
 * PACK 152 - Safety Middleware
 * Validates events against romantic/NSFW/attention-for-payment patterns
 * 
 * CRITICAL: Blocks any events that could enable dating/romance/NSFW dynamics
 */

import { FORBIDDEN_EVENT_PATTERNS, APPROVED_EVENT_KEYWORDS, EventType } from './types';

export interface ValidationResult {
  isValid: boolean;
  violations: string[];
  warnings: string[];
  score: number; // 0-100, higher = safer
}

export class AmbassadorSafetyMiddleware {
  
  /**
   * Validates event title and description against forbidden patterns
   */
  static validateEventContent(
    title: string,
    description: string,
    eventType: EventType
  ): ValidationResult {
    const violations: string[] = [];
    const warnings: string[] = [];
    let score = 100;
    
    const combinedText = `${title} ${description}`.toLowerCase();
    
    // Check for forbidden patterns
    for (const pattern of FORBIDDEN_EVENT_PATTERNS) {
      if (combinedText.includes(pattern)) {
        violations.push(`Forbidden content detected: "${pattern}"`);
        score -= 20;
      }
    }
    
    // Additional pattern checks (regex-based)
    const romanticPatterns = [
      /\bmeet\s+singles?\b/i,
      /\bfind\s+love\b/i,
      /\bdate\s+night\b/i,
      /\battract(ive)?\s+(people|men|women|singles)\b/i,
      /\bbeautiful\s+(men|women|people|singles)\b/i,
      /\bsexy\s+(outfit|dress|attire)\b/i,
      /\bmingle\s+with\b/i,
      /\bconnect\s+romantically\b/i,
      /\bescort\b/i,
      /\bsugar\s+(daddy|mommy|baby)\b/i,
      /\bhookup\b/i,
      /\bone\s+night\s+stand\b/i,
      /\bcasual\s+(sex|encounter)\b/i,
      /\bnsfw\b/i,
      /\badult\s+content\b/i,
      /\b(strip|pole)\s+dance\b/i
    ];
    
    for (const pattern of romanticPatterns) {
      if (pattern.test(combinedText)) {
        violations.push(`Romantic/NSFW pattern detected: ${pattern.source}`);
        score -= 25;
      }
    }
    
    // Alcohol-centric flirt themes
    const alcoholFlirtPatterns = [
      /\bbar\s+hop(ping)?\b/i,
      /\bpub\s+crawl\b/i,
      /\bdrinks?\s+and\s+mingle\b/i,
      /\bcocktails?\s+and\s+(flirt|meet)\b/i,
      /\bwine\s+and\s+dine\b/i,
      /\bhappy\s+hour\s+singles\b/i
    ];
    
    for (const pattern of alcoholFlirtPatterns) {
      if (pattern.test(combinedText)) {
        violations.push(`Alcohol-centric flirt theme detected: ${pattern.source}`);
        score -= 20;
      }
    }
    
    // Suggestive dress code warnings
    const dressCodePatterns = [
      /\bdress\s+(sexy|sensual|provocative|revealing)\b/i,
      /\bsexy\s+(outfit|attire|dress|clothing)\b/i,
      /\brevealing\s+(clothes|outfit)\b/i,
      /\blingerie\b/i,
      /\bblack\s+tie\s+and\s+sexy\b/i
    ];
    
    for (const pattern of dressCodePatterns) {
      if (pattern.test(combinedText)) {
        violations.push(`Suggestive dress code detected: ${pattern.source}`);
        score -= 25;
      }
    }
    
    // Check for approved keywords (bonus points)
    let approvedKeywordCount = 0;
    for (const keyword of APPROVED_EVENT_KEYWORDS) {
      if (combinedText.includes(keyword)) {
        approvedKeywordCount++;
      }
    }
    
    if (approvedKeywordCount === 0) {
      warnings.push('No approved keywords found. Consider adding professional/skill-based context.');
      score -= 5;
    } else if (approvedKeywordCount >= 3) {
      score = Math.min(100, score + 5);
    }
    
    // Check title length and quality
    if (title.length < 10) {
      warnings.push('Title is too short. Provide more descriptive information.');
      score -= 3;
    }
    
    if (description.length < 50) {
      warnings.push('Description is too short. Provide detailed event information.');
      score -= 5;
    }
    
    // Check for excessive special characters that might indicate unprofessional content
    const specialCharCount = combinedText.split('').filter(char => {
      const code = char.charCodeAt(0);
      return (code >= 0x1F300 && code <= 0x1F9FF) || (code >= 0x2600 && code <= 0x27BF);
    }).length;
    if (specialCharCount > 5) {
      warnings.push('Excessive emoji/special character use detected. Keep content professional.');
      score -= 2;
    }
    
    // Final validation
    const isValid = violations.length === 0 && score >= 60;
    
    return {
      isValid,
      violations,
      warnings,
      score: Math.max(0, Math.min(100, score))
    };
  }
  
  /**
   * Validates venue suitability
   */
  static validateVenue(venue: string, address: string): ValidationResult {
    const violations: string[] = [];
    const warnings: string[] = [];
    let score = 100;
    
    const combinedText = `${venue} ${address}`.toLowerCase();
    
    // Forbidden venue types
    const forbiddenVenues = [
      /\bnightclub\b/i,
      /\bstrip\s+club\b/i,
      /\badult\s+(entertainment|club|venue)\b/i,
      /\bhookah\s+lounge\b/i,
      /\bbar\b(?!\s+(code|graph|chart))/i, // Allow "bar chart" but not "bar" venue
      /\bpub\b/i,
      /\btavern\b/i,
      /\bbrothel\b/i,
      /\bescort\s+service\b/i,
      /\bmassage\s+parlor\b/i,
      /\bprivate\s+residence\b/i // Safety concern
    ];
    
    for (const pattern of forbiddenVenues) {
      if (pattern.test(combinedText)) {
        violations.push(`Inappropriate venue type detected: ${pattern.source}`);
        score -= 30;
      }
    }
    
    // Approved venue types
    const approvedVenues = [
      /\bcoworking\s+space\b/i,
      /\bcommunity\s+center\b/i,
      /\bconference\s+(room|center|hall)\b/i,
      /\boffice\b/i,
      /\bgym\b/i,
      /\bfitness\s+studio\b/i,
      /\bpark\b/i,
      /\bgallery\b/i,
      /\bmuseum\b/i,
      /\blibrary\b/i,
      /\buniversity\b/i,
      /\bcafe\b/i,
      /\brestaurant\b/i,
      /\bhotel\s+(conference|meeting)\b/i
    ];
    
    let hasApprovedVenue = false;
    for (const pattern of approvedVenues) {
      if (pattern.test(combinedText)) {
        hasApprovedVenue = true;
        break;
      }
    }
    
    if (!hasApprovedVenue && combinedText.length > 0) {
      warnings.push('Venue type is unclear. Specify a professional venue (coworking, conference center, etc.).');
      score -= 10;
    }
    
    // Check for address completeness
    if (address.length < 15) {
      warnings.push('Address is incomplete. Provide full street address.');
      score -= 5;
    }
    
    const isValid = violations.length === 0 && score >= 50;
    
    return {
      isValid,
      violations,
      warnings,
      score: Math.max(0, Math.min(100, score))
    };
  }
  
  /**
   * Validates event timing (no late-night singles events)
   */
  static validateEventTiming(startTime: Date, endTime: Date): ValidationResult {
    const violations: string[] = [];
    const warnings: string[] = [];
    let score = 100;
    
    const startHour = startTime.getHours();
    const endHour = endTime.getHours();
    const duration = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
    
    // No events starting after 9 PM (to avoid late-night singles scenarios)
    if (startHour >= 21 || startHour < 6) {
      violations.push('Events cannot start after 9 PM or before 6 AM');
      score -= 30;
    }
    
    // No events ending after midnight
    if (endHour >= 24 || (endHour < 6 && endHour > 0)) {
      violations.push('Events cannot end after midnight');
      score -= 25;
    }
    
    // Reasonable duration
    if (duration > 8) {
      warnings.push('Event duration exceeds 8 hours. Consider splitting into multiple sessions.');
      score -= 5;
    }
    
    if (duration < 0.5) {
      warnings.push('Event duration is less than 30 minutes. Provide adequate time for activities.');
      score -= 5;
    }
    
    const isValid = violations.length === 0;
    
    return {
      isValid,
      violations,
      warnings,
      score: Math.max(0, Math.min(100, score))
    };
  }
  
  /**
   * Comprehensive event validation
   */
  static validateEvent(event: {
    title: string;
    description: string;
    eventType: EventType;
    venue: string;
    address: string;
    startTime: Date;
    endTime: Date;
  }): ValidationResult {
    const contentValidation = this.validateEventContent(
      event.title,
      event.description,
      event.eventType
    );
    
    const venueValidation = this.validateVenue(event.venue, event.address);
    
    const timingValidation = this.validateEventTiming(
      event.startTime,
      event.endTime
    );
    
    // Combine results
    const allViolations = [
      ...contentValidation.violations,
      ...venueValidation.violations,
      ...timingValidation.violations
    ];
    
    const allWarnings = [
      ...contentValidation.warnings,
      ...venueValidation.warnings,
      ...timingValidation.warnings
    ];
    
    const avgScore = Math.round(
      (contentValidation.score + venueValidation.score + timingValidation.score) / 3
    );
    
    return {
      isValid: allViolations.length === 0 && avgScore >= 60,
      violations: allViolations,
      warnings: allWarnings,
      score: avgScore
    };
  }
  
  /**
   * Validates ambassador profile safety
   * Ensures no profile boost or visibility advantages
   */
  static validateAmbassadorProfileRestrictions(
    profileChanges: Record<string, any>
  ): ValidationResult {
    const violations: string[] = [];
    const warnings: string[] = [];
    let score = 100;
    
    // Forbidden profile modifications
    const forbiddenFields = [
      'rankingBoost',
      'visibilityBoost',
      'matchmakingPriority',
      'discoveryBoost',
      'premiumStatus',
      'featuredStatus',
      'highlightedProfile',
      'topRanked'
    ];
    
    for (const field of forbiddenFields) {
      if (field in profileChanges) {
        violations.push(`Forbidden profile modification: ${field}`);
        score -= 50;
      }
    }
    
    const isValid = violations.length === 0;
    
    return {
      isValid,
      violations,
      warnings,
      score
    };
  }
  
  /**
   * Validates earnings source (no attention-for-payment)
   */
  static validateEarningsSource(sourceType: string, sourceId: string): ValidationResult {
    const violations: string[] = [];
    const warnings: string[] = [];
    let score = 100;
    
    // Only allowed earning sources
    const allowedSources = [
      'event_hosted',
      'user_onboarded',
      'creator_onboarded',
      'ticket_revenue'
    ];
    
    if (!allowedSources.includes(sourceType)) {
      violations.push(`Invalid earnings source: ${sourceType}`);
      score -= 100;
    }
    
    // Forbidden earning patterns
    const forbiddenSourcePatterns = [
      'personal_attention',
      'romantic_interaction',
      'private_meeting',
      'exclusive_access',
      'companionship',
      'date'
    ];
    
    for (const pattern of forbiddenSourcePatterns) {
      if (sourceType.includes(pattern)) {
        violations.push(`Forbidden earnings pattern: ${pattern}`);
        score -= 100;
      }
    }
    
    const isValid = violations.length === 0;
    
    return {
      isValid,
      violations,
      warnings,
      score
    };
  }
}