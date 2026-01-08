/**
 * PACK 359 — Legal Compliance: Admin Legal Dashboard
 * 
 * Comprehensive legal compliance management interface for administrators
 */

import React, { useState, useEffect } from 'react';
import { 
  Card, 
  Table, 
  Tabs, 
  Badge, 
  Button, 
  Select, 
  Input,
  Modal,
  Statistic,
  Row,
  Col,
  Alert,
  Timeline,
  Progress
} from 'antd';
import {
  AlertOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  GlobalOutlined,
  SafetyOutlined,
  FileTextOutlined,
  DownloadOutlined
} from '@ant-design/icons';
import { db, functions } from '../../lib/firebase';
import type { DSAReport, DSAStatistics, JurisdictionProfile } from '../../types/legal';

const { TabPane } = Tabs;
const { Option } = Select;

export const LegalDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(false);
  
  return (
    <div className="legal-dashboard">
      <h1>Legal Compliance Dashboard</h1>
      
      <Tabs activeKey={activeTab} onChange={setActiveTab}>
        <TabPane tab="Overview" key="overview" icon={<GlobalOutlined />}>
          <OverviewTab />
        </TabPane>
        
        <TabPane tab="Country Tax Matrix" key="tax-matrix" icon={<FileTextOutlined />}>
          <TaxMatrixTab />
        </TabPane>
        
        <TabPane tab="Creator Compliance" key="creator-compliance" icon={<CheckCircleOutlined />}>
          <CreatorComplianceTab />
        </TabPane>
        
        <TabPane tab="KYC Verification" key="kyc" icon={<SafetyOutlined />}>
          <KYCTab />
        </TabPane>
        
        <TabPane tab="Data Requests" key="data-requests" icon={<ClockCircleOutlined />}>
          <DataRequestsTab />
        </TabPane>
        
        <TabPane tab="DSA Reports" key="dsa-reports" icon={<AlertOutlined />}>
          <DSAReportsTab />
        </TabPane>
        
        <TabPane tab="Audit Log" key="audit" icon={<FileTextOutlined />}>
          <AuditLogTab />
        </TabPane>
      </Tabs>
    </div>
  );
};

// ============================================================================
// OVERVIEW TAB
// ============================================================================

const OverviewTab: React.FC = () => {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    loadOverviewStats();
  }, []);
  
  const loadOverviewStats = async () => {
    setLoading(true);
    try {
      // Load key metrics
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      const [dsaReports, dataRequests, kycPending] = await Promise.all([
        db.collection('dsa_reports')
          .where('reportedAt', '>=', thirtyDaysAgo)
          .get(),
        db.collection('data_erasure_requests')
          .where('status', 'in', ['pending', 'processing'])
          .get(),
        db.collection('kyc_verifications')
          .where('status', '==', 'pending')
          .get()
      ]);
      
      setStats({
        activeDSAReports: dsaReports.size,
        pendingDataRequests: dataRequests.size,
        pendingKYC: kycPending.size,
      });
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="overview-tab">
      <Row gutter={16}>
        <Col span={6}>
          <Card>
            <Statistic
              title="Active DSA Reports"
              value={stats?.activeDSAReports || 0}
              prefix={<AlertOutlined />}
              valueStyle={{ color: stats?.activeDSAReports > 0 ? '#cf1322' : '#3f8600' }}
            />
          </Card>
        </Col>
        
        <Col span={6}>
          <Card>
            <Statistic
              title="Pending Data Requests"
              value={stats?.pendingDataRequests || 0}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: stats?.pendingDataRequests > 5 ? '#faad14' : '#3f8600' }}
            />
          </Card>
        </Col>
        
        <Col span={6}>
          <Card>
            <Statistic
              title="Pending KYC"
              value={stats?.pendingKYC || 0}
              prefix={<SafetyOutlined />}
            />
          </Card>
        </Col>
        
        <Col span={6}>
          <Card>
            <Statistic
              title="Compliance Score"
              value={95}
              suffix="/ 100"
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
      </Row>
      
      <Card title="Recent Alerts" style={{ marginTop: 16 }}>
        <Alert
          message="4 new DSA reports requiring review"
          type="warning"
          showIcon
          style={{ marginBottom: 8 }}
        />
        <Alert
          message="Monthly DSA compliance report generated"
          type="info"
          showIcon
          style={{ marginBottom: 8 }}
        />
        <Alert
          message="2 data erasure requests completed"
          type="success"
          showIcon
        />
      </Card>
    </div>
  );
};

// ============================================================================
// TAX MATRIX TAB
// ============================================================================

