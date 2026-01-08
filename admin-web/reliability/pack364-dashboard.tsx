/**
 * PACK 364 — Observability, Error Budgets & SLA Dashboard
 * Admin Reliability Cockpit
 * 
 * View-only analytics dashboard for monitoring Avalo's reliability.
 * Displays SLO status, error budgets, metrics, and system health.
 */

import React, { useState, useEffect } from "react";
import {
  Box,
  Card,
  CardContent,
  Tab,
  Tabs,
  Typography,
  Grid,
  LinearProgress,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Alert
} from "@mui/material";
import {
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  TrendingUp as TrendingUpIcon,
  Speed as SpeedIcon
} from "@mui/icons-material";

interface SLOStatus {
  id: string;
  name: string;
  domain: string;
  target: number;
  current: number;
  errorBudgetRemaining: number;
  status: "healthy" | "warning" | "critical";
}

interface MetricDataPoint {
  timestamp: number;
  value: number;
}

interface AlertSummary {
  total: number;
  critical: number;
  warning: number;
  info: number;
  unacknowledged: number;
}

export default function ReliabilityDashboard() {
  const [activeTab, setActiveTab] = useState(0);
  const [sloStatuses, setSLOStatuses] = useState<SLOStatus[]>([]);
  const [alerts, setAlerts] = useState<AlertSummary>({
    total: 0,
    critical: 0,
    warning: 0,
    info: 0,
    unacknowledged: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
    const interval = setInterval(loadDashboardData, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  const loadDashboardData = async () => {
    try {
      // In production, these would be actual API calls
      // For now, provide example data structure
      
      setSLOStatuses([
        {
          id: "slo_chat_delivery",
          name: "Chat Delivery",
          domain: "chat",
          target: 99.5,
          current: 99.8,
          errorBudgetRemaining: 60,
          status: "healthy"
        },
        {
          id: "slo_wallet_operations",
          name: "Wallet Operations",
          domain: "wallet",
          target: 99.8,
          current: 99.9,
          errorBudgetRemaining: 75,
          status: "healthy"
        },
        {
          id: "slo_panic_safety",
          name: "Panic/Safety",
          domain: "safety",
          target: 100,
          current: 100,
          errorBudgetRemaining: 90,
          status: "healthy"
        },
        {
          id: "slo_ai_companions",
          name: "AI Companions",
          domain: "ai",
          target: 99.0,
          current: 98.2,
          errorBudgetRemaining: 20,
          status: "warning"
        },
        {
          id: "slo_support_system",
          name: "Support System",
          domain: "support",
          target: 99.9,
          current: 99.95,
          errorBudgetRemaining: 85,
          status: "healthy"
        },
        {
          id: "slo_api_overall",
          name: "API Overall",
          domain: "infra",
          target: 99.0,
          current: 99.3,
          errorBudgetRemaining: 70,
          status: "healthy"
        }
      ]);

      setAlerts({
        total: 12,
        critical: 1,
        warning: 5,
        info: 6,
        unacknowledged: 3
      });

      setLoading(false);
    } catch (error) {
      console.error("Failed to load dashboard data:", error);
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "healthy":
        return <CheckCircleIcon sx={{ color: "success.main" }} />;
      case "warning":
        return <WarningIcon sx={{ color: "warning.main" }} />;
      case "critical":
        return <ErrorIcon sx={{ color: "error.main" }} />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "healthy":
        return "success";
      case "warning":
        return "warning";
      case "critical":
        return "error";
      default:
        return "default";
    }
  };

  const getBudgetColor = (remaining: number) => {
    if (remaining >= 50) return "success";
    if (remaining >= 20) return "warning";
    return "error";
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Reliability Dashboard
      </Typography>
      <Typography variant="body2" color="text.secondary" paragraph>
        Real-time monitoring of Avalo's SLOs, error budgets, and system health
      </Typography>

      {/* Alert Summary */}
      {alerts.unacknowledged > 0 && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          <strong>{alerts.unacknowledged} unacknowledged alert(s)</strong> - 
          {alerts.critical > 0 && ` ${alerts.critical} critical`}
          {alerts.warning > 0 && ` ${alerts.warning} warnings`}
        </Alert>
      )}

      <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)} sx={{ mb: 3 }}>
        <Tab label="Overview" />
        <Tab label="Chat & Realtime" />
        <Tab label="Wallet & Payments" />
        <Tab label="Safety & Panic" />
        <Tab label="AI & Support" />
        <Tab label="Infrastructure" />
      </Tabs>

      {/* Overview Tab */}
      {activeTab === 0 && (
        <Box>
          <Grid container spacing={3}>
            {/* SLO Status Cards */}
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>
                SLO Status Overview
              </Typography>
            </Grid>

            {sloStatuses.map((slo) => (
              <Grid item xs={12} md={6} lg={4} key={slo.id}>
                <Card>
                  <CardContent>
                    <Box display="flex" alignItems="center" mb={2}>
                      {getStatusIcon(slo.status)}
                      <Typography variant="h6" ml={1}>
                        {slo.name}
                      </Typography>
                    </Box>

                    <Chip
                      label={slo.domain}
                      size="small"
                      sx={{ mb: 2 }}
                    />

                    <Box mb={2}>
                      <Typography variant="body2" color="text.secondary">
                        Current: {slo.current}% (Target: {slo.target}%)
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={(slo.current / slo.target) * 100}
                        color={getStatusColor(slo.status) as any}
                        sx={{ mt: 1 }}
                      />
                    </Box>

                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        Error Budget Remaining
                      </Typography>
                      <Box display="flex" alignItems="center" mt={1}>
                        <LinearProgress
                          variant="determinate"
                          value={slo.errorBudgetRemaining}
                          color={getBudgetColor(slo.errorBudgetRemaining) as any}
                          sx={{ flexGrow: 1, mr: 1 }}
                        />
                        <Typography variant="body2" fontWeight="bold">
                          {slo.errorBudgetRemaining}%
                        </Typography>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}

            {/* Quick Stats */}
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom mt={3}>
                System Health
              </Typography>
            </Grid>

            <Grid item xs={12} md={4}>
              <Card>
                <CardContent>
                  <Box display="flex" alignItems="center">
                    <SpeedIcon sx={{ fontSize: 40, color: "primary.main", mr: 2 }} />
                    <Box>
                      <Typography variant="h4">99.6%</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Overall Uptime (30d)
                      </Typography>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={4}>
              <Card>
                <CardContent>
                  <Box display="flex" alignItems="center">
                    <TrendingUpIcon sx={{ fontSize: 40, color: "success.main", mr: 2 }} />
                    <Box>
                      <Typography variant="h4">245ms</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Avg Response Time
                      </Typography>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={4}>
              <Card>
                <CardContent>
                  <Box display="flex" alignItems="center">
                    <ErrorIcon sx={{ fontSize: 40, color: "warning.main", mr: 2 }} />
                    <Box>
                      <Typography variant="h4">0.8%</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Error Rate (24h)
                      </Typography>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Box>
      )}

      {/* Chat & Realtime Tab */}
      {activeTab === 1 && (
        <Box>
          <Typography variant="h6" gutterBottom>
            Chat & Realtime Metrics
          </Typography>
          
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="subtitle1" gutterBottom>
                    Message Volume
                  </Typography>
                  <Typography variant="h4">1.2M</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Messages delivered (24h)
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="subtitle1" gutterBottom>
                    Delivery Latency (P95)
                  </Typography>
                  <Typography variant="h4">280ms</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Target: &lt;300ms
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12}>
              <Card>
                <CardContent>
                  <Typography variant="subtitle1" gutterBottom>
                    Error Rate
                  </Typography>
                  <Typography variant="h4" color="success.main">
                    0.2%
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Well below 0.5% threshold
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Box>
      )}

      {/* Wallet & Payments Tab */}
      {activeTab === 2 && (
        <Box>
          <Typography variant="h6" gutterBottom>
            Wallet & Payment Metrics
          </Typography>
          
          <Grid container spacing={3}>
            <Grid item xs={12} md={4}>
              <Card>
                <CardContent>
                  <Typography variant="subtitle1" gutterBottom>
                    Transaction Volume
                  </Typography>
                  <Typography variant="h4">45.2K</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Transactions (24h)
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={4}>
              <Card>
                <CardContent>
                  <Typography variant="subtitle1" gutterBottom>
                    Success Rate
                  </Typography>
                  <Typography variant="h4" color="success.main">
                    99.9%
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Target: ≥99.8%
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={4}>
              <Card>
                <CardContent>
                  <Typography variant="subtitle1" gutterBottom>
                    Avg Latency
                  </Typography>
                  <Typography variant="h4">180ms</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Transaction processing
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Box>
      )}

      {/* Safety & Panic Tab */}
      {activeTab === 3 && (
        <Box>
          <Typography variant="h6" gutterBottom>
            Safety & Panic Metrics
          </Typography>
          
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="subtitle1" gutterBottom>
                    Panic Events (24h)
                  </Typography>
                  <Typography variant="h4">12</Typography>
                  <Typography variant="body2" color="text.secondary">
                    All processed successfully
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="subtitle1" gutterBottom>
                    Processing Latency (P95)
                  </Typography>
                  <Typography variant="h4" color="success.main">
                    1.2s
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Target: &lt;2s (100% success)
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Box>
      )}

      {/* AI & Support Tab */}
      {activeTab === 4 && (
        <Box>
          <Typography variant="h6" gutterBottom>
            AI & Support Metrics
          </Typography>
          
          <Grid container spacing={3}>
            <Grid item xs={12} md={4}>
              <Card>
                <CardContent>
                  <Typography variant="subtitle1" gutterBottom>
                    AI Requests (24h)
                  </Typography>
                  <Typography variant="h4">8.5K</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Companion interactions
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={4}>
              <Card>
                <CardContent>
                  <Typography variant="subtitle1" gutterBottom>
                    AI Success Rate
                  </Typography>
                  <Typography variant="h4" color="warning.main">
                    98.2%
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Target: ≥99.0%
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={4}>
              <Card>
                <CardContent>
                  <Typography variant="subtitle1" gutterBottom>
                    Support Tickets
                  </Typography>
                  <Typography variant="h4">234</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Created (24h)
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Box>
      )}

      {/* Infrastructure Tab */}
      {activeTab === 5 && (
        <Box>
          <Typography variant="h6" gutterBottom>
            Infrastructure Metrics
          </Typography>
          
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="subtitle1" gutterBottom>
                    API Error Rate
                  </Typography>
                  <Typography variant="h4" color="success.main">
                    0.8%
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Target: ≤1.0%
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="subtitle1" gutterBottom>
                    Avg Region Latency
                  </Typography>
                  <Typography variant="h4">245ms</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Global average
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12}>
              <Card>
                <CardContent>
                  <Typography variant="subtitle1" gutterBottom>
                    Top Slow Endpoints
                  </Typography>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Endpoint</TableCell>
                          <TableCell align="right">P95 Latency</TableCell>
                          <TableCell align="right">Requests (24h)</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        <TableRow>
                          <TableCell>/api/ai/complete</TableCell>
                          <TableCell align="right">2.1s</TableCell>
                          <TableCell align="right">8,523</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>/api/events/search</TableCell>
                          <TableCell align="right">850ms</TableCell>
                          <TableCell align="right">12,453</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>/api/wallet/history</TableCell>
                          <TableCell align="right">620ms</TableCell>
                          <TableCell align="right">5,234</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </TableContainer>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Box>
      )}
    </Box>
  );
}
