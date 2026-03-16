/**
 * Compatibility bridge for legacy imports.
 *
 * Canonical source of truth:
 *   - EarningSourceType
 *   - recordEarning
 * lives in ./creatorEarnings
 */
export type { EarningSourceType } from './creatorEarnings';
export { recordEarning } from './creatorEarnings';
