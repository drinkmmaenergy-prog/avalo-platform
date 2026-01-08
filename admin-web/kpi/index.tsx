/**
 * PACK 402 — KPI Monitoring Dashboard
 * 
 * Simple admin dashboard for viewing aggregated KPIs.
 * Read-only, displays last 7 or 30 days of data.
 */

import React, { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth } from 'firebase/auth';

// KPI data types
interface KpiKey {
  date: string;
  hour?: number;
}

interface GrowthKpi {
  key: KpiKey;
  interval: string;
  newUsers: number;
  verifiedUsers: number;
  onboardingStageCounts: Record<string, number>;
  retentionSegmentCounts: Record<string, number>;
}

interface EngagementKpi {
  key: KpiKey;
  interval: string;
  totalSwipes: number;
  uniqueSwipers: number;
  totalMatches: number;
  paidChatsStarted: number;
  paidChatWordsBilled: number;
  voiceMinutes: number;
  videoMinutes: number;
  calendarBookings: number;
  eventsCreated: number;
  eventTickets: number;
  aiChats: number;
  aiVoiceMinutes: number;
}

interface RevenueKpi {
  key: KpiKey;
  interval: string;
  tokenPurchasesCount: number;
  tokenPurchasedTotal: number;
  tokensSpentTotal: number;
  creatorEarningsTokens: number;
  avaloRevenueTokens: number;
  payoutsRequestedTokens: number;
  payoutsApprovedTokens: number;
  payingUsersCount: number;
}

interface SafetyKpi {
  key: KpiKey;
  interval: string;
  abuseReports: number;
  safetyTickets: number;
  criticalSafetyTickets: number;
  accountsFrozen: number;
  accountsBanned: number;
  fraudRiskDistribution: Record<string, number>;
}

interface SupportKpi {
  key: KpiKey;
  interval: string;
  ticketsCreated: number;
  ticketsResolved: number;
  avgFirstResponseMinutes: number | null;
  avgResolveMinutes: number | null;
}

type KpiType = 'growth' | 'engagement' | 'revenue' | 'safety' | 'support';
type KpiInterval = 'day' | 'hour';
type AnyKpi = GrowthKpi | EngagementKpi | RevenueKpi | SafetyKpi | SupportKpi;

/**
 * Main KPI Dashboard Component
 */
