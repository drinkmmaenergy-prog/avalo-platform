export type RealtimeResult<T> = {
  data: T[];
  loading: boolean;
};

export interface RealtimeIncident {
  id: string;
  category?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  snippet?: string;
  timestamp?: string | { toMillis: () => number };
  contentId?: string;
  userId?: string;
  username?: string;
  status?: string;
  reportedBy?: string;
  description?: string;
  contentType?: string;
  contentSnippet?: string;
}

export function useRealtimeIncidents(limit: number): {
  incidents: RealtimeIncident[];
  loading: boolean;
} {
  return {
    incidents: [],
    loading: false,
  };
}

export function useRealtimeAppeals(limit: number): {
  appeals: any[];
  loading: boolean;
} {
  return {
    appeals: [],
    loading: false,
  };
}

export function useOnlineModerators(): {
  moderators: any[];
  loading: boolean;
} {
  return {
    moderators: [],
    loading: false,
  };
}

export function useAlertCounts(): {
  alerts: number;
  loading: boolean;
  newIncidentsCount: number;
  newAppealsCount: number;
  criticalCount: number;
  highCount: number;
} {
  return {
    alerts: 0,
    loading: false,
    newIncidentsCount: 0,
    newAppealsCount: 0,
    criticalCount: 0,
    highCount: 0,
  };
}

export function sortByPriority<T>(items: T[]): T[] {
  return items;
}
