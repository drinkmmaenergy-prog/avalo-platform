/**
 * PACK 365 — Feature Flag Admin Panel
 * 
 * Purpose: Real-time feature flag management and kill-switch controls
 * Phase: ETAP B — Pre-Launch Hardening
 */

import React, { useState, useEffect } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Typography,
  Switch,
  TextField,
  Grid,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  AlertTitle,
  Tabs,
  Tab,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Slider,
  IconButton,
  Tooltip,
  List,
  ListItem,
  ListItemText,
  Divider,
} from "@mui/material";
import {
  Warning as WarningIcon,
  CheckCircle as CheckIcon,
  History as HistoryIcon,
  Add as AddIcon,
  Refresh as RefreshIcon,
  PowerSettingsNew as PowerIcon,
} from "@mui/icons-material";

interface FeatureFlag {
  key: string;
  enabled: boolean;
  environment: "dev" | "staging" | "prod";
  rolloutPercent?: number;
  userSegments?: string[];
  regions?: string[];
  updatedAt: number;
  updatedBy: string;
  description?: string;
  domain?: string;
  changeReason?: string;
}

interface FlagChange {
  timestamp: number;
  changedBy: string;
  previousState: Partial<FeatureFlag>;
  newState: Partial<FeatureFlag>;
  reason?: string;
}

const CRITICAL_KILL_SWITCHES = [
  "system.global.freeze",
  "wallet.spend.disabled",
  "withdrawals.disabled",
  "chat.paid.disabled",
  "ai.voice.disabled",
  "calendar.booking.disabled",
  "events.booking.disabled",
  "panic.system.disabled",
  "registrations.disabled",
  "launch.production.enabled",
];

const DOMAINS = [
  "system",
  "auth",
  "chat",
  "wallet",
  "calendar",
  "events",
  "panic",
  "ai",
  "feed",
  "discovery",
  "subscriptions",
  "verification",
  "support",
  "withdrawals",
  "registrations",
];

const REGIONS = ["PL", "DE", "FR", "ES", "IT", "GB", "US", "ALL"];
const USER_SEGMENTS = ["FREE", "VIP", "ROYAL", "CELEBRITY", "ALL"];

