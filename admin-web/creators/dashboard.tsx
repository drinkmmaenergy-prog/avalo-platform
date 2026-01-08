/**
 * PACK 433 — Creator Marketplace Dashboard
 * Main dashboard for managing creators, deals, and payouts
 */

import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Card, 
  CardContent, 
  Typography, 
  Grid, 
  Button, 
  Chip, 
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Alert
} from '@mui/material';
import { 
  TrendingUp, 
  People, 
  AttachMoney, 
  Warning,
  CheckCircle 
} from '@mui/icons-material';

interface CreatorStats {
  totalCreators: number;
  activeCreators: number;
  pendingApprovals: number;
  suspendedCreators: number;
  totalRevenue: number;
  totalPayouts: number;
  avgConversionRate: number;
}

interface TopCreator {
  id: string;
  displayName: string;
  totalInstalls: number;
  totalRevenue: number;
  conversionRate: number;
  status: string;
  riskScore: number;
}

export default function CreatorDashboard() {
  const [stats, setStats] = useState<CreatorStats | null>(null);
  const [topCreators, setTopCreators] = useState<TopCreator[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      // TODO: Load from Firebase Functions
      // Placeholder data
      setStats({
        totalCreators: 156,
        activeCreators: 142,
        pendingApprovals: 8,
        suspendedCreators: 6,
        totalRevenue: 125000,
        totalPayouts: 81250,
        avgConversionRate: 3.2,
      });

      setTopCreators([
        {
          id: '1',
          displayName: 'TechInfluencer',
          totalInstalls: 15000,
          totalRevenue: 45000,
          conversionRate: 4.5,
          status: 'ACTIVE',
          riskScore: 15,
        },
        // Add more mock data...
      ]);

      setLoading(false);
    } catch (error) {
      console.error('Error loading dashboard:', error);
      setLoading(false);
    }
  };

  if (loading) {
    return <Typography>Loading...</Typography>;
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Creator Marketplace Dashboard
      </Typography>

      {/* Stats Overview */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Total Creators
                  </Typography>
                  <Typography variant="h4">{stats?.totalCreators || 0}</Typography>
                  <Chip 
                    label={`${stats?.activeCreators || 0} Active`} 
                    color="success" 
                    size="small" 
                    sx={{ mt: 1 }}
                  />
                </Box>
                <People fontSize="large" color="primary" />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Pending Approvals
                  </Typography>
                  <Typography variant="h4">{stats?.pendingApprovals || 0}</Typography>
                  <Button size="small" sx={{ mt: 1 }}>Review</Button>
                </Box>
                <Warning fontSize="large" color="warning" />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Total Revenue
                  </Typography>
                  <Typography variant="h4">
                    ${(stats?.totalRevenue || 0).toLocaleString()}
                  </Typography>
                  <Typography variant="caption" color="textSecondary">
                    Payouts: ${(stats?.totalPayouts || 0).toLocaleString()}
                  </Typography>
                </Box>
                <AttachMoney fontSize="large" color="success" />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Avg Conversion Rate
                  </Typography>
                  <Typography variant="h4">
                    {stats?.avgConversionRate || 0}%
                  </Typography>
                  <Chip 
                    label="Good" 
                    color="success" 
                    size="small" 
                    icon={<TrendingUp />}
                    sx={{ mt: 1 }}
                  />
                </Box>
                <CheckCircle fontSize="large" color="info" />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Alerts */}
      {stats && stats.suspendedCreators > 0 && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          {stats.suspendedCreators} creators are currently suspended due to fraud signals.
        </Alert>
      )}

      {/* Top Creators Table */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Top Performing Creators
          </Typography>
          <TableContainer component={Paper} sx={{ mt: 2 }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Creator</TableCell>
                  <TableCell align="right">Installs</TableCell>
                  <TableCell align="right">Revenue</TableCell>
                  <TableCell align="right">Conversion Rate</TableCell>
                  <TableCell align="right">Risk Score</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {topCreators.map((creator) => (
                  <TableRow key={creator.id}>
                    <TableCell>{creator.displayName}</TableCell>
                    <TableCell align="right">{creator.totalInstalls.toLocaleString()}</TableCell>
                    <TableCell align="right">${creator.totalRevenue.toLocaleString()}</TableCell>
                    <TableCell align="right">{creator.conversionRate}%</TableCell>
                    <TableCell align="right">
                      <Chip 
                        label={creator.riskScore} 
                        color={creator.riskScore > 50 ? 'error' : 'success'} 
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={creator.status} 
                        color="success" 
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Button size="small">View Details</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </Box>
  );
}
