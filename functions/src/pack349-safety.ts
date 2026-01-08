/**
 * PACK 349 - Ad Safety & Compliance Gate
 * Validates all ads before going live
 */

import { AvaloAd, BrandCampaign, AdSafetyCheckResult, AD_CONSTANTS } from './pack349-types';

/**
 * Comprehensive Ad Safety Validator
 * All ads must pass these checks before activation
 */
export class AdSafetyGate {
  /**
   * Main validation entry point
   */
  static async validateAd(ad: AvaloAd): Promise<AdSafetyCheckResult> {
    const result: AdSafetyCheckResult = {
      isValid: true,
      violations: [],
      requiresManualReview: false,
      risk: 'low',
      flags: {
        datingManipulation: false,
        scamWording: false,
        adultContent: false,
        politicalContent: false,
        religiousContent: false,
        medicalClaims: false,
        ageInappropriate: false,
      },
    };

    // Age gate check
    if (ad.ageGate < AD_CONSTANTS.MIN_AGE_GATE) {
      result.violations.push(`Age gate must be ${AD_CONSTANTS.MIN_AGE_GATE}+`);
      result.isValid = false;
      result.flags.ageInappropriate = true;
    }

    // Content checks
    const textContent = `${ad.headline} ${ad.description}`.toLowerCase();

    // Check for dating manipulation
    if (this.hasDatingManipulation(textContent)) {
      result.violations.push('Contains dating manipulation tactics');
      result.flags.datingManipulation = true;
      result.requiresManualReview = true;
    }

    // Check for scam wording
    if (this.hasScamWording(textContent)) {
      result.violations.push('Contains scam or deceptive wording');
      result.flags.scamWording = true;
      result.requiresManualReview = true;
    }

    // Check for escort/adult content
    if (this.hasEscortContent(textContent)) {
      result.violations.push('Contains escort or adult service content');
      result.isValid = false;
      result.flags.adultContent = true;
    }

    // Check for political content
    if (this.hasPoliticalContent(textContent)) {
      result.violations.push('Contains political content (not allowed)');
      result.isValid = false;
      result.flags.politicalContent = true;
    }

    // Check for religious content
    if (this.hasReligiousContent(textContent)) {
      result.violations.push('Contains religious content (not allowed)');
      result.isValid = false;
      result.flags.religiousContent = true;
    }

    // Check for medical misinformation
    if (this.hasMedicalClaims(textContent)) {
      result.violations.push('Contains unverified medical claims');
      result.isValid = false;
      result.flags.medicalClaims = true;
    }

    // URL safety check
    if (ad.targetUrl && !this.isSafeUrl(ad.targetUrl)) {
      result.violations.push('Target URL appears unsafe or suspicious');
      result.requiresManualReview = true;
    }

    // Determine risk level
    result.risk = this.calculateRiskLevel(result.flags);

    // Mark invalid if critical violations
    if (result.risk === 'critical') {
      result.isValid = false;
    }

    return result;
  }

  /**
   * Validate brand campaign
   */
  static async validateCampaign(campaign: BrandCampaign): Promise<AdSafetyCheckResult> {
    const result: AdSafetyCheckResult = {
      isValid: true,
      violations: [],
      requiresManualReview: false,
      risk: 'low',
      flags: {
        datingManipulation: false,
        scamWording: false,
        adultContent: false,
        politicalContent: false,
        religiousContent: false,
        medicalClaims: false,
        ageInappropriate: false,
      },
    };

    // Check brand name
    const brandName = campaign.brandName.toLowerCase();
    if (this.hasScamWording(brandName) || this.hasEscortContent(brandName)) {
      result.violations.push('Brand name contains prohibited content');
      result.isValid = false;
    }

    // Check if campaigns are too aggressive
    if (campaign.maxSpendTokens > 1000000) {
      result.requiresManualReview = true;
      result.violations.push('High-budget campaign requires manual approval');
    }

    return result;
  }

  /**
   * Dating Manipulation Detection
   * Patterns that could manipulate users into relationships
   */
  private static hasDatingManipulation(text: string): boolean {
    const manipulationPatterns = [
      /guaranteed (match|date|love|relationship)/i,
      /100% success rate/i,
      /find your soulmate in \d+ (days|hours|minutes)/i,
      /secret (trick|method|formula) to (attract|seduce|get)/i,
      /make (him|her|them) fall in love/i,
      /guaranteed to make you irresistible/i,
      /scientifically proven to attract/i,
    ];

    return manipulationPatterns.some(pattern => pattern.test(text));
  }