export const FeatureFlagPanel: React.FC = () => {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [selectedEnvironment, setSelectedEnvironment] = useState<"dev" | "staging" | "prod">("prod");
  const [selectedDomain, setSelectedDomain] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedFlag, setSelectedFlag] = useState<FeatureFlag | null>(null);
  const [flagHistory, setFlagHistory] = useState<FlagChange[]>([]);
  const [editingFlag, setEditingFlag] = useState<Partial<FeatureFlag>>({});
  const [changeReason, setChangeReason] = useState("");
  const [alert, setAlert] = useState<{ type: "success" | "error" | "warning"; message: string } | null>(null);

  useEffect(() => {
    loadFlags();
  }, [selectedEnvironment]);

  const loadFlags = async () => {
    setLoading(true);
    try {
      // Call Firebase function to get flags
      const response = await fetch(`/api/admin/feature-flags?environment=${selectedEnvironment}`);
      const data = await response.json();
      setFlags(data.flags || []);
    } catch (error) {
      console.error("Error loading flags:", error);
      showAlert("error", "Failed to load feature flags");
    } finally {
      setLoading(false);
    }
  };

  const showAlert = (type: "success" | "error" | "warning", message: string) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 5000);
  };

  const handleToggleFlag = async (flag: FeatureFlag) => {
    // For critical switches, require confirmation
    if (CRITICAL_KILL_SWITCHES.includes(flag.key)) {
      setSelectedFlag(flag);
      setEditingFlag({ ...flag, enabled: !flag.enabled });
      setDialogOpen(true);
      return;
    }

    await updateFlag({ ...flag, enabled: !flag.enabled }, "Quick toggle");
  };

  const handleOpenEdit = (flag: FeatureFlag) => {
    setSelectedFlag(flag);
    setEditingFlag({ ...flag });
    setDialogOpen(true);
  };

  const handleOpenHistory = async (flag: FeatureFlag) => {
    setSelectedFlag(flag);
    setHistoryOpen(true);
    
    try {
      const response = await fetch(`/api/admin/feature-flags/${flag.key}/history`);
      const data = await response.json();
      setFlagHistory(data.changes || []);
    } catch (error) {
      console.error("Error loading history:", error);
      showAlert("error", "Failed to load flag history");
    }
  };

  const updateFlag = async (flag: Partial<FeatureFlag>, reason: string) => {
    try {
      const response = await fetch("/api/admin/feature-flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flag, reason }),
      });

      if (!response.ok) throw new Error("Failed to update flag");

      showAlert("success", `Feature flag "${flag.key}" updated successfully`);
      setDialogOpen(false);
      setChangeReason("");
      loadFlags();
    } catch (error) {
      console.error("Error updating flag:", error);
      showAlert("error", "Failed to update feature flag");
    }
  };

  const handleSaveFlag = () => {
    if (!changeReason.trim() && CRITICAL_KILL_SWITCHES.includes(editingFlag.key!)) {
      showAlert("warning", "Please provide a reason for changing a critical flag");
      return;
    }

    updateFlag(editingFlag as FeatureFlag, changeReason);
  };

  const filteredFlags = flags.filter((flag) => {
    if (selectedDomain === "all") return true;
    return flag.domain === selectedDomain;
  });

  const criticalFlags = filteredFlags.filter((flag) =>
    CRITICAL_KILL_SWITCHES.includes(flag.key)
  );
  const regularFlags = filteredFlags.filter(
    (flag) => !CRITICAL_KILL_SWITCHES.includes(flag.key)
  );

  const getSeverityColor = (flag: FeatureFlag): "error" | "warning" | "success" | "default" => {
    if (flag.key === "panic.system.disabled" && flag.enabled) return "error";
    if (flag.key === "system.global.freeze" && flag.enabled) return "error";
    if (CRITICAL_KILL_SWITCHES.includes(flag.key)) return "warning";
    return flag.enabled ? "success" : "default";
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Typography variant="h4" fontWeight="bold">
          Feature Flag Control Center
        </Typography>
        <Box sx={{ display: "flex", gap: 2 }}>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Environment</InputLabel>
            <Select
              value={selectedEnvironment}
              label="Environment"
              onChange={(e) => setSelectedEnvironment(e.target.value as any)}
            >
              <MenuItem value="dev">Development</MenuItem>
              <MenuItem value="staging">Staging</MenuItem>
              <MenuItem value="prod">Production</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Domain</InputLabel>
            <Select
              value={selectedDomain}
              label="Domain"
              onChange={(e) => setSelectedDomain(e.target.value)}
            >
              <MenuItem value="all">All Domains</MenuItem>
              {DOMAINS.map((domain) => (
                <MenuItem key={domain} value={domain}>
                  {domain}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <IconButton onClick={loadFlags} disabled={loading}>
            <RefreshIcon />
          </IconButton>
        </Box>
      </Box>

      {alert && (
        <Alert severity={alert.type} sx={{ mb: 2 }} onClose={() => setAlert(null)}>
          <AlertTitle>{alert.type === "error" ? "Error" : "Success"}</AlertTitle>
          {alert.message}
        </Alert>
      )}

      {/* Critical Kill Switches */}
      {criticalFlags.length > 0 && (
        <Box sx={{ mb: 4 }}>
          <Typography variant="h5" gutterBottom sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <PowerIcon color="error" />
            Critical Kill Switches
          </Typography>
          <Grid container spacing={2}>
            {criticalFlags.map((flag) => (
              <Grid item xs={12} md={6} lg={4} key={flag.key}>
                <Card
                  sx={{
                    border: 2,
                    borderColor: getSeverityColor(flag) === "error" ? "error.main" : "warning.main",
                  }}
                >
                  <CardContent>
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "start", mb: 2 }}>
                      <Box>
                        <Typography variant="h6" sx={{ fontSize: "0.9rem", fontWeight: "bold" }}>
                          {flag.key}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                          {flag.description || "No description"}
                        </Typography>
                      </Box>
                      <Switch
                        checked={flag.enabled}
                        onChange={() => handleToggleFlag(flag)}
                        color={getSeverityColor(flag) as any}
                      />
                    </Box>
                    
                    <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1 }}>
                      <Chip
                        label={flag.enabled ? "Enabled" : "Disabled"}
                        color={flag.enabled ? "success" : "default"}
                        size="small"
                      />
                      {flag.domain && (
                        <Chip label={flag.domain} size="small" variant="outlined" />
                      )}
                    </Box>

                    <Typography variant="caption" display="block" color="text.secondary">
                      Last updated: {new Date(flag.updatedAt).toLocaleString()}
                    </Typography>
                    <Typography variant="caption" display="block" color="text.secondary">
                      By: {flag.updatedBy}
                    </Typography>

                    <Box sx={{ mt: 2, display: "flex", gap: 1 }}>
                      <Button size="small" variant="outlined" onClick={() => handleOpenEdit(flag)}>
                        Edit
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<HistoryIcon />}
                        onClick={() => handleOpenHistory(flag)}
                      >
                        History
                      </Button>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      {/* Regular Flags */}
      {regularFlags.length > 0 && (
        <Box>
          <Typography variant="h5" gutterBottom>
            Feature Flags
          </Typography>
          <Grid container spacing={2}>
            {regularFlags.map((flag) => (
              <Grid item xs={12} md={6} lg={4} key={flag.key}>
                <Card>
                  <CardContent>
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "start", mb: 2 }}>
                      <Box>
                        <Typography variant="h6" sx={{ fontSize: "0.9rem", fontWeight: "bold" }}>
                          {flag.key}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                          {flag.description || "No description"}
                        </Typography>
                      </Box>
                      <Switch
                        checked={flag.enabled}
                        onChange={() => handleToggleFlag(flag)}
                        color="primary"
                      />
                    </Box>

                    <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1 }}>
                      <Chip
                        label={flag.enabled ? "Enabled" : "Disabled"}
                        color={flag.enabled ? "success" : "default"}
                        size="small"
                      />
                      {flag.domain && (
                        <Chip label={flag.domain} size="small" variant="outlined" />
                      )}
                      {flag.rolloutPercent !== undefined && flag.rolloutPercent < 100 && (
                        <Chip label={`${flag.rolloutPercent}% rollout`} size="small" color="info" />
                      )}
                    </Box>

                    {flag.regions && flag.regions.length > 0 && (
                      <Typography variant="caption" display="block">
                        Regions: {flag.regions.join(", ")}
                      </Typography>
                    )}

                    {flag.userSegments && flag.userSegments.length > 0 && (
                      <Typography variant="caption" display="block">
                        Segments: {flag.userSegments.join(", ")}
                      </Typography>
                    )}

                    <Box sx={{ mt: 2, display: "flex", gap: 1 }}>
                      <Button size="small" variant="outlined" onClick={() => handleOpenEdit(flag)}>
                        Edit
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<HistoryIcon />}
                        onClick={() => handleOpenHistory(flag)}
                      >
                        History
                      </Button>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      {/* Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {CRITICAL_KILL_SWITCHES.includes(editingFlag.key || "")
            ? "⚠️ Edit Critical Kill Switch"
            : "Edit Feature Flag"}
        </DialogTitle>
        <DialogContent>
          {CRITICAL_KILL_SWITCHES.includes(editingFlag.key || "") && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              You are editing a critical kill switch. Changes will affect production systems immediately.
            </Alert>
          )}

          <Typography variant="subtitle2" gutterBottom>
            {editingFlag.key}
          </Typography>

          <FormControl fullWidth sx={{ mt: 2, mb: 2 }}>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <Typography>Enabled</Typography>
              <Switch
                checked={editingFlag.enabled || false}
                onChange={(e) => setEditingFlag({ ...editingFlag, enabled: e.target.checked })}
              />
            </Box>
          </FormControl>

          {!CRITICAL_KILL_SWITCHES.includes(editingFlag.key || "") && (
            <>
              <Typography gutterBottom>Rollout Percentage: {editingFlag.rolloutPercent || 100}%</Typography>
              <Slider
                value={editingFlag.rolloutPercent || 100}
                onChange={(e, value) => setEditingFlag({ ...editingFlag, rolloutPercent: value as number })}
                min={0}
                max={100}
                marks
                valueLabelDisplay="auto"
              />

              <TextField
                fullWidth
                label="Description"
                value={editingFlag.description || ""}
                onChange={(e) => setEditingFlag({ ...editingFlag, description: e.target.value })}
                multiline
                rows={2}
                sx={{ mt: 2 }}
              />
            </>
          )}

          <TextField
            fullWidth
            label="Reason for Change"
            value={changeReason}
            onChange={(e) => setChangeReason(e.target.value)}
            required={CRITICAL_KILL_SWITCHES.includes(editingFlag.key || "")}
            multiline
            rows={3}
            sx={{ mt: 2 }}
            placeholder="Explain why you're making this change..."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSaveFlag} variant="contained" color="primary">
            Save Changes
          </Button>
        </DialogActions>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={historyOpen} onClose={() => setHistoryOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          Flag History: {selectedFlag?.key}
        </DialogTitle>
        <DialogContent>
          {flagHistory.length === 0 ? (
            <Typography color="text.secondary">No history available</Typography>
          ) : (
            <List>
              {flagHistory.map((change, index) => (
                <React.Fragment key={index}>
                  <ListItem alignItems="flex-start">
                    <ListItemText
                      primary={
                        <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                          <Typography variant="subtitle2">
                            Changed by: {change.changedBy}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {new Date(change.timestamp).toLocaleString()}
                          </Typography>
                        </Box>
                      }
                      secondary={
                        <>
                          <Typography variant="body2" component="span">
                            {change.previousState.enabled ? "Enabled" : "Disabled"} →{" "}
                            {change.newState.enabled ? "Enabled" : "Disabled"}
                          </Typography>
                          {change.reason && (
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                              Reason: {change.reason}
                            </Typography>
                          )}
                        </>
                      }
                    />
                  </ListItem>
                  {index < flagHistory.length - 1 && <Divider />}
                </React.Fragment>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHistoryOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default FeatureFlagPanel;
