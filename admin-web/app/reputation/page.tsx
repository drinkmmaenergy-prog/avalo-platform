/**
 * PACK 397 — Admin Trust Console
 * 
 * Dashboard for monitoring app store reviews, detecting attacks,
 * and managing reputation defense systems.
 */

'use client';

import { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  getDocs,
  Timestamp,
  onSnapshot
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  Shield,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Star,
  Eye,
  CheckCircle,
  XCircle,
  Clock,
  Activity,
  Filter,
  Download,
  Bell
} from 'lucide-react';

interface ReviewAnomaly {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  detectedAt: Date;
  affectedReviews: number;
  averageRating: number;
  status: string;
  actions: string[];
}

interface ReviewStats {
  totalReviews: number;
  averageRating: number;
  sentimentBreakdown: {
    positive: number;
    neutral: number;
    negative: number;
  };
  platformBreakdown: {
    google_play: number;
    app_store: number;
    web_trust: number;
  };
}

interface VerifiedReview {
  id: string;
  userId: string;
  rating: number;
  title: string;
  text: string;
  verificationScore: number;
  approved: boolean;
  createdAt: Date;
}

export default function ReputationDashboard() {
  const [activeTab, setActiveTab] = useState<'overview' | 'anomalies' | 'reviews' | 'appeals'>('overview');
  const [anomalies, setAnomalies] = useState<ReviewAnomaly[]>([]);
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [pendingReviews, setPendingReviews] = useState<VerifiedReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  useEffect(() => {
    loadDashboardData();
    
    // Real-time anomaly monitoring
    const anomalyQuery = query(
      collection(db, 'review_anomalies'),
      where('status', 'in', ['detected', 'responding']),
      orderBy('detectedAt', 'desc'),
      limit(20)
    );
    
    const unsubscribe = onSnapshot(anomalyQuery, (snapshot) => {
      const newAnomalies = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        detectedAt: (doc.data().detectedAt as Timestamp).toDate(),
      })) as ReviewAnomaly[];
      
      setAnomalies(newAnomalies);
    });
    
    return () => unsubscribe();
  }, []);

  async function loadDashboardData() {
    setLoading(true);
    try {
      // Load review stats
      const statsDoc = await getDocs(
        query(collection(db, 'review_stats'), limit(1))
      );
      
      if (!statsDoc.empty) {
        const statsData = statsDoc.docs[0].data();
        setStats({
          totalReviews: statsData.totalReviews || 0,
          averageRating: statsData.averageRating || 0,
          sentimentBreakdown: {
            positive: statsData.sentiment_positive_count || 0,
            neutral: statsData.sentiment_neutral_count || 0,
            negative: statsData.sentiment_negative_count || 0,
          },
          platformBreakdown: {
            google_play: statsData.platform_google_play_count || 0,
            app_store: statsData.platform_app_store_count || 0,
            web_trust: statsData.platform_web_trust_count || 0,
          },
        });
      }
      
      // Load pending verified reviews
      const reviewsQuery = query(
        collection(db, 'verified_reviews'),
        where('approved', '==', false),
        orderBy('createdAt', 'desc'),
        limit(10)
      );
      
      const reviewsSnapshot = await getDocs(reviewsQuery);
      const reviews = reviewsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: (doc.data().createdAt as Timestamp).toDate(),
      })) as VerifiedReview[];
      
      setPendingReviews(reviews);
      
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }

  function getSeverityColor(severity: string) {
    switch (severity) {
      case 'critical': return 'text-red-600 bg-red-50 border-red-200';
      case 'high': return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'medium': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'low': return 'text-blue-600 bg-blue-50 border-blue-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'detected': return 'text-red-600 bg-red-50';
      case 'responding': return 'text-orange-600 bg-orange-50';
      case 'mitigated': return 'text-blue-600 bg-blue-50';
      case 'resolved': return 'text-green-600 bg-green-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  }

  const filteredAnomalies = anomalies.filter(a => {
    if (selectedSeverity !== 'all' && a.severity !== selectedSeverity) return false;
    if (selectedStatus !== 'all' && a.status !== selectedStatus) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Shield className="w-8 h-8 text-indigo-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Reputation & Trust Console
                </h1>
                <p className="text-sm text-gray-500">
                  App Store Defense & Review Intelligence
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              <button className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
                <Download className="w-4 h-4 inline mr-2" />
                Export Report
              </button>
              <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
                <Bell className="w-4 h-4 inline mr-2" />
                Alert Settings
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="border-b border-gray-200 mb-6">
          <nav className="flex space-x-8">
            {[
              { id: 'overview', label: 'Overview', icon: Activity },
              { id: 'anomalies', label: 'Attack Detection', icon: AlertTriangle },
              { id: 'reviews', label: 'Verified Reviews', icon: Star },
              { id: 'appeals', label: 'Store Appeals', icon: Shield },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`
                  flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm
                  ${activeTab === tab.id
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <tab.icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Reviews</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">
                      {stats?.totalReviews.toLocaleString() || '0'}
                    </p>
                  </div>
                  <Eye className="w-8 h-8 text-blue-500" />
                </div>
                <div className="mt-4 flex items-center text-sm">
                  <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
                  <span className="text-green-600">+12%</span>
                  <span className="text-gray-500 ml-2">vs last week</span>
                </div>
              </div>

              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Average Rating</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">
                      {stats?.averageRating.toFixed(1) || '0.0'}
                    </p>
                  </div>
                  <Star className="w-8 h-8 text-yellow-500 fill-current" />
                </div>
                <div className="mt-4 flex items-center text-sm">
                  <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
                  <span className="text-green-600">+0.3</span>
                  <span className="text-gray-500 ml-2">vs last week</span>
                </div>
              </div>

              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Active Anomalies</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">
                      {anomalies.length}
                    </p>
                  </div>
                  <AlertTriangle className="w-8 h-8 text-orange-500" />
                </div>
                <div className="mt-4 flex items-center text-sm">
                  {anomalies.length > 0 ? (
                    <>
                      <span className="text-orange-600">Requires attention</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4 text-green-500 mr-1" />
                      <span className="text-green-600">All clear</span>
                    </>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Pending Reviews</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">
                      {pendingReviews.length}
                    </p>
                  </div>
                  <Clock className="w-8 h-8 text-purple-500" />
                </div>
                <div className="mt-4 flex items-center text-sm">
                  <span className="text-gray-500">Awaiting moderation</span>
                </div>
              </div>
            </div>

            {/* Sentiment Breakdown */}
            {stats && (
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Sentiment Analysis
                </h3>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">Positive</span>
                      <span className="text-sm text-gray-600">
                        {stats.sentimentBreakdown.positive} reviews
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-green-500 h-2 rounded-full"
                        style={{
                          width: `${(stats.sentimentBreakdown.positive / stats.totalReviews) * 100}%`
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">Neutral</span>
                      <span className="text-sm text-gray-600">
                        {stats.sentimentBreakdown.neutral} reviews
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-yellow-500 h-2 rounded-full"
                        style={{
                          width: `${(stats.sentimentBreakdown.neutral / stats.totalReviews) * 100}%`
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">Negative</span>
                      <span className="text-sm text-gray-600">
                        {stats.sentimentBreakdown.negative} reviews
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-red-500 h-2 rounded-full"
                        style={{
                          width: `${(stats.sentimentBreakdown.negative / stats.totalReviews) * 100}%`
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Anomalies Tab */}
        {activeTab === 'anomalies' && (
          <div className="space-y-6">
            {/* Filters */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center space-x-4">
                <Filter className="w-5 h-5 text-gray-400" />
                <select
                  value={selectedSeverity}
                  onChange={(e) => setSelectedSeverity(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                >
                  <option value="all">All Severities</option>
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
                
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                >
                  <option value="all">All Statuses</option>
                  <option value="detected">Detected</option>
                  <option value="responding">Responding</option>
                  <option value="mitigated">Mitigated</option>
                  <option value="resolved">Resolved</option>
                </select>
              </div>
            </div>

            {/* Anomaly List */}
            <div className="space-y-4">
              {filteredAnomalies.length === 0 ? (
                <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
                  <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                  <p className="text-lg font-medium text-gray-900">All Clear!</p>
                  <p className="text-gray-500 mt-2">No active anomalies detected</p>
                </div>
              ) : (
                filteredAnomalies.map(anomaly => (
                  <div
                    key={anomaly.id}
                    className={`bg-white rounded-lg border-2 p-6 ${getSeverityColor(anomaly.severity)}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <AlertTriangle className="w-5 h-5" />
                          <h3 className="text-lg font-semibold">
                            {anomaly.type.replace(/_/g, ' ')}
                          </h3>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(anomaly.status)}`}>
                            {anomaly.status}
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-3 gap-4 mt-4 text-sm">
                          <div>
                            <p className="text-gray-600">Affected Reviews</p>
                            <p className="text-xl font-bold mt-1">{anomaly.affectedReviews}</p>
                          </div>
                          <div>
                            <p className="text-gray-600">Average Rating</p>
                            <p className="text-xl font-bold mt-1">{anomaly.averageRating.toFixed(1)}★</p>
                          </div>
                          <div>
                            <p className="text-gray-600">Detected</p>
                            <p className="text-sm font-medium mt-1">
                              {anomaly.detectedAt.toLocaleString()}
                            </p>
                          </div>
                        </div>

                        {anomaly.actions.length > 0 && (
                          <div className="mt-4">
                            <p className="text-sm font-medium mb-2">Active Defenses:</p>
                            <div className="flex flex-wrap gap-2">
                              {anomaly.actions.map((action, idx) => (
                                <span
                                  key={idx}
                                  className="px-2 py-1 bg-gray-100 rounded text-xs font-medium"
                                >
                                  {action.replace(/_/g, ' ')}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <button className="ml-4 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
                        Investigate
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Reviews Tab */}
        {activeTab === 'reviews' && (
          <div className="space-y-4">
            {pendingReviews.length === 0 ? (
              <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
                <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                <p className="text-lg font-medium text-gray-900">All Caught Up!</p>
                <p className="text-gray-500 mt-2">No pending reviews to moderate</p>
              </div>
            ) : (
              pendingReviews.map(review => (
                <div key={review.id} className="bg-white rounded-lg border border-gray-200 p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <div className="flex">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={`w-4 h-4 ${
                                i < review.rating
                                  ? 'text-yellow-400 fill-current'
                                  : 'text-gray-300'
                              }`}
                            />
                          ))}
                        </div>
                        <span className="text-sm text-gray-500">
                          Verification Score: {review.verificationScore}
                        </span>
                      </div>
                      
                      <h4 className="text-lg font-semibold text-gray-900 mb-2">
                        {review.title}
                      </h4>
                      
                      <p className="text-gray-700 mb-4">{review.text}</p>
                      
                      <p className="text-xs text-gray-500">
                        Submitted {review.createdAt.toLocaleDateString()} by User {review.userId.slice(0, 8)}
                      </p>
                    </div>

                    <div className="ml-4 flex flex-col space-y-2">
                      <button className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 flex items-center">
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Approve
                      </button>
                      <button className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 flex items-center">
                        <XCircle className="w-4 h-4 mr-2" />
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Appeals Tab */}
        {activeTab === 'appeals' && (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <Shield className="w-16 h-16 text-indigo-500 mx-auto mb-4" />
            <p className="text-lg font-medium text-gray-900">Store Appeals</p>
            <p className="text-gray-500 mt-2">Appeal management coming soon</p>
          </div>
        )}
      </div>
    </div>
  );
}
