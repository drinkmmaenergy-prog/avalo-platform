/**
 * PACK 365 — Launch Readiness Checklist UI
 * 
 * Purpose: Pre-launch validation dashboard and readiness verification
 * Phase: ETAP B — Pre-Launch Hardening
 */

import React, { useState, useEffect } from "react";
import {
  Box,
  Button,
 Card,
  CardContent,
  Typography,
  Grid,
  Chip,
  LinearProgress,
  Alert,
  AlertTitle,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Tooltip,
} from "@mui/material";
import {
  CheckCircle as CheckIcon,
  Cancel as CancelIcon,
  Warning as WarningIcon,
  ExpandMore as ExpandIcon,
  Refresh as RefreshIcon,
  PlayArrow as LaunchIcon,
  Description as DescIcon,
} from "@mui/icons-material";

interface ChecklistItem {
  key: string;
  domain: string;
  description: string;
  passed: boolean;
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  blocking: boolean;
  verifiedBy?: string;
  verifiedAt?: number;
  notes?: string;
}

interface DomainReadiness {
  domain: string;
  total: number;
  passed: number;
  failed: number;
  readyForLaunch: boolean;
}

interface ReadinessReport {
  timestamp: number;
  ready: boolean;
  totalItems: number;
  passedItems: number;
  blockingIssues: string[];
  criticalIssues: string[];
  warnings: string[];
  domains: Record<string, DomainReadiness>;
}

const DOMAIN_ICONS: Record<string, string> = {
  auth: "🔐",
  chat: "💬",
  wallet: "💰",
  calendar: "📅",
  events: "🎪",
  safety: "🛡️",
  support: "🎧",
  ai: "🤖",
  legal: "⚖️",
  infra: "🏗️",
  monitoring: "📊",
  backup: "💾",
};