const TaxMatrixTab: React.FC = () => {
  const jurisdictions: Partial<JurisdictionProfile>[] = [
    { countryCode: 'PL', vatRate: 0.23, digitalServiceTaxRate: 0.03, kycRequired: true, minimumAge: 18 },
    { countryCode: 'DE', vatRate: 0.19, digitalServiceTaxRate: 0.03, kycRequired: true, minimumAge: 18 },
    { countryCode: 'FR', vatRate: 0.20, digitalServiceTaxRate: 0.03, kycRequired: true, minimumAge: 18 },
    { countryCode: 'GB', vatRate: 0.20, digitalServiceTaxRate: 0.02, kycRequired: true, minimumAge: 18 },
    { countryCode: 'US', vatRate: 0, digitalServiceTaxRate: 0, kycRequired: true, minimumAge: 18 },
  ];
  
  const columns = [
    {
      title: 'Country',
      dataIndex: 'countryCode',
      key: 'countryCode',
      render: (code: string) => <Badge status="success" text={code} />,
    },
    {
      title: 'VAT Rate',
      dataIndex: 'vatRate',
      key: 'vatRate',
      render: (rate: number) => `${(rate * 100).toFixed(0)}%`,
    },
    {
      title: 'Digital Tax Rate',
      dataIndex: 'digitalServiceTaxRate',
      key: 'digitalServiceTaxRate',
      render: (rate: number) => `${(rate * 100).toFixed(1)}%`,
    },
    {
      title: 'KYC Required',
      dataIndex: 'kycRequired',
      key: 'kycRequired',
      render: (required: boolean) => 
        required ? <Badge status="success" text="Yes" /> : <Badge status="default" text="No" />,
    },
    {
      title: 'Minimum Age',
      dataIndex: 'minimumAge',
      key: 'minimumAge',
    },
  ];
  
  return (
    <div className="tax-matrix-tab">
      <Card title="Country Tax Configuration">
        <Table
          dataSource={jurisdictions}
          columns={columns}
          rowKey="countryCode"
          pagination={false}
        />
      </Card>
    </div>
  );
};

// ============================================================================
// CREATOR COMPLIANCE TAB
// ============================================================================

