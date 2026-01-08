/**
 * PACK 72 — AI-Driven Auto-Moderation V2 + Sensitive Media Classification
 * Admin Moderation Queue Component
 */

import React, { useState, useEffect } from 'react';
import { ModerationQueueItem } from '../../../shared/types/contentModeration';

interface ModerationQueueProps {
  authToken: string;
}

const ModerationQueue: React.FC<ModerationQueueProps> = ({ authToken }) => {
  const [queue, setQueue] = useState<ModerationQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<ModerationQueueItem | null>(null);
  const [processing, setProcessing] = useState(false);

  // Fetch moderation queue
  const fetchQueue = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/admin/moderation/pending?limit=50', {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch queue: ${response.statusText}`);
      }

      const data = await response.json();
      setQueue(data.queue || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch queue');
    } finally {
      setLoading(false);
    }
  };

  // Make moderation decision
  const makeDecision = async (contentId: string, decision: 'ALLOW' | 'AUTO_BLOCK', reason?: string) => {
    try {
      setProcessing(true);
      setError(null);

      const response = await fetch('/admin/moderation/decision', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contentId,
          decision,
          reason: reason || (decision === 'ALLOW' ? 'Approved by admin' : 'Blocked by admin'),
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to make decision: ${response.statusText}`);
      }

      // Remove from queue
      setQueue(prev => prev.filter(item => item.contentId !== contentId));
      setSelectedItem(null);

      // Show success message
      alert(`Content ${decision === 'ALLOW' ? 'approved' : 'blocked'} successfully`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to make decision');
    } finally {
      setProcessing(false);
    }
  };

  // Load queue on mount
  useEffect(() => {
    fetchQueue();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <h3 className="text-red-800 font-semibold">Error</h3>
        <p className="text-red-600">{error}</p>
        <button
          onClick={fetchQueue}
          className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (queue.length === 0) {
    return (
      <div className="text-center py-12">
        <svg
          className="mx-auto h-12 w-12 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <h3 className="mt-2 text-sm font-medium text-gray-900">All clear!</h3>
        <p className="mt-1 text-sm text-gray-500">No content pending review</p>
        <button
          onClick={fetchQueue}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Refresh
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">
          Moderation Queue ({queue.length})
        </h2>
        <button
          onClick={fetchQueue}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      {/* Priority Legend */}
      <div className="flex gap-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 bg-red-500 rounded-full"></span>
          <span>High Priority</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 bg-yellow-500 rounded-full"></span>
          <span>Medium Priority</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 bg-green-500 rounded-full"></span>
          <span>Low Priority</span>
        </div>
      </div>

      {/* Queue Items */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {queue.map((item) => (
          <div
            key={item.contentId}
            className={`border rounded-lg p-4 cursor-pointer transition ${
              selectedItem?.contentId === item.contentId
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
            onClick={() => setSelectedItem(item)}
          >
            {/* Priority Indicator */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span
                  className={`w-3 h-3 rounded-full ${
                    item.priority === 'HIGH'
                      ? 'bg-red-500'
                      : item.priority === 'MEDIUM'
                      ? 'bg-yellow-500'
                      : 'bg-green-500'
                  }`}
                ></span>
                <span className="text-sm font-medium text-gray-700">
                  {item.contentType}
                </span>
              </div>
              <span className="text-xs text-gray-500">
                {new Date(item.uploadedAt.seconds * 1000).toLocaleString()}
              </span>
            </div>

            {/* Media Preview */}
            <div className="mb-2">
              <img
                src={item.mediaUrl}
                alt="Content preview"
                className="w-full h-48 object-cover rounded"
                loading="lazy"
              />
            </div>

            {/* Labels */}
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span>Adult:</span>
                <span className={item.labels.adult > 0.5 ? 'text-red-600 font-semibold' : ''}>
                  {(item.labels.adult * 100).toFixed(0)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span>Violence:</span>
                <span className={item.labels.violence > 0.5 ? 'text-red-600 font-semibold' : ''}>
                  {(item.labels.violence * 100).toFixed(0)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span>Hateful:</span>
                <span className={item.labels.hateful > 0.5 ? 'text-red-600 font-semibold' : ''}>
                  {(item.labels.hateful * 100).toFixed(0)}%
                </span>
              </div>
              {item.labels.minorPresence > 0 && (
                <div className="flex justify-between text-red-600 font-bold">
                  <span>⚠️ Minor Presence:</span>
                  <span>{(item.labels.minorPresence * 100).toFixed(0)}%</span>
                </div>
              )}
            </div>

            {/* User Info */}
            <div className="mt-2 text-xs text-gray-600">
              User ID: {item.userId.substring(0, 8)}...
            </div>
          </div>
        ))}
      </div>

      {/* Decision Modal */}
      {selectedItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-screen overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">Make Decision</h3>

            {/* Full Image */}
            <img
              src={selectedItem.mediaUrl}
              alt="Content"
              className="w-full rounded mb-4"
            />

            {/* Details */}
            <div className="space-y-2 mb-4">
              <div>
                <strong>Content Type:</strong> {selectedItem.contentType}
              </div>
              <div>
                <strong>User ID:</strong> {selectedItem.userId}
              </div>
              <div>
                <strong>Uploaded:</strong>{' '}
                {new Date(selectedItem.uploadedAt.seconds * 1000).toLocaleString()}
              </div>
              <div>
                <strong>Priority:</strong> {selectedItem.priority}
              </div>
            </div>

            {/* Labels */}
            <div className="bg-gray-50 rounded p-4 mb-4">
              <h4 className="font-semibold mb-2">AI Classification</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>Adult: {(selectedItem.labels.adult * 100).toFixed(0)}%</div>
                <div>Violence: {(selectedItem.labels.violence * 100).toFixed(0)}%</div>
                <div>Hateful: {(selectedItem.labels.hateful * 100).toFixed(0)}%</div>
                <div>Illegal: {(selectedItem.labels.illegal * 100).toFixed(0)}%</div>
                <div>Self-harm: {(selectedItem.labels.selfHarm * 100).toFixed(0)}%</div>
                <div className={selectedItem.labels.minorPresence > 0 ? 'text-red-600 font-bold' : ''}>
                  Minor: {(selectedItem.labels.minorPresence * 100).toFixed(0)}%
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => makeDecision(selectedItem.contentId, 'ALLOW')}
                disabled={processing}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
              >
                ✓ Approve
              </button>
              <button
                onClick={() => makeDecision(selectedItem.contentId, 'AUTO_BLOCK')}
                disabled={processing}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
              >
                ✗ Block
              </button>
              <button
                onClick={() => setSelectedItem(null)}
                disabled={processing}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>

            {processing && (
              <div className="mt-4 text-center text-sm text-gray-600">
                Processing decision...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ModerationQueue;