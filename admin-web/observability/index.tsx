/**
 * PACK 421 — Admin Observability Dashboard
 * 
 * Unified system health and observability interface for operations team.
 * Displays:
 * - Global system status (GREEN/YELLOW/RED)
 * - Module health cards (Wallet, Chat, Calls, Events, AI, etc.)
 * - Quick links to incident, support, and fraud consoles
 * - Real-time health checks
 */

import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Container, 
  Typography, 
  Grid, 
  Card, 
  CardContent, 
  Chip, 
  Button, 
  Alert,
  CircularProgress,
  Link as MuiLink,
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  Refresh as RefreshIcon,
  OpenInNew as OpenInNewIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';
import type { 
  HealthCheckResponse, 
  FeatureMatrixResponse,
  HealthStatus,
} from '../../../shared/types/pack421-observability.types';

/**
 * Status color mapping
 */
const STATUS_COLORS = {
  ok: 'success' as const,
  degraded: 'warning' as const,
  error: 'error' as const,
};

const STATUS_ICONS = {
  ok: CheckCircleIcon,
  degraded: WarningIcon,
  error: ErrorIcon,
};

const STATUS_LABELS = {
  ok: 'Operational',
  degraded: 'Degraded',
  error: 'Outage',
};

/**
 * Module health card component
 */
interface ModuleCardProps {
  name: string;
  status: HealthStatus;
  description?: string;
  packs?: string[];
  lastChecked?: number;
}

