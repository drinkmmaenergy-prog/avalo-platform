/**
 * Analytics Charts Component
 * Placeholder for data visualization
 */

'use client';

export default function AnalyticsCharts() {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Analytics</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="font-medium mb-2">Views Over Time</h3>
          <div className="h-48 bg-gray-100 rounded flex items-center justify-center text-gray-500">
            📊 Chart coming soon
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="font-medium mb-2">Earnings</h3>
          <div className="h-48 bg-gray-100 rounded flex items-center justify-center text-gray-500">
            💰 Chart coming soon
          </div>
        </div>
      </div>
    </div>
  );
}
