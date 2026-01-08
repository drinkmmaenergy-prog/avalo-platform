/**
 * PACK 399 — Influencer Console Dashboard
 * 
 * Admin interface for managing influencers, campaigns, and payouts
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
  Button,
  Chip,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tabs,
  Tab,
  Alert,
  LinearProgress,
} from '@mui/material';
import {
  TrendingUp,
  AttachMoney,
  People,
  Warning,
  CheckCircle,
  Block,
  Pause,
  PlayArrow,
} from '@mui/icons-material';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirestore, collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';

// ============================================================================
// TYPES
// ============================================================================

type InfluencerState = 'CANDIDATE' | 'VERIFIED' | 'ACTIVE' | 'PAUSED' | 'BANNED';

interface InfluencerProfile {
  influencerId: string;
  userId: string;
  state: InfluencerState;
  displayName: string;
  handle: string;
  email: string;
  followers: number;
  platformType: string;
  platformHandle: string;
  referralCode: string;
  totalInstalls: number;
  verifiedProfiles: number;
  firstPurchases: number;
  totalRevenue: number;
  fraudRatio: number;
  totalEarnings: number;
  pendingEarnings: number;
  paidEarnings: number;
  country: string;
  fraudScore: number;
  createdAt: any;
  lastActiveAt: any;
}

interface InfluencerMetrics {
  impressions: number;
  clicks: number;
  installs: number;
  verifiedProfiles: number;
  firstPurchases: number;
  revenue: number;
  commission: number;
  fraudInstalls: number;
  fraudRevenue: number;
}

interface ConversionRates {
  clickToInstall: number;
  installToVerified: number;
  verifiedToFirstPurchase: number;
  fraudRate: number;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function InfluencerConsoleDashboard() {
  const [activeTab, setActiveTab] = useState(0);
  const [influencers, setInfluencers] = useState<InfluencerProfile[]>([]);
  const [selectedInfluencer, setSelectedInfluencer] = useState<InfluencerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterState, setFilterState] = useState<InfluencerState | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [showVerifyDialog, setShowVerifyDialog] = useState(false);
  const [showPayoutDialog, setShowPayoutDialog] = useState(false);

  const functions = getFunctions();
  const db = getFirestore();

  // Load influencers
  useEffect(() => {
    loadInfluencers();
  }, [filterState]);

  async function loadInfluencers() {
    try {
      setLoading(true);
      setError(null);

      let q = query(
        collection(db, 'influencer_profiles'),
        orderBy('totalRevenue', 'desc'),
        limit(100)
      );

      if (filterState !== 'ALL') {
        q = query(
          collection(db, 'influencer_profiles'),
          where('state', '==', filterState),
          orderBy('totalRevenue', 'desc'),
          limit(100)
        );
      }

      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({
        ...doc.data(),
        influencerId: doc.id,
      })) as InfluencerProfile[];

      setInfluencers(data);
    } catch (err: any) {
      console.error('Error loading influencers:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Filter influencers by search query
  const filteredInfluencers = influencers.filter(inf =>
    inf.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    inf.handle.toLowerCase().includes(searchQuery.toLowerCase()) ||
    inf.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Handle verification
  async function handleVerifyInfluencer(influencerId: string) {
    try {
      const verifyInfluencer = httpsCallable(functions, 'verifyInfluencer');
      await verifyInfluencer({ influencerId, platformVerified: true });
      setShowVerifyDialog(false);
      loadInfluencers();
      alert('Influencer verified successfully');
    } catch (err: any) {
      console.error('Error verifying influencer:', err);
      alert('Failed to verify influencer: ' + err.message);
    }
  }

  // Handle payout creation
  async function handleCreatePayout(influencerId: string, periodStart: string, periodEnd: string) {
    try {
      const createPayout = httpsCallable(functions, 'createInfluencerPayout');
      const result = await createPayout({ influencerId, periodStart, periodEnd });
      setShowPayoutDialog(false);
      alert(`Payout created successfully. Amount: $${(result.data as any).amount}`);
    } catch (err: any) {
      console.error('Error creating payout:', err);
      alert('Failed to create payout: ' + err.message);
    }
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" gutterBottom>
          Influencer Console
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Manage influencer partnerships, campaigns, and payouts
        </Typography>
      </Box>

      {/* Tabs */}
      <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)} sx={{ mb: 3 }}>
        <Tab label="Overview" />
        <Tab label="Influencer Ranking" />
        <Tab label="Funnel Analysis" />
        <Tab label="Fraud Alerts" />
        <Tab label="Payouts" />
      </Tabs>

      {/* Tab Content */}
      {activeTab === 0 && (
        <OverviewTab
          influencers={influencers}
          loading={loading}
        />
      )}

      {activeTab === 1 && (
        <RankingTab
          influencers={filteredInfluencers}
          loading={loading}
          error={error}
          filterState={filterState}
          setFilterState={setFilterState}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          onVerify={(inf) => {
            setSelectedInfluencer(inf);
            setShowVerifyDialog(true);
          }}
          onCreatePayout={(inf) => {
            setSelectedInfluencer(inf);
            setShowPayoutDialog(true);
          }}
          onRefresh={loadInfluencers}
        />
      )}

      {activeTab === 2 && (
        <FunnelAnalysisTab influencers={influencers} />
      )}

      {activeTab === 3 && (
        <FraudAlertsTab influencers={influencers} />
      )}

      {activeTab === 4 && (
        <PayoutsTab />
      )}

      {/* Verify Dialog */}
      <Dialog open={showVerifyDialog} onClose={() => setShowVerifyDialog(false)}>
        <DialogTitle>Verify Influencer</DialogTitle>
        <DialogContent>
          {selectedInfluencer && (
            <Box>
              <Typography variant="body1">
                <strong>Name:</strong> {selectedInfluencer.displayName}
              </Typography>
              <Typography variant="body1">
                <strong>Platform:</strong> {selectedInfluencer.platformType}
              </Typography>
              <Typography variant="body1">
                <strong>Handle:</strong> @{selectedInfluencer.platformHandle}
              </Typography>
              <Typography variant="body1">
                <strong>Followers:</strong> {selectedInfluencer.followers.toLocaleString()}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                Verify that this influencer has provided authentic platform credentials and meets our partnership criteria.
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowVerifyDialog(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="primary"
            onClick={() => selectedInfluencer && handleVerifyInfluencer(selectedInfluencer.influencerId)}
          >
            Verify
          </Button>
        </DialogActions>
      </Dialog>

      {/* Payout Dialog */}
      <Dialog open={showPayoutDialog} onClose={() => setShowPayoutDialog(false)}>
        <DialogTitle>Create Payout</DialogTitle>
        <DialogContent>
          {selectedInfluencer && (
            <Box>
              <Typography variant="body1" gutterBottom>
                <strong>Influencer:</strong> {selectedInfluencer.displayName}
              </Typography>
              <Typography variant="body1" gutterBottom>
                <strong>Pending Earnings:</strong> ${selectedInfluencer.pendingEarnings.toFixed(2)}
              </Typography>
              <TextField
                fullWidth
                label="Period Start"
                type="date"
                sx={{ mt: 2 }}
                InputLabelProps={{ shrink: true }}
                id="payout-period-start"
              />
              <TextField
                fullWidth
                label="Period End"
                type="date"
                sx={{ mt: 2 }}
                InputLabelProps={{ shrink: true }}
                id="payout-period-end"
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowPayoutDialog(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="primary"
            onClick={() => {
              if (selectedInfluencer) {
                const startInput = document.getElementById('payout-period-start') as HTMLInputElement;
                const endInput = document.getElementById('payout-period-end') as HTMLInputElement;
                handleCreatePayout(selectedInfluencer.influencerId, startInput.value, endInput.value);
              }
            }}
          >
            Create Payout
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

// ============================================================================
// OVERVIEW TAB
// ============================================================================

function OverviewTab({ influencers, loading }: { influencers: InfluencerProfile[]; loading: boolean }) {
  const stats = {
    totalInfluencers: influencers.length,
    activeInfluencers: influencers.filter(i => i.state === 'ACTIVE').length,
    totalRevenue: influencers.reduce((sum, i) => sum + i.totalRevenue, 0),
    totalEarnings: influencers.reduce((sum, i) => sum + i.totalEarnings, 0),
    totalInstalls: influencers.reduce((sum, i) => sum + i.totalInstalls, 0),
    avgFraudRatio: influencers.length > 0
      ? influencers.reduce((sum, i) => sum + i.fraudRatio, 0) / influencers.length
      : 0,
  };

  return (
    <Box>
      {loading ? (
        <LinearProgress />
      ) : (
        <>
          <Grid container spacing={3}>
            <Grid item xs={12} md={3}>
              <StatCard
                title="Total Influencers"
                value={stats.totalInfluencers}
                icon={<People />}
                color="#1976d2"
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <StatCard
                title="Active Influencers"
                value={stats.activeInfluencers}
                icon={<CheckCircle />}
                color="#2e7d32"
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <StatCard
                title="Total Revenue"
                value={`$${stats.totalRevenue.toLocaleString()}`}
                icon={<AttachMoney />}
                color="#ed6c02"
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <StatCard
                title="Total Installs"
                value={stats.totalInstalls.toLocaleString()}
                icon={<TrendingUp />}
                color="#9c27b0"
              />
            </Grid>
          </Grid>

          <Card sx={{ mt: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Top Performing Influencers
              </Typography>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell>
                      <TableCell>Platform</TableCell>
                      <TableCell align="right">Installs</TableCell>
                      <TableCell align="right">Revenue</TableCell>
                      <TableCell align="right">Conversion</TableCell>
                      <TableCell>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {influencers.slice(0, 10).map((inf) => (
                      <TableRow key={inf.influencerId}>
                        <TableCell>{inf.displayName}</TableCell>
                        <TableCell>
                          {inf.platformType} ({inf.followers.toLocaleString()})
                        </TableCell>
                        <TableCell align="right">{inf.totalInstalls}</TableCell>
                        <TableCell align="right">${inf.totalRevenue.toFixed(2)}</TableCell>
                        <TableCell align="right">
                          {inf.totalInstalls > 0
                            ? ((inf.firstPurchases / inf.totalInstalls) * 100).toFixed(1)
                            : 0}%
                        </TableCell>
                        <TableCell>
                          <StateChip state={inf.state} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </>
      )}
    </Box>
  );
}

// ============================================================================
// RANKING TAB
// ============================================================================

function RankingTab({
  influencers,
  loading,
  error,
  filterState,
  setFilterState,
  searchQuery,
  setSearchQuery,
  onVerify,
  onCreatePayout,
  onRefresh,
}: any) {
  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Box sx={{ mb: 3, display: 'flex', gap: 2 }}>
        <TextField
          placeholder="Search by name, handle, or email..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          sx={{ flexGrow: 1 }}
        />
        <FormControl sx={{ minWidth: 150 }}>
          <InputLabel>Status Filter</InputLabel>
          <Select
            value={filterState}
            label="Status Filter"
            onChange={(e) => setFilterState(e.target.value)}
          >
            <MenuItem value="ALL">All</MenuItem>
            <MenuItem value="CANDIDATE">Candidate</MenuItem>
            <MenuItem value="VERIFIED">Verified</MenuItem>
            <MenuItem value="ACTIVE">Active</MenuItem>
            <MenuItem value="PAUSED">Paused</MenuItem>
            <MenuItem value="BANNED">Banned</MenuItem>
          </Select>
        </FormControl>
        <Button variant="outlined" onClick={onRefresh}>
          Refresh
        </Button>
      </Box>

      {loading ? (
        <LinearProgress />
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Influencer</TableCell>
                <TableCell>Platform</TableCell>
                <TableCell align="right">Installs</TableCell>
                <TableCell align="right">Verified</TableCell>
                <TableCell align="right">First Purchase</TableCell>
                <TableCell align="right">Revenue</TableCell>
                <TableCell align="right">Earnings</TableCell>
                <TableCell align="right">Fraud</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {influencers.map((inf: InfluencerProfile) => (
                <TableRow key={inf.influencerId}>
                  <TableCell>
                    <Box>
                      <Typography variant="body2" fontWeight="bold">
                        {inf.displayName}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        @{inf.handle} • {inf.email}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Box>
                      <Typography variant="body2">{inf.platformType}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {inf.followers.toLocaleString()} followers
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell align="right">{inf.totalInstalls}</TableCell>
                  <TableCell align="right">{inf.verifiedProfiles}</TableCell>
                  <TableCell align="right">{inf.firstPurchases}</TableCell>
                  <TableCell align="right">${inf.totalRevenue.toFixed(2)}</TableCell>
                  <TableCell align="right">
                    <Box>
                      <Typography variant="body2">${inf.totalEarnings.toFixed(2)}</Typography>
                      <Typography variant="caption" color="warning.main">
                        ${inf.pendingEarnings.toFixed(2)} pending
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell align="right">
                    <Chip
                      label={`${(inf.fraudRatio * 100).toFixed(1)}%`}
                      size="small"
                      color={inf.fraudRatio > 0.2 ? 'error' : 'success'}
                    />
                  </TableCell>
                  <TableCell>
                    <StateChip state={inf.state} />
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      {inf.state === 'CANDIDATE' && (
                        <Button size="small" onClick={() => onVerify(inf)}>
                          Verify
                        </Button>
                      )}
                      {inf.pendingEarnings > 0 && (
                        <Button size="small" onClick={() => onCreatePayout(inf)}>
                          Pay
                        </Button>
                      )}
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}

// ============================================================================
// FUNNEL ANALYSIS TAB
// ============================================================================

function FunnelAnalysisTab({ influencers }: { influencers: InfluencerProfile[] }) {
  // Calculate aggregate funnel metrics
  const funnelData = {
    totalInstalls: influencers.reduce((sum, i) => sum + i.totalInstalls, 0),
    totalVerified: influencers.reduce((sum, i) => sum + i.verifiedProfiles, 0),
    totalPurchases: influencers.reduce((sum, i) => sum + i.firstPurchases, 0),
  };

  const conversionRates = {
    installToVerified: funnelData.totalInstalls > 0
      ? (funnelData.totalVerified / funnelData.totalInstalls) * 100
      : 0,
    verifiedToPurchase: funnelData.totalVerified > 0
      ? (funnelData.totalPurchases / funnelData.totalVerified) * 100
      : 0,
    installToPurchase: funnelData.totalInstalls > 0
      ? (funnelData.totalPurchases / funnelData.totalInstalls) * 100
      : 0,
  };

  return (
    <Box>
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Aggregate Funnel Conversion
          </Typography>
          
          <Box sx={{ mt: 3 }}>
            <FunnelStage
              label="Installs"
              value={funnelData.totalInstalls}
              percentage={100}
            />
            <FunnelStage
              label="Verified Profiles"
              value={funnelData.totalVerified}
              percentage={conversionRates.installToVerified}
            />
            <FunnelStage
              label="First Purchase"
              value={funnelData.totalPurchases}
              percentage={conversionRates.verifiedToPurchase}
            />
          </Box>

          <Box sx={{ mt: 4 }}>
            <Typography variant="subtitle2" gutterBottom>
              Overall Conversion Rate: {conversionRates.installToPurchase.toFixed(2)}%
            </Typography>
          </Box>
        </CardContent>
      </Card>

      <Card sx={{ mt: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Influencer Conversion Heatmap
          </Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Influencer</TableCell>
                  <TableCell align="right">Installs</TableCell>
                  <TableCell align="right">Install→Verified</TableCell>
                  <TableCell align="right">Verified→Purchase</TableCell>
                  <TableCell align="right">Overall</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {influencers.slice(0, 20).map((inf) => {
                  const i2v = inf.totalInstalls > 0
                    ? (inf.verifiedProfiles / inf.totalInstalls) * 100
                    : 0;
                  const v2p = inf.verifiedProfiles > 0
                    ? (inf.firstPurchases / inf.verifiedProfiles) * 100
                    : 0;
                  const overall = inf.totalInstalls > 0
                    ? (inf.firstPurchases / inf.totalInstalls) * 100
                    : 0;

                  return (
                    <TableRow key={inf.influencerId}>
                      <TableCell>{inf.displayName}</TableCell>
                      <TableCell align="right">{inf.totalInstalls}</TableCell>
                      <TableCell align="right">
                        <ConversionChip value={i2v} />
                      </TableCell>
                      <TableCell align="right">
                        <ConversionChip value={v2p} />
                      </TableCell>
                      <TableCell align="right">
                        <ConversionChip value={overall} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </Box>
  );
}

// ============================================================================
// FRAUD ALERTS TAB
// ============================================================================

function FraudAlertsTab({ influencers }: { influencers: InfluencerProfile[] }) {
  const fraudulentInfluencers = influencers.filter(i => i.fraudRatio > 0.2 || i.fraudScore > 0.7);
  
  return (
    <Box>
      <Alert severity="warning" sx={{ mb: 3 }}>
        Showing influencers with fraud ratio &gt; 20% or fraud score &gt; 0.7
      </Alert>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Influencer</TableCell>
              <TableCell align="right">Total Installs</TableCell>
              <TableCell align="right">Fraud Ratio</TableCell>
              <TableCell align="right">Fraud Score</TableCell>
              <TableCell align="right">Revenue Lost</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {fraudulentInfluencers.map((inf) => (
              <TableRow key={inf.influencerId}>
                <TableCell>
                  <Typography variant="body2" fontWeight="bold">
                    {inf.displayName}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    @{inf.handle}
                  </Typography>
                </TableCell>
                <TableCell align="right">{inf.totalInstalls}</TableCell>
                <TableCell align="right">
                  <Chip
                    label={`${(inf.fraudRatio * 100).toFixed(1)}%`}
                    color="error"
                    size="small"
                  />
                </TableCell>
                <TableCell align="right">
                  <Chip
                    label={inf.fraudScore.toFixed(2)}
                    color={inf.fraudScore > 0.8 ? 'error' : 'warning'}
                    size="small"
                  />
                </TableCell>
                <TableCell align="right">
                  ${(inf.totalRevenue * inf.fraudRatio).toFixed(2)}
                </TableCell>
                <TableCell>
                  <StateChip state={inf.state} />
                </TableCell>
                <TableCell>
                  <Button size="small" color="error" startIcon={<Block />}>
                    Ban
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {fraudulentInfluencers.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <CheckCircle sx={{ fontSize: 48, color: 'success.main', mb: 2 }} />
          <Typography variant="h6">No Fraud Alerts</Typography>
          <Typography variant="body2" color="text.secondary">
            All influencers are performing within acceptable fraud thresholds
          </Typography>
        </Box>
      )}
    </Box>
  );
}

// ============================================================================
// PAYOUTS TAB
// ============================================================================

function PayoutsTab() {
  return (
    <Box>
      <Alert severity="info" sx={{ mb: 3 }}>
        Payout management interface - Coming soon
      </Alert>
      <Typography variant="body2" color="text.secondary">
        This tab will show pending, approved, and paid influencer payouts with filtering and bulk actions.
      </Typography>
    </Box>
  );
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

function StatCard({ title, value, icon, color }: any) {
  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {title}
            </Typography>
            <Typography variant="h5">{value}</Typography>
          </Box>
          <Box sx={{ color, opacity: 0.7 }}>
            {icon}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

function StateChip({ state }: { state: InfluencerState }) {
  const config = {
    CANDIDATE: { label: 'Candidate', color: 'default' as const },
    VERIFIED: { label: 'Verified', color: 'info' as const },
    ACTIVE: { label: 'Active', color: 'success' as const },
    PAUSED: { label: 'Paused', color: 'warning' as const },
    BANNED: { label: 'Banned', color: 'error' as const },
  };

  return <Chip label={config[state].label} color={config[state].color} size="small" />;
}

function FunnelStage({ label, value, percentage }: any) {
  return (
    <Box sx={{ mb: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="body2">{label}</Typography>
        <Typography variant="body2">
          {value.toLocaleString()} ({percentage.toFixed(1)}%)
        </Typography>
      </Box>
      <LinearProgress variant="determinate" value={Math.min(percentage, 100)} />
    </Box>
  );
}

function ConversionChip({ value }: { value: number }) {
  let color: 'success' | 'warning' | 'error' = 'success';
  if (value < 10) color = 'error';
  else if (value < 20) color = 'warning';

  return (
    <Chip
      label={`${value.toFixed(1)}%`}
      color={color}
      size="small"
    />
  );
}
