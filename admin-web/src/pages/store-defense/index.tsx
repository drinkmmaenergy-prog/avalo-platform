/**
 * PACK 367: STORE DEFENSE DASHBOARD
 * Main admin interface for monitoring and managing store reputation
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Tabs,
  Tab,
  Alert,
  Chip,
  LinearProgress,
  Button,
} from '@mui/material';
import {
  Shield as ShieldIcon,
  Warning as WarningIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  RemoveCircle as StableIcon,
} from '@mui/icons-material';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { DefenseStatus, Platform } from '../../types/pack367';
import RatingHealthCard from './components/RatingHealthCard';
import ActiveCrisesCard from './components/ActiveCrisesCard';
import DefenseActionsCard from './components/DefenseActionsCard';
import RecentSignalsCard from './components/RecentSignalsCard';
import ReviewScanner from './components/ReviewScanner';
import CrisisManagement from './components/CrisisManagement';

const functions = getFunctions();

export default function StoreDefenseDashboard() {
  const [platform, setPlatform] = useState<Platform>('ios');
  const [defenseStatus, setDefenseStatus] = useState<DefenseStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [tabValue, setTabValue] = useState(0);

  useEffect(() => {
    loadDefenseStatus();
    
    // Refresh every 30 seconds
    const interval = setInterval(loadDefenseStatus, 30000);
    return () => clearInterval(interval);
  }, [platform]);

  const loadDefenseStatus = async () => {
    try {
      const getDefenseStatus = httpsCallable(functions, 'pack367_getDefenseStatus');
      const result = await getDefenseStatus({ platform }) as any;
      setDefenseStatus(result.data);
    } catch (error) {
      console.error('Error loading defense status:', error);
    } finally {
      setLoading(false);
    }
  };

  const getHealthColor = (score: number) => {
    if (score >= 80) return 'success';
    if (score >= 60) return 'warning';
    return 'error';
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up': return <TrendingUpIcon color="success" />;
      case 'down': return <TrendingDownIcon color="error" />;
      default: return <StableIcon color="action" />;
    }
  };

  if (loading) {
    return <LinearProgress />;
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <ShieldIcon sx={{ fontSize: 40, color: 'primary.main' }} />
          <div>
            <Typography variant="h4">Store Defense Center</Typography>
            <Typography variant="body2" color="text.secondary">
              PACK 367 — App Store Reputation & Trust Management
            </Typography>
          </div>
        </Box>

        {/* Platform Selector */}
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant={platform === 'ios' ? 'contained' : 'outlined'}
            onClick={() => setPlatform('ios')}
          >
            iOS
          </Button>
          <Button
            variant={platform === 'android' ? 'contained' : 'outlined'}
            onClick={() => setPlatform('android')}
          >
            Android
          </Button>
        </Box>
      </Box>

      {/* Health Status Alert */}
      {defenseStatus && defenseStatus.healthScore < 70 && (
        <Alert 
          severity={defenseStatus.healthScore < 50 ? 'error' : 'warning'} 
          sx={{ mb: 3 }}
          icon={<WarningIcon />}
        >
          <Typography variant="subtitle2">
            Store Health Alert: Score is {defenseStatus.healthScore}/100
          </Typography>
          <Typography variant="body2">
            {defenseStatus.activeCrises.length} active crises, {defenseStatus.activeDefenseActions.length} defense actions running
          </Typography>
        </Alert>
      )}

      {/* Health Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography variant="overline" color="text.secondary">
                Health Score
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                <Typography variant="h3" color={getHealthColor(defenseStatus?.healthScore || 0)}>
                  {defenseStatus?.healthScore || 0}
                </Typography>
                <Typography variant="h6" color="text.secondary">/100</Typography>
              </Box>
              <LinearProgress 
                variant="determinate" 
                value={defenseStatus?.healthScore || 0}
                color={getHealthColor(defenseStatus?.healthScore || 0) as any}
                sx={{ mt: 2, height: 8, borderRadius: 4 }}
              />
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography variant="overline" color="text.secondary">
                Current Rating
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                <Typography variant="h3">
                  {defenseStatus?.currentRating?.toFixed(1) || 'N/A'}
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  {defenseStatus && getTrendIcon(defenseStatus.ratingTrend)}
                  <Typography variant="caption" color="text.secondary">
                    {defenseStatus?.ratingTrend}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography variant="overline" color="text.secondary">
                Active Crises
              </Typography>
              <Typography variant="h3" color={defenseStatus?.activeCrises.length ? 'error' : 'success'}>
                {defenseStatus?.activeCrises.length || 0}
              </Typography>
              {defenseStatus?.activeCrises.length ? (
                <Chip 
                  label="Action Required" 
                  color="error" 
                  size="small" 
                  sx={{ mt: 1 }}
                />
              ) : (
                <Chip 
                  label="All Clear" 
                  color="success" 
                  size="small" 
                  sx={{ mt: 1 }}
                />
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography variant="overline" color="text.secondary">
                Defense Actions
              </Typography>
              <Typography variant="h3" color={defenseStatus?.activeDefenseActions.length ? 'warning' : 'text.primary'}>
                {defenseStatus?.activeDefenseActions.length || 0}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                Active protections
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Main Content Tabs */}
      <Card>
        <Tabs 
          value={tabValue} 
          onChange={(e, v) => setTabValue(v)}
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab label="Overview" />
          <Tab label="Review Scanner" />
          <Tab label="Crisis Management" />
          <Tab label="Defense Actions" />
          <Tab label="Reputation Signals" />
        </Tabs>

        <CardContent>
          {/* Overview Tab */}
          {tabValue === 0 && defenseStatus && (
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <RatingHealthCard 
                  platform={platform} 
                  status={defenseStatus}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <ActiveCrisesCard 
                  crises={defenseStatus.activeCrises}
                  onRefresh={loadDefenseStatus}
                />
              </Grid>
              <Grid item xs={12}>
                <DefenseActionsCard 
                  actions={defenseStatus.activeDefenseActions}
                  onRefresh={loadDefenseStatus}
                />
              </Grid>
              <Grid item xs={12}>
                <RecentSignalsCard 
                  signals={defenseStatus.recentSignals}
                />
              </Grid>
            </Grid>
          )}

          {/* Review Scanner Tab */}
          {tabValue === 1 && (
            <ReviewScanner 
              platform={platform}
              onScanComplete={loadDefenseStatus}
            />
          )}

          {/* Crisis Management Tab */}
          {tabValue === 2 && defenseStatus && (
            <CrisisManagement 
              platform={platform}
              crises={defenseStatus.activeCrises}
              onRefresh={loadDefenseStatus}
            />
          )}

          {/* Defense Actions Tab */}
          {tabValue === 3 && defenseStatus && (
            <DefenseActionsCard 
              actions={defenseStatus.activeDefenseActions}
              onRefresh={loadDefenseStatus}
              detailed
            />
          )}

          {/* Reputation Signals Tab */}
          {tabValue === 4 && defenseStatus && (
            <RecentSignalsCard 
              signals={defenseStatus.recentSignals}
              detailed
            />
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
