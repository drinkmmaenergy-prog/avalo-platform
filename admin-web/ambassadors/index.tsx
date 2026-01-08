/**
 * PACK 434 — Global Ambassador Program & Offline Partner Expansion Engine
 * Admin Dashboard - Ambassador Overview
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
  TableHead,
  TableRow,
  Chip,
  Button,
  TextField,
  MenuItem,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';

interface AmbassadorSummary {
  id: string;
  name: string;
  role: string;
  tier: string;
  status: string;
  region: string;
  referrals: number;
  creators: number;
  events: number;
  revenue: number;
  rating: number;
}

interface DashboardStats {
  totalAmbassadors: number;
  activeAmbassadors: number;
  pendingApplications: number;
  totalReferrals: number;
  totalRevenue: number;
  avgConversionRate: number;
}

export default function AmbassadorDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [ambassadors, setAmbassadors] = useState<AmbassadorSummary[]>([]);
  const [filterRole, setFilterRole] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  useEffect(() => {
    loadDashboardData();
  }, [filterRole, filterStatus, searchTerm]);

  const loadDashboardData = async () => {
    // Load dashboard statistics
    // This would connect to Firebase or API
    
    const mockStats: DashboardStats = {
      totalAmbassadors: 247,
      activeAmbassadors: 198,
      pendingApplications: 34,
      totalReferrals: 12543,
      totalRevenue: 89234.50,
      avgConversionRate: 0.42,
    };

    const mockAmbassadors: AmbassadorSummary[] = [
      {
        id: '1',
        name: 'John Doe',
        role: 'city_ambassador',
        tier: 'platinum',
        status: 'active',
        region: 'New York, US',
        referrals: 523,
        creators: 47,
        events: 12,
        revenue: 8934.20,
        rating: 4.8,
      },
      {
        id: '2',
        name: 'Sarah Smith',
        role: 'campus_ambassador',
        tier: 'gold',
        status: 'active',
        region: 'Boston, US',
        referrals: 289,
        creators: 24,
        events: 8,
        revenue: 4521.50,
        rating: 4.6,
      },
    ];

    setStats(mockStats);
    setAmbassadors(mockAmbassadors);
  };

  const getTierColor = (tier: string) => {
    const colors: Record<string, string> = {
      bronze: 'default',
      silver: 'info',
      gold: 'warning',
      platinum: 'secondary',
      titan: 'error',
    };
    return colors[tier] || 'default';
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      active: 'success',
      approved: 'info',
      pending: 'warning',
      suspended: 'error',
      terminated: 'default',
    };
    return colors[status] || 'default';
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Ambassador Program Dashboard
      </Typography>

      {/* Summary Statistics */}
      {stats && (
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={12} sm={6} md={4}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Total Ambassadors
                </Typography>
                <Typography variant="h4">{stats.totalAmbassadors}</Typography>
                <Typography variant="body2" color="success.main">
                  {stats.activeAmbassadors} active
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={4}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Total Referrals
                </Typography>
                <Typography variant="h4">
                  {stats.totalReferrals.toLocaleString()}
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  {(stats.avgConversionRate * 100).toFixed(1)}% conversion rate
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={4}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Total Revenue
                </Typography>
                <Typography variant="h4">
                  ${stats.totalRevenue.toLocaleString()}
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  ${(stats.totalRevenue / stats.totalAmbassadors).toFixed(2)} per ambassador
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          {stats.pendingApplications > 0 && (
            <Grid item xs={12}>
              <Card sx={{ bgcolor: 'warning.light' }}>
                <CardContent>
                  <Typography variant="h6">
                    {stats.pendingApplications} Pending Applications
                  </Typography>
                  <Button
                    variant="contained"
                    sx={{ mt: 1 }}
                    onClick={() => navigate('/ambassadors/applications')}
                  >
                    Review Applications
                  </Button>
                </CardContent>
              </Card>
            </Grid>
          )}
        </Grid>
      )}

      {/* Filters */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                label="Search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by name or region..."
              />
            </Grid>

            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                select
                label="Role"
                value={filterRole}
                onChange={(e) => setFilterRole(e.target.value)}
              >
                <MenuItem value="all">All Roles</MenuItem>
                <MenuItem value="city_ambassador">City Ambassador</MenuItem>
                <MenuItem value="campus_ambassador">Campus Ambassador</MenuItem>
                <MenuItem value="nightlife_ambassador">Nightlife Ambassador</MenuItem>
                <MenuItem value="creator_recruiter">Creator Recruiter</MenuItem>
                <MenuItem value="community_ambassador">Community Ambassador</MenuItem>
              </TextField>
            </Grid>

            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                select
                label="Status"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <MenuItem value="all">All Statuses</MenuItem>
                <MenuItem value="active">Active</MenuItem>
                <MenuItem value="approved">Approved</MenuItem>
                <MenuItem value="pending">Pending</MenuItem>
                <MenuItem value="suspended">Suspended</MenuItem>
              </TextField>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Ambassador List */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Ambassadors
          </Typography>

          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Region</TableCell>
                <TableCell>Tier</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Referrals</TableCell>
                <TableCell align="right">Creators</TableCell>
                <TableCell align="right">Events</TableCell>
                <TableCell align="right">Revenue</TableCell>
                <TableCell align="right">Rating</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {ambassadors.map((ambassador) => (
                <TableRow key={ambassador.id} hover>
                  <TableCell>{ambassador.name}</TableCell>
                  <TableCell>
                    {ambassador.role.replace('_', ' ')}
                  </TableCell>
                  <TableCell>{ambassador.region}</TableCell>
                  <TableCell>
                    <Chip
                      label={ambassador.tier}
                      color={getTierColor(ambassador.tier) as any}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={ambassador.status}
                      color={getStatusColor(ambassador.status) as any}
                      size="small"
                    />
                  </TableCell>
                  <TableCell align="right">{ambassador.referrals}</TableCell>
                  <TableCell align="right">{ambassador.creators}</TableCell>
                  <TableCell align="right">{ambassador.events}</TableCell>
                  <TableCell align="right">
                    ${ambassador.revenue.toLocaleString()}
                  </TableCell>
                  <TableCell align="right">{ambassador.rating.toFixed(1)}</TableCell>
                  <TableCell>
                    <Button
                      size="small"
                      onClick={() => navigate(`/ambassadors/${ambassador.id}`)}
                    >
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Box>
  );
}
