/**
 * Creator Dashboard Component
 * Placeholder for analytics and metrics dashboard
 */

'use client';

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Creator Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-gray-500 text-sm">Total Views</h3>
          <p className="text-2xl font-bold">--</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-gray-500 text-sm">Earnings</h3>
          <p className="text-2xl font-bold">--</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-gray-500 text-sm">Followers</h3>
          <p className="text-2xl font-bold">--</p>
        </div>
      </div>
    </div>
  );
}

