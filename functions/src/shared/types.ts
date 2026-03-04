/**
 * Shared Types
 */

export interface AlertConfig {
  severity: 'low' | 'medium' | 'high' | 'critical';
  channel?: string;
  throttleMs?: number;
}

export interface Alert {
  id: string;
  type: string;
  message: string;
  severity: AlertConfig['severity'];
  timestamp: Date;
  metadata?: Record<string, any>;
}

export type AlertHandler = (alert: Alert) => Promise<void>;









