/**
 * PACK 413 — KPI Command Center
 * 
 * Main dashboard for monitoring all critical KPIs during launch
 */

import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Grid, 
  Card, 
  CardContent, 
  Typography, 
  Chip, 
  Alert,
  CircularProgress,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Tabs,
  Tab,
} from '@mui/material';
import { 
  TrendingUp, 
  TrendingDown, 
  TrendingFlat,
  Warning,
  Error as ErrorIcon,
  CheckCircle,
} from '@mui/icons-material';
import { functions } from '../../lib/firebase';
import { httpsCallable } from 'firebase/functions';
import {
  ToplineKpiData,
  KpiCategory,
  KpiTimeRange,
  KpiMetric,
  GroupedKpis,
  KpiSeverity,
  PanicModeId,
} from '../../../../shared/types/pack413-kpi';

interface CommandCenterProps {
  onNavigateToAlerts?: () => void;
  onNavigateToPanicModes?: () => void;
  onNavigateToTimeline?: () => void;
}

export const CommandCenter: React.FC<CommandCenterProps> = ({
  onNavigateToAlerts,
  onNavigateToPanicModes,
  onNavigateToTimeline,
}) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ToplineKpiData | null>(null);
  const [timeRange, setTimeRange] = useState<KpiTimeRange>('TODAY');
  const [selectedRegion, setSelectedRegion] = useState<string>('GLOBAL');
  const [activeTab, setActiveTab] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadToplineKpis();
    
    // Auto-refresh every 60 seconds
    const interval = setInterval(loadToplineKpis, 60000);
    return () => clearInterval(interval);
  }, [timeRange, selectedRegion]);

  const loadToplineKpis = async () => {
    try {
      setLoading(true);
      setError(null);

      const getToplineKpis = httpsCallable(functions, 'pack413_getToplineKpis');
      const result = await getToplineKpis({
        timeRange,
        regionId: selectedRegion === 'GLOBAL' ? undefined : selectedRegion,
        includeAlerts: true,
      });

      if (result.data && (result.data as any).success) {
        setData((result.data as any).data as ToplineKpiData);
      }
    } catch (err) {
      console.error('Error loading topline KPIs:', err);
      setError('Failed to load KPI data');
    } finally {
      setLoading(false);
    }
  };

  const renderPanicModeChips = () => {
    if (!data?.activePanicModes || data.activePanicModes.length === 0) {
      return <Chip label="No Active Panic Modes" color="success" size="small" icon={<CheckCircle />} />;
    }

    return data.activePanicModes.map((modeId: PanicModeId) => (
      <Chip
        key={modeId}
        label={modeId.replace(/_/g, ' ')}
        color="error"
        size="small"
        icon={<Warning />}
        onClick={onNavigateToPanicModes}
        sx={{ mr: 1, cursor: 'pointer' }}
      />
    ));
  };

  const renderLaunchStage = () => {
    if (!data?.launchStage) return null;

    const stageColors: Record<string, 'default' | 'primary' | 'secondary' | 'success'> = {
      'SOFT_LIVE': 'primary',
      'FULL_LIVE': 'success',
      'PAUSED': 'default',
    };

    return (
      <Chip
        label={`Stage: ${data.launchStage}`}
        color={stageColors[data.launchStage] || 'default'}
        size="medium"
      />
    );
  };

  const renderKpiCard = (metric: KpiMetric) => {
    const severityColors: Record<KpiSeverity, string> = {
      INFO: '#4caf50',
      WARN: '#ff9800',
      CRITICAL: '#f44336',
    };

    const trendIcons = {
      UP: <TrendingUp />,
      DOWN: <TrendingDown />,
      FLAT: <TrendingFlat />,
    };

    const formatValue = (value: number, unit: string) => {
      switch (unit) {
        case 'PERCENT':
          return `${value.toFixed(1)}%`;
        case 'CURRENCY':
          return `$${value.toFixed(2)}`;
        case 'SECONDS':
          return `${value.toFixed(2)}s`;
        case 'SCORE':
          return value.toFixed(2);
        default:
          return Math.round(value).toLocaleString();
      }
    };

    return (
      <Card
        key={metric.id}
        sx={{
          borderLeft: 4,
          borderColor: metric.severity ? severityColors[metric.severity] : '#e0e0e0',
          height: '100%',
        }}
      >
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="flex-start">
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              {metric.label}
            </Typography>
            <Box color={metric.severity === 'CRITICAL' ? 'error.main' : metric.severity === 'WARN' ? 'warning.main' : 'text.secondary'}>
              {trendIcons[metric.trend]}
            </Box>
          </Box>

          <Typography variant="h4" gutterBottom>
            {formatValue(metric.value, metric.unit)}
          </Typography>

          {metric.changePct !== undefined && (
            <Box display="flex" alignItems="center" gap={1}>
              <Typography
                variant="body2"
                color={metric.changePct > 0 ? 'success.main' : metric.changePct < 0 ? 'error.main' : 'text.secondary'}
              >
                {metric.changePct > 0 ? '+' : ''}{metric.changePct.toFixed(1)}%
              </Typography>
              <Typography variant="caption" color="text.secondary">
                vs previous period
              </Typography>
            </Box>
          )}

          {metric.baseline !== undefined && (
            <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
              Baseline: {formatValue(metric.baseline, metric.unit)}
            </Typography>
          )}
        </CardContent>
      </Card>
    );
  };

  const renderCategoryGroup = (group: GroupedKpis) => {
    const categoryIcons: Record<KpiCategory, string> = {
      GROWTH: '📈',
      ENGAGEMENT: '💬',
      REVENUE: '💰',
      SAFETY: '🛡️',
      SUPPORT: '💁',
      STORE_REPUTATION: '⭐',
      PERFORMANCE: '⚡',
    };

    return (
      <Box key={group.category} mb={4}>
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
          <Typography variant="h6">
            {categoryIcons[group.category]} {group.category}
          </Typography>
          <Box display="flex" gap={1}>
            {group.summary.criticalCount > 0 && (
              <Chip
                label={`${group.summary.criticalCount} Critical`}
                color="error"
                size="small"
                icon={<ErrorIcon />}
              />
            )}
            {group.summary.warningCount > 0 && (
              <Chip
                label={`${group.summary.warningCount} Warnings`}
                color="warning"
                size="small"
                icon={<Warning />}
              />
            )}
          </Box>
        </Box>

        <Grid container spacing={2}>
          {group.metrics.map((metric) => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={metric.id}>
              {renderKpiCard(metric)}
            </Grid>
          ))}
        </Grid>
      </Box>
    );
  };

  if (loading && !data) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        {error}
      </Alert>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box mb={3}>
        <Typography variant="h4" gutterBottom>
          📊 KPI Command Center
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Real-time monitoring and alerting for all critical metrics
        </Typography>
      </Box>

      {/* Status Bar */}
      <Card sx={{ mb: 3, p: 2 }}>
        <Box display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={2}>
          <Box display="flex" alignItems="center" gap={2}>
            {renderLaunchStage()}
            {renderPanicModeChips()}
          </Box>

          <Box display="flex" gap={2}>
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>Time Range</InputLabel>
              <Select
                value={timeRange}
                label="Time Range"
                onChange={(e) => setTimeRange(e.target.value as KpiTimeRange)}
              >
                <MenuItem value="LAST_15_MIN">Last 15 min</MenuItem>
                <MenuItem value="LAST_HOUR">Last Hour</MenuItem>
                <MenuItem value="TODAY">Today</MenuItem>
                <MenuItem value="YESTERDAY">Yesterday</MenuItem>
                <MenuItem value="LAST_7_DAYS">Last 7 Days</MenuItem>
                <MenuItem value="LAST_30_DAYS">Last 30 Days</MenuItem>
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>Region</InputLabel>
              <Select
                value={selectedRegion}
                label="Region"
                onChange={(e) => setSelectedRegion(e.target.value)}
              >
                <MenuItem value="GLOBAL">Global</MenuItem>
                <MenuItem value="EE_CENTRAL">EE Central</MenuItem>
                <MenuItem value="EE_EAST">EE East</MenuItem>
                <MenuItem value="EE_WEST">EE West</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </Box>

        {/* Active Alerts Banner */}
        {data?.activeAlerts && data.activeAlerts.length > 0 && (
          <Alert 
            severity="error" 
            sx={{ mt: 2 }}
            action={
              onNavigateToAlerts && (
                <Typography
                  variant="button"
                  sx={{ cursor: 'pointer', textDecoration: 'underline' }}
                  onClick={onNavigateToAlerts}
                >
                  View All
                </Typography>
              )
            }
          >
            {data.activeAlerts.length} active alert{data.activeAlerts.length !== 1 ? 's' : ''} require attention
          </Alert>
        )}
      </Card>

      {/* Main Content */}
      <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ mb: 3 }}>
        <Tab label="All Categories" />
        <Tab label="Growth & Engagement" />
        <Tab label="Revenue & Safety" />
        <Tab label="Support & Performance" />
      </Tabs>

      {/* KPI Groups */}
      {data?.groups && (
        <Box>
          {activeTab === 0 && data.groups.map(renderCategoryGroup)}
          {activeTab === 1 && data.groups.filter(g => ['GROWTH', 'ENGAGEMENT'].includes(g.category)).map(renderCategoryGroup)}
          {activeTab === 2 && data.groups.filter(g => ['REVENUE', 'SAFETY'].includes(g.category)).map(renderCategoryGroup)}
          {activeTab === 3 && data.groups.filter(g => ['SUPPORT', 'PERFORMANCE', 'STORE_REPUTATION'].includes(g.category)).map(renderCategoryGroup)}
        </Box>
      )}

      {/* Last Updated */}
      <Box mt={3} textAlign="center">
        <Typography variant="caption" color="text.secondary">
          Last updated: {data?.timestamp ? new Date(data.timestamp).toLocaleString() : 'Unknown'}
        </Typography>
      </Box>
    </Box>
  );
};

export default CommandCenter;
