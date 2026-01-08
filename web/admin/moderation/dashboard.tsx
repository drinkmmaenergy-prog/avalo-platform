/**
 * Moderator Dashboard - Phase 41: Human-in-the-Loop Moderation Portal
 *
 * Admin interface for reviewing AI-flagged content and making
 * moderation decisions.
 */

import React, { useState, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../app/lib/firebase';

interface QueueItem {
  queueId: string;
  contentId: string;
  contentType: string;
  userId: string;
  analysis: {
    riskScore: number;
    riskLevel: string;
    flags: Array<{
      category: string;
      confidence: number;
      evidence: string;
    }>;
    recommendation: string;
    reasoning: string;
    confidence: number;
  };
  priority: number;
  status: string;
  createdAt: any;
}

export default function ModeratorDashboard() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<QueueItem | null>(null);
  const [resolving, setResolving] = useState(false);
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    loadQueue();
    loadStats();
  }, []);

  const loadQueue = async () => {
    try {
      setLoading(true);
      const getModerationQueue = httpsCallable(functions, 'getModerationQueueV1');
      const result = await getModerationQueue({ status: 'pending', limit: 50 });
      const data = result.data as { queue: QueueItem[] };
      setQueue(data.queue);
      setLoading(false);
    } catch (error: any) {
      console.error('Error loading queue:', error);
      alert('Failed to load moderation queue: ' + error.message);
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const getStats = httpsCallable(functions, 'getAIOversightStatsV1');
      const result = await getStats({ days: 7 });
      setStats(result.data);
    } catch (error: any) {
      console.error('Error loading stats:', error);
    }
  };

  const resolveItem = async (action: string, notes: string) => {
    if (!selectedItem) return;

    try {
      setResolving(true);
      const resolveFunc = httpsCallable(functions, 'resolveModerationItemV1');
      await resolveFunc({
        queueId: selectedItem.queueId,
        action,
        notes,
      });

      alert('Item resolved successfully');
      setSelectedItem(null);
      loadQueue();
    } catch (error: any) {
      console.error('Error resolving item:', error);
      alert('Failed to resolve item: ' + error.message);
    } finally {
      setResolving(false);
    }
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'safe': return '#4CAF50';
      case 'caution': return '#FF9800';
      case 'warning': return '#F44336';
      case 'critical': return '#9C27B0';
      default: return '#757575';
    }
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>Moderation Dashboard</h1>
        {stats && (
          <div style={styles.statsRow}>
            <div style={styles.statCard}>
              <div style={styles.statValue}>{stats.totalAnalyses}</div>
              <div style={styles.statLabel}>Total Analyses (7d)</div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statValue}>{stats.avgLatency}ms</div>
              <div style={styles.statLabel}>Avg Latency</div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statValue}>{stats.humanReviewRate.toFixed(1)}%</div>
              <div style={styles.statLabel}>Human Review Rate</div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statValue}>{stats.avgConfidence.toFixed(0)}%</div>
              <div style={styles.statLabel}>Avg Confidence</div>
            </div>
          </div>
        )}
      </div>

      {/* Queue */}
      <div style={styles.content}>
        <div style={styles.queueSection}>
          <h2>Pending Reviews ({queue.length})</h2>
          {loading ? (
            <div style={styles.loading}>Loading...</div>
          ) : queue.length === 0 ? (
            <div style={styles.empty}>No items in queue</div>
          ) : (
            <div style={styles.queueList}>
              {queue.map((item) => (
                <div
                  key={item.queueId}
                  style={{
                    ...styles.queueItem,
                    borderLeft: `4px solid ${getRiskColor(item.analysis.riskLevel)}`,
                  }}
                  onClick={() => setSelectedItem(item)}
                >
                  <div style={styles.queueHeader}>
                    <span style={styles.priority}>P{item.priority}</span>
                    <span style={styles.contentType}>{item.contentType}</span>
                    <span style={{
                      ...styles.riskBadge,
                      backgroundColor: getRiskColor(item.analysis.riskLevel),
                    }}>
                      {item.analysis.riskLevel.toUpperCase()}
                    </span>
                  </div>
                  <div style={styles.queueBody}>
                    <div style={styles.riskScore}>Risk: {item.analysis.riskScore}/100</div>
                    <div style={styles.flags}>
                      {item.analysis.flags.slice(0, 2).map((flag, idx) => (
                        <span key={idx} style={styles.flagBadge}>
                          {flag.category.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div style={styles.userId}>User: {item.userId.substring(0, 8)}...</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detail Panel */}
        {selectedItem && (
          <div style={styles.detailPanel}>
            <div style={styles.detailHeader}>
              <h2>Review Item</h2>
              <button style={styles.closeButton} onClick={() => setSelectedItem(null)}>
                ×
              </button>
            </div>

            <div style={styles.detailContent}>
              <div style={styles.section}>
                <h3>Risk Analysis</h3>
                <div style={styles.riskInfo}>
                  <div>Risk Score: <strong>{selectedItem.analysis.riskScore}/100</strong></div>
                  <div>Risk Level: <strong style={{ color: getRiskColor(selectedItem.analysis.riskLevel) }}>
                    {selectedItem.analysis.riskLevel.toUpperCase()}
                  </strong></div>
                  <div>AI Confidence: <strong>{selectedItem.analysis.confidence}%</strong></div>
                  <div>AI Recommendation: <strong>{selectedItem.analysis.recommendation}</strong></div>
                </div>
              </div>

              <div style={styles.section}>
                <h3>AI Reasoning</h3>
                <p style={styles.reasoning}>{selectedItem.analysis.reasoning}</p>
              </div>

              <div style={styles.section}>
                <h3>Risk Flags</h3>
                {selectedItem.analysis.flags.map((flag, idx) => (
                  <div key={idx} style={styles.flagDetail}>
                    <div style={styles.flagHeader}>
                      <strong>{flag.category.replace(/_/g, ' ').toUpperCase()}</strong>
                      <span style={styles.confidence}>{flag.confidence}% confident</span>
                    </div>
                    <p style={styles.evidence}>{flag.evidence}</p>
                  </div>
                ))}
              </div>

              <div style={styles.section}>
                <h3>Content Info</h3>
                <div style={styles.contentInfo}>
                  <div>Content ID: {selectedItem.contentId}</div>
                  <div>User ID: {selectedItem.userId}</div>
                  <div>Content Type: {selectedItem.contentType}</div>
                  <div>Priority: {selectedItem.priority}</div>
                </div>
              </div>

              <div style={styles.actions}>
                <h3>Moderator Actions</h3>
                <div style={styles.actionButtons}>
                  <button
                    style={{ ...styles.actionButton, ...styles.allowButton }}
                    onClick={() => {
                      const notes = prompt('Add notes (optional):');
                      if (notes !== null) resolveItem('allow', notes || 'Approved after review');
                    }}
                    disabled={resolving}
                  >
                    ✓ Allow
                  </button>
                  <button
                    style={{ ...styles.actionButton, ...styles.shadowBanButton }}
                    onClick={() => {
                      const notes = prompt('Add notes:');
                      if (notes) resolveItem('shadow_ban', notes);
                    }}
                    disabled={resolving}
                  >
                    👁️ Shadow Ban
                  </button>
                  <button
                    style={{ ...styles.actionButton, ...styles.blockButton }}
                    onClick={() => {
                      const notes = prompt('Add notes:');
                      if (notes) resolveItem('block', notes);
                    }}
                    disabled={resolving}
                  >
                    🚫 Block
                  </button>
                  <button
                    style={{ ...styles.actionButton, ...styles.escalateButton }}
                    onClick={() => {
                      const notes = prompt('Add notes:');
                      if (notes) resolveItem('escalate', notes);
                    }}
                    disabled={resolving}
                  >
                    ⚠️ Escalate
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#1976D2',
    color: '#fff',
    padding: '20px',
  },
  title: {
    margin: '0 0 20px 0',
    fontSize: '28px',
  },
  statsRow: {
    display: 'flex',
    gap: '15px',
  },
  statCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: '15px',
    borderRadius: '8px',
    flex: 1,
  },
  statValue: {
    fontSize: '24px',
    fontWeight: 'bold',
  },
  statLabel: {
    fontSize: '12px',
    marginTop: '5px',
    opacity: 0.9,
  },
  content: {
    display: 'flex',
    padding: '20px',
    gap: '20px',
  },
  queueSection: {
    flex: 1,
  },
  queueList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  queueItem: {
    backgroundColor: '#fff',
    padding: '15px',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'transform 0.2s',
  },
  queueHeader: {
    display: 'flex',
    gap: '10px',
    marginBottom: '10px',
  },
  priority: {
    backgroundColor: '#FF9800',
    color: '#fff',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 'bold',
  },
  contentType: {
    backgroundColor: '#E0E0E0',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '12px',
  },
  riskBadge: {
    color: '#fff',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 'bold',
  },
  queueBody: {
    marginBottom: '10px',
  },
  riskScore: {
    fontSize: '14px',
    fontWeight: 'bold',
    marginBottom: '8px',
  },
  flags: {
    display: 'flex',
    gap: '5px',
    flexWrap: 'wrap',
  },
  flagBadge: {
    backgroundColor: '#F44336',
    color: '#fff',
    padding: '2px 6px',
    borderRadius: '3px',
    fontSize: '11px',
    textTransform: 'capitalize',
  },
  userId: {
    fontSize: '12px',
    color: '#757575',
  },
  detailPanel: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: '8px',
    padding: '20px',
    maxHeight: 'calc(100vh - 180px)',
    overflow: 'auto',
  },
  detailHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    borderBottom: '2px solid #E0E0E0',
    paddingBottom: '10px',
  },
  closeButton: {
    background: 'none',
    border: 'none',
    fontSize: '32px',
    cursor: 'pointer',
    color: '#757575',
  },
  detailContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  section: {
    borderBottom: '1px solid #E0E0E0',
    paddingBottom: '15px',
  },
  riskInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    fontSize: '14px',
  },
  reasoning: {
    fontSize: '14px',
    color: '#424242',
    lineHeight: '1.6',
  },
  flagDetail: {
    marginBottom: '15px',
    padding: '10px',
    backgroundColor: '#FFF3E0',
    borderRadius: '4px',
  },
  flagHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '8px',
  },
  confidence: {
    fontSize: '12px',
    color: '#757575',
  },
  evidence: {
    fontSize: '13px',
    color: '#424242',
    margin: 0,
  },
  contentInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    fontSize: '14px',
  },
  actions: {
    paddingTop: '15px',
  },
  actionButtons: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
  },
  actionButton: {
    padding: '10px 20px',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 'bold',
    transition: 'opacity 0.2s',
  },
  allowButton: {
    backgroundColor: '#4CAF50',
    color: '#fff',
  },
  shadowBanButton: {
    backgroundColor: '#FF9800',
    color: '#fff',
  },
  blockButton: {
    backgroundColor: '#F44336',
    color: '#fff',
  },
  escalateButton: {
    backgroundColor: '#9C27B0',
    color: '#fff',
  },
  loading: {
    textAlign: 'center',
    padding: '40px',
    color: '#757575',
  },
  empty: {
    textAlign: 'center',
    padding: '40px',
    color: '#757575',
  },
};