  /**
   * Scam Wording Detection
   */
  private static hasScamWording(text: string): boolean {
    const scamPatterns = [
      /act now|urgent|limited time|expires (soon|today)/i,
      /click here to (win|claim|receive|get free)/i,
      /you('ve| have) been (selected|chosen|picked)/i,
      /congratulations! you('ve| have) won/i,
      /deposit.*withdraw.*profit/i,
      /guaranteed (money|income|profit|earnings)/i,
      /work from home.*earn \$\d+/i,
      /too good to be true/i,
      /risk-free|no risk|100% guarantee/i,
      /wire transfer|western union|bitcoin|crypto wallet/i,
    ];

    return scamPatterns.some(pattern => pattern.test(text));
  }

  /**
   * Escort/Adult Content Detection
   */
  private static hasEscortContent(text: string): boolean {
    const escortPatterns = [
      /escort service/i,
      /sugar (daddy|mommy|baby)/i,
      /compensated dating/i,
      /pay.*meet/i,
      /outcall|incall/i,
      /hourly rate|nightly rate/i,
      /discreet encounter/i,
      /adult entertainment/i,
      /GFE|girlfriend experience/i,
    ];

    return escortPatterns.some(pattern => pattern.test(text));
  }

  /**
   * Political Content Detection
   */
  private static hasPoliticalContent(text: string): boolean {
    const politicalPatterns = [
      /vote for|support (candidate|party|politician)/i,
      /election|campaign|ballot|referendum/i,
      /political (party|movement|agenda)/i,
      /democrat|republican|liberal|conservative/i,
      /left-wing|right-wing/i,
      /socialist|capitalist|communist/i,
    ];

    return politicalPatterns.some(pattern => pattern.test(text));
  }

  /**
   * Religious Content Detection
   */
  private static hasReligiousContent(text: string): boolean {
    const religiousPatterns = [
      /join our (church|temple|mosque|congregation)/i,
      /religious (group|organization|movement)/i,
      /spiritual awakening|salvation|redemption/i,
      /convert to|accept (jesus|allah|god|christ)/i,
      /tithe|offering|donation to (church|religious)/i,
    ];

    return religiousPatterns.some(pattern => pattern.test(text));
  }

  /**
   * Medical Claims Detection
   */
  private static hasMedicalClaims(text: string): boolean {
    const medicalPatterns = [
      /cure|treat|prevent (disease|illness|condition)/i,
      /clinically proven|fda approved/i,
      /lose \d+ (pounds|kg|lbs) in \d+ days/i,
      /miracle (cure|treatment|drug|supplement)/i,
      /no side effects/i,
      /doctor.*recommend/i,
      /medical breakthrough/i,
    ];

    return medicalPatterns.some(pattern => pattern.test(text));
  }

  /**
   * URL Safety Check
   */
  private static isSafeUrl(url: string): boolean {
    try {
      const parsed = new URL(url);

      // Block suspicious TLDs
      const suspiciousTlds = ['.tk', '.ml', '.ga', '.cf', '.gq', '.zip', '.loan'];
      if (suspiciousTlds.some(tld => parsed.hostname.endsWith(tld))) {
        return false;
      }

      // Block IP addresses
      if (/^\d+\.\d+\.\d+\.\d+$/.test(parsed.hostname)) {
        return false;
      }

      // Block non-standard ports
      if (parsed.port && parsed.port !== '80' && parsed.port !== '443') {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Calculate overall risk level
   */
  private static calculateRiskLevel(flags: AdSafetyCheckResult['flags']): 'low' | 'medium' | 'high' | 'critical' {
    let riskScore = 0;

    if (flags.adultContent) riskScore += 4;
    if (flags.politicalContent) riskScore += 4;
    if (flags.religiousContent) riskScore += 4;
    if (flags.medicalClaims) riskScore += 4;
    if (flags.scamWording) riskScore += 3;
    if (flags.datingManipulation) riskScore += 3;
    if (flags.ageInappropriate) riskScore += 5;

    if (riskScore >= 5) return 'critical';
    if (riskScore >= 3) return 'high';
    if (riskScore >= 1) return 'medium';
    return 'low';
  }

  /**
   * Check if content violates any safety rules
   */
  static hasViolations(result: AdSafetyCheckResult): boolean {
    return result.violations.length > 0 || !result.isValid;
  }

  /**
   * Get violation summary
   */
  static getViolationSummary(result: AdSafetyCheckResult): string {
    if (result.violations.length === 0) {
      return 'No violations detected';
    }
    return result.violations.join('; ');
  }
}
