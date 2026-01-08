/**
 * PACK 320 - Real-Time Moderation Dashboard
 * Admin-only interface for reviewing flagged content and taking action
 */

import React, { useState, useEffect } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  doc,
  getDoc,
  Timestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../lib/firebase';

// ============================================================================
// TYPES
// ============================================================================

type ModerationItemType = 'IMAGE' | 'PROFILE' | 'CHAT' | 'MEETING' | 'EVENT' | 'AUDIO' | 'VIDEO';
type ModerationRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type ModerationStatus = 'PENDING' | 'IN_REVIEW' | 'ACTION_TAKEN' | 'DISMISSED';
type ModerationActionType = 
  | 'DISMISS'
  | 'WARNING'
  | 'LIMIT_VISIBILITY'
  | 'SUSPEND_24H'
  | 'SUSPEND_72H'
  | 'SUSPEND_7D'
  | 'PERMANENT_BAN'
  | 'REMOVE_CONTENT'
  | 'REQUIRE_REVERIFICATION';

interface AIFlags {
  nudity?: number;
  weapons?: number;
  violence?: number;
  csamProbability?: number;
  deepfake?: number;
  faceMismatch?: number;
  toxicity?: number;
  hate?: number;
  harassment?: number;
  bannedTerms?: string[];
}

interface ModerationQueueItem {
  itemId: string;
  type: ModerationItemType;
  userId: string;
  reporterId: string | null;
  createdAt: any;
  sourceRef: string;
  riskLevel: ModerationRiskLevel;
  status: ModerationStatus;
  aiFlags: AIFlags;
  notes: string;
  lastUpdated: any;
  contentUrl?: string;
  thumbnailUrl?: string;
  extractedText?: string;
  reportReason?: string;
}

interface UserProfile {
  name: string;
  age: number;
  badges: string[];
  trustLevel: string;
  verificationStatus: string;
  accountCreated: any;
}

interface DashboardStats {
  totalPending: number;
  totalInReview: number;
  totalToday: number;
  totalThisWeek: number;
  criticalUnresolved: number;
  highUnresolved: number;
  avgResolutionTimeMinutes: number;
  moderatorsActive: number;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function ModerationDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [queueItems, setQueueItems] = useState<ModerationQueueItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<ModerationQueueItem | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  
  // Filters
  const [filterType, setFilterType] = useState<ModerationItemType | 'ALL'>('ALL');
  const [filterRisk, setFilterRisk] = useState<ModerationRiskLevel | 'ALL'>('ALL');
  const [filterStatus, setFilterStatus] = useState<ModerationStatus | 'ALL'>('PENDING');
  const [searchUserId, setSearchUserId] = useState('');

  useEffect(() => {
    loadDashboard();
  }, [filterType, filterRisk, filterStatus, searchUserId]);

  const loadDashboard = async () => {
    try {
      setLoading(true);

      // Load stats via Cloud Function
      const getModerationStats = httpsCallable(functions, 'getModerationStats');
      const statsResult = await getModerationStats({});
      setStats(statsResult.data as DashboardStats);

      // Load queue items
      await loadQueueItems();

      setLoading(false);
    } catch (error) {
      console.error('Error loading dashboard:', error);
      setLoading(false);
    }
  };

  const loadQueueItems = async () => {
    try {
      let q = query(
        collection(db, 'moderationQueue'),
        orderBy('createdAt', 'desc'),
        limit(50)
      );

      // Apply filters
      if (filterStatus !== 'ALL') {
        q = query(q, where('status', '==', filterStatus));
      }
      if (filterType !== 'ALL') {
        q = query(q, where('type', '==', filterType));
      }
      if (filterRisk !== 'ALL') {
        q = query(q, where('riskLevel', '==', filterRisk));
      }
      if (searchUserId) {
        q = query(q, where('userId', '==', searchUserId));
      }

      const snapshot = await getDocs(q);
      const items = snapshot.docs.map((doc) => doc.data() as ModerationQueueItem);
      
      // Sort with CRITICAL first
      items.sort((a, b) => {
        const riskOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
        return riskOrder[a.riskLevel] - riskOrder[b.riskLevel];
      });

      setQueueItems(items);
    } catch (error) {
      console.error('Error loading queue items:', error);
    }
  };

