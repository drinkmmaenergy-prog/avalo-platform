/**
 * PACK 395 - Admin Compliance Dashboard
 * Monitor and manage creator verification, payouts, and compliance
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  CircularProgress,
  Tabs,
  Tab,
  Alert,
  IconButton
} from '@mui/material';
import {
  CheckCircle,
  Warning,
  Error as ErrorIcon,
  Pending,
  Visibility,
  Done,
  Close
} from '@mui/icons-material';

interface VerificationRequest {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  level: 'level1' | 'level2' | 'kyb';
  status: 'pending' | 'under_review' | 'approved' | 'rejected';
  submittedAt: Date;
  governmentIdUrl?: string;
  addressProofUrl?: string;
  businessDocumentUrl?: string;
}

interface PayoutRequest {
  id: string;
  creatorId: string;
  creatorName: string;
  amount: number;
  currency: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: Date;
  verificationLevel: string;
}

interface ComplianceFlag {
  id: string;
  creatorId: string;
  creatorName: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  reason: string;
  status: 'open' | 'resolved';
  createdAt: Date;
}

export default function ComplianceDashboard() {
  const [tabValue, setTabValue] = useState(0);
  const [loading, setLoading] = useState(true);
  
  // Verification requests
  const [verificationRequests, setVerificationRequests] = useState<VerificationRequest[]>([]);
  const [selectedVerification, setSelectedVerification] = useState<VerificationRequest | null>(null);
  const [verificationDialogOpen, setVerificationDialogOpen] = useState(false);
  
  // Payout requests
  const [payoutRequests, setPayoutRequests] = useState<PayoutRequest[]>([]);
  
  // Compliance flags
  const [complianceFlags, setComplianceFlags] = useState<ComplianceFlag[]>([]);
  
  // Stats
  const [stats, setStats] = useState({
    pendingVerifications: 0,
    pendingPayouts: 0,
    openFlags: 0,
    totalPayoutsToday: 0
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load verification requests
      // const verifications = await fetchVerificationRequests();
      // setVerificationRequests(verifications);
      
      // Load payout requests
      // const payouts = await fetchPayoutRequests();
      // setPayoutRequests(payouts);
      
      // Load compliance flags
      // const flags = await fetchComplianceFlags();
      // setComplianceFlags(flags);
      
      // Mock data
      setVerificationRequests([
        {
          id: '1',
          userId: 'user1',
          userName: 'John Doe',
          userEmail: 'john@example.com',
          level: 'level1',
          status: 'pending',
          submittedAt: new Date()
        }
      ]);
      
      setPayoutRequests([
        {
          id: '1',
          creatorId: 'creator1',
          creatorName: 'Jane Smith',
          amount: 5000,
          currency: 'PLN',
          status: 'pending',
          createdAt: new Date(),
          verificationLevel: 'level1'
        }
      ]);
      
      setComplianceFlags([
        {
          id: '1',
          creatorId: 'creator2',
          creatorName: 'Bob Wilson',
          type: 'high_velocity_payouts',
          severity: 'medium',
          reason: 'More than 5 payouts in 24 hours',
          status: 'open',
          createdAt: new Date()
        }
      ]);
      
      setStats({
        pendingVerifications: 12,
        pendingPayouts: 8,
        openFlags: 3,
        totalPayoutsToday: 125000
      });
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const approveVerification = async (verificationId: string) => {
    try {
      // Call Cloud Function to approve
      // await approveKYC(verificationId);
      alert('Verification approved');
      loadData();
    } catch (error) {
      console.error('Error approving verification:', error);
      alert('Failed to approve verification');
    }
  };

  const rejectVerification = async (verificationId: string, reason: string) => {
    try {
      // Call Cloud Function to reject
      // await rejectKYC(verificationId, reason);
      alert('Verification rejected');
      loadData();
    } catch (error) {
      console.error('Error rejecting verification:', error);
      alert('Failed to reject verification');
    }
  };

  const approvePayout = async (payoutId: string) => {
    try {
      // Call Cloud Function to approve payout
      // await approvePayout(payoutId);
      alert('Payout approved and processing');
      loadData();
    } catch (error) {
      console.error('Error approving payout:', error);
      alert('Failed to approve payout');
    }
  };

  const resolveFlag = async (flagId: string) => {
    try {
      // Mark flag as resolved
      alert('Flag resolved');
      loadData();
    } catch (error) {
      console.error('Error resolving flag:', error);
      alert('Failed to resolve flag');
    }
  };

  const viewVerificationDetails = (verification: VerificationRequest) => {
    setSelectedVerification(verification);
    setVerificationDialogOpen(true);
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'error';
      case 'high':
        return 'error';
      case 'medium':
        return 'warning';
      case 'low':
        return 'info';
      default:
        return 'default';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
      case 'completed':
        return 'success';
      case 'rejected':
      case 'failed':
        return 'error';
      case 'pending':
        return 'warning';
      case 'under_review':
      case 'processing':
        return 'info';
      default:
        return 'default';
    }
  };

  const renderStats = () => (
    <Grid container spacing={3} sx={{ mb: 3 }}>
      <Grid item xs={12} sm={6} md={3}>
        <Card>
          <CardContent>
            <Box display="flex" alignItems="center" mb={1}>
              <Pending color="warning" sx={{ mr: 1 }} />
              <Typography variant="h6">Pending KYC</Typography>
            </Box>
            <Typography variant="h4">{stats.pendingVerifications}</Typography>
            <Typography variant="body2" color="textSecondary">
              Awaiting review
            </Typography>
          </CardContent>
        </Card>
      </Grid>
      
      <Grid item xs={12} sm={6} md={3}>
        <Card>
          <CardContent>
            <Box display="flex" alignItems="center" mb={1}>
              <Warning color="warning" sx={{ mr: 1 }} />
              <Typography variant="h6">Pending Payouts</Typography>
            </Box>
            <Typography variant="h4">{stats.pendingPayouts}</Typography>
            <Typography variant="body2" color="textSecondary">
              Awaiting approval
            </Typography>
          </CardContent>
        </Card>
      </Grid>
      
      <Grid item xs={12} sm={6} md={3}>
        <Card>
          <CardContent>
            <Box display="flex" alignItems="center" mb={1}>
              <ErrorIcon color="error" sx={{ mr: 1 }} />
              <Typography variant="h6">Open Flags</Typography>
            </Box>
            <Typography variant="h4">{stats.openFlags}</Typography>
            <Typography variant="body2" color="textSecondary">
              Compliance issues
            </Typography>
          </CardContent>
        </Card>
      </Grid>
      
      <Grid item xs={12} sm={6} md={3}>
        <Card>
          <CardContent>
            <Box display="flex" alignItems="center" mb={1}>
              <CheckCircle color="success" sx={{ mr: 1 }} />
              <Typography variant="h6">Today's Payouts</Typography>
            </Box>
            <Typography variant="h4">
              {(stats.totalPayoutsToday / 1000).toFixed(0)}K
            </Typography>
            <Typography variant="body2" color="textSecondary">
              PLN processed
            </Typography>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );

  const renderVerificationRequests = () => (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>User</TableCell>
            <TableCell>Email</TableCell>
            <TableCell>Level</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Submitted</TableCell>
            <TableCell>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {verificationRequests.map((request) => (
            <TableRow key={request.id}>
              <TableCell>{request.userName}</TableCell>
              <TableCell>{request.userEmail}</TableCell>
              <TableCell>
                <Chip label={request.level.toUpperCase()} size="small" />
              </TableCell>
              <TableCell>
                <Chip
                  label={request.status}
                  color={getStatusColor(request.status) as any}
                  size="small"
                />
              </TableCell>
              <TableCell>
                {new Date(request.submittedAt).toLocaleDateString()}
              </TableCell>
              <TableCell>
                <IconButton
                  size="small"
                  onClick={() => viewVerificationDetails(request)}
                >
                  <Visibility />
                </IconButton>
                {request.status === 'pending' && (
                  <>
                    <IconButton
                      size="small"
                      color="success"
                      onClick={() => approveVerification(request.id)}
                    >
                      <Done />
                    </IconButton>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => rejectVerification(request.id, 'Invalid documents')}
                    >
                      <Close />
                    </IconButton>
                  </>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );

  const renderPayoutRequests = () => (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Creator</TableCell>
            <TableCell>Amount</TableCell>
            <TableCell>Currency</TableCell>
            <TableCell>KYC Level</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Requested</TableCell>
            <TableCell>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {payoutRequests.map((request) => (
            <TableRow key={request.id}>
              <TableCell>{request.creatorName}</TableCell>
              <TableCell>{request.amount.toLocaleString()}</TableCell>
              <TableCell>{request.currency}</TableCell>
              <TableCell>
                <Chip label={request.verificationLevel} size="small" />
              </TableCell>
              <TableCell>
                <Chip
                  label={request.status}
                  color={getStatusColor(request.status) as any}
                  size="small"
                />
              </TableCell>
              <TableCell>
                {new Date(request.createdAt).toLocaleDateString()}
              </TableCell>
              <TableCell>
                {request.status === 'pending' && (
                  <Button
                    size="small"
                    variant="contained"
                    color="primary"
                    onClick={() => approvePayout(request.id)}
                  >
                    Approve
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );

  const renderComplianceFlags = () => (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Creator</TableCell>
            <TableCell>Type</TableCell>
            <TableCell>Severity</TableCell>
            <TableCell>Reason</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Created</TableCell>
            <TableCell>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {complianceFlags.map((flag) => (
            <TableRow key={flag.id}>
              <TableCell>{flag.creatorName}</TableCell>
              <TableCell>{flag.type}</TableCell>
              <TableCell>
                <Chip
                  label={flag.severity}
                  color={getSeverityColor(flag.severity) as any}
                  size="small"
                />
              </TableCell>
              <TableCell>{flag.reason}</TableCell>
              <TableCell>
                <Chip
                  label={flag.status}
                  color={flag.status === 'open' ? 'error' : 'success'}
                  size="small"
                />
              </TableCell>
              <TableCell>
                {new Date(flag.createdAt).toLocaleDateString()}
              </TableCell>
              <TableCell>
                {flag.status === 'open' && (
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => resolveFlag(flag.id)}
                  >
                    Resolve
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Compliance Dashboard
      </Typography>
      <Typography variant="body1" color="textSecondary" gutterBottom>
        Monitor creator verification, payouts, and compliance flags
      </Typography>

      {renderStats()}

      <Card>
        <Tabs value={tabValue} onChange={(e, newValue) => setTabValue(newValue)}>
          <Tab label="Verification Requests" />
          <Tab label="Payout Requests" />
          <Tab label="Compliance Flags" />
        </Tabs>
        
        <CardContent>
          {tabValue === 0 && renderVerificationRequests()}
          {tabValue === 1 && renderPayoutRequests()}
          {tabValue === 2 && renderComplianceFlags()}
        </CardContent>
      </Card>

      {/* Verification Details Dialog */}
      <Dialog
        open={verificationDialogOpen}
        onClose={() => setVerificationDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Verification Details</DialogTitle>
        <DialogContent>
          {selectedVerification && (
            <Box>
              <Typography variant="h6" gutterBottom>
                {selectedVerification.userName}
              </Typography>
              <Typography variant="body2" gutterBottom>
                Email: {selectedVerification.userEmail}
              </Typography>
              <Typography variant="body2" gutterBottom>
                Level: {selectedVerification.level}
              </Typography>
              <Typography variant="body2" gutterBottom>
                Status: {selectedVerification.status}
              </Typography>
              
              {selectedVerification.governmentIdUrl && (
                <Box mt={2}>
                  <Typography variant="subtitle2">Government ID:</Typography>
                  <img
                    src={selectedVerification.governmentIdUrl}
                    alt="Government ID"
                    style={{ maxWidth: '100%', marginTop: 8 }}
                  />
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setVerificationDialogOpen(false)}>
            Close
          </Button>
          {selectedVerification?.status === 'pending' && (
            <>
              <Button
                color="success"
                variant="contained"
                onClick={() => {
                  approveVerification(selectedVerification.id);
                  setVerificationDialogOpen(false);
                }}
              >
                Approve
              </Button>
              <Button
                color="error"
                variant="contained"
                onClick={() => {
                  rejectVerification(selectedVerification.id, 'Invalid documents');
                  setVerificationDialogOpen(false);
                }}
              >
                Reject
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
}
