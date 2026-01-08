/**
 * PACK 149: Global Tax Engine & Compliance Hub
 * Main Export File
 */

export * from './types';
export * from './tax-rules';
export * from './tax-profile';
export * from './tax-calculation';
export * from './tax-reporting';

export {
  registerTaxProfile,
  getTaxProfile,
  updateTaxProfile,
  lockTaxProfileIfFraudSuspected,
  unlockTaxProfile,
  submitKYCDocuments,
  verifyTaxProfile,
  checkPayoutEligibility
} from './tax-profile';

export {
  calculateTaxLiability,
  getRevenueDataForPeriod,
  generateAnonymizedRevenueSources,
  getTaxLiabilitiesForYear,
  calculateYearlyTaxSummary,
  recalculateTaxLiabilityForPeriod
} from './tax-calculation';

export {
  generateTaxReport,
  exportTaxReport,
  getTaxReportsForUser
} from './tax-reporting';

export {
  getComplianceRequirements,
  getVATRate,
  getGSTRate,
  getDigitalServicesTaxThreshold,
  getReportType,
  hasDoubleTaxTreaty,
  calculateVATLiability,
  calculateGSTLiability,
  validateTaxProfile
} from './tax-rules';