export const LaunchReadinessPanel: React.FC = () => {
  const [report, setReport] = useState<ReadinessReport | null>(null);
  const [checklist, setChecklist] = useState<Record<string, ChecklistItem>>({});
  const [loading, setLoading] = useState(false);
  const [verifyDialogOpen, setVerifyDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ChecklistItem | null>(null);
  const [verificationNotes, setVerificationNotes] = useState("");
  const [alert, setAlert] = useState<{ type: "success" | "error" | "warning"; message: string } | null>(null);

  useEffect(() => {
    loadReadinessData();
  }, []);

  const loadReadinessData = async () => {
    setLoading(true);
    try {
      // Load checklist
      const checklistResponse = await fetch("/api/admin/launch-checklist");
      const checklistData = await checklistResponse.json();
      setChecklist(checklistData.items || {});

      // Load readiness report
      const reportResponse = await fetch("/api/admin/launch-checklist/report");
      const reportData = await reportResponse.json();
      setReport(reportData);
    } catch (error) {
      console.error("Error loading readiness data:", error);
      showAlert("error", "Failed to load readiness data");
    } finally {
      setLoading(false);
    }
  };

  const showAlert = (type: "success" | "error" | "warning", message: string) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 5000);
  };

  const handleVerifyItem = async () => {
    if (!selectedItem) return;

    try {
      const response = await fetch("/api/admin/launch-checklist/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: selectedItem.key,
          notes: verificationNotes,
        }),
      });

      if (!response.ok) throw new Error("Failed to verify item");

      showAlert("success", `Item "${selectedItem.description}" verified successfully`);
      setVerifyDialogOpen(false);
      setVerificationNotes("");
      loadReadinessData();
    } catch (error) {
      console.error("Error verifying item:", error);
      showAlert("error", "Failed to verify checklist item");
    }
  };

  const handleOpenVerify = (item: ChecklistItem) => {
    setSelectedItem(item);
    setVerifyDialogOpen(true);
  };

  const handleResetItem = async (item: ChecklistItem) => {
    if (!confirm(`Reset verification for "${item.description}"?`)) return;

    try {
      const response = await fetch("/api/admin/launch-checklist/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: item.key }),
      });

      if (!response.ok) throw new Error("Failed to reset item");

      showAlert("success", "Item reset successfully");
      loadReadinessData();
    } catch (error) {
      console.error("Error resetting item:", error);
      showAlert("error", "Failed to reset item");
    }
  };

  const getPriorityColor = (priority: string): "error" | "warning" | "info" | "default" => {
    switch (priority) {
      case "CRITICAL":
        return "error";
      case "HIGH":
        return "warning";
      case "MEDIUM":
        return "info";
      default:
        return "default";
    }
  };

  const getProgressPercentage = () => {
    if (!report) return 0;
    return Math.round((report.passedItems / report.totalItems) * 100);
  };

  // Group items by domain
  const groupedItems: Record<string, ChecklistItem[]> = {};
  Object.values(checklist).forEach((item) => {
    if (!groupedItems[item.domain]) {
      groupedItems[item.domain] = [];
    }
    groupedItems[item.domain].push(item);
  });

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Typography variant="h4" fontWeight="bold">
          Production Launch Readiness
        </Typography>
        <Box sx={{ display: "flex", gap: 2 }}>
          <IconButton onClick={loadReadinessData} disabled={loading}>
            <RefreshIcon />
          </IconButton>
          {report?.ready && (
            <Button
              variant="contained"
              color="success"
              startIcon={<LaunchIcon />}
              size="large"
            >
              Ready to Launch
            </Button>
          )}
        </Box>
      </Box>

      {alert && (
        <Alert severity={alert.type} sx={{ mb: 2 }} onClose={() => setAlert(null)}>
          <AlertTitle>{alert.type === "error" ? "Error" : alert.type === "warning" ? "Warning" : "Success"}</AlertTitle>
          {alert.message}
        </Alert>
      )}

      {/* Overall Progress */}
      {report && (
        <Card sx={{ mb: 3, bgcolor: report.ready ? "success.light" : "warning.light" }}>
          <CardContent>
            <Grid container spacing={3} alignItems="center">
              <Grid item xs={12} md={8}>
                <Typography variant="h5" gutterBottom>
                  Overall Progress: {report.passedItems} / {report.totalItems}
                </Typography>
                <LinearProgress
                  variant="determinate"
                  value={getProgressPercentage()}
                  sx={{ height: 10, borderRadius: 5, mb: 2 }}
                />
                <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                  <Chip
                    icon={<CheckIcon />}
                    label={`${report.passedItems} Passed`}
                    color="success"
                  />
                  <Chip
                    icon={<CancelIcon />}
                    label={`${report.totalItems - report.passedItems} Remaining`}
                    color="default"
                  />
                  {report.blockingIssues.length > 0 && (
                    <Chip
                      icon={<WarningIcon />}
                      label={`${report.blockingIssues.length} Blocking`}
                      color="error"
                    />
                  )}
                </Box>
              </Grid>
              <Grid item xs={12} md={4} sx={{ textAlign: "center" }}>
                {report.ready ? (
                  <Box>
                    <CheckIcon sx={{ fontSize: 80, color: "success.main" }} />
                    <Typography variant="h6" color="success.main">
                      Ready for Production!
                    </Typography>
                  </Box>
                ) : (
                  <Box>
                    <WarningIcon sx={{ fontSize: 80, color: "warning.main" }} />
                    <Typography variant="h6" color="warning.main">
                      Not Ready Yet
                    </Typography>
                  </Box>
                )}
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}

      {/* Blocking Issues */}
      {report && report.blockingIssues.length > 0 && (
        <Alert severity="error" sx={{ mb: 3 }}>
          <AlertTitle>Blocking Issues ({report.blockingIssues.length})</AlertTitle>
          <List dense>
            {report.blockingIssues.map((issue, index) => (
              <ListItem key={index}>
                <ListItemText primary={issue} />
              </ListItem>
            ))}
          </List>
        </Alert>
      )}

      {/* Critical Issues */}
      {report && report.criticalIssues.length > 0 && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          <AlertTitle>Critical Issues ({report.criticalIssues.length})</AlertTitle>
          <List dense>
            {report.criticalIssues.map((issue, index) => (
              <ListItem key={index}>
                <ListItemText primary={issue} />
              </ListItem>
            ))}
          </List>
        </Alert>
      )}

      {/* Checklist by Domain */}
      <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>
        Checklist by Domain
      </Typography>

      {Object.entries(groupedItems).map(([domain, items]) => {
        const domainData = report?.domains[domain];
        const progress = domainData ? (domainData.passed / domainData.total) * 100 : 0;

        return (
          <Accordion key={domain} defaultExpanded={!domainData?.readyForLaunch}>
            <AccordionSummary expandIcon={<ExpandIcon />}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 2, width: "100%" }}>
                <Typography variant="h6">
                  {DOMAIN_ICONS[domain] || "📋"} {domain.toUpperCase()}
                </Typography>
                <Box sx={{ flex: 1, mx: 2 }}>
                  <LinearProgress variant="determinate" value={progress} />
                </Box>
                <Typography variant="body2">
                  {domainData?.passed || 0} / {domainData?.total || items.length}
                </Typography>
                {domainData?.readyForLaunch ? (
                  <CheckIcon color="success" />
                ) : (
                  <WarningIcon color="warning" />
                )}
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <List>
                {items.map((item) => (
                  <ListItem
                    key={item.key}
                    sx={{
                      bgcolor: item.passed ? "success.light" : "background.paper",
                      mb: 1,
                      borderRadius: 1,
                      opacity: item.passed ? 0.7 : 1,
                    }}
                  >
                    <ListItemIcon>
                      {item.passed ? (
                        <CheckIcon color="success" />
                      ) : (
                        <CancelIcon color="error" />
                      )}
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          <Typography>{item.description}</Typography>
                          {item.blocking && (
                            <Chip label="BLOCKING" size="small" color="error" />
                          )}
                          <Chip
                            label={item.priority}
                            size="small"
                            color={getPriorityColor(item.priority)}
                          />
                        </Box>
                      }
                      secondary={
                        item.passed
                          ? `Verified by ${item.verifiedBy} on ${new Date(
                              item.verifiedAt!
                            ).toLocaleString()}`
                          : "Not verified"
                      }
                    />
                    <Box sx={{ display: "flex", gap: 1 }}>
                      {!item.passed ? (
                        <Button
                          variant="contained"
                          size="small"
                          color="primary"
                          onClick={() => handleOpenVerify(item)}
                        >
                          Verify
                        </Button>
                      ) : (
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={() => handleResetItem(item)}
                        >
                          Reset
                        </Button>
                      )}
                      {item.notes && (
                        <Tooltip title={item.notes}>
                          <IconButton size="small">
                            <DescIcon />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  </ListItem>
                ))}
              </List>
            </AccordionDetails>
          </Accordion>
        );
      })}

      {/* Verify Dialog */}
      <Dialog open={verifyDialogOpen} onClose={() => setVerifyDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Verify Checklist Item</DialogTitle>
        <DialogContent>
          {selectedItem && (
            <>
              <Typography variant="subtitle2" gutterBottom>
                {selectedItem.description}
              </Typography>
              <Alert severity="info" sx={{ my: 2 }}>
                Please confirm that you have personally verified this item is working correctly.
              </Alert>
              <TextField
                fullWidth
                label="Verification Notes (Optional)"
                value={verificationNotes}
                onChange={(e) => setVerificationNotes(e.target.value)}
                multiline
                rows={4}
                placeholder="Add any relevant notes about the verification..."
              />
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setVerifyDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleVerifyItem} variant="contained" color="primary">
            Confirm Verification
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default LaunchReadinessPanel;
