/**
 * PACK 415 - Admin Abuse Center Dashboard
 * 
 * Provides admins with real-time visibility and control over:
 * - Rate limiting activity
 * - Abuse mode management
 * - Device fingerprint blacklisting
 * - Regional attack heatmaps
 * - Violation analytics
 */

import React, { useEffect, useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  CircularProgress,
  Alert,
  Tabs,
  Tab,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Block as BlockIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  Fingerprint as FingerprintIcon,
  Security as SecurityIcon,
  Timeline as TimelineIcon,
  Map as MapIcon,
} from '@mui/icons-material';

// ============================================================================
// TYPES
// ============================================================================

type AbuseMode = 'NORMAL' | 'SOFT' | 'HARD' | 'FREEZE';

interface AbuseStats {
  activeAbuse: {
    soft: number;
    hard: number;
    freeze: number;
  };
  violations24h: {
    total: number;
    byType: {
      ip: number;
      user: number;
      device: number;
    };
    byAction: Record<string, number>;
  };
  flaggedDevices: number;
  topFlaggedRegions: string[];
}

interface HealthCheckResult {
  status: string;
  timestamp: number;
  activeThrottles: number;
  abusiveSessions: {
    soft: number;
    hard: number;
    freeze: number;
  };
  currentAutoFreezes: number;
  violationsLastHour: number;
  topFlaggedRegions: string[];
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function AbuseCenterDashboard() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<AbuseStats | null>(null);
  const [health, setHealth] = useState<HealthCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // Modals
  const [applyAbuseModeModalOpen, setApplyAbuseModeModalOpen] = useState(false);
  const [blacklistDeviceModalOpen, setBlacklistDeviceModalOpen] = useState(false);

  const functions = getFunctions();

  // ========================================================================
  // DATA FETCHING
  // ========================================================================

