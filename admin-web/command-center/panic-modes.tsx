/**
 * PACK 413 — Panic Modes Panel
 * 
 * Interface for viewing and managing panic mode activations
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Chip,
  Alert,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  CircularProgress,
  Divider,
} from '@mui/material';
import {
  Warning,
  CheckCircle,
  PlayArrow,
  Stop,
  Info,
} from '@mui/icons-material';
import { functions } from '../../lib/firebase';
import { httpsCallable } from 'firebase/functions';
import {
  PanicModeConfig,
  ActivePanicMode,
  PanicModeId,
} from '../../../../shared/types/pack413-kpi';

export const PanicModesPanel: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [configs, setConfigs] = useState<PanicModeConfig[]>([]);
  const [activeModes, setActiveModes] = useState<ActivePanicMode[]>([]);
  const [selectedMode, setSelectedMode] = useState<PanicModeConfig | null>(null);
  const [activateDialogOpen, setActivateDialogOpen] = useState(false);
 const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadPanicModes();
  }, []);

  const loadPanicModes = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load configs (would be from Firestore or API)
      // For now, hardcoded based on backend defaults
      const defaultConfigs: PanicModeConfig[] = [
        {
          id: 'SLOWDOWN_GROWTH',
          label: 'Slowdown Growth',
          description: 'Growth KPIs fine, but infrastructure/operations overloaded',
          allowedStages: ['SOFT_LIVE', 'FULL_LIVE'],
          autoTriggers: [],
          manualOnly: true,
          recommendedActions: [
            'Reduce acquisition spend',
            'Lower referral bonuses temporarily',
            'Limit new registrations in selected regions',
          ],
          integrationsAffected: ['PACK_412', 'PACK_301', 'PACK_301A'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'SAFETY_LOCKDOWN',
          label: 'Safety Lockdown',
          description: 'Spike in safety incidents, abuse, or panic button triggers',
          allowedStages: ['SOFT_LIVE', 'FULL_LIVE'],
          autoTriggers: ['ALERT_SAFETY_INCIDENT_SPIKE'],
          manualOnly: false,
          recommendedActions: [
            'Auto-limit high-risk features',
            'Force age/ID re-verification',
            'Tighten content filters',
          ],
          integrationsAffected: ['PACK_302', 'PACK_412', 'PACK_159'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'PAYMENT_PROTECT',
          label: 'Payment Protection',
          description: 'Payment errors, refund spikes, or suspected fraud',
          allowedStages: ['SOFT_LIVE', 'FULL_LIVE'],
          autoTriggers: ['ALERT_PAYMENT_ERROR_SPIKE'],
          manualOnly: false,
          recommendedActions: [
            'Temporarily disable high-risk payment methods',
            'Add extra verification for high-value transactions',
          ],
          integrationsAffected: ['PACK_302', 'PACK_174', 'Wallet_Packs'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'SUPPORT_OVERLOAD',
          label: 'Support Overload',
          description: 'Support backlog spikes, SLA failing',
          allowedStages: ['SOFT_LIVE', 'FULL_LIVE'],
          autoTriggers: ['ALERT_SUPPORT_BACKLOG_CRITICAL'],
          manualOnly: false,
          recommendedActions: [
            'Rate-limit new feature rollouts',
            'Reduce notification campaign intensity',
            'Display known issues banners',
          ],
          integrationsAffected: ['PACK_300', 'PACK_412', 'PACK_301'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'STORE_DEFENSE',
          label: 'Store Defense',
          description: 'Negative rating attack or review bombing detected',
          allowedStages: ['FULL_LIVE'],
          autoTriggers: ['ALERT_RATING_DROP_CRITICAL'],
          manualOnly: false,
          recommendedActions: [
            'Activate PACK 411 defensive patterns',
            'Ramp up in-app rating prompts',
            'Pause high-risk experiments',
          ],
          integrationsAffected: ['PACK_411', 'PACK_301B'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      setConfigs(defaultConfigs);

      // Load active modes
      const getActivePanicModes = httpsCallable(functions, 'pack413_getActivePanicModes');
      const result = await getActivePanicModes({});
      
      if (result.data && (result.data as any).success) {
        setActiveModes((result.data as any).data as ActivePanicMode[]);
      }
    } catch (err) {
      console.error('Error loading panic modes:', err);
      setError('Failed to load panic modes');
    } finally {
      setLoading(false);
    }
  };

  const handleActivate = async () => {
    if (!selectedMode || !reason.trim()) {
      setError('Reason is required');
      return;
    }

    try {
      setError(null);
      const activatePanicMode = httpsCallable(functions, 'pack413_activatePanicMode');
      const result = await activatePanicMode({
        modeId: selectedMode.id,
        reason: reason.trim(),
      });

      if (result.data && (result.data as any).success) {
        setSuccess(`Panic mode ${selectedMode.label} activated successfully`);
        setActivateDialogOpen(false);
        setReason('');
        setSelectedMode(null);
        loadPanicModes();
      }
    } catch (err: any) {
      console.error('Error activating panic mode:', err);
      setError(err.message || 'Failed to activate panic mode');
    }
  };

  const handleDeactivate = async () => {
    if (!selectedMode || !reason.trim()) {
      setError('Reason is required');
      return;
    }

    try {
      setError(null);
      const deactivatePanicMode = httpsCallable(functions, 'pack413_deactivatePanicMode');
      const result = await deactivatePanicMode({
        modeId: selectedMode.id,
        reason: reason.trim(),
      });

      if (result.data && (result.data as any).success) {
        setSuccess(`Panic mode ${selectedMode.label} deactivated successfully`);
        setDeactivateDialogOpen(false);
        setReason('');
        setSelectedMode(null);
        loadPanicModes();
      }
    } catch (err: any) {
      console.error('Error deactivating panic mode:', err);
      setError(err.message || 'Failed to deactivate panic mode');
    }
  };

  const isActive = (modeId: PanicModeId): boolean => {
    return activeModes.some(m => m.modeId === modeId);
  };

  const renderModeCard = (config: PanicModeConfig) => {
    const active = isActive(config.id);

    return (
      <Card key={config.id} sx={{ mb: 2, borderLeft: 4, borderColor: active ? 'error.main' : 'grey.300' }}>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="flex-start">
            <Box flex={1}>
              <Box display="flex" alignItems="center" gap={1} mb={1}>
                <Typography variant="h6">{config.label}</Typography>
                {active && <Chip label="ACTIVE" color="error" size="small" icon={<Warning />} />}
                {config.manualOnly && <Chip label="Manual Only" size="small" />}
              </Box>

              <Typography variant="body2" color="text.secondary" paragraph>
                {config.description}
              </Typography>

              <Typography variant="subtitle2" gutterBottom>
                Recommended Actions:
              </Typography>
              <List dense>
                {config.recommendedActions.map((action, idx) => (
                  <ListItem key={idx} sx={{ py: 0.5 }}>
                    <ListItemIcon sx={{ minWidth: 30 }}>
                      <Info fontSize="small" />
                    </ListItemIcon>
                    <ListItemText primary={action} />
                  </ListItem>
                ))}
              </List>

              <Box mt={2}>
                <Typography variant="caption" color="text.secondary">
                  Affects: {config.integrationsAffected.join(', ')}
                </Typography>
              </Box>
            </Box>

            <Box ml={2}>
              {active ? (
                <Button
                  variant="outlined"
                  color="success"
                  startIcon={<Stop />}
                  onClick={() => {
                    setSelectedMode(config);
                    setDeactivateDialogOpen(true);
                  }}
                >
                  Deactivate
                </Button>
              ) : (
                <Button
                  variant="contained"
                  color="error"
                  startIcon={<PlayArrow />}
                  onClick={() => {
                    setSelectedMode(config);
                    setActivateDialogOpen(true);
                  }}
                >
                  Activate
                </Button>
              )}
            </Box>
          </Box>
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        ⚠️ Panic Modes
      </Typography>
      <Typography variant="body2" color="text.secondary" paragraph>
        Pre-defined response playbooks for critical situations
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      {/* Active Modes Summary */}
      {activeModes.length > 0 && (
        <Card sx={{ mb: 3, bgcolor: 'error.dark', color: 'error.contrastText' }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              🚨 Active Panic Modes
            </Typography>
            {activeModes.map((mode) => (
              <Box key={mode.id} mb={1}>
                <Typography variant="body1">
                  <strong>{mode.modeId}</strong> - Activated {new Date(mode.activatedAt).toLocaleString()}
                </Typography>
                <Typography variant="body2">Reason: {mode.reason}</Typography>
              </Box>
            ))}
          </CardContent>
        </Card>
      )}

      <Divider sx={{ my: 3 }} />

      {/* Mode Cards */}
      {configs.map(renderModeCard)}

      {/* Activate Dialog */}
      <Dialog open={activateDialogOpen} onClose={() => setActivateDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          ⚠️ Activate Panic Mode: {selectedMode?.label}
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            This will trigger automated responses across multiple systems. Ensure you understand the impact.
          </Alert>
          <TextField
            label="Reason (required)"
            multiline
            rows={3}
            fullWidth
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Describe why this panic mode is being activated..."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setActivateDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleActivate} variant="contained" color="error" disabled={!reason.trim()}>
            Activate
          </Button>
        </DialogActions>
      </Dialog>

      {/* Deactivate Dialog */}
      <Dialog open={deactivateDialogOpen} onClose={() => setDeactivateDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          ✅ Deactivate Panic Mode: {selectedMode?.label}
        </DialogTitle>
        <DialogContent>
          <TextField
            label="Reason (required)"
            multiline
            rows={3}
            fullWidth
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Describe why this panic mode is being deactivated..."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeactivateDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDeactivate} variant="contained" color="success" disabled={!reason.trim()}>
            Deactivate
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PanicModesPanel;
