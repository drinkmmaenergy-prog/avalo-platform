/**
 * PACK 297 - Rate Limit Configuration
 * 
 * Extends existing rateLimit.ts with PACK 297 specific limits
 * NO ECONOMIC CHANGES - only protects against abuse
 */

import { RateLimitRuleConfig } from './rateLimit.js';

/**
 * PACK 297 Rate Limit Configuration
 * These values define the abuse protection thresholds
 */
export const PACK_297_RATE_LIMITS: Record<string, RateLimitRuleConfig> = {
  // Authentication & Login
  'auth:login': {
    perIp: {
      perHour: 50
    },
    perUser: {
      perHour: 20
    },
    hardLimit: true,
    escalateThresholdPerDay: 100
  },
  
  // Chat & Messaging
  'chat:sendMessage': {
    perUser: {
      perMinute: 60,
      perHour: 500
    },
    hardLimit: false,
    escalateThresholdPerDay: 2000
  },
  
  'chat:uploadMedia': {
    perUser: {
      perHour: 30,
      perDay: 100
    },
    hardLimit: true
  },
  
  // Swipe & Discovery
  'swipe:action': {
    perUser: {
      perDay: 50 // Business rule limit
    },
    hardLimit: false // Soft limit - users can still use app
  },
  
  'swipe:extraPerHour': {
    perUser: {
      perHour: 10 // Additional swipes while app is open
    },
    hardLimit: false
  },
  
  'discovery:search': {
    perUser: {
      perHour: 60
    },
    perIp: {
      perHour: 200
    },
    hardLimit: false,
    escalateThresholdPerDay: 500
  },
  
  // Calendar & Events
  'calendar:createBooking': {
    perUser: {
      perDay: 20
    },
    hardLimit: true
  },
  
  'calendar:cancelBooking': {
    perUser: {
      perDay: 10
    },
    hardLimit: false
  },
  
  'events:purchaseTicket': {
    perUser: {
      perDay: 50
    },
    hardLimit: true
  },
  
  // Wallet & Payments
  'wallet:purchaseTokens': {
    perUser: {
      perDay: 10
    },
    hardLimit: true
  },
  
  'wallet:requestPayout': {
    perUser: {
      perDay: 3
    },
    hardLimit: true
  },
  
  // Safety & Reporting
  'safety:reportUser': {
    perUser: {
      perDay: 20
    },
    hardLimit: false,
    escalateThresholdPerDay: 50
  },
  
  'safety:panicButton': {
    perUser: {
      perDay: 5
    },
    hardLimit: false
  },
  
  'safety:blockUser': {
    perUser: {
      perDay: 50
    },
    hardLimit: false
  },
  
  // Profile & Settings
  'profile:update': {
    perUser: {
      perHour: 10,
      perDay: 50
    },
    hardLimit: false
  },
  
  'profile:uploadPhoto': {
    perUser: {
      perDay: 20
    },
    hardLimit: true
  },
  
  // API Rate Limits
  'api:general': {
    perUser: {
      perMinute: 100,
      perHour: 1000
    },
    perIp: {
      perMinute: 200,
      perHour: 2000
    },
    hardLimit: false,
    escalateThresholdPerDay: 10000
  }
};

/**
 * Anti-Scraping & Enumeration Limits
 */
export const ANTI_SCRAPING_LIMITS = {
  maxResultsPerPage: 50,
  maxPagesPerSession: 20,
  minDelayBetweenRequests: 100, // milliseconds
  maxProfileViewsPerHour: 100,
  maxProfileViewsPerDay: 500
};

/**
 * Get rate limit config for a specific action
 */
export function getRateLimitConfig(action: string): RateLimitRuleConfig | undefined {
  return PACK_297_RATE_LIMITS[action];
}

/**
 * Check if action requires rate limiting
 */
export function requiresRateLimit(action: string): boolean {
  return action in PACK_297_RATE_LIMITS;
}