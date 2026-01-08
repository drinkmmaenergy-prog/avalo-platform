/**
 * Moderator Hub - Queue Dashboard
 * 
 * AI-assisted moderation interface for human reviewers.
 * Displays priority-based queue with AI recommendations.
 */

'use client';

import React, { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';

interface QueueItem {
  queueId: string;
  contentId: string;
  contentType: string;
  userId: string;
  priority: number;
  status: string;
  aiAnalysis: {
    riskScore: number;
    riskLevel: string;
    flags: Array<{
      category: string;
      confidence: number;
      evidence: string;
    }>;
    recommendation: string;
  };
  contentSnapshot: {
    text?: string;
    metadata: any;
  };
  userContext: {
    trustScore: number;
    accountAge: number;
    previousFlags: number;
    previousBans: number;
  };
  sla: {
    mustReviewBy: any;
    isOverdue: boolean;
    hoursRemaining: number;
  };
  createdAt: any;
}

interface SimilarCase {
  caseId: string;
  similarity: number;
  resolution: string;
  moderatorNotes: string;
}

export default function ModerationQueueDashboard() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<QueueItem | null>(null);
  const [similarCases, setSimilarCases] = useState<SimilarCase[]>([]);
  const [userPattern, setUserPattern] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalPending: 0,
    totalOverdue: 0,
    criticalCount: 0,
  });
  const [filter, setFilter] = useState({
    status: 'pending',
    priority: undefined as number | undefined,
    assignedToMe: false,
  });

  const functions = getFunctions();

  useEffect(() => {
    loadQueue();
    const interval = setInterval(loadQueue, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [filter]);

  const loadQueue = async () => {
    try {
      const getModerationQueue = httpsCallable(functions, 'getModerationQueueV2');
      const result = await getModerationQueue(filter) as any;
      setQueue(result.data.queue);
      setStats(result.data.stats);
      setLoading(false);
    } catch (error) {
      console.error('Failed to load queue:', error);
      setLoading(false);
    }
  };

  const loadItemDetails = async (queueId: string) => {
    try {
      const getDetails = httpsCallable(functions, 'getQueueItemDetailsV1');
      const result = await getDetails({ queueId }) as any;
      setSelectedItem(result.data.item);
      setSimilarCases(result.data.similarCases);
      setUserPattern(result.data.userPattern);
    } catch (error) {
      console.error('Failed to load item details:', error);
    }
  };

  const claimItem = async (queueId: string) => {
    try {
      const claim = httpsCallable(functions, 'claimQueueItemV1');
      await claim({ queueId });
      await loadItemDetails(queueId);
      await loadQueue();
    } catch (error) {
      console.error('Failed to claim item:', error);
    }
  };

  const resolveItem = async (action: string, reason: string, notes: string, durationDays?: number) => {
    if (!selectedItem) return;

    try {
      const resolve = httpsCallable(functions, 'resolveQueueItemV1');
      await resolve({
        queueId: selectedItem.queueId,
        action,
        reason,
        notes,
        durationDays,
      });
      setSelectedItem(null);
      await loadQueue();
    } catch (error) {
      console.error('Failed to resolve item:', error);
    }
  };

  const getPriorityBadge = (priority: number) => {
    const badges = {
      10: { label: 'CRITICAL', color: 'bg-red-500' },
      7: { label: 'HIGH', color: 'bg-orange-500' },
      5: { label: 'MEDIUM', color: 'bg-yellow-500' },
      3: { label: 'LOW', color: 'bg-blue-500' },
    };
    const badge = badges[priority as keyof typeof badges] || { label: 'UNKNOWN', color: 'bg-gray-500' };
    return (
      <span className={`px-2 py-1 rounded text-white text-xs font-bold ${badge.color}`}>
        {badge.label}
      </span>
    );
  };

  const getRiskLevelColor = (riskLevel: string) => {
    const colors = {
      safe: 'text-green-600',
      caution: 'text-yellow-600',
      warning: 'text-orange-600',
      critical: 'text-red-600',
    };
    return colors[riskLevel as keyof typeof colors] || 'text-gray-600';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-xl">Loading moderation queue...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Queue List */}
      <div className="w-1/3 bg-white shadow-lg overflow-y-auto">
        <div className="p-4 border-b bg-gray-50">
          <h1 className="text-2xl font-bold mb-4">Moderation Queue</h1>
          
          {/* Stats */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="bg-blue-100 p-2 rounded">
              <div className="text-xs text-gray-600">Pending</div>
              <div className="text-xl font-bold">{stats.totalPending}</div>
            </div>
            <div className="bg-red-100 p-2 rounded">
              <div className="text-xs text-gray-600">Overdue</div>
              <div className="text-xl font-bold">{stats.totalOverdue}</div>
            </div>
            <div className="bg-orange-100 p-2 rounded">
              <div className="text-xs text-gray-600">Critical</div>
              <div className="text-xl font-bold">{stats.criticalCount}</div>
            </div>
          </div>

          {/* Filters */}
          <div className="space-y-2">
            <select
              className="w-full p-2 border rounded"
              value={filter.status}
              onChange={(e) => setFilter({ ...filter, status: e.target.value })}
            >
              <option value="pending">Pending</option>
              <option value="in_review">In Review</option>
              <option value="">All</option>
            </select>

            <label className="flex items-center">
              <input
                type="checkbox"
                checked={filter.assignedToMe}
                onChange={(e) => setFilter({ ...filter, assignedToMe: e.target.checked })}
                className="mr-2"
              />
              <span className="text-sm">Assigned to me</span>
            </label>
          </div>
        </div>

        {/* Queue Items */}
        <div className="divide-y">
          {queue.map((item) => (
            <div
              key={item.queueId}
              className={`p-4 cursor-pointer hover:bg-gray-50 ${
                selectedItem?.queueId === item.queueId ? 'bg-blue-50' : ''
              } ${item.sla.isOverdue ? 'border-l-4 border-red-500' : ''}`}
              onClick={() => loadItemDetails(item.queueId)}
            >
              <div className="flex justify-between items-start mb-2">
                {getPriorityBadge(item.priority)}
                <span className="text-xs text-gray-500">
                  {item.sla.hoursRemaining > 0
                    ? `${item.sla.hoursRemaining.toFixed(1)}h left`
                    : `${Math.abs(item.sla.hoursRemaining).toFixed(1)}h overdue`}
                </span>
              </div>

              <div className="text-sm font-semibold mb-1">{item.contentType.toUpperCase()}</div>
              
              <div className="text-xs text-gray-600 mb-2 line-clamp-2">
                {item.contentSnapshot.text || 'Media content'}
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className={`font-bold ${getRiskLevelColor(item.aiAnalysis.riskLevel)}`}>
                  {item.aiAnalysis.riskLevel.toUpperCase()} ({item.aiAnalysis.riskScore})
                </span>
                <span className="text-gray-500">
                  Trust: {item.userContext.trustScore}
                </span>
              </div>

              {item.aiAnalysis.flags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {item.aiAnalysis.flags.slice(0, 2).map((flag, i) => (
                    <span key={i} className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">
                      {flag.category}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Detail Panel */}
      <div className="flex-1 overflow-y-auto p-6">
        {selectedItem ? (
          <div className="space-y-6">
            {/* Header */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-2xl font-bold mb-2">Review Required</h2>
                  {getPriorityBadge(selectedItem.priority)}
                </div>
                <div className="text-right text-sm text-gray-600">
                  <div>Queue ID: {selectedItem.queueId}</div>
                  <div>Content: {selectedItem.contentId}</div>
                </div>
              </div>

              {/* SLA Warning */}
              {selectedItem.sla.isOverdue && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                  ⚠️ <strong>OVERDUE:</strong> SLA breach - {Math.abs(selectedItem.sla.hoursRemaining).toFixed(1)} hours overdue
                </div>
              )}

              {/* Content */}
              <div className="bg-gray-50 p-4 rounded mb-4">
                <h3 className="font-semibold mb-2">Content:</h3>
                <p className="whitespace-pre-wrap">{selectedItem.contentSnapshot.text || 'Media content'}</p>
              </div>

              {/* AI Analysis */}
              <div className="mb-4">
                <h3 className="font-semibold mb-2">AI Analysis:</h3>
                <div className="space-y-2">
                  <div className="flex items-center">
                    <span className="font-medium mr-2">Risk Score:</span>
                    <span className={`font-bold ${getRiskLevelColor(selectedItem.aiAnalysis.riskLevel)}`}>
                      {selectedItem.aiAnalysis.riskScore}/100 ({selectedItem.aiAnalysis.riskLevel.toUpperCase()})
                    </span>
                  </div>
                  <div>
                    <span className="font-medium">AI Recommendation:</span>
                    <span className="ml-2 px-2 py-1 bg-blue-100 rounded text-sm">
                      {selectedItem.aiAnalysis.recommendation}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium">Detected Issues:</span>
                    <div className="mt-2 space-y-2">
                      {selectedItem.aiAnalysis.flags.map((flag, i) => (
                        <div key={i} className="bg-red-50 p-3 rounded border border-red-200">
                          <div className="font-semibold text-red-700">{flag.category}</div>
                          <div className="text-sm text-gray-700">{flag.evidence}</div>
                          <div className="text-xs text-gray-500 mt-1">
                            Confidence: {flag.confidence}%
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* User Context */}
              <div className="bg-blue-50 p-4 rounded">
                <h3 className="font-semibold mb-2">User Context:</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Trust Score:</span>
                    <span className="ml-2 font-semibold">{selectedItem.userContext.trustScore}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Account Age:</span>
                    <span className="ml-2 font-semibold">{selectedItem.userContext.accountAge} days</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Previous Flags:</span>
                    <span className="ml-2 font-semibold">{selectedItem.userContext.previousFlags}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Previous Bans:</span>
                    <span className="ml-2 font-semibold">{selectedItem.userContext.previousBans}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* User Pattern */}
            {userPattern && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="font-semibold mb-4">User Pattern Analysis:</h3>
                {userPattern.isRepeatOffender && (
                  <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded mb-4">
                    ⚠️ <strong>REPEAT OFFENDER:</strong> {userPattern.offenseCount} violations in last 90 days
                  </div>
                )}
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="font-medium">Offense Count:</span> {userPattern.offenseCount}
                  </div>
                  <div>
                    <span className="font-medium">Common Violations:</span> {userPattern.commonViolations.join(', ')}
                  </div>
                  <div>
                    <span className="font-medium">Recommended Action:</span>
                    <span className="ml-2 px-2 py-1 bg-orange-100 rounded font-semibold">
                      {userPattern.recommendedAction}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Similar Cases */}
            {similarCases.length > 0 && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="font-semibold mb-4">Similar Cases (for reference):</h3>
                <div className="space-y-3">
                  {similarCases.map((case_) => (
                    <div key={case_.caseId} className="border-l-4 border-blue-500 pl-4 py-2">
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-semibold">Similarity: {case_.similarity}%</span>
                        <span className="text-sm px-2 py-1 bg-green-100 rounded">
                          Action: {case_.resolution}
                        </span>
                      </div>
                      <div className="text-sm text-gray-600">{case_.moderatorNotes}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="font-semibold mb-4">Moderator Actions:</h3>
              
              {!selectedItem.assignedTo && (
                <button
                  onClick={() => claimItem(selectedItem.queueId)}
                  className="w-full mb-4 bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-4 rounded"
                >
                  Claim This Item
                </button>
              )}

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => resolveItem('approve', 'No violation found', '')}
                  className="bg-green-500 hover:bg-green-600 text-white py-2 px-4 rounded"
                >
                  ✓ Approve
                </button>
                <button
                  onClick={() => resolveItem('warn', 'Community guidelines violation', 'Issued warning')}
                  className="bg-yellow-500 hover:bg-yellow-600 text-white py-2 px-4 rounded"
                >
                  ⚠️ Warn
                </button>
                <button
                  onClick={() => resolveItem('remove_content', 'Content violates guidelines', 'Content removed')}
                  className="bg-orange-500 hover:bg-orange-600 text-white py-2 px-4 rounded"
                >
                  🗑️ Remove
                </button>
                <button
                  onClick={() => resolveItem('suspend_user', 'Serious violation', 'User suspended', 7)}
                  className="bg-red-500 hover:bg-red-600 text-white py-2 px-4 rounded"
                >
                  ⛔ Suspend (7d)
                </button>
                <button
                  onClick={() => resolveItem('ban_user', 'Severe/repeated violations', 'User banned permanently')}
                  className="bg-red-700 hover:bg-red-800 text-white py-2 px-4 rounded"
                >
                  🚫 Ban
                </button>
                <button
                  onClick={() => resolveItem('escalate', 'Requires senior review', 'Escalated to senior moderator')}
                  className="bg-purple-500 hover:bg-purple-600 text-white py-2 px-4 rounded"
                >
                  ↗️ Escalate
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400 text-xl">
            Select an item from the queue to review
          </div>
        )}
      </div>
    </div>
  );
}