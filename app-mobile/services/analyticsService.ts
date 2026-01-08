import { getAuth } from 'firebase/auth';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://us-central1-avalo-app.cloudfunctions.net';

interface DashboardResponse {
  period: {
    start: string;
    end: string;
    days: number;
  };
  userKPIs?: any[];
  chatMonetization?: any[];
  calendarEvents?: any[];
  safetyMetrics?: any[];
  fraudMetrics?: any[];
  topCreators?: any[];
  creatorMetrics?: any[];
  personalStats?: any;
  trends?: any;
}

class AnalyticsService {
  private async getAuthToken(): Promise<string> {
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) {
      throw new Error('User not authenticated');
    }
    return await user.getIdToken();
  }

  async getDashboard(days: number = 7): Promise<DashboardResponse> {
    const token = await this.getAuthToken();
    const response = await fetch(`${API_BASE_URL}/getAnalyticsDashboard?days=${days}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch dashboard');
    }

    return await response.json();
  }

  async getCreatorMetrics(creatorId?: string, date?: string): Promise<any> {
    const token = await this.getAuthToken();
    const params = new URLSearchParams();
    if (creatorId) params.append('creatorId', creatorId);
    if (date) params.append('date', date);

    const response = await fetch(`${API_BASE_URL}/getCreatorMetrics?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch creator metrics');
    }

    return await response.json();
  }

  async getSafetyAlerts(severity?: string, limit: number = 50): Promise<any> {
    const token = await this.getAuthToken();
    const params = new URLSearchParams();
    if (severity) params.append('severity', severity);
    params.append('limit', limit.toString());

    const response = await fetch(`${API_BASE_URL}/getSafetyAlerts?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch safety alerts');
    }

    return await response.json();
  }

  async getFraudAlerts(riskLevel?: string, limit: number = 50): Promise<any> {
    const token = await this.getAuthToken();
    const params = new URLSearchParams();
    if (riskLevel) params.append('riskLevel', riskLevel);
    params.append('limit', limit.toString());

    const response = await fetch(`${API_BASE_URL}/getFraudAlerts?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch fraud alerts');
    }

    return await response.json();
  }

  async getRealtimeMetrics(): Promise<any> {
    const token = await this.getAuthToken();
    const response = await fetch(`${API_BASE_URL}/getRealtimeMetrics`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch realtime metrics');
    }

    return await response.json();
  }
}

export const analyticsService = new AnalyticsService();