/**
 * PACK 60 — Security Engine
 * Risk evaluation and security decision logic
 */

import { SecurityContext, SecurityDecision, SecuritySettings } from './types/security';

/**
 * Evaluate security context and determine what actions are needed
 */
export function evaluateSecurityContext(
  context: SecurityContext,
  securitySettings: Pick<SecuritySettings, 'twoFactorEnabled' | 'twoFactorMethod' | 'risk'>
): SecurityDecision {
  const decision: SecurityDecision = {
    requireTwoFactor: false,
    requireLogoutOtherSessions: false,
  };

  // If 2FA is enabled, always require it on LOGIN
  if (context.action === 'LOGIN' && securitySettings.twoFactorEnabled) {
    decision.requireTwoFactor = true;
  }

  // For new devices or locations on login, may require 2FA even if not explicitly enabled
  // (future extension for adaptive security)
  if (context.action === 'LOGIN' && (context.isNewDevice || context.isNewLocation)) {
    // In phase 1, only require if 2FA is already enabled
    if (securitySettings.twoFactorEnabled) {
      decision.requireTwoFactor = true;
    }
  }

  // For PAYOUT actions
  if (context.action === 'PAYOUT') {
    if (securitySettings.risk.require2faForPayout && securitySettings.twoFactorEnabled) {
      decision.requireTwoFactor = true;
    }
  }

  // For SETTINGS_CHANGE actions (email, password, payout info, 2FA itself)
  if (context.action === 'SETTINGS_CHANGE') {
    if (securitySettings.risk.require2faForSettingsChange && securitySettings.twoFactorEnabled) {
      decision.requireTwoFactor = true;
    }
  }

  // If multiple suspicious flags, may want to force logout other sessions
  const highRiskFlags = context.riskFlags.filter(flag => 
    flag === 'DEVICE_NEW' || flag === 'LOCATION_NEW' || flag === 'MANY_SESSIONS'
  );
  if (highRiskFlags.length >= 2) {
    decision.requireLogoutOtherSessions = false; // Don't auto-logout in phase 1, just warn
  }

  return decision;
}

/**
 * Check if an IP country/city combination is significantly different from historical patterns
 * This is a simple heuristic - in production would use more sophisticated anomaly detection
 */
export function isNewLocation(
  currentCountry: string | null,
  currentCity: string | null,
  historicalCountries: string[],
  historicalCities: string[]
): boolean {
  if (!currentCountry) return false;
  
  // Check if country has been seen before
  const countryKnown = historicalCountries.includes(currentCountry);
  if (!countryKnown) return true;
  
  // If city is provided, check if that specific city in that country is new
  if (currentCity) {
    const cityKey = `${currentCountry}:${currentCity}`;
    const historicalCityKeys = historicalCities.map((city, i) => 
      `${historicalCountries[i]}:${city}`
    );
    if (!historicalCityKeys.includes(cityKey)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Generate risk flags based on context
 */
export function generateRiskFlags(context: {
  isNewDevice: boolean;
  isNewLocation: boolean;
  activeSessionCount: number;
}): string[] {
  const flags: string[] = [];
  
  if (context.isNewDevice) {
    flags.push('DEVICE_NEW');
  }
  
  if (context.isNewLocation) {
    flags.push('LOCATION_NEW');
  }
  
  if (context.activeSessionCount > 5) {
    flags.push('MANY_SESSIONS');
  }
  
  return flags;
}