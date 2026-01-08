/**
 * PACK 127 — Copyright Center Panel (Web)
 * 
 * Web-based copyright protection dashboard
 */

import React, { useState, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';

interface IPDashboard {
  contentProtection: {
    totalFingerprints: number;
    activeFingerprints: number;
    disputedContent: number;
  };
  claims: {
    filedByYou: number;
    filedAgainstYou: number;
    openClaims: number;
  };
  antiPiracy: {
    detectionsTotal: number;
    confirmedLeaks: number;
    investigating: number;
  };
  licensing: {
    licensesOwned: number;
    licensesHeld: number;
    activeLicenses: number;
    totalLicenseRevenue: number;
  };
}

export default function CopyrightCenterPanel() {
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<IPDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const getIPDashboard = httpsCallable(functions, 'pack127_getIPDashboard');
      const result: any = await getIPDashboard({});
      
      if (result.data.success) {
        setDashboard(result.data.dashboard);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load copyright dashboard');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="copyright-center-loading">
        <p>Loading Copyright Center...</p>
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div className="copyright-center-error">
        <p>Error: {error || 'Failed to load dashboard'}</p>
      </div>
    );
  }

  return (
    <div className="copyright-center-panel">
      <div className="copyright-header">
        <h1>Copyright Center</h1>
        <p>Protect your intellectual property</p>
      </div>

      {/* Content Protection */}
      <section className="copyright-section">
        <h2>Content Protection</h2>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value" style={{ color: '#4CAF50' }}>
              {dashboard.contentProtection.totalFingerprints}
            </div>
            <div className="stat-label">Protected Content</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: '#2196F3' }}>
              {dashboard.contentProtection.activeFingerprints}
            </div>
            <div className="stat-label">Active</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: '#FF9800' }}>
              {dashboard.contentProtection.disputedContent}
            </div>
            <div className="stat-label">Disputed</div>
          </div>
        </div>
        <button className="action-button">View Protected Content</button>
      </section>

      {/* Copyright Claims */}
      <section className="copyright-section">
        <h2>Copyright Claims</h2>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value" style={{ color: '#2196F3' }}>
              {dashboard.claims.filedByYou}
            </div>
            <div className="stat-label">Claims Filed</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: '#FF9800' }}>
              {dashboard.claims.filedAgainstYou}
            </div>
            <div className="stat-label">Claims Received</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: '#F44336' }}>
              {dashboard.claims.openClaims}
            </div>
            <div className="stat-label">Open Cases</div>
          </div>
        </div>
        <div className="button-group">
          <button className="action-button">File Claim</button>
          <button className="action-button secondary">View Claims</button>
        </div>
      </section>

      {/* Anti-Piracy */}
      <section className="copyright-section">
        <h2>Anti-Piracy Protection</h2>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value" style={{ color: '#9C27B0' }}>
              {dashboard.antiPiracy.detectionsTotal}
            </div>
            <div className="stat-label">Total Detections</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: '#F44336' }}>
              {dashboard.antiPiracy.confirmedLeaks}
            </div>
            <div className="stat-label">Confirmed Leaks</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: '#FF9800' }}>
              {dashboard.antiPiracy.investigating}
            </div>
            <div className="stat-label">Investigating</div>
          </div>
        </div>
        <div className="info-box">
          🛡️ Your content is watermarked for leak detection
        </div>
        <button className="action-button">Report Piracy</button>
      </section>

      {/* Licensing */}
      <section className="copyright-section">
        <h2>IP Licensing</h2>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value" style={{ color: '#4CAF50' }}>
              {dashboard.licensing.licensesOwned}
            </div>
            <div className="stat-label">Licenses Owned</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: '#2196F3' }}>
              {dashboard.licensing.licensesHeld}
            </div>
            <div className="stat-label">Licenses Held</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: '#00BCD4' }}>
              {dashboard.licensing.activeLicenses}
            </div>
            <div className="stat-label">Active</div>
          </div>
        </div>
        {dashboard.licensing.totalLicenseRevenue > 0 && (
          <div className="revenue-box">
            <div className="revenue-label">Total License Revenue</div>
            <div className="revenue-value">
              ${dashboard.licensing.totalLicenseRevenue.toLocaleString()}
            </div>
          </div>
        )}
        <div className="button-group">
          <button className="action-button">Create License</button>
          <button className="action-button secondary">View Licenses</button>
        </div>
      </section>

      {/* Help Section */}
      <section className="copyright-section help-section">
        <h3>Need Help?</h3>
        <ul>
          <li>All creators are protected equally</li>
          <li>No economic effects during disputes</li>
          <li>False claims penalize the claimant</li>
          <li>Your earnings are never affected by piracy</li>
        </ul>
        <button className="action-button help-button">Learn More</button>
      </section>

      <style jsx>{`
        .copyright-center-panel {
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px;
        }

        .copyright-header {
          background: linear-gradient(135deg, #6200EA 0%, #7C4DFF 100%);
          color: white;
          padding: 40px;
          border-radius: 12px;
          margin-bottom: 24px;
        }

        .copyright-header h1 {
          margin: 0 0 8px 0;
          font-size: 32px;
        }

        .copyright-header p {
          margin: 0;
          opacity: 0.9;
        }

        .copyright-section {
          background: white;
          border-radius: 12px;
          padding: 24px;
          margin-bottom: 24px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .copyright-section h2 {
          margin: 0 0 20px 0;
          font-size: 24px;
          color: #333;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 16px;
          margin-bottom: 20px;
        }

        .stat-card {
          text-align: center;
          padding: 16px;
        }

        .stat-value {
          font-size: 36px;
          font-weight: bold;
          margin-bottom: 8px;
        }

        .stat-label {
          font-size: 14px;
          color: #666;
        }

        .action-button {
          background: #6200EA;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          width: 100%;
          transition: background 0.2s;
        }

        .action-button:hover {
          background: #7C4DFF;
        }

        .action-button.secondary {
          background: white;
          color: #6200EA;
          border: 2px solid #6200EA;
        }

        .action-button.secondary:hover {
          background: #F3E5F5;
        }

        .button-group {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .info-box {
          background: #E8F5E9;
          color: #2E7D32;
          padding: 12px;
          border-radius: 8px;
          text-align: center;
          margin-bottom: 16px;
        }

        .revenue-box {
          background: #F3E5F5;
          padding: 20px;
          border-radius: 8px;
          text-align: center;
          margin-bottom: 16px;
        }

        .revenue-label {
          font-size: 12px;
          color: #7B1FA2;
          margin-bottom: 8px;
        }

        .revenue-value {
          font-size: 28px;
          font-weight: bold;
          color: #6A1B9A;
        }

        .help-section {
          background: #FFF3E0;
        }

        .help-section h3 {
          color: #E65100;
          margin: 0 0 16px 0;
        }

        .help-section ul {
          margin: 0 0 16px 0;
          padding-left: 20px;
          color: #EF6C00;
        }

        .help-section li {
          margin-bottom: 8px;
        }

        .help-button {
          background: #FF6F00;
        }

        .help-button:hover {
          background: #F57C00;
        }

        @media (max-width: 768px) {
          .stats-grid {
            grid-template-columns: 1fr;
          }

          .button-group {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}