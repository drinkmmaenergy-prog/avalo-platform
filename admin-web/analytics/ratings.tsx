/**
 * PACK 423 — Admin Analytics Dashboard
 * Ratings & NPS analytics for administrators
 */

import React, { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { NpsAnalytics } from '../../shared/types/pack423-ratings.types';

export default function RatingsAnalytics() {
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const [npsData, setNpsData] = useState<NpsAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAnalytics();
  }, [timeRange]);

  const getTimeRangeMs = () => {
    const now = Date.now();
    switch (timeRange) {
      case '7d':
        return { start: now - 7 * 24 * 60 * 60 * 1000, end: now };
      case '30d':
        return { start: now - 30 * 24 * 60 * 60 * 1000, end: now };
      case '90d':
        return { start: now - 90 * 24 * 60 * 60 * 1000, end: now };
      case 'all':
        return { start: 0, end: now };
    }
  };

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      setError(null);

      const functions = getFunctions();
      const getNpsAnalytics = httpsCallable(functions, 'pack423_getNpsAnalytics');

      const range = getTimeRangeMs();
      const result = await getNpsAnalytics(range);
      setNpsData(result.data as NpsAnalytics);
    } catch (err: any) {
      console.error('Error loading analytics:', err);
      setError(err.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  const renderNpsScore = (score: number) => {
    const color = score >= 50 ? '#4CAF50' : score >= 0 ? '#FF9800' : '#F44336';
    return (
      <div style={{ ...styles.scoreCard, borderColor: color }}>
        <div style={{ ...styles.scoreValue, color }}>{score.toFixed(1)}</div>
        <div style={styles.scoreLabel}>NPS Score</div>
      </div>
    );
  };

  const renderDistribution = (distribution: { [score: number]: number }) => {
    const total = Object.values(distribution).reduce((sum, count) => sum + count, 0);
    
    return (
      <div style={styles.distributionContainer}>
        <h3 style={styles.sectionTitle}>Score Distribution</h3>
        <div style={styles.bars}>
          {Object.entries(distribution)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([score, count]) => {
              const percentage = total > 0 ? (count / total) * 100 : 0;
              const color =
                Number(score) <= 6
                  ? '#F44336'
                  : Number(score) <= 8
                  ? '#FF9800'
                  : '#4CAF50';
              
              return (
                <div key={score} style={styles.barRow}>
                  <div style={styles.barLabel}>{score}</div>
                  <div style={styles.barContainer}>
                    <div
                      style={{
                        ...styles.barFill,
                        width: `${percentage}%`,
                        backgroundColor: color,
                      }}
                    />
                  </div>
                  <div style={styles.barCount}>{count}</div>
                </div>
              );
            })}
        </div>
      </div>
    );
  };

  const renderByProductArea = () => {
    if (!npsData?.byProductArea) return null;

    return (
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>NPS by Product Area</h3>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Area</th>
              <th style={styles.th}>Responses</th>
              <th style={styles.th}>Avg Score</th>
              <th style={styles.th}>NPS</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(npsData.byProductArea).map(([area, data]) => (
              <tr key={area}>
                <td style={styles.td}>{area}</td>
                <td style={styles.td}>{data.totalResponses}</td>
                <td style={styles.td}>{data.avgScore.toFixed(1)}</td>
                <td style={styles.td}>
                  <span
                    style={{
                      color:
                        data.npsScore >= 50
                          ? '#4CAF50'
                          : data.npsScore >= 0
                          ? '#FF9800'
                          : '#F44336',
                      fontWeight: 'bold',
                    }}
                  >
                    {data.npsScore.toFixed(1)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderBySegment = () => {
    if (!npsData?.bySegment) return null;

    return (
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>NPS by User Segment</h3>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Segment</th>
              <th style={styles.th}>Responses</th>
              <th style={styles.th}>Avg Score</th>
              <th style={styles.th}>NPS</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(npsData.bySegment).map(([segment, data]) => (
              <tr key={segment}>
                <td style={styles.td}>{segment}</td>
                <td style={styles.td}>{data.totalResponses}</td>
                <td style={styles.td}>{data.avgScore.toFixed(1)}</td>
                <td style={styles.td}>
                  <span
                    style={{
                      color:
                        data.npsScore >= 50
                          ? '#4CAF50'
                          : data.npsScore >= 0
                          ? '#FF9800'
                          : '#F44336',
                      fontWeight: 'bold',
                    }}
                  >
                    {data.npsScore.toFixed(1)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  if (loading) {
    return <div style={styles.loading}>Loading analytics...</div>;
  }

  if (error) {
    return <div style={styles.error}>Error: {error}</div>;
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Ratings & NPS Analytics</h1>
        
        <div style={styles.timeRangeSelector}>
          {(['7d', '30d', '90d', 'all'] as const).map((range) => (
            <button
              key={range}
              style={{
                ...styles.rangeButton,
                ...(timeRange === range ? styles.rangeButtonActive : {}),
              }}
              onClick={() => setTimeRange(range)}
            >
              {range === 'all' ? 'All Time' : range.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {npsData && (
        <>
          <div style={styles.overview}>
            {renderNpsScore(npsData.npsScore)}
            
            <div style={styles.statsGrid}>
              <div style={styles.statCard}>
                <div style={styles.statValue}>{npsData.totalResponses}</div>
                <div style={styles.statLabel}>Total Responses</div>
              </div>
              
              <div style={{ ...styles.statCard, borderColor: '#4CAF50' }}>
                <div style={{ ...styles.statValue, color: '#4CAF50' }}>
                  {npsData.promoters}
                </div>
                <div style={styles.statLabel}>
                  Promoters ({((npsData.promoters / npsData.totalResponses) * 100).toFixed(0)}%)
                </div>
              </div>
              
              <div style={{ ...styles.statCard, borderColor: '#FF9800' }}>
                <div style={{ ...styles.statValue, color: '#FF9800' }}>
                  {npsData.passives}
                </div>
                <div style={styles.statLabel}>
                  Passives ({((npsData.passives / npsData.totalResponses) * 100).toFixed(0)}%)
                </div>
              </div>
              
              <div style={{ ...styles.statCard, borderColor: '#F44336' }}>
                <div style={{ ...styles.statValue, color: '#F44336' }}>
                  {npsData.detractors}
                </div>
                <div style={styles.statLabel}>
                  Detractors ({((npsData.detractors / npsData.totalResponses) * 100).toFixed(0)}%)
                </div>
              </div>
            </div>
          </div>

          {renderDistribution(npsData.distribution)}
          {renderByProductArea()}
          {renderBySegment()}
        </>
      )}
    </div>
  );
}

const styles = {
  container: {
    padding: '24px',
    maxWidth: '1200px',
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '32px',
  },
  title: {
    fontSize: '32px',
    fontWeight: 'bold',
    margin: 0,
  },
  timeRangeSelector: {
    display: 'flex',
    gap: '8px',
  },
  rangeButton: {
    padding: '8px 16px',
    border: '1px solid #E0E0E0',
    borderRadius: '8px',
    backgroundColor: '#FFFFFF',
    cursor: 'pointer',
    fontSize: '14px',
  },
  rangeButtonActive: {
    backgroundColor: '#007AFF',
    color: '#FFFFFF',
    borderColor: '#007AFF',
  },
  overview: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr',
    gap: '24px',
    marginBottom: '32px',
  },
  scoreCard: {
    border: '3px solid',
    borderRadius: '16px',
    padding: '24px',
    textAlign: 'center' as const,
    minWidth: '200px',
  },
  scoreValue: {
    fontSize: '64px',
    fontWeight: 'bold',
    lineHeight: '1',
  },
  scoreLabel: {
    fontSize: '18px',
    color: '#666666',
    marginTop: '8px',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '16px',
  },
  statCard: {
    border: '2px solid #E0E0E0',
    borderRadius: '12px',
    padding: '16px',
    textAlign: 'center' as const,
  },
  statValue: {
    fontSize: '32px',
    fontWeight: 'bold',
  },
  statLabel: {
    fontSize: '14px',
    color: '#666666',
    marginTop: '4px',
  },
  distributionContainer: {
    marginBottom: '32px',
  },
  section: {
    marginBottom: '32px',
  },
  sectionTitle: {
    fontSize: '24px',
    fontWeight: 'bold',
    marginBottom: '16px',
  },
  bars: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  barRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  barLabel: {
    width: '30px',
    textAlign: 'right' as const,
    fontWeight: 'bold',
  },
  barContainer: {
    flex: 1,
    height: '24px',
    backgroundColor: '#F0F0F0',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    transition: 'width 0.3s',
  },
  barCount: {
    width: '50px',
    textAlign: 'right' as const,
    fontSize: '14px',
    color: '#666666',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    backgroundColor: '#FFFFFF',
    border: '1px solid #E0E0E0',
    borderRadius: '8px',
  },
  th: {
    padding: '12px',
    textAlign: 'left' as const,
    borderBottom: '2px solid #E0E0E0',
    fontWeight: 'bold',
    backgroundColor: '#F5F5F5',
  },
  td: {
    padding: '12px',
    borderBottom: '1px solid #E0E0E0',
  },
  loading: {
    padding: '48px',
    textAlign: 'center' as const,
    fontSize: '18px',
    color: '#666666',
  },
  error: {
    padding: '48px',
    textAlign: 'center' as const,
    fontSize: '18px',
    color: '#F44336',
  },
};
