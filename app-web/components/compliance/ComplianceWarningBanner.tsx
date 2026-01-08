/**
 * PACK 156: Compliance Warning Banner (Web)
 * Displays active compliance warnings to users
 */

import React from 'react';

interface ComplianceWarning {
  reason: string;
  reasonCode: string;
  severity: number;
  issuedAt: Date;
  acknowledged: boolean;
}

interface Props {
  warnings: ComplianceWarning[];
}

export function ComplianceWarningBanner({ warnings }: Props) {
  if (!warnings || warnings.length === 0) {
    return null;
  }

  const unacknowledgedWarnings = warnings.filter(w => !w.acknowledged);
  
  if (unacknowledgedWarnings.length === 0) {
    return null;
  }

  const mostRecent = unacknowledgedWarnings[0];
  const severityStyles = getSeverityStyles(mostRecent.severity);
  const severityLabel = getSeverityLabel(mostRecent.severity);

  return (
    <div
      className="mb-4 p-4 rounded-lg border-l-4 flex items-start gap-3"
      style={{
        backgroundColor: severityStyles.bg,
        borderLeftColor: severityStyles.border
      }}
    >
      <svg
        className="w-5 h-5 mt-0.5"
        fill="none"
        stroke={severityStyles.icon}
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
      <div className="flex-1">
        <div className="font-semibold text-sm mb-1" style={{ color: severityStyles.text }}>
          {severityLabel} Warning
        </div>
        <div className="text-sm text-gray-700">
          {mostRecent.reason}
        </div>
        {unacknowledgedWarnings.length > 1 && (
          <div className="text-xs text-gray-600 mt-1">
            +{unacknowledgedWarnings.length - 1} more warning(s)
          </div>
        )}
      </div>
      <a
        href="/compliance/warnings"
        className="px-3 py-1.5 text-sm font-medium rounded hover:bg-gray-100 transition-colors"
        style={{ color: severityStyles.icon }}
      >
        View →
      </a>
    </div>
  );
}

function getSeverityStyles(severity: number) {
  switch (severity) {
    case 5:
      return {
        border: '#dc2626',
        icon: '#dc2626',
        bg: '#fef2f2',
        text: '#991b1b'
      };
    case 4:
      return {
        border: '#ea580c',
        icon: '#ea580c',
        bg: '#fff7ed',
        text: '#9a3412'
      };
    case 3:
      return {
        border: '#ca8a04',
        icon: '#ca8a04',
        bg: '#fefce8',
        text: '#854d0e'
      };
    default:
      return {
        border: '#2563eb',
        icon: '#2563eb',
        bg: '#eff6ff',
        text: '#1e40af'
      };
  }
}

function getSeverityLabel(severity: number): string {
  switch (severity) {
    case 5:
      return 'Critical';
    case 4:
      return 'Severe';
    case 3:
      return 'Moderate';
    case 2:
      return 'Minor';
    default:
      return 'Notice';
  }
}