/**
 * PACK 414 — Greenlight Matrix Dashboard
 * 
 * Admin UI for viewing system readiness and launch status.
 * Displays integration registry, audit results, and go/no-go decision.
 * 
 * Stage: D — Launch & Defense
 * Purpose: CTO launch readiness dashboard
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Chip,
  Button,
  LinearProgress,
  Alert,
  AlertTitle,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Collapse,
  CircularProgress,
  Divider
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  Refresh as RefreshIcon,
  ExpandMore as ExpandMoreIcon,
  PlayArrow as PlayArrowIcon,
  Rocket as RocketIcon
} from '@mui/icons-material';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { IntegrationStatus, GreenlightStatus } from '../../shared/integration/pack414-registry';

interface GreenlightMatrixData {
  greenlightStatus: GreenlightStatus;
  registry: IntegrationStatus[];
  byCategory: Record<string, IntegrationStatus[]>;
  categoryReadiness: Record<string, { ready: number; total: number; percentage: number }>;
  latestAudit: any;
  criticalRequirements: string[];
  canLaunch: boolean;
  timestamp: string;
}

export default function GreenlightMatrix() {
  const [loading, setLoading] = useState(true);
  const [auditing, setAuditing] = useState(false);
  const [matrixData, setMatrixData] = useState<GreenlightMatrixData | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const functions = getFunctions();

  useEffect(() => {
    loadGreenlightMatrix();
  }, []);

  const loadGreenlightMatrix = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const getMatrix = httpsCallable(functions, 'pack414_getGreenlightMatrix');
      const result = await getMatrix();
      
      setMatrixData(result.data as GreenlightMatrixData);
    } catch (err: any) {
      console.error('Failed to load greenlight matrix:', err);
      setError(err.message || 'Failed to load greenlight matrix');
    } finally {
      setLoading(false);
    }
  };

  const runFullAudit = async () => {
    try {
      setAuditing(true);
      setError(null);
      
      const runAudit = httpsCallable(functions, 'pack414_runFullAudit');
      await runAudit();
      
      // Reload matrix after audit completes
      await loadGreenlightMatrix();
    } catch (err: any) {
      console.error('Audit failed:', err);
      setError(err.message || 'Audit failed');
    } finally {
      setAuditing(false);
    }
  };

  const runPackAudit = async (packId: number) => {
    try {
      const runAudit = httpsCallable(functions, 'pack414_runPackAudit');
      await runAudit({ packId });
      
      // Reload matrix
      await loadGreenlightMatrix();
    } catch (err: any) {
      console.error(`Pack ${packId} audit failed:`, err);
      setError(err.message || 'Pack audit failed');
    }
  };

  const getStatusColor = (status: 'GREEN' | 'YELLOW' | 'RED') => {
    switch (status) {
      case 'GREEN': return 'success';
      case 'YELLOW': return 'warning';
      case 'RED': return 'error';
      default: return 'default';
    }
  };

  const getStatusIcon = (ready: boolean, priority: string) => {
    if (ready) {
      return <CheckCircleIcon color="success" />;
    } else if (priority === 'CRITICAL') {
      return <ErrorIcon color="error" />;
    } else {
      return <WarningIcon color="warning" />;
    }
  };

  const getCategoryIcon = (percentage: number) => {
    if (percentage === 100) {
      return <CheckCircleIcon color="success" />;
    } else if (percentage >= 75) {
      return <WarningIcon color="warning" />;
    } else {
      return <ErrorIcon color="error" />;
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress size={60} />
      </Box>
    );
  }

  if (!matrixData) {
    return (
      <Alert severity="error">
        <AlertTitle>Error</AlertTitle>
        {error || 'Failed to load greenlight matrix'}
      </Alert>
    );
  }

  const { greenlightStatus, registry, byCategory, categoryReadiness, canLaunch, latestAudit } = matrixData;

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" component="h1">
          <RocketIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          Greenlight Matrix — Launch Readiness
        </Typography>
        
        <Box>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={loadGreenlightMatrix}
            disabled={auditing}
            sx={{ mr: 2 }}
          >
            Refresh
          </Button>
          
          <Button
            variant="contained"
            startIcon={auditing ? <CircularProgress size={20} /> : <PlayArrowIcon />}
            onClick={runFullAudit}
            disabled={auditing}
          >
            {auditing ? 'Running Audit...' : 'Run Full Audit'}
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Overall Status Card */}
      <Card sx={{ mb: 3, bgcolor: canLaunch ? 'success.light' : 'error.light' }}>
        <CardContent>
          <Grid container spacing={3} alignItems="center">
            <Grid item xs={12} md={3}>
              <Box display="flex" alignItems="center">
                {greenlightStatus.overall === 'GREEN' ? (
                  <CheckCircleIcon sx={{ fontSize: 60, color: 'success.dark', mr: 2 }} />
                ) : greenlightStatus.overall === 'YELLOW' ? (
                  <WarningIcon sx={{ fontSize: 60, color: 'warning.dark', mr: 2 }} />
                ) : (
                  <ErrorIcon sx={{ fontSize: 60, color: 'error.dark', mr: 2 }} />
                )}
                
                <Box>
                  <Typography variant="h5" fontWeight="bold">
                    {greenlightStatus.overall}
                  </Typography>
                  <Typography variant="body2">
                    Overall Status
                  </Typography>
                </Box>
              </Box>
            </Grid>

            <Grid item xs={12} md={3}>
              <Typography variant="h4" fontWeight="bold" color="success.dark">
                {greenlightStatus.passed}
              </Typography>
              <Typography variant="body2">Systems Passed</Typography>
            </Grid>

            <Grid item xs={12} md={3}>
              <Typography variant="h4" fontWeight="bold" color="error.dark">
                {greenlightStatus.failed}
              </Typography>
              <Typography variant="body2">Systems Failed</Typography>
            </Grid>

            <Grid item xs={12} md={3}>
              <Chip
                label={canLaunch ? 'READY TO LAUNCH' : 'NOT READY'}
                color={canLaunch ? 'success' : 'error'}
                size="large"
                sx={{ fontWeight: 'bold', fontSize: '1.1rem', py: 3 }}
              />
            </Grid>
          </Grid>

          {greenlightStatus.criticalFailures.length > 0 && (
            <Alert severity="error" sx={{ mt: 2 }}>
              <AlertTitle>Critical Failures (Launch Blockers)</AlertTitle>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {greenlightStatus.criticalFailures.map((failure, idx) => (
                  <li key={idx}>{failure}</li>
                ))}
              </ul>
            </Alert>
          )}

          {greenlightStatus.warnings.length > 0 && greenlightStatus.criticalFailures.length === 0 && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              <AlertTitle>Warnings (Non-Critical)</AlertTitle>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {greenlightStatus.warnings.slice(0, 5).map((warning, idx) => (
                  <li key={idx}>{warning}</li>
                ))}
                {greenlightStatus.warnings.length > 5 && (
                  <li>...and {greenlightStatus.warnings.length - 5} more</li>
                )}
              </ul>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Category Readiness */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            System Categories
          </Typography>
          
          <Grid container spacing={2}>
            {Object.entries(categoryReadiness).map(([category, data]) => (
              <Grid item xs={12} sm={6} md={4} key={category}>
                <Card variant="outlined">
                  <CardContent>
                    <Box display="flex" alignItems="center" mb={1}>
                      {getCategoryIcon(data.percentage)}
                      <Typography variant="subtitle1" fontWeight="bold" ml={1}>
                        {category}
                      </Typography>
                    </Box>
                    
                    <Typography variant="h4" color={data.percentage === 100 ? 'success.main' : 'text.secondary'}>
                      {data.percentage}%
                    </Typography>
                    
                    <Typography variant="body2" color="text.secondary">
                      {data.ready} / {data.total} ready
                    </Typography>
                    
                    <LinearProgress
                      variant="determinate"
                      value={data.percentage}
                      color={data.percentage === 100 ? 'success' : data.percentage >= 75 ? 'warning' : 'error'}
                      sx={{ mt: 1, height: 8, borderRadius: 4 }}
                    />
                    
                    <Button
                      size="small"
                      onClick={() => setExpandedCategory(expandedCategory === category ? null : category)}
                      sx={{ mt: 1 }}
                    >
                      View Details
                    </Button>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </CardContent>
      </Card>

      {/* Detailed Integration Registry */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Integration Registry — Full System Status
          </Typography>
          
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Pack ID</TableCell>
                  <TableCell>Module</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell>Priority</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Last Verified</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {registry.map((item) => (
                  <React.Fragment key={`${item.packId}-${item.module}`}>
                    <TableRow
                      sx={{
                        bgcolor: !item.ready && item.priority === 'CRITICAL' ? 'error.light' : 
                                 !item.ready && item.priority === 'HIGH' ? 'warning.light' : 
                                 'inherit'
                      }}
                    >
                      <TableCell>{item.packId}</TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight="medium">
                          {item.module}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip label={item.category} size="small" />
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={item.priority}
                          size="small"
                          color={
                            item.priority === 'CRITICAL' ? 'error' :
                            item.priority === 'HIGH' ? 'warning' :
                            item.priority === 'MEDIUM' ? 'info' :
                            'default'
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Box display="flex" alignItems="center">
                          {getStatusIcon(item.ready, item.priority)}
                          <Typography variant="body2" ml={1}>
                            {item.ready ? 'READY' : 'NOT READY'}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption">
                          {item.lastVerifiedAt 
                            ? new Date(item.lastVerifiedAt).toLocaleString()
                            : 'Never'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <IconButton
                          size="small"
                          onClick={() => runPackAudit(item.packId)}
                          title="Re-audit this pack"
                        >
                          <RefreshIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => setExpandedCategory(
                            expandedCategory === `${item.packId}-${item.module}` 
                              ? null 
                              : `${item.packId}-${item.module}`
                          )}
                          title="Show details"
                        >
                          <ExpandMoreIcon
                            fontSize="small"
                            sx={{
                              transform: expandedCategory === `${item.packId}-${item.module}` 
                                ? 'rotate(180deg)' 
                                : 'rotate(0deg)',
                              transition: 'transform 0.3s'
                            }}
                          />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={7} sx={{ p: 0 }}>
                        <Collapse
                          in={expandedCategory === `${item.packId}-${item.module}`}
                          timeout="auto"
                          unmountOnExit
                        >
                          <Box sx={{ p: 2, bgcolor: 'grey.50' }}>
                            <Typography variant="body2" gutterBottom>
                              <strong>Comments:</strong> {item.comments || 'No comments'}
                            </Typography>
                            
                            {item.missingDependencies.length > 0 && (
                              <>
                                <Typography variant="body2" gutterBottom mt={1}>
                                  <strong>Missing Dependencies:</strong>
                                </Typography>
                                <ul style={{ margin: 0, paddingLeft: 20 }}>
                                  {item.missingDependencies.map((dep, idx) => (
                                    <li key={idx}><Typography variant="body2">{dep}</Typography></li>
                                  ))}
                                </ul>
                              </>
                            )}
                          </Box>
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Latest Audit Info */}
      {latestAudit && (
        <Card sx={{ mt: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Latest Audit Results
            </Typography>
            
            <Grid container spacing={2}>
              <Grid item xs={12} md={4}>
                <Typography variant="body2" color="text.secondary">
                  Completed At
                </Typography>
                <Typography variant="body1">
                  {latestAudit.completedAt 
                    ? new Date(latestAudit.completedAt.seconds * 1000).toLocaleString()
                    : 'N/A'}
                </Typography>
              </Grid>
              
              <Grid item xs={12} md={4}>
                <Typography variant="body2" color="text.secondary">
                  Duration
                </Typography>
                <Typography variant="body1">
                  {latestAudit.duration ? `${(latestAudit.duration / 1000).toFixed(2)}s` : 'N/A'}
                </Typography>
              </Grid>
              
              <Grid item xs={12} md={4}>
                <Typography variant="body2" color="text.secondary">
                  Status
                </Typography>
                <Chip
                  label={latestAudit.overall}
                  color={getStatusColor(latestAudit.overall)}
                />
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