  const handleSelectItem = async (item: ModerationQueueItem) => {
    setSelectedItem(item);
    
    // Load user profile
    try {
      const userDoc = await getDoc(doc(db, 'users', item.userId));
      if (userDoc.exists()) {
        setUserProfile(userDoc.data() as UserProfile);
      }
    } catch (error) {
      console.error('Error loading user profile:', error);
    }
  };

  const handleTakeAction = async (
    actionType: ModerationActionType,
    reason: string
  ) => {
    if (!selectedItem) return;

    if (!confirm(`Are you sure you want to ${actionType} this item?`)) {
      return;
    }

    try {
      setActionLoading(true);

      const processModerationAction = httpsCallable(functions, 'processModerationAction');
      await processModerationAction({
        queueItemId: selectedItem.itemId,
        actionType,
        reason,
        notes: ''
      });

      alert('Action completed successfully');
      setSelectedItem(null);
      loadDashboard();
    } catch (error: any) {
      console.error('Error taking action:', error);
      alert(`Failed to take action: ${error.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading Moderation Dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">🛡️ Moderation Dashboard</h1>
              <p className="mt-1 text-sm text-gray-500">
                Review and take action on flagged content
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={loadDashboard}
                className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Grid */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <StatCard
              title="Pending"
              value={stats.totalPending}
              icon="⏳"
              color="blue"
            />
            <StatCard
              title="Critical"
              value={stats.criticalUnresolved}
              icon="🚨"
              color="red"
            />
            <StatCard
              title="Today"
              value={stats.totalToday}
              icon="📅"
              color="purple"
            />
            <StatCard
              title="Avg Resolution"
              value={`${stats.avgResolutionTimeMinutes}m`}
              icon="⏱️"
              color="green"
            />
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-lg font-bold mb-4">Filters</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Status
              </label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="w-full rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="ALL">All</option>
                <option value="PENDING">Pending</option>
                <option value="IN_REVIEW">In Review</option>
                <option value="ACTION_TAKEN">Action Taken</option>
                <option value="DISMISSED">Dismissed</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Type
              </label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as any)}
                className="w-full rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="ALL">All</option>
                <option value="IMAGE">Image</option>
                <option value="PROFILE">Profile</option>
                <option value="CHAT">Chat</option>
                <option value="MEETING">Meeting</option>
                <option value="EVENT">Event</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Risk Level
              </label>
              <select
                value={filterRisk}
                onChange={(e) => setFilterRisk(e.target.value as any)}
                className="w-full rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="ALL">All</option>
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                User ID
              </label>
              <input
                type="text"
                value={searchUserId}
                onChange={(e) => setSearchUserId(e.target.value)}
                placeholder="Search by user ID"
                className="w-full rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Queue List */}
        <div className="bg-white rounded-lg shadow mb-8">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-bold">Queue ({queueItems.length})</h2>
          </div>
          <div className="divide-y divide-gray-200">
            {queueItems.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                No items match your filters
              </div>
            ) : (
              queueItems.map((item) => (
                <QueueItemRow
                  key={item.itemId}
                  item={item}
                  onSelect={() => handleSelectItem(item)}
                  isSelected={selectedItem?.itemId === item.itemId}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Item Review Panel (Modal) */}
      {selectedItem && (
        <ItemReviewPanel
          item={selectedItem}
          userProfile={userProfile}
          onClose={() => setSelectedItem(null)}
          onAction={handleTakeAction}
          actionLoading={actionLoading}
        />
      )}
    </div>
  );
}

// ============================================================================
// STAT CARD COMPONENT
// ============================================================================

function StatCard({
  title,
  value,
  icon,
  color,
}: {
  title: string;
  value: number | string;
  icon: string;
  color: string;
}) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    green: 'bg-green-50 text-green-700 border-green-200',
  };

  return (
    <div className={`rounded-lg shadow p-6 border-2 ${colorClasses[color as keyof typeof colorClasses]}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium opacity-75">{title}</p>
          <p className="text-3xl font-bold mt-2">{value}</p>
        </div>
        <div className="text-4xl">{icon}</div>
      </div>
    </div>
  );
}

// ============================================================================
// QUEUE ITEM ROW COMPONENT
// ============================================================================

function QueueItemRow({
  item,
  onSelect,
  isSelected,
}: {
  item: ModerationQueueItem;
  onSelect: () => void;
  isSelected: boolean;
}) {
  const riskColors = {
    CRITICAL: 'bg-red-100 text-red-800 border-red-300',
    HIGH: 'bg-orange-100 text-orange-800 border-orange-300',
    MEDIUM: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    LOW: 'bg-blue-100 text-blue-800 border-blue-300',
  };

  const timeAgo = (timestamp: any) => {
    const now = new Date();
    const created = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
    const diffMinutes = Math.floor((now.getTime() - created.getTime()) / 1000 / 60);
    
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)}h ago`;
    return `${Math.floor(diffMinutes / 1440)}d ago`;
  };

  return (
    <div
      onClick={onSelect}
      className={`p-6 hover:bg-gray-50 cursor-pointer ${
        isSelected ? 'bg-blue-50 border-l-4 border-l-blue-600' : ''
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-3 mb-2">
            <span
              className={`px-3 py-1 rounded-full text-sm font-semibold border ${
                riskColors[item.riskLevel]
              }`}
            >
              {item.riskLevel}
            </span>
            <span className="px-3 py-1 rounded-full text-sm font-semibold bg-gray-100 text-gray-800">
              {item.type}
            </span>
            <span className="text-sm text-gray-500">{timeAgo(item.createdAt)}</span>
            {item.reporterId === null && (
              <span className="px-2 py-1 rounded text-xs bg-purple-100 text-purple-800">
                Auto-flagged
              </span>
            )}
          </div>

          <div className="grid grid-cols-3 gap-4 mt-3">
            <div>
              <p className="text-xs text-gray-500">User ID</p>
              <p className="font-mono text-sm">{item.userId.slice(0, 12)}...</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Status</p>
              <p className="text-sm font-medium">{item.status}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Top AI Flag</p>
              <p className="text-sm">
                {getTopAIFlag(item.aiFlags)}
              </p>
            </div>
          </div>
        </div>

        <button className="ml-4 px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700">
          Review
        </button>
      </div>
    </div>
  );
}

function getTopAIFlag(aiFlags: AIFlags): string {
  const flags = Object.entries(aiFlags)
    .filter(([key, value]) => typeof value === 'number' && value > 0)
    .sort(([, a], [, b]) => (b as number) - (a as number));
  
  if (flags.length === 0) return 'None';
  
  const [key, value] = flags[0];
  return `${key}: ${Math.round((value as number) * 100)}%`;
}

// ============================================================================
// ITEM REVIEW PANEL COMPONENT
// ============================================================================

function ItemReviewPanel({
  item,
  userProfile,
  onClose,
  onAction,
  actionLoading,
}: {
  item: ModerationQueueItem;
  userProfile: UserProfile | null;
  onClose: () => void;
  onAction: (actionType: ModerationActionType, reason: string) => Promise<void>;
  actionLoading: boolean;
}) {
  const [reason, setReason] = useState('');
  const [showContent, setShowContent] = useState(false);

  const handleAction = async (actionType: ModerationActionType) => {
    if (!reason && actionType !== 'DISMISS') {
      alert('Please provide a reason');
      return;
    }
    await onAction(actionType, reason);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex justify-between items-center">
          <h3 className="text-xl font-bold">Item Review</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Content Preview */}
          {item.contentUrl && (
            <div>
              <h4 className="font-bold mb-2">Content Preview</h4>
              <div className="border rounded-lg overflow-hidden">
                {!showContent ? (
                  <div className="bg-gray-100 p-8 text-center">
                    <p className="text-gray-600 mb-4">Content blurred for safety</p>
                    <button
                      onClick={() => setShowContent(true)}
                      className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700"
                    >
                      Click to View
                    </button>
                  </div>
                ) : item.type === 'IMAGE' ? (
                  <img src={item.contentUrl} alt="Flagged content" className="w-full" />
                ) : (
                  <div className="p-4 bg-gray-50">
                    <p className="whitespace-pre-wrap">{item.extractedText}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* AI Analysis */}
          <div>
            <h4 className="font-bold mb-2">AI Analysis</h4>
            <div className="grid grid-cols-2 gap-4">
              {Object.entries(item.aiFlags).map(([key, value]) => {
                if (typeof value === 'number' && value > 0) {
                  return (
                    <div key={key} className="bg-gray-50 p-3 rounded">
                      <p className="text-sm text-gray-600">{key}</p>
                      <p className="text-lg font-bold">{Math.round(value * 100)}%</p>
                    </div>
                  );
                }
                if (Array.isArray(value) && value.length > 0) {
                  return (
                    <div key={key} className="bg-red-50 p-3 rounded col-span-2">
                      <p className="text-sm text-gray-600 font-bold">Banned Terms Found:</p>
                      <p className="text-sm text-red-600">{value.join(', ')}</p>
                    </div>
                  );
                }
                return null;
              })}
            </div>
          </div>

          {/* User Profile */}
          {userProfile && (
            <div>
              <h4 className="font-bold mb-2">User Profile</h4>
              <div className="bg-gray-50 p-4 rounded space-y-2">
                <p><strong>Name:</strong> {userProfile.name}</p>
                <p><strong>Age:</strong> {userProfile.age}</p>
                <p><strong>Badges:</strong> {userProfile.badges?.join(', ') || 'None'}</p>
                <p><strong>Trust Level:</strong> {userProfile.trustLevel}</p>
                <p><strong>Verification:</strong> {userProfile.verificationStatus}</p>
              </div>
            </div>
          )}

          {/* Reason Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Reason / Notes
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="w-full rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              placeholder="Explain your decision..."
            />
          </div>

          {/* Actions */}
          <div>
            <h4 className="font-bold mb-3">Take Action</h4>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleAction('DISMISS')}
                disabled={actionLoading}
                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50"
              >
                Dismiss
              </button>
              <button
                onClick={() => handleAction('WARNING')}
                disabled={actionLoading}
                className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:opacity-50"
              >
                Warning
              </button>
              <button
                onClick={() => handleAction('LIMIT_VISIBILITY')}
                disabled={actionLoading}
                className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50"
              >
                Limit Visibility (72h)
              </button>
              <button
                onClick={() => handleAction('SUSPEND_24H')}
                disabled={actionLoading}
                className="px-4 py-2 bg-orange-700 text-white rounded hover:bg-orange-800 disabled:opacity-50"
              >
                Suspend 24h
              </button>
              <button
                onClick={() => handleAction('SUSPEND_72H')}
                disabled={actionLoading}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
              >
                Suspend 72h
              </button>
              <button
                onClick={() => handleAction('SUSPEND_7D')}
                disabled={actionLoading}
                className="px-4 py-2 bg-red-700 text-white rounded hover:bg-red-800 disabled:opacity-50"
              >
                Suspend 7d
              </button>
              <button
                onClick={() => handleAction('PERMANENT_BAN')}
                disabled={actionLoading}
                className="px-4 py-2 bg-red-900 text-white rounded hover:bg-black disabled:opacity-50"
              >
                Permanent Ban
              </button>
              <button
                onClick={() => handleAction('REMOVE_CONTENT')}
                disabled={actionLoading}
                className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
              >
                Remove Content
              </button>
              <button
                onClick={() => handleAction('REQUIRE_REVERIFICATION')}
                disabled={actionLoading}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 col-span-2"
              >
                Require Re-verification
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}