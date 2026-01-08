/**
 * PACK 305 — Legal & Audit Snapshot Export
 * Admin UI: Main Page Index
 */

import React, { useState } from 'react';
import { CreateSnapshotForm } from './CreateSnapshotForm';
import { SnapshotsList } from './SnapshotsList';

export const LegalSnapshotsPage: React.FC = () => {
  const [refreshKey, setRefreshKey] = useState(0);

  const handleSnapshotCreated = () => {
    // Trigger refresh of snapshots list
    setRefreshKey(prev => prev + 1);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Legal & Audit Snapshot Export
          </h1>
          <p className="text-gray-600 mt-2">
            Generate compliance-ready exports for investors, regulators, and internal audits
          </p>
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Create Form - Takes 1 column */}
          <div className="lg:col-span-1">
            <CreateSnapshotForm onSuccess={handleSnapshotCreated} />
          </div>

          {/* Snapshots List - Takes 2 columns */}
          <div className="lg:col-span-2">
            <SnapshotsList key={refreshKey} />
          </div>
        </div>

        {/* Footer Info */}
        <div className="mt-12 p-6 bg-white border rounded-lg">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            About Legal Snapshots
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Investor Overview</h4>
              <p className="text-gray-600">
                High-level business metrics, growth statistics, and revenue overview. 
                Suitable for data rooms and investor relations. Contains only aggregated data.
              </p>
            </div>
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Regulator Overview</h4>
              <p className="text-gray-600">
                Compliance-oriented view covering age verification, content safety, 
                data protection, and AML measures. Designed for regulatory audits.
              </p>
            </div>
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Internal Compliance</h4>
              <p className="text-gray-600">
                Internal compliance dashboard with policy tracking, risk metrics, 
                audit log summaries, and financial consistency checks.
              </p>
            </div>
          </div>
          
          <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800">
              <strong>Privacy Notice:</strong> All snapshots are strictly anonymized and contain 
              no personal identifiable information (PII). Only aggregated statistics and metrics 
              are included. All snapshot requests are logged for audit purposes.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LegalSnapshotsPage;