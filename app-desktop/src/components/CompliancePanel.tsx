/**
 * PACK 156: Compliance Panel (Desktop)
 * Desktop compliance warnings and education interface
 */

import React, { useState, useEffect } from 'react';

interface ComplianceWarning {
  reason: string;
  reasonCode: string;
  severity: number;
  issuedAt: Date;
  acknowledged: boolean;
}

interface ComplianceStatus {
  warnings: ComplianceWarning[];
  riskScore: number;
  riskTier: string;
  educationRequired: string[];
  activeRestrictions: string[];
}

export function CompliancePanel() {
  const [status, setStatus] = useState<ComplianceStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadComplianceStatus();
  }, []);

  const loadComplianceStatus = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/compliance/status');
      const data = await response.json();
      setStatus(data);
    } catch (error) {
      console.error('Failed to load compliance status:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="compliance-panel loading">
        <div className="spinner" />
        <p>Loading compliance status...</p>
      </div>
    );
  }

  if (!status) {
    return null;
  }

  const hasIssues =
    status.warnings.length > 0 ||
    status.educationRequired.length > 0 ||
    status.activeRestrictions.length > 0;

  if (!hasIssues) {
    return (
      <div className="compliance-panel good-standing">
        <div className="icon success">✓</div>
        <h3>Good Standing</h3>
        <p>No compliance issues</p>
      </div>
    );
  }

  return (
    <div className="compliance-panel">
      <div className="panel-header">
        <h2>Compliance Status</h2>
        <span className={`risk-badge ${status.riskTier}`}>
          {status.riskTier.toUpperCase()}
        </span>
      </div>

      {status.warnings.length > 0 && (
        <section className="warnings-section">
          <h3>⚠️ Active Warnings ({status.warnings.length})</h3>
          {status.warnings.slice(0, 3).map((warning, index) => (
            <div
              key={index}
              className={`warning-card severity-${warning.severity}`}
            >
              <div className="warning-header">
                <span className="severity-label">
                  {getSeverityLabel(warning.severity)}
                </span>
                <span className="reason-code">{warning.reasonCode}</span>
              </div>
              <p className="warning-reason">{warning.reason}</p>
              {!warning.acknowledged && (
                <button className="btn-acknowledge">Acknowledge</button>
              )}
            </div>
          ))}
          {status.warnings.length > 3 && (
            <button className="btn-view-all">
              View All {status.warnings.length} Warnings
            </button>
          )}
        </section>
      )}

      {status.educationRequired.length > 0 && (
        <section className="education-section">
          <h3>📚 Required Education</h3>
          <p className="section-description">
            Complete these modules to restore full account access
          </p>
          <ul className="education-list">
            {status.educationRequired.map((module, index) => (
              <li key={index}>
                <span className="module-icon">📖</span>
                <span className="module-name">{module}</span>
                <button className="btn-start">Start</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {status.activeRestrictions.length > 0 && (
        <section className="restrictions-section">
          <h3>🔒 Active Restrictions</h3>
          <ul className="restrictions-list">
            {status.activeRestrictions.map((restriction, index) => (
              <li key={index}>{restriction}</li>
            ))}
          </ul>
        </section>
      )}

      <style jsx>{`
        .compliance-panel {
          background: white;
          border-radius: 8px;
          padding: 20px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .compliance-panel.loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 200px;
        }

        .compliance-panel.good-standing {
          text-align: center;
          padding: 40px;
        }

        .icon.success {
          width: 64px;
          height: 64px;
          background: #4caf50;
          color: white;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 32px;
          margin-bottom: 16px;
        }

        .panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }

        .risk-badge {
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 600;
        }

        .risk-badge.excellent {
          background: #e8f5e9;
          color: #2e7d32;
        }

        .risk-badge.good {
          background: #e3f2fd;
          color: #1976d2;
        }

        .risk-badge.fair {
          background: #fff3e0;
          color: #e65100;
        }

        .risk-badge.poor {
          background: #fce4ec;
          color: #c2185b;
        }

        .risk-badge.critical {
          background: #ffebee;
          color: #c62828;
        }

        section {
          margin-bottom: 24px;
        }

        section h3 {
          font-size: 16px;
          font-weight: 600;
          margin-bottom: 12px;
        }

        .section-description {
          font-size: 14px;
          color: #666;
          margin-bottom: 12px;
        }

        .warning-card {
          padding: 12px;
          border-radius: 6px;
          margin-bottom: 8px;
          border-left: 4px solid;
        }

        .warning-card.severity-5 {
          background: #ffebee;
          border-left-color: #c62828;
        }

        .warning-card.severity-4 {
          background: #fff3e0;
          border-left-color: #e65100;
        }

        .warning-card.severity-3 {
          background: #fffde7;
          border-left-color: #f57f17;
        }

        .warning-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
        }

        .severity-label {
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
        }

        .reason-code {
          font-size: 11px;
          color: #666;
        }

        .warning-reason {
          font-size: 14px;
          color: #333;
          margin-bottom: 8px;
        }

        .btn-acknowledge,
        .btn-view-all,
        .btn-start {
          background: #007aff;
          color: white;
          border: none;
          padding: 6px 12px;
          border-radius: 4px;
          font-size: 13px;
          cursor: pointer;
        }

        .btn-acknowledge:hover,
        .btn-view-all:hover,
        .btn-start:hover {
          background: #0051d5;
        }

        .btn-view-all {
          width: 100%;
          margin-top: 8px;
        }

        .education-list,
        .restrictions-list {
          list-style: none;
          padding: 0;
        }

        .education-list li {
          display: flex;
          align-items: center;
          padding: 12px;
          background: #f5f5f5;
          border-radius: 6px;
          margin-bottom: 8px;
        }

        .module-icon {
          font-size: 20px;
          margin-right: 12px;
        }

        .module-name {
          flex: 1;
          font-size: 14px;
        }

        .restrictions-list li {
          padding: 8px 12px;
          background: #fff3cd;
          border-left: 3px solid #ffc107;
          margin-bottom: 8px;
          font-size: 14px;
        }

        .spinner {
          width: 40px;
          height: 40px;
          border: 4px solid #f3f3f3;
          border-top: 4px solid #007aff;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
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