export default function KpiDashboard() {
  const [activeTab, setActiveTab] = useState<KpiType>('growth');
  const [interval, setInterval] = useState<KpiInterval>('day');
  const [dateRange, setDateRange] = useState<'7d' | '30d'>('7d');
  const [data, setData] = useState<AnyKpi[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch KPIs when tab, interval, or date range changes
  useEffect(() => {
    fetchKpis();
  }, [activeTab, interval, dateRange]);

  /**
   * Fetch KPIs from Cloud Function
   */
  const fetchKpis = async () => {
    setLoading(true);
    setError(null);

    try {
      const auth = getAuth();
      const user = auth.currentUser;

      if (!user) {
        setError('Not authenticated');
        setLoading(false);
        return;
      }

      const functions = getFunctions();
      const getKpis = httpsCallable(functions, 'pack402_getKpis');

      // Calculate date range
      const toDate = new Date();
      const fromDate = new Date();
      fromDate.setDate(toDate.getDate() - (dateRange === '7d' ? 7 : 30));

      const toDateStr = toDate.toISOString().split('T')[0];
      const fromDateStr = fromDate.toISOString().split('T')[0];

      const result = await getKpis({
        type: activeTab,
        fromDate: fromDateStr,
        toDate: toDateStr,
        interval,
      });

      const response = result.data as any;
      if (response.success) {
        setData(response.data);
      } else {
        setError('Failed to fetch KPIs');
      }
    } catch (err: any) {
      console.error('Error fetching KPIs:', err);
      setError(err.message || 'Failed to fetch KPIs');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Calculate summary stats from data
   */
  const calculateSummary = () => {
    if (data.length === 0) return {};

    switch (activeTab) {
      case 'growth':
        const growthData = data as GrowthKpi[];
        return {
          totalNewUsers: growthData.reduce((sum, d) => sum + d.newUsers, 0),
          totalVerified: growthData.reduce((sum, d) => sum + d.verifiedUsers, 0),
          avgNewUsersPerDay: Math.round(
            growthData.reduce((sum, d) => sum + d.newUsers, 0) / growthData.length
          ),
        };

      case 'engagement':
        const engagementData = data as EngagementKpi[];
        return {
          totalSwipes: engagementData.reduce((sum, d) => sum + d.totalSwipes, 0),
          totalMatches: engagementData.reduce((sum, d) => sum + d.totalMatches, 0),
          totalVoiceMinutes: engagementData.reduce((sum, d) => sum + d.voiceMinutes, 0),
          totalVideoMinutes: engagementData.reduce((sum, d) => sum + d.videoMinutes, 0),
        };

      case 'revenue':
        const revenueData = data as RevenueKpi[];
        return {
          totalTokensPurchased: revenueData.reduce((sum, d) => sum + d.tokenPurchasedTotal, 0),
          totalTokensSpent: revenueData.reduce((sum, d) => sum + d.tokensSpentTotal, 0),
          totalCreatorEarnings: revenueData.reduce((sum, d) => sum + d.creatorEarningsTokens, 0),
          totalAvaloRevenue: revenueData.reduce((sum, d) => sum + d.avaloRevenueTokens, 0),
        };

      case 'safety':
        const safetyData = data as SafetyKpi[];
        return {
          totalAbuseReports: safetyData.reduce((sum, d) => sum + d.abuseReports, 0),
          totalSafetyTickets: safetyData.reduce((sum, d) => sum + d.safetyTickets, 0),
          totalAccountsFrozen: safetyData.reduce((sum, d) => sum + d.accountsFrozen, 0),
          totalAccountsBanned: safetyData.reduce((sum, d) => sum + d.accountsBanned, 0),
        };

      case 'support':
        const supportData = data as SupportKpi[];
        const avgFirstResponse =
          supportData
            .filter((d) => d.avgFirstResponseMinutes !== null)
            .reduce((sum, d) => sum + (d.avgFirstResponseMinutes || 0), 0) /
          supportData.filter((d) => d.avgFirstResponseMinutes !== null).length;
        return {
          totalTicketsCreated: supportData.reduce((sum, d) => sum + d.ticketsCreated, 0),
          totalTicketsResolved: supportData.reduce((sum, d) => sum + d.ticketsResolved, 0),
          avgFirstResponseMinutes: Math.round(avgFirstResponse),
        };

      default:
        return {};
    }
  };

  const summary = calculateSummary();

  return (
    <div className="kpi-dashboard">
      <div className="dashboard-header">
        <h1>KPI Monitoring Dashboard</h1>
        <p className="subtitle">PACK 402 — Global KPI & Monitoring Engine</p>
      </div>

      {/* Tab Navigation */}
      <div className="tab-navigation">
        {(['growth', 'engagement', 'revenue', 'safety', 'support'] as KpiType[]).map((tab) => (
          <button
            key={tab}
            className={`tab-button ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Controls */}
      <div className="dashboard-controls">
        <div className="control-group">
          <label>Interval:</label>
          <select value={interval} onChange={(e) => setInterval(e.target.value as KpiInterval)}>
            <option value="day">Daily</option>
            <option value="hour">Hourly</option>
          </select>
        </div>

        <div className="control-group">
          <label>Range:</label>
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as '7d' | '30d')}
            disabled={interval === 'hour'}
          >
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
          </select>
        </div>

        <button className="refresh-button" onClick={fetchKpis} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="error-banner">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Summary Cards */}
      {!loading && !error && data.length > 0 && (
        <div className="summary-cards">
          {Object.entries(summary).map(([key, value]) => (
            <div key={key} className="summary-card">
              <div className="card-label">
                {key
                  .replace(/([A-Z])/g, ' $1')
                  .replace(/^./, (str) => str.toUpperCase())
                  .trim()}
              </div>
              <div className="card-value">{typeof value === 'number' ? value.toLocaleString() : value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Data Table */}
      {!loading && !error && data.length > 0 && (
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                {interval === 'hour' && <th>Hour</th>}
                {renderTableHeaders()}
              </tr>
            </thead>
            <tbody>
              {data.map((row, idx) => (
                <tr key={idx}>
                  <td>{row.key.date}</td>
                  {interval === 'hour' && <td>{row.key.hour}</td>}
                  {renderTableRow(row)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && data.length === 0 && (
        <div className="empty-state">
          <p>No data available for the selected range.</p>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="loading-state">
          <div className="spinner" />
          <p>Loading KPIs...</p>
        </div>
      )}

      <style jsx>{`
        .kpi-dashboard {
          padding: 24px;
          max-width: 1400px;
          margin: 0 auto;
        }

        .dashboard-header {
          margin-bottom: 32px;
        }

        .dashboard-header h1 {
          font-size: 28px;
          font-weight: 600;
          margin: 0 0 8px 0;
          color: #1a1a1a;
        }

        .subtitle {
          color: #666;
          font-size: 14px;
          margin: 0;
        }

        .tab-navigation {
          display: flex;
          gap: 8px;
          margin-bottom: 24px;
          border-bottom: 2px solid #e0e0e0;
          padding-bottom: 8px;
        }

        .tab-button {
          padding: 12px 24px;
          background: none;
          border: none;
          font-size: 16px;
          font-weight: 500;
          color: #666;
          cursor: pointer;
          transition: all 0.2s;
          border-radius: 8px 8px 0 0;
        }

        .tab-button:hover {
          background: #f5f5f5;
          color: #333;
        }

        .tab-button.active {
          color: #0066cc;
          background: #e6f2ff;
          font-weight: 600;
        }

        .dashboard-controls {
          display: flex;
          gap: 16px;
          align-items: center;
          margin-bottom: 24px;
          padding: 16px;
          background: #f9f9f9;
          border-radius: 8px;
        }

        .control-group {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .control-group label {
          font-weight: 500;
          color: #333;
        }

        .control-group select {
          padding: 8px 12px;
          border: 1px solid #ddd;
          border-radius: 6px;
          background: white;
          font-size: 14px;
          cursor: pointer;
        }

        .refresh-button {
          padding: 8px 16px;
          background: #0066cc;
          color: white;
          border: none;
          border-radius: 6px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.2s;
          margin-left: auto;
        }

        .refresh-button:hover:not(:disabled) {
          background: #0052a3;
        }

        .refresh-button:disabled {
          background: #ccc;
          cursor: not-allowed;
        }

        .summary-cards {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
          margin-bottom: 32px;
        }

        .summary-card {
          padding: 20px;
          background: white;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }

        .card-label {
          font-size: 13px;
          color: #666;
          margin-bottom: 8px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .card-value {
          font-size: 28px;
          font-weight: 700;
          color: #1a1a1a;
        }

        .data-table-container {
          overflow-x: auto;
          background: white;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }

        .data-table {
          width: 100%;
          border-collapse: collapse;
        }

        .data-table th {
          background: #f5f5f5;
          padding: 12px 16px;
          text-align: left;
          font-weight: 600;
          color: #333;
          border-bottom: 2px solid #e0e0e0;
          font-size: 13px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .data-table td {
          padding: 12px 16px;
          border-bottom: 1px solid #f0f0f0;
          font-size: 14px;
          color: #333;
        }

        .data-table tbody tr:hover {
          background: #f9f9f9;
        }

        .error-banner {
          padding: 16px;
          background: #ffebee;
          border: 1px solid #ef5350;
          border-radius: 8px;
          color: #c62828;
          margin-bottom: 24px;
        }

        .empty-state,
        .loading-state {
          padding: 64px 32px;
          text-align: center;
          color: #666;
        }

        .spinner {
          width: 40px;
          height: 40px;
          border: 4px solid #f0f0f0;
          border-top-color: #0066cc;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 0 auto 16px;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );

  /**
   * Render table headers based on active KPI type
   */
  function renderTableHeaders() {
    switch (activeTab) {
      case 'growth':
        return (
          <>
            <th>New Users</th>
            <th>Verified</th>
          </>
        );
      case 'engagement':
        return (
          <>
            <th>Swipes</th>
            <th>Matches</th>
            <th>Paid Chats</th>
            <th>Voice Min</th>
            <th>Video Min</th>
          </>
        );
      case 'revenue':
        return (
          <>
            <th>Token Purchases</th>
            <th>Tokens Purchased</th>
            <th>Tokens Spent</th>
            <th>Creator Earnings</th>
            <th>Avalo Revenue</th>
          </>
        );
      case 'safety':
        return (
          <>
            <th>Abuse Reports</th>
            <th>Safety Tickets</th>
            <th>Critical Tickets</th>
            <th>Frozen</th>
            <th>Banned</th>
          </>
        );
      case 'support':
        return (
          <>
            <th>Created</th>
            <th>Resolved</th>
            <th>Avg First Response (min)</th>
            <th>Avg Resolve (min)</th>
          </>
        );
      default:
        return null;
    }
  }

  /**
   * Render table row based on active KPI type
   */
  function renderTableRow(row: AnyKpi) {
    switch (activeTab) {
      case 'growth':
        const g = row as GrowthKpi;
        return (
          <>
            <td>{g.newUsers}</td>
            <td>{g.verifiedUsers}</td>
          </>
        );
      case 'engagement':
        const e = row as EngagementKpi;
        return (
          <>
            <td>{e.totalSwipes}</td>
            <td>{e.totalMatches}</td>
            <td>{e.paidChatsStarted}</td>
            <td>{e.voiceMinutes}</td>
            <td>{e.videoMinutes}</td>
          </>
        );
      case 'revenue':
        const r = row as RevenueKpi;
        return (
          <>
            <td>{r.tokenPurchasesCount}</td>
            <td>{r.tokenPurchasedTotal}</td>
            <td>{r.tokensSpentTotal}</td>
            <td>{r.creatorEarningsTokens}</td>
            <td>{r.avaloRevenueTokens}</td>
          </>
        );
      case 'safety':
        const s = row as SafetyKpi;
        return (
          <>
            <td>{s.abuseReports}</td>
            <td>{s.safetyTickets}</td>
            <td>{s.criticalSafetyTickets}</td>
            <td>{s.accountsFrozen}</td>
            <td>{s.accountsBanned}</td>
          </>
        );
      case 'support':
        const su = row as SupportKpi;
        return (
          <>
            <td>{su.ticketsCreated}</td>
            <td>{su.ticketsResolved}</td>
            <td>{su.avgFirstResponseMinutes?.toFixed(0) || 'N/A'}</td>
            <td>{su.avgResolveMinutes?.toFixed(0) || 'N/A'}</td>
          </>
        );
      default:
        return null;
    }
  }
}
