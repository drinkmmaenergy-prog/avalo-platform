/**
 * PACK 449 - Insider Risk Dashboard
 * 
 * Admin dashboard for monitoring and managing insider risks:
 * - Risk score overview
 * - Privileged action approvals
 * - Emergency controls
 * - Access grant management
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
  updateDoc
} from 'firebase/firestore';
import { db } from '../lib/firebase';

interface InsiderRiskProfile {
  userId: string;
  role: string;
  department: string;
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  factors: RiskFactor[];
  lastUpdated: Date;
}

interface RiskFactor {
  type: string;
  score: number;
  description: string;
}

interface PrivilegedAction {
  id: string;
  type: string;
  requesterId: string;
  requesterRole: string;
  description: string;
  riskLevel: string;
  requiresApprovals: number;
  approvals: any[];
  status: string;
  createdAt: Date;
}

interface AccessGrant {
  id: string;
  userId: string;
  role: string;
  permissions: string[];
  grantedAt: Date;
  expiresAt: Date;
  revoked: boolean;
}

export const InsiderRiskDashboard: React.FC = () => {
  const [highRiskUsers, setHighRiskUsers] = useState<InsiderRiskProfile[]>([]);
  const [pendingActions, setPendingActions] = useState<PrivilegedAction[]>([]);
  const [activeGrants, setActiveGrants] = useState<AccessGrant[]>([]);
  const [emergencyStatus, setEmergencyStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState<'risks' | 'actions' | 'grants' | 'emergency'>('risks');

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    
    try {
      // Load high-risk users
      const risksQuery = query(
        collection(db, 'insider_risk_profiles'),
        where('riskLevel', 'in', ['high', 'critical']),
        orderBy('riskScore', 'desc'),
        limit(20)
      );
      const risksSnapshot = await getDocs(risksQuery);
      const risks = risksSnapshot.docs.map(doc => ({
        ...doc.data(),
        lastUpdated: doc.data().lastUpdated?.toDate()
      })) as InsiderRiskProfile[];
      setHighRiskUsers(risks);

      // Load pending actions
      const actionsQuery = query(
        collection(db, 'privileged_actions'),
        where('status', '==', 'pending'),
        orderBy('createdAt', 'desc'),
        limit(20)
      );
      const actionsSnapshot = await getDocs(actionsQuery);
      const actions = actionsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate()
      })) as PrivilegedAction[];
      setPendingActions(actions);

      // Load active grants
      const grantsQuery = query(
        collection(db, 'internal_access_grants'),
        where('revoked', '==', false),
        orderBy('expiresAt', 'asc'),
        limit(50)
      );
      const grantsSnapshot = await getDocs(grantsQuery);
      const grants = grantsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        grantedAt: doc.data().grantedAt?.toDate(),
        expiresAt: doc.data().expiresAt?.toDate()
      })) as AccessGrant[];
      setActiveGrants(grants);

    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const approveAction = async (actionId: string) => {
    try {
      // Would integrate with privileged action approval flow
      console.log('Approving action:', actionId);
      await loadDashboardData();
    } catch (error) {
      console.error('Error approving action:', error);
    }
  };

  const denyAction = async (actionId: string, reason: string) => {
    try {
      console.log('Denying action:', actionId, reason);
      await loadDashboardData();
    } catch (error) {
      console.error('Error denying action:', error);
    }
  };

  const revokeGrant = async (grantId: string, reason: string) => {
    try {
      const grantRef = doc(db, 'internal_access_grants', grantId);
      await updateDoc(grantRef, {
        revoked: true,
        revokedAt: new Date(),
        revokedReason: reason
      });
      await loadDashboardData();
    } catch (error) {
      console.error('Error revoking grant:', error);
    }
  };

  const activateEmergencyMode = async (type: string) => {
    try {
      console.log('Activating emergency mode:', type);
      // Would integrate with emergency access controller
    } catch (error) {
      console.error('Error activating emergency mode:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg">Loading insider risk dashboard...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">
            PACK 449: Insider Risk Defense Dashboard
          </h1>
          <p className="text-gray-600 mt-2">
            Zero-Trust Access Control & Insider Risk Monitoring
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-600">High Risk Users</div>
            <div className="text-3xl font-bold text-red-600">
              {highRiskUsers.filter(u => u.riskLevel === 'critical' || u.riskLevel === 'high').length}
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-600">Pending Actions</div>
            <div className="text-3xl font-bold text-yellow-600">
              {pendingActions.length}
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-600">Active Grants</div>
            <div className="text-3xl font-bold text-blue-600">
              {activeGrants.length}
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-600">Lockdown Level</div>
            <div className="text-3xl font-bold text-green-600">
              {emergencyStatus?.lockdownLevel || 1}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="border-b border-gray-200">
            <nav className="flex space-x-8 px-6" aria-label="Tabs">
              <button
                onClick={() => setSelectedTab('risks')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  selectedTab === 'risks'
                    ? 'border-red-500 text-red-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Risk Profiles
              </button>
              <button
                onClick={() => setSelectedTab('actions')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  selectedTab === 'actions'
                    ? 'border-red-500 text-red-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Privileged Actions
              </button>
              <button
                onClick={() => setSelectedTab('grants')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  selectedTab === 'grants'
                    ? 'border-red-500 text-red-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Access Grants
              </button>
              <button
                onClick={() => setSelectedTab('emergency')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  selectedTab === 'emergency'
                    ? 'border-red-500 text-red-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Emergency Controls
              </button>
            </nav>
          </div>

          <div className="p-6">
            {/* Risk Profiles Tab */}
            {selectedTab === 'risks' && (
              <div>
                <h2 className="text-xl font-semibold mb-4">High-Risk Users</h2>
                <div className="space-y-4">
                  {highRiskUsers.map(user => (
                    <div
                      key={user.userId}
                      className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3">
                            <span className="font-medium">{user.userId}</span>
                            <span className="text-sm text-gray-600">{user.role}</span>
                            <span className="text-sm text-gray-600">{user.department}</span>
                            <span
                              className={`px-2 py-1 rounded-full text-xs font-medium ${
                                user.riskLevel === 'critical'
                                  ? 'bg-red-100 text-red-800'
                                  : user.riskLevel === 'high'
                                  ? 'bg-orange-100 text-orange-800'
                                  : 'bg-yellow-100 text-yellow-800'
                              }`}
                            >
                              {user.riskLevel.toUpperCase()}
                            </span>
                          </div>
                          <div className="mt-2">
                            <div className="text-2xl font-bold">{user.riskScore}/100</div>
                            <div className="text-sm text-gray-600 mt-1">
                              {user.factors.length} risk factors detected
                            </div>
                          </div>
                          <div className="mt-2 space-y-1">
                            {user.factors.map((factor, idx) => (
                              <div key={idx} className="text-sm text-gray-700">
                                • {factor.description}
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="ml-4 space-x-2">
                          <button
                            onClick={() => console.log('View details:', user.userId)}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                          >
                            View Details
                          </button>
                          <button
                            onClick={() => console.log('Freeze account:', user.userId)}
                            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                          >
                            Freeze Account
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Privileged Actions Tab */}
            {selectedTab === 'actions' && (
              <div>
                <h2 className="text-xl font-semibold mb-4">Pending Approvals</h2>
                <div className="space-y-4">
                  {pendingActions.map(action => (
                    <div
                      key={action.id}
                      className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3">
                            <span className="font-medium">{action.type}</span>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              action.riskLevel === 'critical' ? 'bg-red-100 text-red-800' :
                              action.riskLevel === 'high' ? 'bg-orange-100 text-orange-800' :
                              'bg-yellow-100 text-yellow-800'
                            }`}>
                              {action.riskLevel}
                            </span>
                          </div>
                          <div className="mt-2 text-sm text-gray-700">
                            {action.description}
                          </div>
                          <div className="mt-2 text-sm text-gray-600">
                            Requested by: {action.requesterId} ({action.requesterRole})
                          </div>
                          <div className="mt-1 text-sm text-gray-600">
                            Approvals: {action.approvals.length} / {action.requiresApprovals}
                          </div>
                        </div>
                        <div className="ml-4 space-x-2">
                          <button
                            onClick={() => approveAction(action.id)}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => denyAction(action.id, 'Security concern')}
                            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                          >
                            Deny
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Access Grants Tab */}
            {selectedTab === 'grants' && (
              <div>
                <h2 className="text-xl font-semibold mb-4">Active Access Grants</h2>
                <div className="space-y-4">
                  {activeGrants.map(grant => (
                    <div
                      key={grant.id}
                      className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="font-medium">{grant.userId}</div>
                          <div className="text-sm text-gray-600 mt-1">
                            Role: {grant.role}
                          </div>
                          <div className="text-sm text-gray-600 mt-1">
                            Permissions: {grant.permissions.join(', ')}
                          </div>
                          <div className="text-sm text-gray-600 mt-1">
                            Expires: {grant.expiresAt?.toLocaleString()}
                          </div>
                        </div>
                        <button
                          onClick={() => revokeGrant(grant.id, 'Manual revocation')}
                          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                        >
                          Revoke
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Emergency Controls Tab */}
            {selectedTab === 'emergency' && (
              <div>
                <h2 className="text-xl font-semibold mb-4">Emergency Controls</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button
                    onClick={() => activateEmergencyMode('security_breach')}
                    className="p-6 bg-red-600 text-white rounded-lg hover:bg-red-700 text-left"
                  >
                    <div className="text-xl font-bold">Security Breach</div>
                    <div className="text-sm mt-2">Immediate lockdown and investigation</div>
                  </button>
                  
                  <button
                    onClick={() => activateEmergencyMode('insider_threat')}
                    className="p-6 bg-orange-600 text-white rounded-lg hover:bg-orange-700 text-left"
                  >
                    <div className="text-xl font-bold">Insider Threat</div>
                    <div className="text-sm mt-2">Revoke access, freeze accounts</div>
                  </button>
                  
                  <button
                    onClick={() => activateEmergencyMode('data_leak')}
                    className="p-6 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 text-left"
                  >
                    <div className="text-xl font-bold">Data Leak</div>
                    <div className="text-sm mt-2">Block downloads and exports</div>
                  </button>
                  
                  <button
                    onClick={() => console.log('Set lockdown level')}
                    className="p-6 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-left"
                  >
                    <div className="text-xl font-bold">Set Lockdown Level</div>
                    <div className="text-sm mt-2">Adjust system-wide restrictions</div>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default InsiderRiskDashboard;
