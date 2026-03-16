export async function getEarnerMetrics(..._args:any[]):Promise<Record<string,unknown>>{return{}}
export async function getCreatorMetrics(..._args:any[]):Promise<Record<string,unknown>>{return{}}
export type EarnerMetricsSnapshot=Record<string,unknown>

export {
  trackCreatorExposure,
  trackCreatorEngagement,
  trackCreatorChatEarnings,
  trackCreatorCalendarEarnings,
  aggregateCreatorMetrics,
  calculateCreatorTrends,
} from './creatorMetrics';