const ModuleCard: React.FC<ModuleCardProps> = ({ 
  name, 
  status, 
  description, 
  packs,
  lastChecked,
}) => {
  const StatusIcon = STATUS_ICONS[status];
  
  return (
    <Card 
      elevation={2}
      sx={{ 
        height: '100%',
        borderLeft: 4,
        borderColor: `${STATUS_COLORS[status]}.main`,
      }}
    >
      <CardContent>
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
          <Typography variant="h6" component="div">
            {name}
          </Typography>
          <StatusIcon color={STATUS_COLORS[status]} />
        </Box>
        
        <Chip 
          label={STATUS_LABELS[status]} 
          color={STATUS_COLORS[status]}
          size="small"
          sx={{ mb: 1 }}
        />
        
        {description && (
          <Typography variant="body2" color="text.secondary" paragraph>
            {description}
          </Typography>
        )}
        
        {packs && packs.length > 0 && (
          <Typography variant="caption" color="text.secondary">
            Packs: {packs.join(', ')}
          </Typography>
        )}
        
        {lastChecked && (
          <Typography variant="caption" display="block" color="text.secondary" mt={1}>
            Last checked: {new Date(lastChecked).toLocaleTimeString()}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
};

/**
 * Global status banner
 */
interface StatusBannerProps {
  status: HealthStatus;
  timestamp: number;
}

const StatusBanner: React.FC<StatusBannerProps> = ({ status, timestamp }) => {
  const getStatusMessage = () => {
    switch (status) {
      case 'ok':
        return 'All systems operational';
      case 'degraded':
        return 'Some systems experiencing degraded performance';
      case 'error':
        return 'System outage detected - incident response active';
    }
  };

  return (
    <Alert 
      severity={STATUS_COLORS[status]} 
      icon={React.createElement(STATUS_ICONS[status])}
      sx={{ mb: 3 }}
    >
      <Box display="flex" alignItems="center" justifyContent="space-between">
        <div>
          <Typography variant="h6">{getStatusMessage()}</Typography>
          <Typography variant="caption">
            Last updated: {new Date(timestamp).toLocaleString()}
          </Typography>
        </div>
      </Box>
    </Alert>
  );
};

/**
 * Quick action links
 */
const QuickLinks: React.FC = () => {
  const navigate = useNavigate();

  const links = [
    { label: 'Incident Dashboard', path: '/admin/incidents', description: 'PACK 417-419' },
    { label: 'Support Console', path: '/admin/support', description: 'PACK 300A' },
    { label: 'Fraud & Risk', path: '/admin/fraud', description: 'PACK 302/352' },
    { label: 'Audit Logs', path: '/admin/audit', description: 'PACK 296' },
    { label: 'Safety Incidents', path: '/admin/safety', description: 'PACK 267-268' },
    { label: 'Data Rights Requests', path: '/admin/data-rights', description: 'PACK 420' },
  ];

  return (
    <Card elevation={2} sx={{ mb: 3 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Quick Access
        </Typography>
        <Grid container spacing={2}>
          {links.map((link) => (
            <Grid item xs={12} sm={6} md={4} key={link.path}>
              <Button
                variant="outlined"
                fullWidth
                endIcon={<OpenInNewIcon />}
                onClick={() => navigate(link.path)}
              >
                <Box textAlign="left" width="100%">
                  <Typography variant="body2">{link.label}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {link.description}
                  </Typography>
                </Box>
              </Button>
            </Grid>
          ))}
        </Grid>
      </CardContent>
    </Card>
  );
};

/**
 * Main observability dashboard
 */
export const ObservabilityDashboard: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [internalHealth, setInternalHealth] = useState<HealthCheckResponse | null>(null);
  const [featureMatrix, setFeatureMatrix] = useState<FeatureMatrixResponse | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  /**
   * Fetch health data
   */
  const fetchHealthData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch feature matrix (callable function)
      const getFeatureMatrix = httpsCallable<void, FeatureMatrixResponse>(
        functions,
        'pack421_health_featureMatrix'
      );
      const featureResult = await getFeatureMatrix();
      setFeatureMatrix(featureResult.data);

      // For internal health, we would typically call the HTTP endpoint
      // For now, derive status from feature matrix
      const overallStatus: HealthStatus = featureResult.data.overallReady ? 'ok' : 'degraded';
      setInternalHealth({
        status: overallStatus,
        version: '1.0.0',
        timestamp: Date.now(),
        environment: process.env.NODE_ENV || 'development',
      });

    } catch (err: any) {
      console.error('Failed to fetch health data:', err);
      setError(err.message || 'Failed to load health data');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Auto-refresh every 30 seconds
   */
  useEffect(() => {
    fetchHealthData();

    if (autoRefresh) {
      const interval = setInterval(fetchHealthData, 30000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  /**
   * Manual refresh
   */
  const handleRefresh = () => {
    fetchHealthData();
  };

  /**
   * Render loading state
   */
  if (loading && !featureMatrix) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" component="h1">
          System Observability
        </Typography>
        <Box display="flex" gap={2}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={handleRefresh}
            disabled={loading}
          >
            Refresh
          </Button>
          <Chip 
            label={autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
            color={autoRefresh ? 'success' : 'default'}
            onClick={() => setAutoRefresh(!autoRefresh)}
          />
        </Box>
      </Box>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Global Status Banner */}
      {internalHealth && (
        <StatusBanner 
          status={internalHealth.status} 
          timestamp={internalHealth.timestamp}
        />
      )}

      {/* Quick Links */}
      <QuickLinks />

      {/* Module Health Grid */}
      <Typography variant="h5" gutterBottom sx={{ mt: 4, mb: 2 }}>
        Module Health
      </Typography>

      {featureMatrix && (
        <Grid container spacing={3}>
          {Object.entries(featureMatrix.features).map(([key, feature]) => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={key}>
              <ModuleCard
                name={feature.feature}
                status={feature.ready ? 'ok' : 'degraded'}
                description={feature.status}
                packs={feature.packs}
                lastChecked={featureMatrix.timestamp}
              />
            </Grid>
          ))}
        </Grid>
      )}

      {/* Component Health Details */}
      {internalHealth?.components && (
        <>
          <Typography variant="h5" gutterBottom sx={{ mt: 4, mb: 2 }}>
            Infrastructure Health
          </Typography>
          <Grid container spacing={3}>
            {internalHealth.components.map((component) => (
              <Grid item xs={12} sm={6} md={3} key={component.name}>
                <ModuleCard
                  name={component.name.toUpperCase()}
                  status={component.status}
                  description={component.message}
                  lastChecked={component.lastChecked}
                />
              </Grid>
            ))}
          </Grid>
        </>
      )}

      {/* Metrics Provider Info */}
      <Card elevation={2} sx={{ mt: 4 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Observability Configuration
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={3}>
              <Typography variant="caption" color="text.secondary">
                Provider
              </Typography>
              <Typography variant="body1">
                {process.env.OBSERVABILITY_PROVIDER || 'Not configured'}
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Typography variant="caption" color="text.secondary">
                Environment
              </Typography>
              <Typography variant="body1">
                {internalHealth?.environment || 'Unknown'}
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Typography variant="caption" color="text.secondary">
                Build Version
              </Typography>
              <Typography variant="body1">
                {internalHealth?.version || 'Unknown'}
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Typography variant="caption" color="text.secondary">
                Documentation
              </Typography>
              <MuiLink href="/docs/pack421-slo" target="_blank">
                SLO Targets & Error Budgets
              </MuiLink>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Footer */}
      <Box mt={4} textAlign="center">
        <Typography variant="caption" color="text.secondary">
          PACK 421 — Observability, Reliability & Incident Monitoring Engine
        </Typography>
      </Box>
    </Container>
  );
};

export default ObservabilityDashboard;
