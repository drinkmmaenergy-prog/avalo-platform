/**
 * PACK 442 — Pricing Elasticity Model
 * Dynamic pricing based on demand elasticity
 */

export interface ElasticityConfig {
  basePrice?: number;
  minPrice?: number;
  maxPrice?: number;
  elasticityCoefficient?: number;
  [key: string]: any;
}

export interface ElasticityResult {
  recommendedPrice?: number;
  elasticity?: number;
  demandForecast?: number;
  revenueImpact?: number;
  [key: string]: any;
}

export interface PricingSegment {
  segmentId?: string;
  name?: string;
  elasticity?: number;
  priceMultiplier?: number;
  [key: string]: any;
}

export const pricingElasticityModel = {
  /**
   * Calculate optimal price based on elasticity
   */
  calculateOptimalPrice(
    basePrice: number,
    elasticity: number,
    demandChange: number
  ): number {
    // Price elasticity formula: % change in quantity / % change in price
    const priceAdjustment = demandChange / elasticity;
    return basePrice * (1 + priceAdjustment);
  },

  /**
   * Estimate demand at a given price point
   */
  estimateDemand(
    currentDemand: number,
    currentPrice: number,
    newPrice: number,
    elasticity: number
  ): number {
    const priceChange = (newPrice - currentPrice) / currentPrice;
    const demandChange = priceChange * elasticity;
    return currentDemand * (1 - demandChange);
  },

  /**
   * Calculate revenue impact of price change
   */
  calculateRevenueImpact(
    currentPrice: number,
    newPrice: number,
    currentDemand: number,
    elasticity: number
  ): number {
    const newDemand = this.estimateDemand(currentDemand, currentPrice, newPrice, elasticity);
    const currentRevenue = currentPrice * currentDemand;
    const newRevenue = newPrice * newDemand;
    return newRevenue - currentRevenue;
  },

  /**
   * Get pricing recommendation for a segment
   */
  async getRecommendation(
    segmentId: string,
    config: ElasticityConfig
  ): Promise<ElasticityResult> {
    // Placeholder implementation
    return {
      recommendedPrice: config.basePrice || 100,
      elasticity: config.elasticityCoefficient || 1.0,
      demandForecast: 1000,
      revenueImpact: 0,
    };
  },

  /**
   * Get elasticity curve data for a cohort/region/channel combination
   */
  async getElasticityCurve(params: {
    cohort: string;
    region: string;
    channel: string;
  }): Promise<Array<{ price: number; demand: number; revenue: number; ltv: number }>> {
    // Return sample elasticity curve data points
    const basePrice = 10;
    const baseDemand = 1000;
    const elasticity = 1.2;
    
    return [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0].map(multiplier => {
      const price = basePrice * multiplier;
      const demand = this.estimateDemand(baseDemand, basePrice, price, elasticity);
      return {
        price,
        demand,
        revenue: price * demand,
        ltv: price * demand * 12, // Annualized
      };
    });
  },

  /**
   * Calculate price sensitivity for a cohort/region/channel combination
   */
  async calculatePriceSensitivity(params: {
    cohort: string;
    region: string;
    channel: string;
  }): Promise<{ optimalPrice: number; elasticity: number; confidence: number }> {
    // Return default sensitivity with optimal price calculation
    return {
      optimalPrice: 10.0, // Default optimal price
      elasticity: 1.0, // Default elasticity (1.0 = neutral)
      confidence: 0.8, // Default confidence level
    };
  },

  /**
   * Predict conversion rate at a given price point
   * Supports both (price) and (params, price) signatures
   */
  predictConversionAtPrice(
    paramsOrPrice: number | { cohort: string; region: string; channel: string },
    price?: number
  ): { predictedConversionRate: number; predictedRevenue: number } {
    // Handle both signatures
    const actualPrice = typeof paramsOrPrice === 'number' ? paramsOrPrice : (price ?? 0);
    // Simple conversion prediction based on price
    // Higher prices = lower conversion
    const predictedConversionRate = Math.max(0, 1 - (actualPrice / 100) * 0.5);
    const predictedRevenue = actualPrice * predictedConversionRate * 1000; // Assume 1000 potential customers
    return { predictedConversionRate, predictedRevenue };
  },
};

export default pricingElasticityModel;
