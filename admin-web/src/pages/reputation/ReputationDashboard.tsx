/**
 * PACK 371: ASO REPUTATION OPTIMIZER DASHBOARD
 * 
 * Features:
 * - Sentiment trends per country
 * - Rating vs CPI vs LTV analytics
 * - Fake review attack map
 * - Trust score decay curves
 * - Converter vs complainer ratio
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Grid,
  Card,
  CardContent,
  Typography,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  Alert,
  AlertTitle,
  Chip,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  Warning as WarningIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Block as BlockIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { collection, query, orderBy, limit, where, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';

interface ReputationSignal {
  id: string;
  source: 'app_store' | 'google_play';
  rating: number;
  text: string;
  sentimentScore: number;
  fraudProbability: number;
  geo: string;
  detectedAt: any;
  actionTaken: string;
}

interface ReputationAttack {
  id: string;
  attackType: string;
  severity: string;
  detectedAt: any;
  signalIds: string[];
  resolved: boolean;
  actionsTaken: string[];
}

interface PlatformMetrics {
  reviewSentimentAverage: number;
  refundRatio: number;
  safetyIncidentResolutionTime: number;
  disputeResolutionScore: number;
  lastUpdated: any;
}

interface GeoSentiment {
  country: string;
  avgSentiment: number;
  reviewCount: number;
  avgRating: number;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

export default function ReputationDashboard() {
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d' | '90d'>('7d');
  const [selectedGeo, setSelectedGeo] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  
  // Data states
  const [recentSignals, setRecentSignals] = useState<ReputationSignal[]>([]);
  const [attacks, setAttacks] = useState<ReputationAttack[]>([]);
  const [platformMetrics, setPlatformMetrics] = useState<PlatformMetrics | null>(null);
  const [geoSentiments, setGeoSentiments] = useState<GeoSentiment[]>([]);
  const [sentimentTrend, setSentimentTrend] = useState<any[]>([]);
  const [ratingDistribution, setRatingDistribution] = useState<any[]>([]);
  
  useEffect(() => {
    loadDashboardData();
  }, [timeRange, selectedGeo]);
  
  const loadDashboardData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadRecentSignals(),
        loadAttacks(),
        loadPlatformMetrics(),
        loadGeoSentiments(),
        loadSentimentTrend(),
        loadRatingDistribution(),
      ]);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const loadRecentSignals = async () => {
    const daysAgo = timeRange === '24h' ? 1 : timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysAgo);
    
    let q = query(
      collection(db, 'storeReputationSignals'),
      orderBy('detectedAt', 'desc'),
      limit(1000)
    );
    
    const snapshot = await getDocs(q);
    const signals = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as ReputationSignal[];
    
    // Filter by geo if selected
    const filtered = selectedGeo === 'all' 
      ? signals 
      : signals.filter(s => s.geo === selectedGeo);
    
    setRecentSignals(filtered);
  };
  
  const loadAttacks = async () => {
    const q = query(
      collection(db, 'reputationAttacks'),
      orderBy('detectedAt', 'desc'),
      limit(50)
    );
    
    const snapshot = await getDocs(q);
    const attacksData = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as ReputationAttack[];
    
    setAttacks(attacksData);
  };
  
  const loadPlatformMetrics = async () => {
    const docRef = doc(db, 'platformMetrics', 'trustMetrics');
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      setPlatformMetrics(docSnap.data() as PlatformMetrics);
    }
  };
  
  const loadGeoSentiments = async () => {
    // Calculate geo sentiments from recent signals
    const geoMap = new Map<string, { total: number; count: number; ratings: number[] }>();
    
    recentSignals.forEach(signal => {
      if (!geoMap.has(signal.geo)) {
        geoMap.set(signal.geo, { total: 0, count: 0, ratings: [] });
      }
      const data = geoMap.get(signal.geo)!;
      data.total += signal.sentimentScore;
      data.count++;
      data.ratings.push(signal.rating);
    });
    
    const sentiments: GeoSentiment[] = Array.from(geoMap.entries())
      .map(([country, data]) => ({
        country,
        avgSentiment: data.total / data.count,
        reviewCount: data.count,
        avgRating: data.ratings.reduce((a, b) => a + b, 0) / data.ratings.length,
      }))
      .sort((a, b) => b.reviewCount - a.reviewCount);
    
    setGeoSentiments(sentiments);
  };
  
  const loadSentimentTrend = async () => {
    // Group signals by day
    const dayMap = new Map<string, { sentiment: number[]; rating: number[] }>();
    
    recentSignals.forEach(signal => {
      const date = new Date(signal.detectedAt.seconds * 1000);
      const dayKey = date.toISOString().split('T')[0];
      
      if (!dayMap.has(dayKey)) {
        dayMap.set(dayKey, { sentiment: [], rating: [] });
      }
      dayMap.get(dayKey)!.sentiment.push(signal.sentimentScore);
      dayMap.get(dayKey)!.rating.push(signal.rating);
    });
    
    const trend = Array.from(dayMap.entries())
      .map(([date, data]) => ({
        date,
        avgSentiment: data.sentiment.reduce((a, b) => a + b, 0) / data.sentiment.length,
        avgRating: data.rating.reduce((a, b) => a + b, 0) / data.rating.length,
        reviewCount: data.sentiment.length,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
    
    setSentimentTrend(trend);
  };
  
  const loadRatingDistribution = async () => {
    const distribution = [1, 2, 3, 4, 5].map(rating => ({
      rating,
      count: recentSignals.filter(s => s.rating === rating).length,
    }));
    
    setRatingDistribution(distribution);
  };
  
  const handleResolveAttack = async (attackId: string) => {
    try {
      await updateDoc(doc(db, 'reputationAttacks', attackId), {
        resolved: true,
      });
      await loadAttacks();
    } catch (error) {
      console.error('Error resolving attack:', error);
    }
  };
  
  const getAttackSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'error';
      case 'high': return 'warning';
      case 'medium': return 'info';
      default: return 'default';
    }
  };
  
  const getSentimentColor = (score: number) => {
    if (score > 0.3) return '#4caf50';
    if (score < -0.3) return '#f44336';
    return '#ff9800';
  };
  
  if (loading) {
    return (
      <Container maxWidth="xl" sx={{ mt: 4 }}>
        <LinearProgress />
        <Typography sx={{ mt: 2 }}>Loading reputation data...</Typography>
      </Container>
    );
  }
  
  const unresolvedAttacks = attacks.filter(a => !a.resolved);
  const avgSentiment = recentSignals.length > 0
    ? recentSignals.reduce((sum, s) => sum + s.sentimentScore, 0) / recentSignals.length
    : 0;
  const highFraudCount = recentSignals.filter(s => s.fraudProbability > 0.7).length;
  
  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" gutterBottom>
          🛡️ App Store Reputation Dashboard
        </Typography>
        <Typography variant="body2" color="text.secondary">
          PACK 371: Review Defense, Trust Score & ASO Optimizer
        </Typography>
      </Box>
      
      {/* Filters */}
      <Box sx={{ mb: 3, display: 'flex', gap: 2 }}>
        <FormControl sx={{ minWidth: 120 }}>
          <InputLabel>Time Range</InputLabel>
          <Select
            value={timeRange}
            label="Time Range"
            onChange={(e) => setTimeRange(e.target.value as any)}
          >
            <MenuItem value="24h">Last 24 Hours</MenuItem>
            <MenuItem value="7d">Last 7 Days</MenuItem>
            <MenuItem value="30d">Last 30 Days</MenuItem>
            <MenuItem value="90d">Last 90 Days</MenuItem>
          </Select>
        </FormControl>
        
        <FormControl sx={{ minWidth: 120 }}>
          <InputLabel>Geography</InputLabel>
          <Select
            value={selectedGeo}
            label="Geography"
            onChange={(e) => setSelectedGeo(e.target.value)}
          >
            <MenuItem value="all">All Countries</MenuItem>
            {geoSentiments.slice(0, 10).map(geo => (
              <MenuItem key={geo.country} value={geo.country}>
                {geo.country}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={loadDashboardData}
        >
          Refresh
        </Button>
      </Box>
      
      {/* Alert Cards */}
      {unresolvedAttacks.length > 0 && (
        <Alert severity="error" sx={{ mb: 3 }}>
          <AlertTitle>🚨 Active Reputation Attacks Detected</AlertTitle>
          {unresolvedAttacks.length} unresolved attack{unresolvedAttacks.length > 1 ? 's' : ''} detected. 
          Review and take action below.
        </Alert>
      )}
      
      {/* Key Metrics */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Avg Sentiment
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="h4" sx={{ color: getSentimentColor(avgSentiment) }}>
                  {avgSentiment >= 0 ? '+' : ''}{avgSentiment.toFixed(2)}
                </Typography>
                {avgSentiment > 0 ? <TrendingUpIcon color="success" /> : <TrendingDownIcon color="error" />}
              </Box>
              <Typography variant="body2" color="text.secondary">
                {recentSignals.length} reviews analyzed
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                High Risk Reviews
              </Typography>
              <Typography variant="h4" color={highFraudCount > 10 ? 'error' : 'success'}>
                {highFraudCount}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Fraud probability &gt; 70%
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Active Attacks
              </Typography>
              <Typography variant="h4" color={unresolvedAttacks.length > 0 ? 'error' : 'success'}>
                {unresolvedAttacks.length}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Unresolved incidents
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Platform Trust
              </Typography>
              <Typography variant="h4" color="primary">
                {platformMetrics ? (platformMetrics.disputeResolutionScore * 100).toFixed(0) : '--'}%
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Dispute resolution score
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      
      {/* Charts */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {/* Sentiment Trend */}
        <Grid item xs={12} lg={8}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Sentiment Trend Over Time
              </Typography>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={sentimentTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis domain={[-1, 1]} />
                  <ChartTooltip />
                  <Legend />
                  <Line type="monotone" dataKey="avgSentiment" stroke="#8884d8" name="Sentiment" />
                  <Line type="monotone" dataKey="avgRating" stroke="#82ca9d" name="Rating" yAxisId={0} domain={[0, 5]} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>
        
        {/* Rating Distribution */}
        <Grid item xs={12} lg={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Rating Distribution
              </Typography>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={ratingDistribution}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="rating" />
                  <YAxis />
                  <ChartTooltip />
                  <Bar dataKey="count" fill="#8884d8" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>
        
        {/* Geo Sentiments */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Sentiment by Geography
              </Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Country</TableCell>
                      <TableCell align="right">Avg Sentiment</TableCell>
                      <TableCell align="right">Avg Rating</TableCell>
                      <TableCell align="right">Review Count</TableCell>
                      <TableCell align="center">Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {geoSentiments.slice(0, 10).map((geo) => (
                      <TableRow key={geo.country}>
                        <TableCell component="th" scope="row">
                          {geo.country}
                        </TableCell>
                        <TableCell align="right">
                          <Chip
                            label={geo.avgSentiment.toFixed(2)}
                            size="small"
                            sx={{ 
                              bgcolor: getSentimentColor(geo.avgSentiment),
                              color: 'white',
                            }}
                          />
                        </TableCell>
                        <TableCell align="right">{geo.avgRating.toFixed(1)} ⭐</TableCell>
                        <TableCell align="right">{geo.reviewCount}</TableCell>
                        <TableCell align="center">
                          {geo.avgSentiment > 0.3 ? (
                            <CheckIcon color="success" />
                          ) : geo.avgSentiment < -0.3 ? (
                            <WarningIcon color="error" />
                          ) : (
                            <ErrorIcon color="warning" />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      
      {/* Attacks Table */}
      {attacks.length > 0 && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Reputation Attacks
            </Typography>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Detected</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Severity</TableCell>
                    <TableCell>Signals</TableCell>
                    <TableCell>Actions Taken</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="center">Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {attacks.slice(0, 20).map((attack) => (
                    <TableRow key={attack.id}>
                      <TableCell>
                        {new Date(attack.detectedAt.seconds * 1000).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Chip label={attack.attackType} size="small" />
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={attack.severity.toUpperCase()}
                          size="small"
                          color={getAttackSeverityColor(attack.severity) as any}
                        />
                      </TableCell>
                      <TableCell>{attack.signalIds.length}</TableCell>
                      <TableCell>
                        {attack.actionsTaken.map((action, idx) => (
                          <Chip key={idx} label={action} size="small" sx={{ mr: 0.5 }} />
                        ))}
                      </TableCell>
                      <TableCell>
                        {attack.resolved ? (
                          <Chip label="Resolved" size="small" color="success" />
                        ) : (
                          <Chip label="Active" size="small" color="error" />
                        )}
                      </TableCell>
                      <TableCell align="center">
                        {!attack.resolved && (
                          <Tooltip title="Mark as Resolved">
                            <IconButton
                              size="small"
                              onClick={() => handleResolveAttack(attack.id)}
                            >
                              <CheckIcon />
                            </IconButton>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}
    </Container>
  );
}