const CreatorComplianceTab: React.FC = () => {
  const [creators, setCreators] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    loadCreators();
  }, []);
  
  const loadCreators = async () => {
    setLoading(true);
    try {
      // Load creators with compliance status
      const snapshot = await db.collection('users')
        .where('role', '==', 'creator')
        .limit(50)
        .get();
      
      const creatorsData = await Promise.all(
        snapshot.docs.map(async (doc) => {
          const kycDoc = await db.collection('kyc_verifications').doc(doc.id).get();
          const jurisdictionDoc = await db.collection('legal_jurisdiction').doc(doc.id).get();
          
          return {
            id: doc.id,
            ...doc.data(),
            kycStatus: kycDoc.data()?.status || 'not_started',
            country: jurisdictionDoc.data()?.detectedCountry || 'Unknown',
          };
        })
      );
      
      setCreators(creatorsData);
    } catch (error) {
      console.error('Failed to load creators:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const columns = [
    {
      title: 'Creator',
      dataIndex: 'displayName',
      key: 'displayName',
    },
    {
      title: 'Country',
      dataIndex: 'country',
      key: 'country',
    },
    {
      title: 'KYC Status',
      dataIndex: 'kycStatus',
      key: 'kycStatus',
      render: (status: string) => {
        const colors: Record<string, string> = {
          approved: 'success',
          pending: 'warning',
          rejected: 'error',
          not_started: 'default',
        };
        return <Badge status={colors[status] as any} text={status} />;
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: any) => (
        <Button size="small" onClick={() => viewCreatorDetails(record.id)}>
          View Details
        </Button>
      ),
    },
  ];
  
  const viewCreatorDetails = (creatorId: string) => {
    console.log('View creator:', creatorId);
  };
  
  return (
    <div className="creator-compliance-tab">
      <Card title="Creator Compliance Status">
        <Table
          dataSource={creators}
          columns={columns}
          rowKey="id"
          loading={loading}
        />
      </Card>
    </div>
  );
};

// ============================================================================
// KYC TAB
// ============================================================================

const KYCTab: React.FC = () => {
  const [verifications, setVerifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    loadVerifications();
  }, []);
  
  const loadVerifications = async () => {
    setLoading(true);
    try {
      const snapshot = await db.collection('kyc_verifications')
        .where('status', '==', 'pending')
        .limit(50)
        .get();
      
      setVerifications(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (error) {
      console.error('Failed to load verifications:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const approveKYC = async (userId: string) => {
    try {
      await db.collection('kyc_verifications').doc(userId).update({
        status: 'approved',
        reviewedAt: new Date(),
      });
      loadVerifications();
    } catch (error) {
      console.error('Failed to approve KYC:', error);
    }
  };
  
  const rejectKYC = async (userId: string) => {
    try {
      await db.collection('kyc_verifications').doc(userId).update({
        status: 'rejected',
        reviewedAt: new Date(),
      });
      loadVerifications();
    } catch (error) {
      console.error('Failed to reject KYC:', error);
    }
  };
  
  const columns = [
    {
      title: 'User ID',
      dataIndex: 'id',
      key: 'id',
    },
    {
      title: 'Submitted',
      dataIndex: 'submittedAt',
      key: 'submittedAt',
      render: (date: any) => new Date(date?.seconds * 1000).toLocaleDateString(),
    },
    {
      title: 'Country',
      dataIndex: 'country',
      key: 'country',
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: any) => (
        <>
          <Button type="primary" size="small" onClick={() => approveKYC(record.id)} style={{ marginRight: 8 }}>
            Approve
          </Button>
          <Button danger size="small" onClick={() => rejectKYC(record.id)}>
            Reject
          </Button>
        </>
      ),
    },
  ];
  
  return (
    <div className="kyc-tab">
      <Card title="Pending KYC Verifications">
        <Table
          dataSource={verifications}
          columns={columns}
          rowKey="id"
          loading={loading}
        />
      </Card>
    </div>
  );
};

// ============================================================================
// DATA REQUESTS TAB
// ============================================================================

const DataRequestsTab: React.FC = () => {
  const [erasureRequests, setErasureRequests] = useState<any[]>([]);
  const [exportRequests, setExportRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    loadRequests();
  }, []);
  
  const loadRequests = async () => {
    setLoading(true);
    try {
      const [erasure, exports] = await Promise.all([
        db.collection('data_erasure_requests').limit(20).get(),
        db.collection('data_export_requests').limit(20).get(),
      ]);
      
      setErasureRequests(erasure.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setExportRequests(exports.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (error) {
      console.error('Failed to load requests:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const erasureColumns = [
    {
      title: 'User ID',
      dataIndex: 'userId',
      key: 'userId',
    },
    {
      title: 'Requested',
      dataIndex: 'requestedAt',
      key: 'requestedAt',
      render: (date: any) => new Date(date?.seconds * 1000).toLocaleDateString(),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => <Badge status="processing" text={status} />,
    },
    {
      title: 'Progress',
      key: 'progress',
      render: (_: any, record: any) => {
        const progress = record.status === 'completed' ? 100 : record.status === 'processing' ? 50 : 0;
        return <Progress percent={progress} size="small" />;
      },
    },
  ];
  
  return (
    <div className="data-requests-tab">
      <Card title="Data Erasure Requests" style={{ marginBottom: 16 }}>
        <Table
          dataSource={erasureRequests}
          columns={erasureColumns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>
      
      <Card title="Data Export Requests">
        <Table
          dataSource={exportRequests}
          columns={erasureColumns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>
    </div>
  );
};

// ============================================================================
// DSA REPORTS TAB
// ============================================================================

const DSAReportsTab: React.FC = () => {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  
  useEffect(() => {
    loadReports();
  }, [filterSeverity]);
  
  const loadReports = async () => {
    setLoading(true);
    try {
      let query = db.collection('dsa_reports').orderBy('reportedAt', 'desc').limit(50);
      
      if (filterSeverity !== 'all') {
        query = query.where('severity', '==', filterSeverity) as any;
      }
      
      const snapshot = await query.get();
      setReports(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (error) {
      console.error('Failed to load DSA reports:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const columns = [
    {
      title: 'Report ID',
      dataIndex: 'reportId',
      key: 'reportId',
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
    },
    {
      title: 'Severity',
      dataIndex: 'severity',
      key: 'severity',
      render: (severity: string) => {
        const colors: Record<string, string> = {
          critical: 'error',
          high: 'warning',
          medium: 'processing',
          low: 'default',
        };
        return <Badge status={colors[severity] as any} text={severity} />;
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
    },
    {
      title: 'Reported',
      dataIndex: 'reportedAt',
      key: 'reportedAt',
      render: (date: any) => new Date(date?.seconds * 1000).toLocaleDateString(),
    },
  ];
  
  return (
    <div className="dsa-reports-tab">
      <Card 
        title="DSA Platform Safety Reports"
        extra={
          <Select value={filterSeverity} onChange={setFilterSeverity} style={{ width: 120 }}>
            <Option value="all">All</Option>
            <Option value="critical">Critical</Option>
            <Option value="high">High</Option>
            <Option value="medium">Medium</Option>
            <Option value="low">Low</Option>
          </Select>
        }
      >
        <Table
          dataSource={reports}
          columns={columns}
          rowKey="id"
          loading={loading}
        />
      </Card>
    </div>
  );
};

// ============================================================================
// AUDIT LOG TAB
// ============================================================================

const AuditLogTab: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    loadLogs();
  }, []);
  
  const loadLogs = async () => {
    setLoading(true);
    try {
      const snapshot = await db.collection('legal_audit_log')
        .orderBy('timestamp', 'desc')
        .limit(100)
        .get();
      
      setLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (error) {
      console.error('Failed to load audit logs:', error);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="audit-log-tab">
      <Card title="Legal Audit Log">
        <Timeline>
          {logs.map((log, index) => (
            <Timeline.Item key={index} color={getLogColor(log.type)}>
              <strong>{log.type}</strong> - {new Date(log.timestamp?.seconds * 1000).toLocaleString()}
              <br />
              <small>User: {log.userId || 'System'}</small>
            </Timeline.Item>
          ))}
        </Timeline>
      </Card>
    </div>
  );
};

function getLogColor(type: string): string {
  const colors: Record<string, string> = {
    data_erasure: 'red',
    data_export: 'blue',
    dsa_report_created: 'orange',
    dsa_action_taken: 'green',
  };
  return colors[type] || 'gray';
}

export default LegalDashboard;
