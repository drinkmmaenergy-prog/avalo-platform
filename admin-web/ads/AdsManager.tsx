/**
 * PACK 356 - Ads Manager
 * Admin dashboard for managing paid acquisition campaigns
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Grid,
  Typography,
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
  Alert,
} from '@mui/material';
import {
  PlayArrow,
  Pause,
  Block,
  TrendingUp,
  TrendingDown,
  Create as EditIcon,
} from '@mui/icons-material';
import { getFunctions, httpsCallable } from 'firebase/functions';

interface Campaign {
  id: string;
  platform: string;
  objective: string;
  dailyBudget: number;
  totalBudget: number;
  countryCode: string;
  status: 'ACTIVE' | 'PAUSED' | 'BLOCKED';
  createdAt: any;
}

interface Performance {
  campaignId: string;
  impressions: number;
  clicks: number;
  installs: number;
  verifiedUsers: number;
  payingUsers: number;
  revenue: number;
  spend: number;
  roas: number;
  cpa: number;
  cpv: number;
  cpp: number;
}

const AdsManager: React.FC = () => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [performances, setPerformances] = useState<Record<string, Performance>>({});
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);

  const functions = getFunctions();

  useEffect(() => {
    loadCampaigns();
  }, []);

  const loadCampaigns = async () => {
    setLoading(true);
    try {
      // Load campaigns from Firestore
      const { getFirestore, collection, getDocs } = await import('firebase/firestore');
      const db = getFirestore();
      
      const campaignsSnapshot = await getDocs(collection(db, 'adCampaigns'));
      const campaignsData = campaignsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Campaign[];
      
      setCampaigns(campaignsData);

      // Load performance for each campaign
      const performanceData: Record<string, Performance> = {};
      for (const campaign of campaignsData) {
        const perfDoc = await getDocs(collection(db, 'adPerformance'));
        const perfData = perfDoc.docs.find(d => d.id === campaign.id);
        if (perfData) {
          performanceData[campaign.id] = perfData.data() as Performance;
        }
      }
      setPerformances(performanceData);
    } catch (error) {
      console.error('Error loading campaigns:', error);
    }
    setLoading(false);
  };

  const handleStatusChange = async (campaignId: string, status: string) => {
    try {
      const updateStatus = httpsCallable(functions, 'updateCampaignStatus');
      await updateStatus({ campaignId, status });
      await loadCampaigns();
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const handleBudgetUpdate = async (campaignId: string, dailyBudget: number, totalBudget: number) => {
    try {
      const updateBudget = httpsCallable(functions, 'updateCampaignBudget');
      await updateBudget({ campaignId, dailyBudget, totalBudget });
      await loadCampaigns();
      setEditDialogOpen(false);
    } catch (error) {
      console.error('Error updating budget:', error);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'success';
      case 'PAUSED': return 'warning';
      case 'BLOCKED': return 'error';
      default: return 'default';
    }
  };

  const getROASIndicator = (roas: number) => {
    if (roas >= 2.0) return <TrendingUp color="success" />;
    if (roas >= 1.2) return <TrendingUp color="info" />;
    if (roas >= 0.9) return <TrendingDown color="warning" />;
    return <TrendingDown color="error" />;
  };

  // Calculate overall stats
  const totalSpend = Object.values(performances).reduce((sum, p) => sum + (p.spend || 0), 0);
  const totalRevenue = Object.values(performances).reduce((sum, p) => sum + (p.revenue || 0), 0);
  const overallROAS = totalSpend > 0 ? totalRevenue / totalSpend : 0;
  const activeCampaigns = campaigns.filter(c => c.status === 'ACTIVE').length;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Ads Manager - PACK 356
      </Typography>

      {/* Overview Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Total Spend
              </Typography>
              <Typography variant="h5">{formatCurrency(totalSpend)}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Total Revenue
              </Typography>
              <Typography variant="h5">{formatCurrency(totalRevenue)}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Overall ROAS
              </Typography>
              <Typography variant="h5">
                {overallROAS.toFixed(2)}x
                {getROASIndicator(overallROAS)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Active Campaigns
              </Typography>
              <Typography variant="h5">{activeCampaigns}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Create Campaign Button */}
      <Box sx={{ mb: 2 }}>
        <Button
          variant="contained"
          color="primary"
          onClick={() => setCreateDialogOpen(true)}
        >
          Create Campaign
        </Button>
      </Box>

      {/* Campaigns Table */}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Campaign ID</TableCell>
              <TableCell>Platform</TableCell>
              <TableCell>Country</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Daily Budget</TableCell>
              <TableCell align="right">Spend</TableCell>
              <TableCell align="right">Revenue</TableCell>
              <TableCell align="right">ROAS</TableCell>
              <TableCell align="right">CPA</TableCell>
              <TableCell align="right">Installs</TableCell>
              <TableCell align="right">Verified</TableCell>
              <TableCell align="right">Paying</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {campaigns.map((campaign) => {
              const perf = performances[campaign.id] || {};
              return (
                <TableRow key={campaign.id}>
                  <TableCell>{campaign.id.substring(0, 8)}...</TableCell>
                  <TableCell>
                    <Chip label={campaign.platform} size="small" />
                  </TableCell>
                  <TableCell>{campaign.countryCode}</TableCell>
                  <TableCell>
                    <Chip
                      label={campaign.status}
                      color={getStatusColor(campaign.status) as any}
                      size="small"
                    />
                  </TableCell>
                  <TableCell align="right">{formatCurrency(campaign.dailyBudget)}</TableCell>
                  <TableCell align="right">{formatCurrency(perf.spend || 0)}</TableCell>
                  <TableCell align="right">{formatCurrency(perf.revenue || 0)}</TableCell>
                  <TableCell align="right">
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                      {(perf.roas || 0).toFixed(2)}x
                      {getROASIndicator(perf.roas || 0)}
                    </Box>
                  </TableCell>
                  <TableCell align="right">{formatCurrency(perf.cpa || 0)}</TableCell>
                  <TableCell align="right">{perf.installs || 0}</TableCell>
                  <TableCell align="right">{perf.verifiedUsers || 0}</TableCell>
                  <TableCell align="right">{perf.payingUsers || 0}</TableCell>
                  <TableCell>
                    <IconButton
                      size="small"
                      onClick={() => handleStatusChange(campaign.id, 'ACTIVE')}
                      disabled={campaign.status === 'ACTIVE'}
                    >
                      <PlayArrow />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => handleStatusChange(campaign.id, 'PAUSED')}
                      disabled={campaign.status === 'PAUSED'}
                    >
                      <Pause />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => {
                        setSelectedCampaign(campaign);
                        setEditDialogOpen(true);
                      }}
                    >
                      <EditIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Edit Budget Dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)}>
        <DialogTitle>Edit Campaign Budget</DialogTitle>
        <DialogContent>
          {selectedCampaign && (
            <Box sx={{ pt: 2 }}>
              <TextField
                label="Daily Budget"
                type="number"
                fullWidth
                defaultValue={selectedCampaign.dailyBudget}
                id="dailyBudget"
                sx={{ mb: 2 }}
              />
              <TextField
                label="Total Budget"
                type="number"
                fullWidth
                defaultValue={selectedCampaign.totalBudget}
                id="totalBudget"
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => {
              if (selectedCampaign) {
                const dailyBudget = parseFloat(
                  (document.getElementById('dailyBudget') as HTMLInputElement).value
                );
                const totalBudget = parseFloat(
                  (document.getElementById('totalBudget') as HTMLInputElement).value
                );
                handleBudgetUpdate(selectedCampaign.id, dailyBudget, totalBudget);
              }
            }}
          >
            Update
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AdsManager;
