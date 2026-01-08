/**
 * PACK 199: Regional Compliance Resolution Functions
 * Core logic for resolving and applying regional compliance rules
 */

import { db } from '../init';
import {
  RegionCode,
  RegionalRule,
  RegionalComplianceResult,
  UserRegionalProfile,
  IMMUTABLE_CORE,
  DEFAULT_COMPLIANCE_CONFIG,
  RegionalComplianceConfig,
} from './types';
import { REGIONAL_RULES } from './regional-rules';
import { Timestamp } from 'firebase-admin/firestore';

export class ComplianceResolver {
  private config: RegionalComplianceConfig;

  constructor(config?: Partial<RegionalComplianceConfig>) {
    this.config = { ...DEFAULT_COMPLIANCE_CONFIG, ...config };
  }

  async detectUserRegion(userId: string, ip?: string): Promise<RegionCode> {
    const userProfileRef = db
      .collection('regional_user_profiles')
      .doc(userId);
    
    const profileDoc = await userProfileRef.get();
    
    if (profileDoc.exists) {
      const profile = profileDoc.data() as UserRegionalProfile;
      return profile.regionCode;
    }

    if (ip && this.config.geoIPEnabled) {
      const detectedRegion = await this.geoIPLookup(ip);
      
      await userProfileRef.set({
        userId,
        regionCode: detectedRegion,
        countryCode: this.getCountryCodeFromRegion(detectedRegion),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        language: 'en',
        detectedAt: Timestamp.now(),
        legalPacketsAccepted: {},
        complianceStatus: 'pending',
      } as UserRegionalProfile);
      
      return detectedRegion;
    }

    return this.config.defaultRegion;
  }

  private async geoIPLookup(ip: string): Promise<RegionCode> {
    const countryCode = await this.getCountryFromIP(ip);
    return this.mapCountryToRegion(countryCode);
  }

  private async getCountryFromIP(ip: string): Promise<string> {
    return 'XX';
  }

  private mapCountryToRegion(countryCode: string): RegionCode {
    const euCountries = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'];
    
    if (euCountries.includes(countryCode)) return 'EU';
    if (countryCode === 'US') return 'US';
    if (countryCode === 'GB') return 'UK';
    if (countryCode === 'BR') return 'BR';
    if (countryCode === 'AE') return 'AE';
    if (countryCode === 'SA') return 'SA';
    if (countryCode === 'JP') return 'JP';
    if (countryCode === 'KR') return 'KR';
    if (countryCode === 'IN') return 'IN';
    if (countryCode === 'AU') return 'AU';
    
    return 'OTHER';
  }

  private getCountryCodeFromRegion(region: RegionCode): string {
    const mapping: Record<RegionCode, string> = {
      US: 'US',
      EU: 'EU',
      UK: 'GB',
      BR: 'BR',
      AE: 'AE',
      SA: 'SA',
      JP: 'JP',
      KR: 'KR',
      IN: 'IN',
      AU: 'AU',
      OTHER: 'XX',
    };
    return mapping[region];
  }

  async getRegionalRules(regionCode: RegionCode): Promise<RegionalRule> {
    const rulesRef = db
      .collection('regional_rules')
      .doc(regionCode);
    
    const rulesDoc = await rulesRef.get();
    
    if (rulesDoc.exists) {
      return rulesDoc.data() as RegionalRule;
    }

    return REGIONAL_RULES[regionCode];
  }

  async resolveRegionalCompliance(
    userId: string,
    action: string,
    context: Record<string, any>
  ): Promise<RegionalComplianceResult> {
    const regionCode = await this.detectUserRegion(userId, context.ip);
    const rules = await this.getRegionalRules(regionCode);

    if (!rules.enabled) {
      return {
        allowed: false,
        regionCode,
        restrictions: ['Region not currently supported'],
        warnings: [],
        requiredActions: ['Contact support'],
        appliedRules: [],
      };
    }

    const result: RegionalComplianceResult = {
      allowed: true,
      regionCode,
      restrictions: [],
      warnings: [],
      requiredActions: [],
      appliedRules: [],
    };

    if (!this.validateImmutableCore(context)) {
      result.allowed = false;
      result.restrictions.push('Core ethical rules violated');
      return result;
    }

    const actionHandlers: Record<string, (r: RegionalRule, c: any) => void> = {
      'create-content': this.checkContentCreation.bind(this),
      'list-marketplace-item': this.checkMarketplaceListing.bind(this),
      'start-stream': this.checkStreamingCompliance.bind(this),
      'send-message': this.checkMessaging.bind(this),
      'financial-transaction': this.checkFinancialCompliance.bind(this),
    };

    const handler = actionHandlers[action];
    if (handler) {
      handler(rules, context);
      result.appliedRules.push(`${action}-compliance`);
    }

    if (this.config.stricterLawWins) {
      await this.applyStricterLaw(result, rules);
    }

    return result;
  }

  private validateImmutableCore(context: any): boolean {
    if (context.userAge && context.userAge < IMMUTABLE_CORE.minimumAge) {
      return false;
    }

    if (context.nsfwMonetization && IMMUTABLE_CORE.nsfwMonetizationAllowed === false) {
      return false;
    }

    if (context.payForRomance && IMMUTABLE_CORE.payForRomanceAllowed === false) {
      return false;
    }

    if (context.escortServices && IMMUTABLE_CORE.escortServicesAllowed === false) {
      return false;
    }

    if (context.gambling && IMMUTABLE_CORE.gamblingAllowed === false) {
      return false;
    }

    return true;
  }