  const fetchData = async () => {
    try {
      setRefreshing(true);
      setError(null);

      const [statsResponse, healthResponse] = await Promise.all([
        httpsCallable(functions, 'getAbuseStats')(),
        httpsCallable(functions, 'rateLimiterHealth')(),
      ]);

      setStats(statsResponse.data as AbuseStats);
      setHealth(healthResponse.data as HealthCheckResult);
    } catch (err: any) {
      console.error('Error fetching abuse center data:', err);
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  // ========================================================================
  // HANDLERS
  // ========================================================================

  const handleRefresh = () => {
    fetchData();
  };

  const handleApplyAbuseMode = async (userId: string, mode: AbuseMode, reason: string) => {
    try {
      const applyAbuseMode = httpsCallable(functions, 'adminApplyAbuseMode');
      await applyAbuseMode({ userId, mode, reason });
      
      setApplyAbuseModeModalOpen(false);
      fetchData(); // Refresh data
      
      alert(`Successfully applied ${mode} mode to user ${userId}`);
    } catch (err: any) {
      console.error('Error applying abuse mode:', err);
      alert(`Failed to apply abuse mode: ${err.message}`);
    }
  };

  const handleBlacklistDevice = async (fpHash: string, reason: string) => {
    try {
      const blacklistDevice = httpsCallable(functions, 'blacklistDevice');
      await blacklistDevice({ fpHash, reason });
      
      setBlacklistDeviceModalOpen(false);
      fetchData(); // Refresh data
      
      alert(`Successfully blacklisted device ${fpHash}`);
    } catch (err: any) {
      console.error('Error blacklisting device:', err);
      alert(`Failed to blacklist device: ${err.message}`);
    }
  };

  // ========================================================================
  // RENDER HELPERS
  // ========================================================================

  const getAbuseModeColor = (mode: AbuseMode) => {
    switch (mode) {
      case 'NORMAL':
        return 'success';
      case 'SOFT':
        return 'info';
      case 'HARD':
        return 'warning';
      case 'FREEZE':
        return 'error';
      default:
        return 'default';
    }
  };

  const getAbuseModeIcon = (mode: AbuseMode) => {
    switch (mode) {
      case 'NORMAL':
        return <CheckCircleIcon />;
      case 'SOFT':
        return <WarningIcon />;
      case 'HARD':
        return <ErrorIcon />;
      case 'FREEZE':
        return <BlockIcon />;
      default:
        return null;
    }
  };

  // ========================================================================
  // RENDER
  // ========================================================================

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={3}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Box p={3}>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box display="flex" alignItems="center" gap={2}>
          <SecurityIcon sx={{ fontSize: 40 }} />
          <Box>
            <Typography variant="h4" fontWeight="bold">
              Abuse Center
            </Typography>
            <Typography variant="body2" color="text.secondary">
              PACK 415 — Global Rate Limiter & Abuse Monitor
            </Typography>
          </Box>
        </Box>
        
        <Box display="flex" gap={2}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={handleRefresh}
            disabled={refreshing}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            color="warning"
            startIcon={<BlockIcon />}
            onClick={() => setApplyAbuseModeModalOpen(true)}
          >
            Apply Abuse Mode
          </Button>
          <Button
            variant="contained"
            color="error"
            startIcon={<FingerprintIcon />}
            onClick={() => setBlacklistDeviceModalOpen(true)}
          >
            Blacklist Device
          </Button>
        </Box>
      </Box>

      {/* Health Status */}
      {health && (
        <Card sx={{ mb: 3, bgcolor: health.status === 'healthy' ? 'success.light' : 'error.light' }}>
          <CardContent>
            <Box display="flex" justifyContent="space-between" alignItems="center">
              <Box>
                <Typography variant="h6" fontWeight="bold">
                  System Health: {health.status.toUpperCase()}
                </Typography>
                <Typography variant="body2">
                  Last updated: {new Date(health.timestamp).toLocaleString()}
                </Typography>
              </Box>
              
              <Box display="flex" gap={4}>
                <Box textAlign="center">
                  <Typography variant="h4" fontWeight="bold">
                    {health.activeThrottles}
                  </Typography>
                  <Typography variant="body2">Active Throttles</Typography>
                </Box>
                
                <Box textAlign="center">
                  <Typography variant="h4" fontWeight="bold">
                    {health.currentAutoFreezes}
                  </Typography>
                  <Typography variant="body2">Auto-Freezes</Typography>
                </Box>
                
                <Box textAlign="center">
                  <Typography variant="h4" fontWeight="bold">
                    {health.violationsLastHour}
                  </Typography>
                  <Typography variant="body2">Violations (1h)</Typography>
                </Box>
              </Box>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      {stats && (
        <Grid container spacing={3} mb={3}>
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" gap={2} mb={2}>
                  <CheckCircleIcon color="success" sx={{ fontSize: 40 }} />
                  <Box>
                    <Typography variant="h4" fontWeight="bold">
                      {stats.activeAbuse.soft}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Soft Mode
                    </Typography>
                  </Box>
                </Box>
                <Typography variant="caption" color="text.secondary">
                  2× slower rate limits
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" gap={2} mb={2}>
                  <WarningIcon color="warning" sx={{ fontSize: 40 }} />
                  <Box>
                    <Typography variant="h4" fontWeight="bold">
                      {stats.activeAbuse.hard}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Hard Mode
                    </Typography>
                  </Box>
                </Box>
                <Typography variant="caption" color="text.secondary">
                  5× slower + CAPTCHA
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" gap={2} mb={2}>
                  <BlockIcon color="error" sx={{ fontSize: 40 }} />
                  <Box>
                    <Typography variant="h4" fontWeight="bold">
                      {stats.activeAbuse.freeze}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Frozen
                    </Typography>
                  </Box>
                </Box>
                <Typography variant="caption" color="text.secondary">
                  Full lock + review
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" gap={2} mb={2}>
                  <FingerprintIcon color="primary" sx={{ fontSize: 40 }} />
                  <Box>
                    <Typography variant="h4" fontWeight="bold">
                      {stats.flaggedDevices}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Flagged Devices
                    </Typography>
                  </Box>
                </Box>
                <Typography variant="caption" color="text.secondary">
                  Suspicious fingerprints
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Tabs */}
      <Card>
        <Tabs value={activeTab} onChange={(_, val) => setActiveTab(val)}>
          <Tab icon={<TimelineIcon />} label="Violations 24h" />
          <Tab icon={<MapIcon />} label="Regional Heatmap" />
          <Tab icon={<SecurityIcon />} label="Action Breakdown" />
        </Tabs>

        <CardContent>
          {/* Tab 0: Violations Overview */}
          {activeTab === 0 && stats && (
            <Box>
              <Typography variant="h6" gutterBottom>
                Violations in Last 24 Hours
              </Typography>
              
              <Grid container spacing={3} mt={2}>
                <Grid item xs={12} md={4}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="h3" fontWeight="bold" color="primary">
                        {stats.violations24h.total}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Total Violations
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>

                <Grid item xs={12} md={8}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="subtitle1" gutterBottom>
                        By Source Type
                      </Typography>
                      <Grid container spacing={2}>
                        <Grid item xs={4}>
                          <Typography variant="h5" fontWeight="bold">
                            {stats.violations24h.byType.ip}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            IP Violations
                          </Typography>
                        </Grid>
                        <Grid item xs={4}>
                          <Typography variant="h5" fontWeight="bold">
                            {stats.violations24h.byType.user}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            User Violations
                          </Typography>
                        </Grid>
                        <Grid item xs={4}>
                          <Typography variant="h5" fontWeight="bold">
                            {stats.violations24h.byType.device}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            Device Violations
                          </Typography>
                        </Grid>
                      </Grid>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            </Box>
          )}

          {/* Tab 1: Regional Heatmap */}
          {activeTab === 1 && (
            <Box textAlign="center" py={4}>
              <MapIcon sx={{ fontSize: 60, color: 'text.secondary', mb: 2 }} />
              <Typography variant="h6" color="text.secondary">
                Regional Heatmap
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Integration with PACK 412 coming soon
              </Typography>
            </Box>
          )}

          {/* Tab 2: Action Breakdown */}
          {activeTab === 2 && stats && (
            <Box>
              <Typography variant="h6" gutterBottom>
                Violations by Action Type
              </Typography>
              
              <TableContainer component={Paper} sx={{ mt: 2 }}>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Action Type</TableCell>
                      <TableCell align="right">Violations</TableCell>
                      <TableCell align="right">% of Total</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {Object.entries(stats.violations24h.byAction)
                      .sort(([, a], [, b]) => b - a)
                      .map(([action, count]) => (
                        <TableRow key={action}>
                          <TableCell>
                            <Chip label={action} size="small" />
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body1" fontWeight="bold">
                              {count}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            {((count / stats.violations24h.total) * 100).toFixed(1)}%
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Apply Abuse Mode Modal */}
      <ApplyAbuseModeModal
        open={applyAbuseModeModalOpen}
        onClose={() => setApplyAbuseModeModalOpen(false)}
        onApply={handleApplyAbuseMode}
      />

      {/* Blacklist Device Modal */}
      <BlacklistDeviceModal
        open={blacklistDeviceModalOpen}
        onClose={() => setBlacklistDeviceModalOpen(false)}
        onBlacklist={handleBlacklistDevice}
      />
    </Box>
  );
}

// ============================================================================
// MODAL COMPONENTS
// ============================================================================

interface ApplyAbuseModeModalProps {
  open: boolean;
  onClose: () => void;
  onApply: (userId: string, mode: AbuseMode, reason: string) => void;
}

function ApplyAbuseModeModal({ open, onClose, onApply }: ApplyAbuseModeModalProps) {
  const [userId, setUserId] = useState('');
  const [mode, setMode] = useState<AbuseMode>('SOFT');
  const [reason, setReason] = useState('');

  const handleSubmit = () => {
    if (!userId || !reason) {
      alert('Please fill in all fields');
      return;
    }

    onApply(userId, mode, reason);
    
    // Reset form
    setUserId('');
    setMode('SOFT');
    setReason('');
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Apply Abuse Mode</DialogTitle>
      <DialogContent>
        <Box display="flex" flexDirection="column" gap={2} mt={2}>
          <TextField
            label="User ID"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            fullWidth
            required
          />

          <FormControl fullWidth required>
            <InputLabel>Abuse Mode</InputLabel>
            <Select value={mode} onChange={(e) => setMode(e.target.value as AbuseMode)}>
              <MenuItem value="SOFT">SOFT - 2× slower limits</MenuItem>
              <MenuItem value="HARD">HARD - 5× slower + CAPTCHA</MenuItem>
              <MenuItem value="FREEZE">FREEZE - Full lock + review</MenuItem>
              <MenuItem value="NORMAL">NORMAL - Remove restrictions</MenuItem>
            </Select>
          </FormControl>

          <TextField
            label="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            multiline
            rows={3}
            fullWidth
            required
          />

          <Alert severity="warning">
            This will immediately apply the selected abuse mode to the user. Manual overrides require admin removal.
          </Alert>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} variant="contained" color="warning">
          Apply Mode
        </Button>
      </DialogActions>
    </Dialog>
  );
}

interface BlacklistDeviceModalProps {
  open: boolean;
  onClose: () => void;
  onBlacklist: (fpHash: string, reason: string) => void;
}

function BlacklistDeviceModal({ open, onClose, onBlacklist }: BlacklistDeviceModalProps) {
  const [fpHash, setFpHash] = useState('');
  const [reason, setReason] = useState('');

  const handleSubmit = () => {
    if (!fpHash || !reason) {
      alert('Please fill in all fields');
      return;
    }

    onBlacklist(fpHash, reason);
    
    // Reset form
    setFpHash('');
    setReason('');
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Blacklist Device Fingerprint</DialogTitle>
      <DialogContent>
        <Box display="flex" flexDirection="column" gap={2} mt={2}>
          <TextField
            label="Device Fingerprint Hash"
            value={fpHash}
            onChange={(e) => setFpHash(e.target.value)}
            fullWidth
            required
          />

          <TextField
            label="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            multiline
            rows={3}
            fullWidth
            required
          />

          <Alert severity="error">
            This will blacklist the device and FREEZE all associated user accounts. Use with caution.
          </Alert>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} variant="contained" color="error">
          Blacklist Device
        </Button>
      </DialogActions>
    </Dialog>
  );
}
