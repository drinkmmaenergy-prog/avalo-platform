/**
 * PACK 303 — Creator Earnings Dashboard & Monthly Statements
 * Main export file
 * 
 * @package avaloapp
 * @version 1.0.0
 */

// Export all types
export * from './types/pack303-creator-earnings.types';

// Export services
export {
  getEarningsDashboard,
  getMonthlyStatement,
  hasEarningsCapability,
  getAvailableEarningsMonths,
  logStatementAudit,
  getUserAuditLogs,
} from './pack303-earnings-service';

export {
  aggregateUserMonthlyEarnings,
  runMonthlyAggregation,
  backfillAggregation,
} from './pack303-aggregation';

export {
  exportStatement,
  exportStatementCSV,
  exportStatementPDF,
} from './pack303-statement-export';

// Export endpoints
export {
  getEarningsDashboardCallable,
  getMonthlyStatementCallable,
  exportStatementCallable,
  checkEarningsCapabilityCallable,
  adminTriggerAggregation,
  adminBackfillAggregation,
  adminViewUserEarnings,
  cronDailyEarningsAggregation,
  httpTriggerAggregation,
} from './pack303-endpoints';