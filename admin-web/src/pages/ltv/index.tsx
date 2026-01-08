/**
 * PACK 370: LTV / ROAS ADMIN DASHBOARD
 * 
 * Real-time monitoring of user lifetime value and ad performance
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
  Chip,
  LinearProgress
} from '@mui/material';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  doc,
  updateDoc,
  Timestamp
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';

// ============================================================================
// TYPES
// ============================================================================

interface LTVForecast {
  userId: string;
  ltvDay1: number;
  ltvDay7: number;
  ltvDay30: number;
  ltvDay90: number;
  confidenceScore: number;
  assignedTier: 'LOW' | 'MID' | 'HIGH' | 'WHALE';
  lastRecalcAt: Timestamp;
}

interface GeoLTVProfile {
  country: string;
  avgLTV: number;
  avgCPI: number;
  whaleRatio: number;
  creatorActivityIndex: number;
  riskIndex: number;
}

interface ROASSignal {
  adSource: string;
  country: string;
  avgCPI: number;
  avgPredictedLTV: number;
  trueROAS: number;
  recommendedAction: string;
  safeScaleLevel: number;
  maxDailyBudget: number;
  createdAt: Timestamp;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function LTVDashboard() {
  const [loading, setLoading] = useState(true);
  const [ltvForecasts, setLtvForecasts] = useState<LTVForecast[]>([]);
  const [geoProfiles, setGeoProfiles] = useState<GeoLTVProfile[]>([]);
  const [roasSignals, setRoasSignals] = useState<ROASSignal[]>([]);
  const [tierDistribution, setTierDistribution] = useState<any[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<string>('ALL');
  const [emergencyFreeze, setEmergencyFreeze] = useState(false);
  const [overrideUserId, setOverrideUserId] = useState('');
  const [overrideLTV, setOverrideLTV] = useState('');
  const [overrideReason, setOverrideReason] = useState('');

  // ============================================================================
  // DATA LOADING
  // ============================================================================

  useEffect(() => {
    loadDashboardData();
    
    // Refresh every 5 minutes
    const interval = setInterval(loadDashboardData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [selectedCountry]);

  async function loadDashboardData() {
    setLoading(true);
    try {
      await Promise.all([
        loadLTVForecasts(),
        loadGeoProfiles(),
        loadROASSignals(),
        loadTierDistribution()
      ]);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadLTVForecasts() {
    const q = query(
      collection(db, 'userLTVForecast'),
      orderBy('ltvDay30', 'desc'),
      limit(100)
    );
    const snapshot = await getDocs(q);
    setLtvForecasts(snapshot.docs.map(doc => ({ userId: doc.id, ...doc.data() } as LTVForecast)));
  }

  async function loadGeoProfiles() {
    const snapshot = await getDocs(collection(db, 'geoLTVProfiles'));
    const profiles = snapshot.docs.map(doc => doc.data() as GeoLTVProfile);
    setGeoProfiles(profiles.sort((a, b) => b.avgLTV - a.avgLTV));
  }

  async function loadROASSignals() {
    let q = query(
      collection(db, 'roasSignals'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    
    if (selectedCountry !== 'ALL') {
      q = query(q, where('country', '==', selectedCountry));
    }
    
    const snapshot = await getDocs(q);
    setRoasSignals(snapshot.docs.map(doc => doc.data() as ROASSignal));
  }

  async function loadTierDistribution() {
    const snapshot = await getDocs(collection(db, 'userLTVForecast'));
    const tiers = { LOW: 0, MID: 0, HIGH: 0, WHALE: 0 };
    
    snapshot.docs.forEach(doc => {
      const tier = doc.data().assignedTier;
      if (tier in tiers) {
        tiers[tier as keyof typeof tiers]++;
      }
    });
    
    setTierDistribution([
      { name: 'LOW', value: tiers.LOW, color: '#ff6b6b' },
      { name: 'MID', value: tiers.MID, color: '#ffd93d' },
      { name: 'HIGH', value: tiers.HIGH, color: '#6bcf7f' },
      { name: 'WHALE', value: tiers.WHALE, color: '#4d96ff' }
    ]);
  }

  // ============================================================================
  // ACTIONS
  // ============================================================================

  async function handleEmergencyFreeze() {
    try {
      // Update all active ad campaigns to freeze
      const campaignsSnapshot = await getDocs(
        query(collection(db, 'adCampaigns'), where('status', '==', 'active'))
      );
      
      for (const campaign of campaignsSnapshot.docs) {
        await updateDoc(campaign.ref, {
          status: 'paused',
          pauseReason: 'emergency_freeze',
          pausedAt: Timestamp.now()
        });
      }
      
      setEmergencyFreeze(true);
      alert('Emergency spend freeze activated. All ad campaigns paused.');
    } catch (error) {
      console.error('Error activating emergency freeze:', error);
      alert('Failed to activate emergency freeze');
    }
  }

  async function handleLTVOverride() {
    if (!overrideUserId || !overrideLTV || !overrideReason) {
      alert('Please fill all fields');
      return;
    }
    
    try {
      const overrideFunction = httpsCallable(functions, 'pack370_adminLTVOverride');
      await overrideFunction({
        userId: overrideUserId,
        overrideLTV: parseFloat(overrideLTV),
        reason: overrideReason
      });
      
      alert('LTV override successful');
      setOverrideUserId('');
      setOverrideLTV('');
      setOverrideReason('');
      loadDashboardData();
    } catch (error) {
      console.error('Error overriding LTV:', error);
      alert('Failed to override LTV');
    }
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h4" gutterBottom>LTV / ROAS Dashboard</Typography>
        <LinearProgress />
      </Box>
    );
  }

  // Calculate summary metrics
  const avgLTV = ltvForecasts.length > 0
    ? ltvForecasts.reduce((sum, f) => sum + f.ltvDay30, 0) / ltvForecasts.length
    : 0;
  
  const avgROAS = roasSignals.length > 0
    ? roasSignals.reduce((sum, s) => sum + s.trueROAS, 0) / roasSignals.length
    : 0;
  
  const whaleCount = ltvForecasts.filter(f => f.assignedTier === 'WHALE').length;

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">LTV / ROAS Dashboard</Typography>
        
        <Box sx={{ display: 'flex', gap: 2 }}>
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Filter by Country</InputLabel>
            <Select
              value={selectedCountry}
              onChange={(e) => setSelectedCountry(e.target.value)}
              label="Filter by Country"
            >
              <MenuItem value="ALL">All Countries</MenuItem>
              {geoProfiles.map(geo => (
                <MenuItem key={geo.country} value={geo.country}>{geo.country}</MenuItem>
              ))}
            </Select>
          </FormControl>
          
          <Button
            variant="contained"
            color="error"
            onClick={handleEmergencyFreeze}
            disabled={emergencyFreeze}
          >
            {emergencyFreeze ? 'Spend Frozen' : 'Emergency Freeze'}
          </Button>
        </Box>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Avg LTV (Day 30)</Typography>
              <Typography variant="h4">{avgLTV.toFixed(2)} PLN</Typography>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Avg ROAS</Typography>
              <Typography variant="h4" color={avgROAS > 1.5 ? 'success.main' : 'warning.main'}>
                {avgROAS.toFixed(2)}x
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Whale Users</Typography>
              <Typography variant="h4">{whaleCount}</Typography>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Active Signals</Typography>
              <Typography variant="h4">{roasSignals.length}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Tier Distribution Pie Chart */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>User Tier Distribution</Typography>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={tierDistribution}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label
                  >
                    {tierDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>

        {/* CPI vs LTV by Country */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>CPI vs LTV by Country</Typography>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={geoProfiles.slice(0, 10)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="country" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="avgCPI" fill="#ff6b6b" name="Avg CPI" />
                  <Bar dataKey="avgLTV" fill="#4d96ff" name="Avg LTV" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* ROAS Signals Table */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Recent ROAS Signals</Typography>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Ad Source</TableCell>
                <TableCell>Country</TableCell>
                <TableCell>Avg CPI</TableCell>
                <TableCell>Avg LTV</TableCell>
                <TableCell>True ROAS</TableCell>
                <TableCell>Action</TableCell>
                <TableCell>Scale Level</TableCell>
                <TableCell>Max Budget</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {roasSignals.slice(0, 20).map((signal, idx) => (
                <TableRow key={idx}>
                  <TableCell>{signal.adSource}</TableCell>
                  <TableCell>{signal.country}</TableCell>
                  <TableCell>{signal.avgCPI.toFixed(2)} PLN</TableCell>
                  <TableCell>{signal.avgPredictedLTV.toFixed(2)} PLN</TableCell>
                  <TableCell>
                    <Chip
                      label={`${signal.trueROAS.toFixed(2)}x`}
                      color={signal.trueROAS > 2 ? 'success' : signal.trueROAS > 1 ? 'warning' : 'error'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={signal.recommendedAction}
                      color={
                        signal.recommendedAction === 'SCALE_UP' ? 'success' :
                        signal.recommendedAction === 'SCALE_DOWN' ? 'error' :
                        'default'
                      }
                      size="small"
                    />
                  </TableCell>
                  <TableCell>{signal.safeScaleLevel.toFixed(2)}x</TableCell>
                  <TableCell>{signal.maxDailyBudget} PLN</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Geo LTV Profiles */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Geo-Level Intelligence</Typography>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Country</TableCell>
                <TableCell>Avg LTV</TableCell>
                <TableCell>Avg CPI</TableCell>
                <TableCell>Whale Ratio</TableCell>
                <TableCell>Creator Activity</TableCell>
                <TableCell>Risk Index</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {geoProfiles.map((geo) => (
                <TableRow key={geo.country}>
                  <TableCell>{geo.country}</TableCell>
                  <TableCell>{geo.avgLTV.toFixed(2)} PLN</TableCell>
                  <TableCell>{geo.avgCPI.toFixed(2)} PLN</TableCell>
                  <TableCell>{(geo.whaleRatio * 100).toFixed(1)}%</TableCell>
                  <TableCell>{geo.creatorActivityIndex.toFixed(3)}</TableCell>
                  <TableCell>
                    <Chip
                      label={geo.riskIndex > 0.5 ? 'HIGH' : 'LOW'}
                      color={geo.riskIndex > 0.5 ? 'error' : 'success'}
                      size="small"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Manual LTV Override */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>Manual LTV Override</Typography>
          <Alert severity="warning" sx={{ mb: 2 }}>
            Use with caution. Manual overrides affect ROAS calculations and ad budget decisions.
          </Alert>
          <Grid container spacing={2}>
            <Grid item xs={12} md={3}>
              <TextField
                fullWidth
                label="User ID"
                value={overrideUserId}
                onChange={(e) => setOverrideUserId(e.target.value)}
                size="small"
              />
            </Grid>
            <Grid item xs={12} md={2}>
              <TextField
                fullWidth
                label="Override LTV (PLN)"
                type="number"
                value={overrideLTV}
                onChange={(e) => setOverrideLTV(e.target.value)}
                size="small"
              />
            </Grid>
            <Grid item xs={12} md={5}>
              <TextField
                fullWidth
                label="Reason"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                size="small"
              />
            </Grid>
            <Grid item xs={12} md={2}>
              <Button
                fullWidth
                variant="contained"
                onClick={handleLTVOverride}
              >
                Override
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>
    </Box>
  );
}
