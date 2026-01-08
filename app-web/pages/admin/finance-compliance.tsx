/**
 * PACK 330 — Finance & Compliance Dashboard (Admin Only)
 * Platform tax reports, regional breakdown, and compliance monitoring
 */

import React, { useState, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';

// ============================================================================
// TYPES
// ============================================================================

interface RegionBreakdown {
  creators: number;
  tokens: number;
  payoutPLN: number;
}

interface TaxReportPlatform {
  period: string;
  totalGrossTokensSold: number;
  totalGrossRevenuePLN: number;
  totalTokensPaidOutToCreators: number;
  totalPayoutsPLN: number;
  totalAvaloRevenuePLN: number;
  regionBreakdown: {
    PL?: RegionBreakdown;
    EU?: RegionBreakdown;
    US?: RegionBreakdown;
    ROW?: RegionBreakdown;
  };
  generatedAt: any;
}

interface DashboardStats {
  totalCreators: number;
  totalEarningsThisMonth: number;
  totalPayoutsThisMonth: number;
  averageReportCompletionTime: string;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function FinanceComplianceDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [reports, setReports] = useState<TaxReportPlatform[]>([]);
  const [selectedReport, setSelectedReport] = useState<TaxReportPlatform | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [period, setPeriod] = useState('');

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      setLoading(true);

      // Load platform reports
      const listReports = httpsCallable(functions, 'taxReports_listPlatformReports');
      const reportsResult: any = await listReports({ limit: 12 });

      if (reportsResult.data.success) {
        setReports(reportsResult.data.reports || []);
      }

      // Calculate stats from reports
      if (reportsResult.data.reports && reportsResult.data.reports.length > 0) {
        const latestReport = reportsResult.data.reports[0];
        const totalCreators = Object.values(latestReport.regionBreakdown || {}).reduce(
          (sum: number, region: any) => sum + (region.creators || 0),
          0
        );

        setStats({
          totalCreators,
          totalEarningsThisMonth: latestReport.totalPayoutsPLN || 0,
          totalPayoutsThisMonth: latestReport.numberOfPayouts || 0,
          averageReportCompletionTime: 'N/A',
        });
      }

      setLoading(false);
    } catch (error) {
      console.error('Error loading dashboard:', error);
      setLoading(false);
    }
  };

  const handleGenerateReport = async () => {
    if (!period) {
      alert('Please enter a period (e.g., 2024-12 or 2024-YEAR)');
      return;
    }

    try {
      setGenerating(true);
      const generateReport = httpsCallable(functions, 'taxReports_admin_generatePlatformReport');
      const result: any = await generateReport({ period });

      if (result.data.success) {
        alert(`Platform report generated successfully for ${period}`);
        loadDashboard();
      } else {
        alert('Failed to generate report: ' + (result.data.error || 'Unknown error'));
      }
    } catch (error: any) {
      console.error('Error generating report:', error);
      alert('Error: ' + (error.message || 'Unknown error'));
    } finally {
      setGenerating(false);
    }
  };

  const formatPeriod = (period: string): string => {
    if (period.endsWith('-YEAR')) {
      return period.replace('-YEAR', ' (Yearly)');
    }
    const [year, month] = period.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const formatCurrency = (amount: number): string => {
    return `${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PLN`;
  };

  const formatTokens = (tokens: number): string => {
    return tokens.toLocaleString('en-US');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading Finance Dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">💼 Finance & Compliance</h1>
              <p className="mt-1 text-sm text-gray-500">
                Platform tax reports and revenue analysis
              </p>
            </div>
            <button
              onClick={loadDashboard}
              className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Grid */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <StatCard
              title="Total Creators"
              value={stats.totalCreators}
              icon="👥"
              color="blue"
            />
            <StatCard
              title="Earnings This Month"
              value={formatCurrency(stats.totalEarningsThisMonth)}
              icon="💰"
              color="green"
            />
            <StatCard
              title="Platform Revenue"
              value={reports[0] ? formatCurrency(reports[0].totalAvaloRevenuePLN) : 'N/A'}
              icon="📊"
              color="purple"
            />
            <StatCard
              title="Reports Generated"
              value={reports.length}
              icon="📄"
              color="indigo"
            />
          </div>
        )}

        {/* Generate Report Section */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-lg font-bold mb-4">Generate Platform Report</h2>
          <div className="flex gap-4">
            <input
              type="text"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              placeholder="e.g., 2024-12 or 2024-YEAR"
              className="flex-1 rounded border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            />
            <button
              onClick={handleGenerateReport}
              disabled={generating}
              className="px-6 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
            >
              {generating ? 'Generating...' : 'Generate Report'}
            </button>
          </div>
          <p className="text-sm text-gray-500 mt-2">
            Format: YYYY-MM for monthly or YYYY-YEAR for yearly reports
          </p>
        </div>

        {/* Reports List */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-bold">Platform Tax Reports</h2>
          </div>
          <div className="divide-y divide-gray-200">
            {reports.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                No reports available. Generate your first report above.
              </div>
            ) : (
              reports.map((report, index) => (
                <ReportRow
                  key={index}
                  report={report}
                  onSelect={() => setSelectedReport(report)}
                  isSelected={selectedReport?.period === report.period}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Report Detail Modal */}
      {selectedReport && (
        <ReportDetailModal
          report={selectedReport}
          onClose={() => setSelectedReport(null)}
        />
      )}
    </div>
  );
}

// ============================================================================
// STAT CARD COMPONENT
// ============================================================================

function StatCard({
  title,
  value,
  icon,
  color,
}: {
  title: string;
  value: number | string;
  icon: string;
  color: string;
}) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  };

  return (
    <div className={`rounded-lg shadow p-6 border-2 ${colorClasses[color as keyof typeof colorClasses]}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium opacity-75">{title}</p>
          <p className="text-2xl font-bold mt-2">{value}</p>
        </div>
        <div className="text-4xl">{icon}</div>
      </div>
    </div>
  );
}

// ============================================================================
// REPORT ROW COMPONENT
// ============================================================================

function ReportRow({
  report,
  onSelect,
  isSelected,
}: {
  report: TaxReportPlatform;
  onSelect: () => void;
  isSelected: boolean;
}) {
  const formatPeriod = (period: string): string => {
    if (period.endsWith('-YEAR')) {
      return period.replace('-YEAR', ' (Yearly)');
    }
    const [year, month] = period.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const formatCurrency = (amount: number): string => {
    return `${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PLN`;
  };

  const formatTokens = (tokens: number): string => {
    return tokens.toLocaleString('en-US');
  };

  return (
    <div
      onClick={onSelect}
      className={`p-6 hover:bg-gray-50 cursor-pointer ${
        isSelected ? 'bg-indigo-50 border-l-4 border-l-indigo-600' : ''
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-3 mb-2">
            <h3 className="text-lg font-bold text-gray-900">{formatPeriod(report.period)}</h3>
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
              {Object.keys(report.regionBreakdown || {}).length} regions
            </span>
          </div>

          <div className="grid grid-cols-4 gap-4 mt-3">
            <div>
              <p className="text-xs text-gray-500">Gross Revenue</p>
              <p className="font-semibold text-sm">{formatCurrency(report.totalGrossRevenuePLN)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Creator Payouts</p>
              <p className="font-semibold text-sm">{formatCurrency(report.totalPayoutsPLN)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Platform Revenue</p>
              <p className="font-semibold text-sm text-indigo-600">
                {formatCurrency(report.totalAvaloRevenuePLN)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Tokens Sold</p>
              <p className="font-semibold text-sm">{formatTokens(report.totalGrossTokensSold)}</p>
            </div>
          </div>
        </div>

        <button className="ml-4 px-4 py-2 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700">
          View Details
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// REPORT DETAIL MODAL COMPONENT
// ============================================================================

function ReportDetailModal({
  report,
  onClose,
}: {
  report: TaxReportPlatform;
  onClose: () => void;
}) {
  const formatPeriod = (period: string): string => {
    if (period.endsWith('-YEAR')) {
      return period.replace('-YEAR', ' (Yearly)');
    }
    const [year, month] = period.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const formatCurrency = (amount: number): string => {
    return `${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PLN`;
  };

  const formatTokens = (tokens: number): string => {
    return tokens.toLocaleString('en-US');
  };

  const handleExportCSV = async () => {
    try {
      const exportReport = httpsCallable(functions, 'taxReports_exportPlatformCSV');
      const result: any = await exportReport({ period: report.period });

      if (result.data.success && result.data.downloadUrl) {
        window.open(result.data.downloadUrl, '_blank');
      } else {
        alert(result.data.error || 'Export feature coming soon');
      }
    } catch (error: any) {
      console.error('Error exporting report:', error);
      alert('Export feature is not yet implemented (STUB)');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex justify-between items-center">
          <h3 className="text-xl font-bold">Platform Tax Report</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Period Header */}
          <div className="bg-indigo-600 text-white p-6 rounded-lg">
            <h4 className="text-sm opacity-90">Report Period</h4>
            <h2 className="text-3xl font-bold mt-1">{formatPeriod(report.period)}</h2>
          </div>

          {/* Revenue Summary */}
          <div>
            <h4 className="font-bold text-lg mb-4">Revenue Summary</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600">Gross Token Sales</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {formatTokens(report.totalGrossTokensSold)}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  {formatCurrency(report.totalGrossRevenuePLN)}
                </p>
              </div>

              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600">Creator Payouts</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {formatTokens(report.totalTokensPaidOutToCreators)}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  {formatCurrency(report.totalPayoutsPLN)}
                </p>
              </div>

              <div className="bg-indigo-50 p-4 rounded-lg col-span-2">
                <p className="text-sm text-indigo-600 font-semibold">Platform Revenue (Commission + Fees)</p>
                <p className="text-3xl font-bold text-indigo-700 mt-1">
                  {formatCurrency(report.totalAvaloRevenuePLN)}
                </p>
              </div>
            </div>
          </div>

          {/* Regional Breakdown */}
          <div>
            <h4 className="font-bold text-lg mb-4">Regional Breakdown</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(report.regionBreakdown || {}).map(([region, data]) => (
                <div key={region} className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h5 className="font-bold text-gray-900">{region}</h5>
                    <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                      {data.creators} creators
                    </span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Tokens Earned:</span>
                      <span className="text-sm font-semibold">{formatTokens(data.tokens)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Payout Value:</span>
                      <span className="text-sm font-semibold">{formatCurrency(data.payoutPLN)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Export Button */}
          <div className="border-t border-gray-200 pt-6">
            <button
              onClick={handleExportCSV}
              className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold"
            >
              📥 Export to CSV (Coming Soon)
            </button>
            <p className="text-xs text-gray-500 text-center mt-2">
              Export feature is a stub and will be implemented in a future update
            </p>
          </div>

          {/* Metadata */}
          <div className="bg-gray-50 p-4 rounded-lg text-sm text-gray-600">
            <p>
              <strong>Generated:</strong>{' '}
              {report.generatedAt?.toDate
                ? report.generatedAt.toDate().toLocaleString()
                : 'N/A'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

// Export for external use
export { StatCard, ReportRow, ReportDetailModal };