import * as admin from 'firebase-admin';

export interface RegionalPricing {
  region: string;
  currency: string;
  basePrice: number;
  vatRate: number;
  vatInclusive: boolean;
  legalMinimum?: number;
  volatilityBuffer: number; // Percentage buffer for currency volatility
  priceWithVAT: number;
  priceWithBuffer: number;
}

export interface ComplianceCheck {
  compliant: boolean;
  adjustedPrice?: number;
  reason?: string;
  requiredChanges?: string[];
}

export class RegionalPriceComplianceAdapter {
  private db: admin.firestore.Firestore;
  private exchangeRateCache: Map<string, { rate: number; timestamp: number }>;
  private readonly CACHE_DURATION = 3600000; // 1 hour

  constructor() {
    this.db = admin.firestore();
    this.exchangeRateCache = new Map();
  }

  /**
   * Calculate region-aware pricing with VAT and compliance
   */
  async calculateRegionalPrice(
    basePrice: number,
    region: string,
    baseCurrency: string = 'USD'
  ): Promise<RegionalPricing> {
    const regionalConfig = await this.getRegionalConfig(region);
    
    // Convert price to local currency
    const exchangeRate = await this.getExchangeRate(baseCurrency, regionalConfig.currency);
    let localPrice = basePrice * exchangeRate;

    // Apply volatility buffer
    const bufferMultiplier = 1 + regionalConfig.volatilityBuffer / 100;
    const priceWithBuffer = localPrice * bufferMultiplier;

    // Calculate VAT
    let priceWithVAT: number;
    if (regionalConfig.vatInclusive) {
      priceWithVAT = priceWithBuffer * (1 + regionalConfig.vatRate / 100);
    } else {
      priceWithVAT = priceWithBuffer;
    }

    // Check legal minimum
    if (regionalConfig.legalMinimum && priceWithVAT < regionalConfig.legalMinimum) {
      priceWithVAT = regionalConfig.legalMinimum;
    }

    return {
      region,
      currency: regionalConfig.currency,
      basePrice,
      vatRate: regionalConfig.vatRate,
      vatInclusive: regionalConfig.vatInclusive,
      legalMinimum: regionalConfig.legalMinimum,
      volatilityBuffer: regionalConfig.volatilityBuffer,
      priceWithVAT: this.roundPrice(priceWithVAT, regionalConfig.currency),
      priceWithBuffer: this.roundPrice(priceWithBuffer, regionalConfig.currency),
    };
  }

  /**
   * Check price compliance for region
   */
  async checkPriceCompliance(
    price: number,
    region: string
  ): Promise<ComplianceCheck> {
    const regionalConfig = await this.getRegionalConfig(region);
    const requiredChanges: string[] = [];

    // Check legal minimum
    if (regionalConfig.legalMinimum && price < regionalConfig.legalMinimum) {
      return {
        compliant: false,
        adjustedPrice: regionalConfig.legalMinimum,
        reason: `Price ${price} is below legal minimum ${regionalConfig.legalMinimum} for ${region}`,
        requiredChanges: [`Increase price to ${regionalConfig.legalMinimum}`],
      };
    }

    // Check VAT application (from PACK 296 compliance)
    if (regionalConfig.vatInclusive) {
      const priceWithoutVAT = price / (1 + regionalConfig.vatRate / 100);
      if (Math.abs(priceWithoutVAT * (1 + regionalConfig.vatRate / 100) - price) > 0.01) {
        requiredChanges.push('VAT must be properly included in price');
      }
    }

    // Check currency-specific pricing rules
    const currencyRules = await this.getCurrencyRules(regionalConfig.currency);
    if (currencyRules.minPrice && price < currencyRules.minPrice) {
      return {
        compliant: false,
        adjustedPrice: currencyRules.minPrice,
        reason: `Price ${price} is below currency minimum ${currencyRules.minPrice}`,
        requiredChanges: [`Increase price to ${currencyRules.minPrice}`],
      };
    }

    // Check price ending rules (psychological pricing)
    const roundedPrice = this.roundPrice(price, regionalConfig.currency);
    if (Math.abs(roundedPrice - price) > 0.01) {
      requiredChanges.push(`Round price to ${roundedPrice} for better conversion`);
    }

    return {
      compliant: requiredChanges.length === 0,
      adjustedPrice: requiredChanges.length > 0 ? roundedPrice : undefined,
      requiredChanges: requiredChanges.length > 0 ? requiredChanges : undefined,
    };
  }

  /**
   * Get regional configuration
   */
  private async getRegionalConfig(region: string): Promise<{
    currency: string;
    vatRate: number;
    vatInclusive: boolean;
    legalMinimum?: number;
    volatilityBuffer: number;
  }> {
    const doc = await this.db.collection('regional_pricing_config').doc(region).get();

    if (!doc.exists) {
      // Default configuration
      return {
        currency: 'USD',
        vatRate: 0,
        vatInclusive: false,
        volatilityBuffer: 5, // 5% buffer
      };
    }

    return doc.data() as any;
  }

  /**
   * Get exchange rate with caching
   */
  private async getExchangeRate(from: string, to: string): Promise<number> {
    if (from === to) return 1.0;

    const cacheKey = `${from}_${to}`;
    const cached = this.exchangeRateCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.rate;
    }

    // Fetch from database (would be updated by external service)
    const doc = await this.db.collection('exchange_rates').doc(cacheKey).get();

