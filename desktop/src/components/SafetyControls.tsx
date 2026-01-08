/**
 * PACK 126 — Desktop Safety Controls
 * 
 * Desktop-specific safety interface for Avalo Desktop App (PACK 125)
 */

import React, { useState, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';

interface SafetyControlsProps {
  counterpartId?: string;
  counterpartName?: string;
}

export default function SafetyControls({
  counterpartId,
  counterpartName,
}: SafetyControlsProps) {
  const [consentState, setConsentState] = useState<string>('PENDING');
  const [showConsentMenu, setShowConsentMenu] = useState(false);

  useEffect(() => {
    if (counterpartId) {
      loadConsentState();
    }
  }, [counterpartId]);

  const loadConsentState = async () => {
    if (!counterpartId) return;

    try {
      const getConsent = httpsCallable(functions, 'pack126_getConsentRecord');
      const result = await getConsent({ counterpartId });
      
      if (result.data && typeof result.data === 'object' && 'record' in result.data) {
        const record = (result.data as any).record;
        setConsentState(record?.state || 'PENDING');
      }
    } catch (error) {
      console.error('Error loading consent state:', error);
    }
  };

  const handlePauseConsent = async () => {
    if (!counterpartId) return;

    try {
      const pauseConsent = httpsCallable(functions, 'pack126_pauseConsent');
      await pauseConsent({ counterpartId });
      setConsentState('PAUSED');
      setShowConsentMenu(false);
    } catch (error) {
      console.error('Error pausing consent:', error);
    }
  };

  const handleRevokeConsent = async () => {
    if (!counterpartId) return;

    const confirmed = window.confirm(
      'Permanently end communication? This cannot be undone.'
    );

    if (!confirmed) return;

    try {
      const revokeConsent = httpsCallable(functions, 'pack126_revokeConsent');
      await revokeConsent({ counterpartId });
      setConsentState('REVOKED');
      setShowConsentMenu(false);
    } catch (error) {
      console.error('Error revoking consent:', error);
    }
  };

  const handleResumeConsent = async () => {
    if (!counterpartId) return;

    try {
      const resumeConsent = httpsCallable(functions, 'pack126_resumeConsent');
      await resumeConsent({ counterpartId });
      setConsentState('ACTIVE_CONSENT');
      setShowConsentMenu(false);
    } catch (error) {
      console.error('Error resuming consent:', error);
    }
  };

  if (!counterpartId) {
    return null;
  }

  return (
    <div className="safety-controls">
      <button
        className="safety-menu-trigger"
        onClick={() => setShowConsentMenu(!showConsentMenu)}
        title="Safety Controls"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <path d="M10 2L3 6v4c0 5 3 8 7 10 4-2 7-5 7-10V6l-7-4z" />
        </svg>
        <span className={`status-indicator status-${consentState.toLowerCase()}`} />
      </button>

      {showConsentMenu && (
        <div className="consent-dropdown">
          <div className="dropdown-header">
            <strong>{counterpartName || 'User'}</strong>
            <span className="status-badge">{consentState}</span>
          </div>

          <div className="dropdown-actions">
            {consentState === 'ACTIVE_CONSENT' && (
              <>
                <button onClick={handlePauseConsent} className="action-pause">
                  Pause Connection
                </button>
                <button onClick={handleRevokeConsent} className="action-end">
                  End Connection
                </button>
              </>
            )}

            {consentState === 'PAUSED' && (
              <>
                <button onClick={handleResumeConsent} className="action-resume">
                  Resume Connection
                </button>
                <button onClick={handleRevokeConsent} className="action-end">
                  End Connection
                </button>
              </>
            )}

            {consentState === 'REVOKED' && (
              <div className="revoked-message">
                Connection has been ended
              </div>
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        .safety-controls {
          position: relative;
        }

        .safety-menu-trigger {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 12px;
          background: #f3f4f6;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          cursor: pointer;
          color: #6b7280;
          transition: all 0.2s;
        }

        .safety-menu-trigger:hover {
          background: #e5e7eb;
          color: #374151;
        }

        .status-indicator {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        .status-active_consent {
          background: #10b981;
        }

        .status-paused {
          background: #f59e0b;
        }

        .status-revoked {
          background: #ef4444;
        }

        .status-pending {
          background: #6b7280;
        }

        .consent-dropdown {
          position: absolute;
          top: 100%;
          right: 0;
          margin-top: 8px;
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
          min-width: 280px;
          z-index: 1000;
        }

        .dropdown-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px;
          border-bottom: 1px solid #e5e7eb;
        }

        .status-badge {
          font-size: 11px;
          padding: 4px 8px;
          background: #f3f4f6;
          border-radius: 4px;
          color: #6b7280;
          text-transform: uppercase;
          font-weight: 600;
        }

        .dropdown-actions {
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .dropdown-actions button {
          padding: 12px 16px;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: opacity 0.2s;
        }

        .dropdown-actions button:hover {
          opacity: 0.9;
        }

        .action-pause {
          background: #f59e0b;
          color: #fff;
        }

        .action-resume {
          background: #10b981;
          color: #fff;
        }

        .action-end {
          background: #ef4444;
          color: #fff;
        }

        .revoked-message {
          padding: 16px;
          text-align: center;
          color: #6b7280;
          font-size: 14px;
        }
      `}</style>
    </div>
  );
}