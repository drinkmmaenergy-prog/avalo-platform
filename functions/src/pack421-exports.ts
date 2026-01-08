/**
 * PACK 421 — Observability & Health Check Exports
 * 
 * Add these exports to functions/src/index.ts:
 * 
 * import { 
 *   pack421_health_public,
 *   pack421_health_internal,
 *   pack421_health_featureMatrix,
 *   pack421_health_featureMatrix_http,
 * } from './pack421-exports';
 * 
 * export { 
 *   pack421_health_public,
 *   pack421_health_internal,
 *   pack421_health_featureMatrix,
 *   pack421_health_featureMatrix_http,
 * };
 */

// Re-export all health endpoints for convenience
export {
  pack421_health_public,
  pack421_health_internal,
  pack421_health_featureMatrix,
  pack421_health_featureMatrix_http,
} from './pack421-health.controller';

// Optional: Export metrics adapter if needed by other functions
export {
  emitMetric,
  metricCount,
  metricTiming,
  metricGauge,
  metricTimer,
  emitMetricBatch,
  createTaggedEmitter,
  checkMetricsHealth,
} from './pack421-metrics.adapter';

// Optional: Export alert configuration if needed
export {
  ALERT_RULES,
  ALERT_CHANNELS,
  ALERT_RESPONSE_TIMES,
  getAlertsBySeverity,
  getAlertsForMetric,
  evaluateAlertRule,
} from './pack421-alerting.config';