    let rate = 1.0;
    if (doc.exists) {
      rate = doc.data()?.rate || 1.0;
    }

    // Cache the rate
    this.exchangeRateCache.set(cacheKey, {
      rate,
      timestamp: Date.now(),
    });

    return rate;
  }

  /**
   * Get currency-specific rules
   */
  private async getCurrencyRules(currency: string): Promise<{
    minPrice?: number;
    roundingRule: 'nearest' | 'up' | 'down' | 'psychological';
    decimalPlaces: number;
  }> {
    const doc = await this.db.collection('currency_rules').doc(currency).get();

    if (!doc.exists) {
      return {
        roundingRule: 'psychological',
        decimalPlaces: 2,
      };
    }

    return doc.data() as any;
  }

  /**
   * Round price according to currency rules
   */
  private roundPrice(price: number, currency: string): number {
    // Psychological pricing rules by currency
    const psychologicalEndings: Record<string, number[]> = {
      USD: [0.99, 0.95, 0.49],
      EUR: [0.99, 0.95, 0.49],
      GBP: [0.99, 0.95, 0.49],
      JPY: [0, 900, 800], // Yen doesn't use decimal places
      INR: [0, 999, 499],
    };

    const endings = psychologicalEndings[currency] || [0.99, 0.95, 0.49];

    if (currency === 'JPY' || currency === 'KRW') {
      // No decimal places for these currencies
      const rounded = Math.round(price / 100) * 100;
      return rounded;
    }

    // Find nearest psychological ending
    const wholePart = Math.floor(price);
    const decimalPart = price - wholePart;

    let bestEnding = endings[0];
    let minDiff = Math.abs(decimalPart - endings[0]);

    for (const ending of endings) {
      const diff = Math.abs(decimalPart - ending);
      if (diff < minDiff) {
        minDiff = diff;
        bestEnding = ending;
      }
    }

    return wholePart + bestEnding;
  }

  /**
   * Get all regional prices for a base price
   */
  async getAllRegionalPrices(
    basePrice: number,
    baseCurrency: string = 'USD'
  ): Promise<RegionalPricing[]> {
    const regionsSnapshot = await this.db.collection('regional_pricing_config').get();
    const regionalPrices: RegionalPricing[] = [];

    for (const doc of regionsSnapshot.docs) {
      const regionalPrice = await this.calculateRegionalPrice(
        basePrice,
        doc.id,
        baseCurrency
      );
      regionalPrices.push(regionalPrice);
    }

    return regionalPrices;
  }

  /**
   * Update regional configuration
   */
  async updateRegionalConfig(
    region: string,
    config: {
      currency?: string;
      vatRate?: number;
      vatInclusive?: boolean;
      legalMinimum?: number;
      volatilityBuffer?: number;
    }
  ): Promise<void> {
    await this.db
      .collection('regional_pricing_config')
      .doc(region)
      .set(config, { merge: true });
  }

  /**
   * Update exchange rate
   */
  async updateExchangeRate(from: string, to: string, rate: number): Promise<void> {
    const cacheKey = `${from}_${to}`;
    
    await this.db.collection('exchange_rates').doc(cacheKey).set({
      from,
      to,
      rate,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Clear cache
    this.exchangeRateCache.delete(cacheKey);
  }

  /**
   * Check if regional config is compliant with PACK 296
   */
  async checkRegionalCompliance(region: string): Promise<{
    compliant: boolean;
    issues: string[];
  }> {
    const config = await this.getRegionalConfig(region);
    const issues: string[] = [];

    // Check if VAT is configured for EU regions
    const euRegions = ['DE', 'FR', 'IT', 'ES', 'NL', 'PL', 'BE', 'AT', 'SE', 'DK'];
    if (euRegions.includes(region)) {
      if (!config.vatInclusive) {
        issues.push('EU regions must have VAT-inclusive pricing');
      }
      if (config.vatRate === 0) {
        issues.push('EU regions must have VAT rate configured');
      }
    }

    // Check currency alignment
    const currencyDoc = await this.db.collection('currency_rules').doc(config.currency).get();
    if (!currencyDoc.exists) {
      issues.push(`Currency rules not configured for ${config.currency}`);
    }

    // Check legal minimum is reasonable
    if (config.legalMinimum && config.legalMinimum < 0.5) {
      issues.push('Legal minimum price seems unreasonably low');
    }

    return {
      compliant: issues.length === 0,
      issues,
    };
  }

  /**
   * Get tax breakdown for transparency
   */
  async getTaxBreakdown(
    price: number,
    region: string
  ): Promise<{
    basePrice: number;
    vatAmount: number;
    totalPrice: number;
    currency: string;
  }> {
    const config = await this.getRegionalConfig(region);

    let basePrice: number;
    let vatAmount: number;
    let totalPrice: number;

    if (config.vatInclusive) {
      // Price includes VAT, extract it
      totalPrice = price;
      basePrice = price / (1 + config.vatRate / 100);
      vatAmount = totalPrice - basePrice;
    } else {
      // Price doesn't include VAT
      basePrice = price;
      vatAmount = price * (config.vatRate / 100);
      totalPrice = basePrice + vatAmount;
    }

    return {
      basePrice: this.roundPrice(basePrice, config.currency),
      vatAmount: this.roundPrice(vatAmount, config.currency),
      totalPrice: this.roundPrice(totalPrice, config.currency),
      currency: config.currency,
    };
  }
}

export const regionalPriceComplianceAdapter = new RegionalPriceComplianceAdapter();
