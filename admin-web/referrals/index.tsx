/**
 * PACK 355 - Referral & Invite Engine
 * Admin Dashboard Module
 * 
 * Features:
 * - Global referral heatmap
 * - Top referrers
 * - Influencer contribution
 * - Campaign tracking
 * - Fraud flags
 * - Admin actions (freeze, disable)
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Grid,
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  LinearProgress,
  Tabs,
  Tab,
} from '@mui/material';
import {
  Block as BlockIcon,
  Lock as LockIcon,
  Refresh as RefreshIcon,
  Campaign as CampaignIcon,
  TrendingUp as TrendingUpIcon,
  Warning as WarningIcon,
  Public as PublicIcon,
  People as PeopleIcon,
} from '@mui/icons-material';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';

interface ReferralMetrics {
  totalReferrals: number;
  activeReferrals: number;
  fraudReferrals: number;
  fraudRate: number;
  conversionRate: number;
  avgViralCoefficient: number;
  topReferrers: ReferralStats[];
}

interface ReferralStats {
  userId: string;
  totalInvites: number;
  convertedInvites: number;
  totalRewardsTokens: number;
  flaggedAttempts: number;
  viralCoefficient?: number;
}

interface RegionalMetrics {
  totalReferrals: number;
  activeReferrals: number;
  fraudRate: number;
  conversionRate: number;
}

export default function ReferralsAdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<ReferralMetrics | null>(null);
  const [selectedTab, setSelectedTab] = useState(0);
  const [freezeDialogOpen, setFreezeDialogOpen] = useState(false);
  const [disableDialogOpen, setDisableDialogOpen] = useState(false);
  const [campaignDialogOpen, setCampaignDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedCode, setSelectedCode] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [campaignName, setCampaignName] = useState('');
  const [regionalMetrics, setRegionalMetrics] = useState<Record<string, RegionalMetrics>>({});

  useEffect(() => {
    loadMetrics();
  }, []);

  const loadMetrics = async () => {
    try {
      setLoading(true);

      const getMetricsFn = httpsCallable(functions, 'getGlobalReferralMetrics');
      const result = await getMetricsFn({});
      setMetrics((result.data as any).metrics);

      // Load regional data for top countries
      const topCountries = ['US', 'GB', 'CA', 'AU', 'DE', 'FR', 'JP', 'BR'];
      const regionalData: Record<string, RegionalMetrics> = {};

      for (const country of topCountries) {
        try {
          const getRegionalFn = httpsCallable(functions, 'getReferralMetricsByRegionEndpoint');
          const regionalResult = await getRegionalFn({ countryCode: country });
          regionalData[country] = (regionalResult.data as any).metrics;
        } catch (error) {
          console.error(`Error loading metrics for ${country}:`, error);
        }
      }

      setRegionalMetrics(regionalData);
    } catch (error) {
      console.error('Error loading metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFreezeUser = async () => {
    if (!selectedUserId) return;

    try {
      const freezeFn = httpsCallable(functions, 'adminFreezeUserReferrals');
      await freezeFn({ userId: selectedUserId });
      alert('User referrals frozen successfully');
      setFreezeDialogOpen(false);
      setSelectedUserId('');
      loadMetrics();
    } catch (error) {
      console.error('Error freezing user:', error);
      alert('Failed to freeze user referrals');
    }
  };

  const handleDisableCode = async () => {
    if (!selectedCode) return;

    try {
      const disableFn = httpsCallable(functions, 'adminDisableReferralCode');
      await disableFn({ code: selectedCode });
      alert('Referral code disabled successfully');
      setDisableDialogOpen(false);
      setSelectedCode('');
      loadMetrics();
    } catch (error) {
      console.error('Error disabling code:', error);
      alert('Failed to disable referral code');
    }
  };

  const handleCreateCampaign = async () => {
    if (!campaignId || !campaignName) return;

    try {
      const createCampaignFn = httpsCallable(functions, 'adminCreateCampaignCode');
      const result = await createCampaignFn({ campaignId, campaignName });
      alert(`Campaign created! Code: ${(result.data as any).code.code}`);
      setCampaignDialogOpen(false);
      setCampaignId('');
      setCampaignName('');
      loadMetrics();
    } catch (error) {
      console.error('Error creating campaign:', error);
      alert('Failed to create campaign');
    }
  };

  if (loading) {
    return (
      <Container maxWidth="xl" sx={{ mt: 4 }}>
        <LinearProgress />
        <Typography variant="h6" align="center" sx={{ mt: 2 }}>
          Loading referral metrics...
        </Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Typography variant="h4" component="h1">
          Referral & Invite Engine
        </Typography>
        <Box>
          <Button
            variant="contained"
            startIcon={<CampaignIcon />}
            onClick={() => setCampaignDialogOpen(true)}
            sx={{ mr: 2 }}
          >
            Create Campaign
          </Button>
          <IconButton onClick={loadMetrics}>
            <RefreshIcon />
          </IconButton>
        </Box>
      </Box>

      {/* Key Metrics */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Total Referrals
              </Typography>
              <Typography variant="h4">{metrics?.totalReferrals || 0}</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                <PeopleIcon color="primary" sx={{ mr: 1 }} />
                <Typography variant="body2" color="textSecondary">
                  All time
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Active Referrals
              </Typography>
              <Typography variant="h4" color="success.main">
                {metrics?.activeReferrals || 0}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                <TrendingUpIcon color="success" sx={{ mr: 1 }} />
                <Typography variant="body2" color="textSecondary">
                  {metrics && metrics.totalReferrals > 0
                    ? ((metrics.activeReferrals / metrics.totalReferrals) * 100).toFixed(1)
                    : 0}
                  % conversion
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Fraud Blocked
              </Typography>
              <Typography variant="h4" color="error.main">
                {metrics?.fraudReferrals || 0}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                <WarningIcon color="error" sx={{ mr: 1 }} />
                <Typography variant="body2" color="textSecondary">
                  {metrics ? (metrics.fraudRate * 100).toFixed(1) : 0}% fraud rate
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Viral Coefficient
              </Typography>
              <Typography variant="h4" color="info.main">
                {metrics?.avgViralCoefficient.toFixed(2) || '0.00'}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                <PublicIcon color="info" sx={{ mr: 1 }} />
                <Typography variant="body2" color="textSecondary">
                  {metrics && metrics.avgViralCoefficient > 1 ? 'Exponential growth' : 'Linear growth'}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={selectedTab} onChange={(e, v) => setSelectedTab(v)}>
          <Tab label="Top Referrers" />
          <Tab label="Regional Breakdown" />
          <Tab label="Admin Actions" />
        </Tabs>
      </Box>

      {/* Top Referrers Tab */}
      {selectedTab === 0 && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Top Referrers Leaderboard
            </Typography>
            <TableContainer component={Paper} variant="outlined">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Rank</TableCell>
                    <TableCell>User ID</TableCell>
                    <TableCell align="right">Total Invites</TableCell>
                    <TableCell align="right">Converted</TableCell>
                    <TableCell align="right">Tokens Earned</TableCell>
                    <TableCell align="right">K-Factor</TableCell>
                    <TableCell align="right">Fraud Flags</TableCell>
                    <TableCell align="center">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {metrics?.topReferrers.map((referrer, index) => (
                    <TableRow key={referrer.userId}>
                      <TableCell>
                        <Chip
                          label={`#${index + 1}`}
                          color={index < 3 ? 'primary' : 'default'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>{referrer.userId.substring(0, 12)}...</TableCell>
                      <TableCell align="right">{referrer.totalInvites}</TableCell>
                      <TableCell align="right">
                        <Chip label={referrer.convertedInvites} color="success" size="small" />
                      </TableCell>
                      <TableCell align="right">{referrer.totalRewardsTokens}</TableCell>
                      <TableCell align="right">
                        {referrer.viralCoefficient?.toFixed(2) || 'N/A'}
                      </TableCell>
                      <TableCell align="right">
                        {referrer.flaggedAttempts > 0 ? (
                          <Chip
                            label={referrer.flaggedAttempts}
                            color="error"
                            size="small"
                            icon={<WarningIcon />}
                          />
                        ) : (
                          <Chip label="0" color="success" size="small" />
                        )}
                      </TableCell>
                      <TableCell align="center">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => {
                            setSelectedUserId(referrer.userId);
                            setFreezeDialogOpen(true);
                          }}
                          title="Freeze referrals"
                        >
                          <LockIcon />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}

      {/* Regional Breakdown Tab */}
      {selectedTab === 1 && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Regional Referral Metrics
            </Typography>
            <TableContainer component={Paper} variant="outlined">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Country</TableCell>
                    <TableCell align="right">Total Referrals</TableCell>
                    <TableCell align="right">Active</TableCell>
                    <TableCell align="right">Conversion Rate</TableCell>
                    <TableCell align="right">Fraud Rate</TableCell>
                    <TableCell align="right">Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {Object.entries(regionalMetrics).map(([country, data]) => (
                    <TableRow key={country}>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          <PublicIcon sx={{ mr: 1 }} />
                          <Typography variant="body1">{country}</Typography>
                        </Box>
                      </TableCell>
                      <TableCell align="right">{data.totalReferrals}</TableCell>
                      <TableCell align="right">
                        <Chip label={data.activeReferrals} color="success" size="small" />
                      </TableCell>
                      <TableCell align="right">
                        {(data.conversionRate * 100).toFixed(1)}%
                      </TableCell>
                      <TableCell align="right">
                        <Chip
                          label={`${(data.fraudRate * 100).toFixed(1)}%`}
                          color={data.fraudRate > 0.1 ? 'error' : 'success'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Chip
                          label={data.fraudRate > 0.2 ? 'High Risk' : 'Normal'}
                          color={data.fraudRate > 0.2 ? 'warning' : 'success'}
                          size="small"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}

      {/* Admin Actions Tab */}
      {selectedTab === 2 && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  User Management
                </Typography>
                <Alert severity="warning" sx={{ mb: 2 }}>
                  Use these actions carefully. They will immediately affect user referrals.
                </Alert>
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<LockIcon />}
                  onClick={() => setFreezeDialogOpen(true)}
                  fullWidth
                  sx={{ mb: 2 }}
                >
                  Freeze User Referrals
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<BlockIcon />}
                  onClick={() => setDisableDialogOpen(true)}
                  fullWidth
                >
                  Disable Referral Code
                </Button>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Campaign Management
                </Typography>
                <Alert severity="info" sx={{ mb: 2 }}>
                  Create campaign codes for marketing initiatives and track their performance.
                </Alert>
                <Button
                  variant="contained"
                  startIcon={<CampaignIcon />}
                  onClick={() => setCampaignDialogOpen(true)}
                  fullWidth
                >
                  Create New Campaign Code
                </Button>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Freeze User Dialog */}
      <Dialog open={freezeDialogOpen} onClose={() => setFreezeDialogOpen(false)}>
        <DialogTitle>Freeze User Referrals</DialogTitle>
        <DialogContent>
          <Alert severity="error" sx={{ mb: 2 }}>
            This will lock all pending and active referrals for this user. This action cannot be
            easily undone.
          </Alert>
          <TextField
            autoFocus
            margin="dense"
            label="User ID"
            fullWidth
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFreezeDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleFreezeUser} color="error" variant="contained">
            Freeze Referrals
          </Button>
        </DialogActions>
      </Dialog>

      {/* Disable Code Dialog */}
      <Dialog open={disableDialogOpen} onClose={() => setDisableDialogOpen(false)}>
        <DialogTitle>Disable Referral Code</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            This will prevent the code from being used for new referrals. Existing referrals will
            not be affected.
          </Alert>
          <TextField
            autoFocus
            margin="dense"
            label="Referral Code"
            fullWidth
            value={selectedCode}
            onChange={(e) => setSelectedCode(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDisableDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDisableCode} color="error" variant="contained">
            Disable Code
          </Button>
        </DialogActions>
      </Dialog>

      {/* Create Campaign Dialog */}
      <Dialog open={campaignDialogOpen} onClose={() => setCampaignDialogOpen(false)}>
        <DialogTitle>Create Campaign Code</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Campaign ID"
            fullWidth
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            label="Campaign Name"
            fullWidth
            value={campaignName}
            onChange={(e) => setCampaignName(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCampaignDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleCreateCampaign} variant="contained">
            Create Campaign
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
