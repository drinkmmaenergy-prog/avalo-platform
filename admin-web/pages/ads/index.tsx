/**
 * PACK 369: Ad Analytics & Decision Dashboard
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Switch,
  FormControlLabel,
  Tabs,
  Tab,
} from '@mui/material';
import {
  PlayArrow,
  Pause,
  Edit,
  Refresh,
  TrendingUp,
  TrendingDown,
  Warning,
} from '@mui/icons-material';
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { collection, query, where, getDocs, doc, updateDoc, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';

interface AdSource {
  id: string;
  source: 'meta' | 'tiktok' | 'google' | 'snapchat' | 'apple';
  geo: string;
  dailyBudget: number;
  status: 'OFF' | 'TEST' | 'SCALE' | 'PAUSED';
  targetCPI: number;
  targetROAS: number;
  riskScore: number;
  performance?: {
    installs: number;
    spend: number;
    revenue: number;
    cpi: number;
    roas: number;
  };
}

interface AdCreative {
  id: string;
  format: string;
  theme: string;
  demographic: string;
  geo: string;
  performanceScore: number;
  fatigueScore: number;
  status: string;
  impressions: number;
  clicks: number;
  conversions: number;
}

export default function AdsPage() {
  const [activeTab, setActiveTab] = useState(0);
  const [adSources, setAdSources] = useState<AdSource[]>([]);
  const [adCreatives, setAdCreatives] = useState<AdCreative[]>([]);
  const [selectedSource, setSelectedSource] = useState<AdSource | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [generateCreativeDialogOpen, setGenerateCreativeDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAdSources();
    loadAdCreatives();
  }, []);

  const loadAdSources = async () => {
    try {
      const sourcesSnapshot = await getDocs(collection(db, 'adSources'));
      const sources = sourcesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as AdSource[];
      setAdSources(sources);
      setLoading(false);
    } catch (error) {
      console.error('Error loading ad sources:', error);
    }
  };

  const loadAdCreatives = async () => {
    try {
      const creativesSnapshot = await getDocs(
        query(collection(db, 'adCreatives'), where('status', '==', 'active'))
      );
      const creatives = creativesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as AdCreative[];
      setAdCreatives(creatives);
    } catch (error) {
      console.error('Error loading ad creatives:', error);
    }
  };

  const handleToggleSource = async (sourceId: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus === 'OFF' ? 'TEST' : 'OFF';
      await updateDoc(doc(db, 'adSources', sourceId), {
        status: newStatus,
      });
      loadAdSources();
    } catch (error) {
      console.error('Error toggling source:', error);
    }
  };

  const handleEditSource = (source: AdSource) => {
    setSelectedSource(source);
    setEditDialogOpen(true);
  };

  const handleSaveSource = async () => {
    if (!selectedSource) return;

    try {
      await updateDoc(doc(db, 'adSources', selectedSource.id), {
        dailyBudget: selectedSource.dailyBudget,
        targetCPI: selectedSource.targetCPI,
        targetROAS: selectedSource.targetROAS,
      });
      setEditDialogOpen(false);
      loadAdSources();
    } catch (error) {
      console.error('Error saving source:', error);
    }
  };

  const handleGenerateCreatives = async (data: any) => {
    try {
      const generateCreatives = httpsCallable(functions, 'pack369_generateCreatives');
      await generateCreatives(data);
      setGenerateCreativeDialogOpen(false);
      loadAdCreatives();
    } catch (error) {
      console.error('Error generating creatives:', error);
    }
  };

  const handleTriggerFatigueReset = async () => {
    try {
      const fatigueReset = httpsCallable(functions, 'pack369_detectCreativeFatigue');
      await fatigueReset();
      loadAdCreatives();
    } catch (error) {
      console.error('Error triggering fatigue reset:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'SCALE':
        return 'success';
      case 'TEST':
        return 'info';
      case 'PAUSED':
        return 'warning';
      case 'OFF':
        return 'default';
      default:
        return 'default';
    }
  };

  const getSourceIcon = (source: string) => {
    // You would import actual platform icons here
    return source.toUpperCase();
  };

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          📦 PACK 369 - Global Ads Automation
        </Typography>
        <Box>
          <Button
            variant="contained"
            color="primary"
            startIcon={<Refresh />}
            onClick={() => {
              loadAdSources();
              loadAdCreatives();
            }}
            sx={{ mr: 1 }}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            color="secondary"
            onClick={() => setGenerateCreativeDialogOpen(true)}
          >
            Generate Creatives
          </Button>
        </Box>
      </Box>

      <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)} sx={{ mb: 3 }}>
        <Tab label="Overview" />
        <Tab label="Ad Sources" />
        <Tab label="Creatives" />
        <Tab label="Performance" />
        <Tab label="Geo Heatmap" />
      </Tabs>

      {/* Overview Tab */}
      {activeTab === 0 && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Total Daily Budget
                </Typography>
                <Typography variant="h4">
                  ${adSources.reduce((sum, s) => sum + (s.dailyBudget || 0), 0).toLocaleString()}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Active Sources
                </Typography>
                <Typography variant="h4">
                  {adSources.filter(s => s.status !== 'OFF' && s.status !== 'PAUSED').length}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Active Creatives
                </Typography>
                <Typography variant="h4">
                  {adCreatives.length}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Avg ROAS
                </Typography>
                <Typography variant="h4">
                  {adSources.length > 0
                    ? (adSources.reduce((sum, s) => sum + (s.performance?.roas || 0), 0) / adSources.length).toFixed(2)
                    : '0.00'}
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Budget Distribution by Platform
                </Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={Object.entries(
                    adSources.reduce((acc: any, s) => {
                      acc[s.source] = (acc[s.source] || 0) + s.dailyBudget;
                      return acc;
                    }, {})
                  ).map(([source, budget]) => ({ source, budget }))}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="source" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="budget" fill="#8884d8" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Ad Sources Tab */}
      {activeTab === 1 && (
        <Card>
          <CardContent>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Platform</TableCell>
                    <TableCell>Geo</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right">Daily Budget</TableCell>
                    <TableCell align="right">Target CPI</TableCell>
                    <TableCell align="right">Target ROAS</TableCell>
                    <TableCell align="right">Risk Score</TableCell>
                    <TableCell align="right">Actual ROAS</TableCell>
                    <TableCell align="center">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {adSources.map((source) => (
                    <TableRow key={source.id}>
                      <TableCell>
                        <Chip label={getSourceIcon(source.source)} size="small" />
                      </TableCell>
                      <TableCell>{source.geo}</TableCell>
                      <TableCell>
                        <Chip
                          label={source.status}
                          color={getStatusColor(source.status) as any}
                          size="small"
                        />
                      </TableCell>
                      <TableCell align="right">${source.dailyBudget.toLocaleString()}</TableCell>
                      <TableCell align="right">${source.targetCPI.toFixed(2)}</TableCell>
                      <TableCell align="right">{source.targetROAS.toFixed(2)}</TableCell>
                      <TableCell align="right">
                        {source.riskScore > 0.7 ? (
                          <Chip
                            icon={<Warning />}
                            label={source.riskScore.toFixed(2)}
                            color="error"
                            size="small"
                          />
                        ) : (
                          source.riskScore.toFixed(2)
                        )}
                      </TableCell>
                      <TableCell align="right">
                        {source.performance?.roas ? (
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                            {source.performance.roas.toFixed(2)}
                            {source.performance.roas >= source.targetROAS ? (
                              <TrendingUp color="success" sx={{ ml: 1 }} />
                            ) : (
                              <TrendingDown color="error" sx={{ ml: 1 }} />
                            )}
                          </Box>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell align="center">
                        <IconButton
                          size="small"
                          onClick={() => handleToggleSource(source.id, source.status)}
                        >
                          {source.status === 'OFF' || source.status === 'PAUSED' ? (
                            <PlayArrow />
                          ) : (
                            <Pause />
                          )}
                        </IconButton>
                        <IconButton size="small" onClick={() => handleEditSource(source)}>
                          <Edit />
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

      {/* Creatives Tab */}
      {activeTab === 2 && (
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="h6">Active Creatives</Typography>
              <Button
                variant="outlined"
                startIcon={<Refresh />}
                onClick={handleTriggerFatigueReset}
              >
                Trigger Fatigue Reset
              </Button>
            </Box>
          </Grid>
          {adCreatives.map((creative) => (
            <Grid item xs={12} md={6} lg={4} key={creative.id}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="subtitle2">{creative.format}</Typography>
                    <Chip
                      label={creative.status}
                      color={creative.status === 'active' ? 'success' : 'default'}
                      size="small"
                    />
                  </Box>
                  <Typography variant="body2" color="textSecondary" gutterBottom>
                    {creative.theme} • {creative.geo} • {creative.demographic}
                  </Typography>
                  <Box sx={{ mt: 2 }}>
                    <Grid container spacing={2}>
                      <Grid item xs={6}>
                        <Typography variant="caption" color="textSecondary">
                          Performance
                        </Typography>
                        <Typography variant="body1">
                          {(creative.performanceScore * 100).toFixed(0)}%
                        </Typography>
                      </Grid>
                      <Grid item xs={6}>
                        <Typography variant="caption" color="textSecondary">
                          Fatigue
                        </Typography>
                        <Typography variant="body1">
                          {creative.fatigueScore > 0.7 ? (
                            <Chip
                              label={`${(creative.fatigueScore * 100).toFixed(0)}%`}
                              color="warning"
                              size="small"
                            />
                          ) : (
                            `${(creative.fatigueScore * 100).toFixed(0)}%`
                          )}
                        </Typography>
                      </Grid>
                    </Grid>
                  </Box>
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="caption" color="textSecondary">
                      {creative.impressions.toLocaleString()} impressions •{' '}
                      {creative.clicks.toLocaleString()} clicks •{' '}
                      {creative.conversions.toLocaleString()} conversions
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Performance Tab */}
      {activeTab === 3 && (
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  CPI & ROAS Comparison
                </Typography>
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={adSources.map(s => ({
                    name: `${s.source}/${s.geo}`,
                    cpi: s.performance?.cpi || 0,
                    roas: s.performance?.roas || 0,
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="cpi" stroke="#8884d8" />
                    <Line type="monotone" dataKey="roas" stroke="#82ca9d" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Edit Source Dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Ad Source</DialogTitle>
        <DialogContent>
          {selectedSource && (
            <Box sx={{ mt: 2 }}>
              <TextField
                fullWidth
                label="Daily Budget"
                type="number"
                value={selectedSource.dailyBudget}
                onChange={(e) =>
                  setSelectedSource({
                    ...selectedSource,
                    dailyBudget: parseFloat(e.target.value),
                  })
                }
                sx={{ mb: 2 }}
              />
              <TextField
                fullWidth
                label="Target CPI"
                type="number"
                value={selectedSource.targetCPI}
                onChange={(e) =>
                  setSelectedSource({
                    ...selectedSource,
                    targetCPI: parseFloat(e.target.value),
                  })
                }
                sx={{ mb: 2 }}
              />
              <TextField
                fullWidth
                label="Target ROAS"
                type="number"
                value={selectedSource.targetROAS}
                onChange={(e) =>
                  setSelectedSource({
                    ...selectedSource,
                    targetROAS: parseFloat(e.target.value),
                  })
                }
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSaveSource} variant="contained" color="primary">
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Generate Creative Dialog */}
      <Dialog
        open={generateCreativeDialogOpen}
        onClose={() => setGenerateCreativeDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Generate New Creatives</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2 }}>
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Geo</InputLabel>
              <Select defaultValue="">
                <MenuItem value="US">United States</MenuItem>
                <MenuItem value="EU">Europe</MenuItem>
                <MenuItem value="LATAM">Latin America</MenuItem>
                <MenuItem value="ME">Middle East</MenuItem>
              </Select>
            </FormControl>
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Format</InputLabel>
              <Select defaultValue="">
                <MenuItem value="static">Static Image</MenuItem>
                <MenuItem value="video">Video</MenuItem>
                <MenuItem value="carousel">Carousel</MenuItem>
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>Theme</InputLabel>
              <Select defaultValue="">
                <MenuItem value="premium">Premium</MenuItem>
                <MenuItem value="lifestyle">Lifestyle</MenuItem>
                <MenuItem value="emotional">Emotional</MenuItem>
                <MenuItem value="bold">Bold</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setGenerateCreativeDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={() => handleGenerateCreatives({})}
            variant="contained"
            color="primary"
          >
            Generate
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
