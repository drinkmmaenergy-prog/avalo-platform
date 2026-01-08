/**
 * PACK 436 — Review Defense Dashboard
 * 
 * Admin console for monitoring and managing App Store reviews
 */

import React, { useState, useEffect } from 'react';

interface ReviewStats {
  totalReviews: number;
  averageRating: number;
  positiveCount: number;
  negativeCount: number;
  responseRate: number;
  authenticityScore: number;
}

interface Review {
  id: string;
  userId: string;
  platform: 'ios' | 'android';
  rating: number;
  text: string;
  timestamp: number;
  authenticityScore?: number;
  flags?: string[];
  responded: boolean;
}

interface AttackAlert {
  type: string;
  severity: string;
  reviewIds: string[];
  detectedAt: number;
  metrics: any;
}

export default function ReviewsDashboard() {
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [recentReviews, setRecentReviews] = useState<Review[]>([]);
  const [attacks, setAttacks] = useState<AttackAlert[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'sentiment' | 'anomalies' | 'flagged'>('overview');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    // Fetch data from Firestore
    // This is a placeholder - integrate with your Firebase setup
    const mockStats: ReviewStats = {
      totalReviews: 1247,
      averageRating: 4.6,
      positiveCount: 956,
      negativeCount: 98,
      responseRate: 87,
      authenticityScore: 92,
    };
    setStats(mockStats);
  };

  return (
    <div className="review-defense-dashboard">
      <h1>📊 Review Defense Dashboard</h1>
      
      {/* Stats Overview */}
      <div className="stats-grid">
        {stats && (
          <>
            <div className="stat-card">
              <h3>Total Reviews</h3>
              <div className="stat-value">{stats.totalReviews.toLocaleString()}</div>
            </div>
            
            <div className="stat-card">
              <h3>Average Rating</h3>
              <div className="stat-value">{stats.averageRating.toFixed(1)} ⭐</div>
            </div>
            
            <div className="stat-card positive">
              <h3>Positive Reviews</h3>
              <div className="stat-value">{stats.positiveCount}</div>
              <div className="stat-detail">
                {((stats.positiveCount / stats.totalReviews) * 100).toFixed(1)}%
              </div>
            </div>
            
            <div className="stat-card negative">
              <h3>Negative Reviews</h3>
              <div className="stat-value">{stats.negativeCount}</div>
              <div className="stat-detail">
                {((stats.negativeCount / stats.totalReviews) * 100).toFixed(1)}%
              </div>
            </div>
            
            <div className="stat-card">
              <h3>Response Rate</h3>
              <div className="stat-value">{stats.responseRate}%</div>
            </div>
            
            <div className="stat-card">
              <h3>Authenticity Score</h3>
              <div className="stat-value">{stats.authenticityScore}/100</div>
            </div>
          </>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="tabs">
        <button 
          className={activeTab === 'overview' ? 'active' : ''}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button 
          className={activeTab === 'sentiment' ? 'active' : ''}
          onClick={() => setActiveTab('sentiment')}
        >
          Sentiment Analysis
        </button>
        <button 
          className={activeTab === 'anomalies' ? 'active' : ''}
          onClick={() => setActiveTab('anomalies')}
        >
          Anomalies & Attacks
        </button>
        <button 
          className={activeTab === 'flagged' ? 'active' : ''}
          onClick={() => setActiveTab('flagged')}
        >
          Flagged Reviews
        </button>
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {activeTab === 'overview' && <OverviewTab />}
        {activeTab === 'sentiment' && <SentimentTab />}
        {activeTab === 'anomalies' && <AnomaliesTab attacks={attacks} />}
        {activeTab === 'flagged' && <FlaggedReviewsTab />}
      </div>

      <style jsx>{`
        .review-defense-dashboard {
          padding: 20px;
          max-width: 1400px;
          margin: 0 auto;
        }

        h1 {
          font-size: 28px;
          margin-bottom: 30px;
          color: #1a1a1a;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 20px;
          margin-bottom: 30px;
        }

        .stat-card {
          background: white;
          padding: 20px;
          border-radius: 12px;
          border: 1px solid #e0e0e0;
          box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        }

        .stat-card.positive {
          border-left: 4px solid #4caf50;
        }

        .stat-card.negative {
          border-left: 4px solid #f44336;
        }

        .stat-card h3 {
          font-size: 14px;
          color: #666;
          margin: 0 0 10px 0;
          font-weight: 500;
        }

        .stat-value {
          font-size: 32px;
          font-weight: 700;
          color: #1a1a1a;
        }

        .stat-detail {
          font-size: 14px;
          color: #999;
          margin-top: 5px;
        }

        .tabs {
          display: flex;
          gap: 10px;
          margin-bottom: 20px;
          border-bottom: 2px solid #e0e0e0;
        }

        .tabs button {
          padding: 12px 24px;
          background: none;
          border: none;
          border-bottom: 2px solid transparent;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          color: #666;
          transition: all 0.2s;
        }

        .tabs button.active {
          color: #6c5ce7;
          border-bottom-color: #6c5ce7;
        }

        .tabs button:hover {
          color: #6c5ce7;
        }

        .tab-content {
          background: white;
          padding: 30px;
          border-radius: 12px;
          border: 1px solid #e0e0e0;
        }
      `}</style>
    </div>
  );
}

// =============================================================================
// TAB COMPONENTS
// =============================================================================

function OverviewTab() {
  return (
    <div className="overview-tab">
      <h2>Recent Reviews</h2>
      <div className="review-list">
        <ReviewItem
          platform="ios"
          rating={5}
          text="Amazing app! Finally found what I was looking for."
          authenticityScore={95}
          timestamp={Date.now() - 3600000}
        />
        <ReviewItem
          platform="android"
          rating={4}
          text="Great experience, could use more features."
          authenticityScore={88}
          timestamp={Date.now() - 7200000}
        />
        <ReviewItem
          platform="ios"
          rating={1}
          text="Terrible app, waste of time."
          authenticityScore={23}
          timestamp={Date.now() - 10800000}
          flagged={true}
        />
      </div>

      <style jsx>{`
        .overview-tab h2 {
          font-size: 20px;
          margin-bottom: 20px;
        }

        .review-list {
          display: flex;
          flex-direction: column;
          gap: 15px;
        }
      `}</style>
    </div>
  );
}

function ReviewItem({ platform, rating, text, authenticityScore, timestamp, flagged }: any) {
  const timeAgo = Math.floor((Date.now() - timestamp) / 60000); // minutes ago
  
  return (
    <div className={`review-item ${flagged ? 'flagged' : ''}`}>
      <div className="review-header">
        <span className="platform">{platform === 'ios' ? '🍎' : '🤖'} {platform.toUpperCase()}</span>
        <span className="rating">{'⭐'.repeat(rating)}</span>
        <span className="auth-score" style={{
          color: authenticityScore >= 70 ? '#4caf50' : authenticityScore >= 40 ? '#ff9800' : '#f44336'
        }}>
          Auth: {authenticityScore}/100
        </span>
        <span className="time">{timeAgo}m ago</span>
      </div>
      <p className="review-text">{text}</p>
      {flagged && <span className="flag-badge">🚩 FLAGGED</span>}

      <style jsx>{`
        .review-item {
          padding: 15px;
          background: #f8f9fa;
          border-radius: 8px;
          border: 1px solid #e0e0e0;
        }

        .review-item.flagged {
          border-color: #f44336;
          background: #fff5f5;
        }

        .review-header {
          display: flex;
          gap: 15px;
          align-items: center;
          margin-bottom: 10px;
          font-size: 13px;
        }

        .platform {
          font-weight: 600;
        }

        .auth-score {
          font-weight: 600;
        }

        .time {
          color: #999;
          margin-left: auto;
        }

        .review-text {
          margin: 0;
          color: #333;
          line-height: 1.5;
        }

        .flag-badge {
          display: inline-block;
          margin-top: 10px;
          padding: 4px 8px;
          background: #f44336;
          color: white;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
        }
      `}</style>
    </div>
  );
}

function SentimentTab() {
  const clusters = [
    { category: 'UX Complaints', count: 23, sentiment: -0.4, priority: 'medium' },
    { category: 'Bug Reports', count: 15, sentiment: -0.6, priority: 'high' },
    { category: 'Feature Requests', count: 45, sentiment: 0.2, priority: 'low' },
    { category: 'Pricing Complaints', count: 8, sentiment: -0.3, priority: 'medium' },
    { category: 'Competitor Attack', count: 2, sentiment: -0.9, priority: 'high' },
  ];

  return (
    <div className="sentiment-tab">
      <h2>Sentiment Clustering</h2>
      <p>Reviews grouped by topic and sentiment</p>
      
      <div className="clusters">
        {clusters.map((cluster, i) => (
          <div key={i} className="cluster-card">
            <div className="cluster-header">
              <h3>{cluster.category}</h3>
              <span className={`priority ${cluster.priority}`}>{cluster.priority}</span>
            </div>
            <div className="cluster-stats">
              <span className="count">{cluster.count} reviews</span>
              <span className="sentiment" style={{
                color: cluster.sentiment > 0 ? '#4caf50' : '#f44336'
              }}>
                {cluster.sentiment > 0 ? '↗' : '↘'} {cluster.sentiment.toFixed(2)}
              </span>
            </div>
          </div>
        ))}
      </div>

      <style jsx>{`
        .sentiment-tab h2 {
          font-size: 20px;
          margin-bottom: 10px;
        }

        .sentiment-tab p {
          color: #666;
          margin-bottom: 20px;
        }

        .clusters {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 15px;
        }

        .cluster-card {
          padding: 15px;
          background: #f8f9fa;
          border-radius: 8px;
          border: 1px solid #e0e0e0;
        }

        .cluster-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
        }

        .cluster-header h3 {
          font-size: 16px;
          margin: 0;
        }

        .priority {
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
        }

        .priority.high {
          background: #ffebee;
          color: #c62828;
        }

        .priority.medium {
          background: #fff3e0;
          color: #ef6c00;
        }

        .priority.low {
          background: #e8f5e9;
          color: #2e7d32;
        }

        .cluster-stats {
          display: flex;
          justify-content: space-between;
          font-size: 14px;
        }

        .count {
          color: #666;
        }

        .sentiment {
          font-weight: 600;
        }
      `}</style>
    </div>
  );
}

function AnomaliesTab({ attacks }: { attacks: AttackAlert[] }) {
  return (
    <div className="anomalies-tab">
      <h2>🚨 Attack Detection & Anomalies</h2>
      
      <div className="alert-box critical">
        <strong>No active attacks detected</strong>
        <p>All systems operating normally. Monitoring continues...</p>
      </div>

      <h3>Recent Anomalies</h3>
      <div className="anomaly-list">
        <AnomalyItem
          type="Volume Spike"
          severity="medium"
          description="15 negative reviews in 60 minutes"
          timestamp={Date.now() - 7200000}
          status="resolved"
        />
        <AnomalyItem
          type="Regional Cluster"
          severity="low"
          description="12 reviews from same region"
          timestamp={Date.now() - 14400000}
          status="monitoring"
        />
      </div>

      <style jsx>{`
        .anomalies-tab h2 {
          font-size: 20px;
          margin-bottom: 20px;
        }

        .anomalies-tab h3 {
          font-size: 18px;
          margin: 30px 0 15px 0;
        }

        .alert-box {
          padding: 15px;
          border-radius: 8px;
          margin-bottom: 20px;
        }

        .alert-box.critical {
          background: #e8f5e9;
          border: 1px solid #4caf50;
        }

        .alert-box strong {
          display: block;
          margin-bottom: 5px;
          color: #2e7d32;
        }

        .alert-box p {
          margin: 0;
          color: #4caf50;
          font-size: 14px;
        }

        .anomaly-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
      `}</style>
    </div>
  );
}

function AnomalyItem({ type, severity, description, timestamp, status }: any) {
  const timeAgo = Math.floor((Date.now() - timestamp) / 3600000); // hours ago
  
  return (
    <div className="anomaly-item">
      <span className={`severity-badge ${severity}`}>{severity}</span>
      <div className="anomaly-content">
        <h4>{type}</h4>
        <p>{description}</p>
        <span className="time">{timeAgo}h ago • {status}</span>
      </div>

      <style jsx>{`
        .anomaly-item {
          display: flex;
          gap: 15px;
          padding: 15px;
          background: #f8f9fa;
          border-radius: 8px;
          border: 1px solid #e0e0e0;
        }

        .severity-badge {
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          height: fit-content;
        }

        .severity-badge.high {
          background: #f44336;
          color: white;
        }

        .severity-badge.medium {
          background: #ff9800;
          color: white;
        }

        .severity-badge.low {
          background: #ffc107;
          color: #333;
        }

        .anomaly-content h4 {
          margin: 0 0 5px 0;
          font-size: 16px;
        }

        .anomaly-content p {
          margin: 0 0 10px 0;
          color: #666;
          font-size: 14px;
        }

        .time {
          font-size: 12px;
          color: #999;
        }
      `}</style>
    </div>
  );
}

function FlaggedReviewsTab() {
  return (
    <div className="flagged-tab">
      <h2>🚩 Flagged Reviews</h2>
      <p>Reviews with low authenticity scores requiring attention</p>
      
      <div className="review-list">
        <FlaggedReview
          platform="ios"
          rating={1}
          text="Terrible app, complete waste of money. Don't download!"
          authenticityScore={18}
          flags={['LOW_AUTHENTICITY', 'NEW_ACCOUNT', 'SUSPICIOUS_BEHAVIOR']}
          timestamp={Date.now() - 1800000}
        />
        <FlaggedReview
          platform="android"
          rating={1}
          text="Scam app. Use Tinder instead much better."
          authenticityScore={25}
          flags={['COMPETITOR_MENTION', 'UNVERIFIED', 'SUSPICIOUS_DEVICE']}
          timestamp={Date.now() - 3600000}
        />
      </div>

      <style jsx>{`
        .flagged-tab h2 {
          font-size: 20px;
          margin-bottom: 10px;
        }

        .flagged-tab p {
          color: #666;
          margin-bottom: 20px;
        }

        .review-list {
          display: flex;
          flex-direction: column;
          gap: 15px;
        }
      `}</style>
    </div>
  );
}

function FlaggedReview({ platform, rating, text, authenticity Score, flags, timestamp }: any) {
  const timeAgo = Math.floor((Date.now() - timestamp) / 60000);
  
  return (
    <div className="flagged-review">
      <div className="review-header">
        <span className="platform">{platform === 'ios' ? '🍎' : '🤖'} {platform.toUpperCase()}</span>
        <span className="rating">{'⭐'.repeat(rating)}</span>
        <span className="auth-score">{authenticityScore}/100</span>
        <span className="time">{timeAgo}m ago</span>
      </div>
      <p className="review-text">{text}</p>
      <div className="flags">
        {flags.map((flag: string, i: number) => (
          <span key={i} className="flag">{flag}</span>
        ))}
      </div>
      <div className="actions">
        <button className="btn-action">Review</button>
        <button className="btn-action">Appeal to Store</button>
        <button className="btn-action danger">Block User</button>
      </div>

      <style jsx>{`
        .flagged-review {
          padding: 15px;
          background: #fff5f5;
          border-radius: 8px;
          border: 1px solid #f44336;
        }

        .review-header {
          display: flex;
          gap: 15px;
          align-items: center;
          margin-bottom: 10px;
          font-size: 13px;
        }

        .platform {
          font-weight: 600;
        }

        .auth-score {
          color: #f44336;
          font-weight: 600;
        }

        .time {
          color: #999;
          margin-left: auto;
        }

        .review-text {
          margin: 0 0 15px 0;
          color: #333;
          line-height: 1.5;
        }

        .flags {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 15px;
        }

        .flag {
          padding: 4px 8px;
          background: #f44336;
          color: white;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
        }

        .actions {
          display: flex;
          gap: 10px;
        }

        .btn-action {
          padding: 8px 16px;
          background: white;
          border: 1px solid #e0e0e0;
          border-radius: 6px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
          transition: all 0.2s;
        }

        .btn-action:hover {
          background: #f8f9fa;
        }

        .btn-action.danger {
          border-color: #f44336;
          color: #f44336;
        }

        .btn-action.danger:hover {
          background: #f44336;
          color: white;
        }
      `}</style>
    </div>
  );
}