  private checkContentCreation(rules: RegionalRule, context: any): void {
    const contentRules = rules.legalFramework.contentModeration[0];
    
    if (contentRules.modestyRequired && context.revealingContent) {
      throw new Error('Content does not meet regional modesty requirements');
    }

    if (contentRules.defamationSensitivity === 'critical' && context.mentionsIndividuals) {
      throw new Error('Defamation risk too high for this region');
    }
  }

  private checkMarketplaceListing(rules: RegionalRule, context: any): void {
    const restrictions = rules.marketplaceRestrictions;
    
    for (const restriction of restrictions) {
      if (
        restriction.category === context.category &&
        restriction.subcategory === context.subcategory
      ) {
        if (restriction.prohibited) {
          throw new Error(`${context.category}/${context.subcategory} not allowed in this region: ${restriction.reason}`);
        }

        if (restriction.requiresLicense && !context.hasLicense) {
          throw new Error(`License required for ${context.category}/${context.subcategory}`);
        }

        if (restriction.ageRestricted && !context.ageVerified) {
          throw new Error('Age verification required for this item');
        }
      }
    }
  }

  private checkStreamingCompliance(rules: RegionalRule, context: any): void {
    const contentRules = rules.legalFramework.contentModeration[0];
    
    for (const restriction of contentRules.streamingRestrictions) {
      if (context.streamTags?.includes(restriction)) {
        throw new Error(`Streaming content type '${restriction}' not allowed in this region`);
      }
    }
  }

  private checkMessaging(rules: RegionalRule, context: any): void {
    const safetyRules = rules.safetyRules;
    
    for (const safetyRule of safetyRules) {
      if (context.messageContent) {
        const hasProhibited = safetyRule.terminology.prohibited.some(term =>
          context.messageContent.toLowerCase().includes(term.toLowerCase())
        );
        
        if (hasProhibited) {
          throw new Error('Message contains prohibited content for this region');
        }
      }
    }
  }

  private checkFinancialCompliance(rules: RegionalRule, context: any): void {
    const financialRules = rules.legalFramework.financialCompliance[0];
    
    if (context.isCrypto && !financialRules.cryptoAllowed) {
      throw new Error('Cryptocurrency transactions not allowed in this region');
    }

    if (financialRules.kycRequired && !context.kycCompleted) {
      throw new Error('KYC verification required for financial transactions in this region');
    }
  }

  private async applyStricterLaw(
    result: RegionalComplianceResult,
    rules: RegionalRule
  ): Promise<void> {
    result.appliedRules.push('stricter-law-principle');
  }

  async applyRegionalUXProfile(userId: string): Promise<any> {
    const regionCode = await this.detectUserRegion(userId);
    const rules = await this.getRegionalRules(regionCode);

    const uxProfile = {
      regionCode,
      onboarding: rules.uxAdaptations.filter(a => a.type === 'onboarding'),
      legalPopups: rules.uxAdaptations.filter(a => a.type === 'legal-popup'),
      tutorials: rules.uxAdaptations.filter(a => a.type === 'tutorial'),
      resources: this.getSafetyResources(rules),
      warnings: rules.uxAdaptations.filter(a => a.type === 'warning'),
    };

    return uxProfile;
  }

  private getSafetyResources(rules: RegionalRule): any[] {
    const resources: any[] = [];

    for (const safetyRule of rules.safetyRules) {
      for (const authority of safetyRule.localAuthorities) {
        resources.push({
          type: authority.type,
          name: authority.name,
          phone: authority.phone,
          website: authority.website,
          available24x7: authority.available24x7,
        });
      }
    }

    return resources;
  }
}

export async function resolveRegionalCompliance(
  userId: string,
  action: string,
  context: Record<string, any>
): Promise<RegionalComplianceResult> {
  const resolver = new ComplianceResolver();
  return resolver.resolveRegionalCompliance(userId, action, context);
}

export async function applyRegionalUXProfile(userId: string): Promise<any> {
  const resolver = new ComplianceResolver();
  return resolver.applyRegionalUXProfile(userId);
}

export async function detectLocalizationAbuse(
  userId: string,
  reportedAction: string
): Promise<boolean> {
  const regionCode = await new ComplianceResolver().detectUserRegion(userId);
  const rules = await new ComplianceResolver().getRegionalRules(regionCode);

  const forbiddenPatterns = [
    'dating-by-culture',
    'race-preference',
    'nationality-filter',
    'exotic-fetish',
    'colonial-dynamic',
    'sexualization-by-region',
  ];

  const isAbuse = forbiddenPatterns.some(pattern =>
    reportedAction.toLowerCase().includes(pattern)
  );

  if (isAbuse) {
    await db
      .collection('regional_compliance_violations')
      .add({
        userId,
        regionCode,
        violationType: 'localization-abuse',
        action: reportedAction,
        timestamp: Timestamp.now(),
        autoBlocked: true,
      });
  }

  return isAbuse;
}