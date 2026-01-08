/**
 * PACK 126 — Web Consent Management Panel
 * 
 * Web interface for managing user connections and consent
 */

import React, { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';

interface ConsentManagementPanelProps {
  counterpartId: string;
  counterpartName: string;
  currentState: 'PENDING' | 'ACTIVE_CONSENT' | 'PAUSED' | 'REVOKED';
  onStateChange?: () => void;
}

export default function ConsentManagementPanel({
  counterpartId,
  counterpartName,
  currentState,
  onStateChange,
}: ConsentManagementPanelProps) {
  const [processing, setProcessing] = useState(false);

  const handlePauseConsent = async () => {
    if (!confirm('Pause communication with this user? You can resume anytime.')) {
      return;
    }

    setProcessing(true);
    try {
      const pauseConsent = httpsCallable(functions, 'pack126_pauseConsent');
      await pauseConsent({ counterpartId });
      alert('Connection paused successfully');
      onStateChange?.();
    } catch (error) {
      alert('Failed to pause connection');
    } finally {
      setProcessing(false);
    }
  };

  const handleRevokeConsent = async () => {
    if (!confirm('Permanently end communication with this user? This cannot be undone.')) {
      return;
    }

    setProcessing(true);
    try {
      const revokeConsent = httpsCallable(functions, 'pack126_revokeConsent');
      await revokeConsent({ counterpartId });
      alert('Connection ended successfully');
      onStateChange?.();
    } catch (error) {
      alert('Failed to end connection');
    } finally {
      setProcessing(false);
    }
  };

  const handleResumeConsent = async () => {
    setProcessing(true);
    try {
      const resumeConsent = httpsCallable(functions, 'pack126_resumeConsent');
      await resumeConsent({ counterpartId });
      alert('Connection resumed successfully');
      onStateChange?.();
    } catch (error) {
      alert('Failed to resume connection');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="consent-management-panel">
      <div className="panel-header">
        <h3>Manage Connection</h3>
        <span className={`status-badge status-${currentState.toLowerCase()}`}>
          {currentState}
        </span>
      </div>

      <div className="panel-info">
        <p>Connection with <strong>{counterpartName}</strong></p>
      </div>

      <div className="panel-actions">
        {currentState === 'ACTIVE_CONSENT' && (
          <>
            <button
              className="btn btn-warning"
              onClick={handlePauseConsent}
              disabled={processing}
            >
              Pause Connection
            </button>
            <button
              className="btn btn-danger"
              onClick={handleRevokeConsent}
              disabled={processing}
            >
              End Connection
            </button>
          </>
        )}

        {currentState === 'PAUSED' && (
          <>
            <button
              className="btn btn-success"
              onClick={handleResumeConsent}
              disabled={processing}
            >
              Resume Connection
            </button>
            <button
              className="btn btn-danger"
              onClick={handleRevokeConsent}
              disabled={processing}
            >
              End Connection
            </button>
          </>
        )}

        {currentState === 'REVOKED' && (
          <div className="revoked-message">
            <p>This connection has been permanently ended</p>
          </div>
        )}
      </div>

      <div className="panel-footer">
        <p className="footer-text">
          Actions take effect immediately and protect both users.
        </p>
      </div>

      <style jsx>{`
        .consent-management-panel {
          background: #fff;
          border-radius: 12px;
          padding: 24px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .panel-header h3 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
          color: #1f2937;
        }

        .status-badge {
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
        }

        .status-active_consent {
          background: #d1fae5;
          color: #065f46;
        }

        .status-paused {
          background: #fef3c7;
          color: #92400e;
        }

        .status-revoked {
          background: #fee2e2;
          color: #991b1b;
        }

        .panel-info {
          background: #f3f4f6;
          padding: 12px;
          border-radius: 8px;
          margin-bottom: 16px;
        }

        .panel-info p {
          margin: 0;
          font-size: 14px;
          color: #374151;
        }

        .panel-actions {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-bottom: 16px;
        }

        .btn {
          padding: 12px 16px;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: opacity 0.2s;
        }

        .btn:hover:not(:disabled) {
          opacity: 0.9;
        }

        .btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .btn-warning {
          background: #f59e0b;
          color: #fff;
        }

        .btn-danger {
          background: #ef4444;
          color: #fff;
        }

        .btn-success {
          background: #10b981;
          color: #fff;
        }

        .revoked-message {
          text-align: center;
          padding: 20px;
          background: #f9fafb;
          border-radius: 8px;
        }

        .revoked-message p {
          margin: 0;
          color: #6b7280;
        }

        .panel-footer {
          padding-top: 12px;
          border-top: 1px solid #e5e7eb;
        }

        .footer-text {
          margin: 0;
          font-size: 12px;
          color: #6b7280;
          text-align: center;
        }
      `}</style>
    </div>
  );
}