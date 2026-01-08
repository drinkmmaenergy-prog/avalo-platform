/**
 * PACK 367 — ASO, Reviews, Reputation & Store Defense Engine
 * Reputation & Ratings Dashboard
 * 
 * Monitor app store ratings, review anomalies, and reputation metrics.
 */

import React, { useState, useEffect } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Alert,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  LinearProgress,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
} from "@mui/material";
import {
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Star as StarIcon,
  Close as CloseIcon,
} from "@mui/icons-material";

// Types
interface RatingSnapshot {
  platform: "android" | "ios";
  country: string;
  capturedAt: number;
  avgRating: number;
  totalRatings: number;
  ratingsBreakdown: { "1": number; "2": number; "3": number; "4": number; "5": number };
  suspiciousSpike?: boolean;
}

interface ReviewAnomaly {
  id: string;
  platform: "android" | "ios";
  country: string;
  detectedAt: number;
  anomalyType: string;
  severity: "low" | "medium" | "high" | "critical";
  metrics: {
    previousAvg: number;
    currentAvg: number;
    delta: number;
    timeWindowHours: number;
  };
  status: "new" | "investigating" | "resolved" | "false_positive";
}

export function ReputationDashboard() {
  const [platform, setPlatform] = useState<"android" | "ios">("android");
  const [country, setCountry] = useState<string>("ALL");
  const [loading, setLoading] = useState(false);
  const [ratingData, setRatingData] = useState<RatingSnapshot[]>([]);
  const [anomalies, setAnomalies] = useState<ReviewAnomaly[]>([]);
  const [selectedAnomaly, setSelectedAnomaly] = useState<ReviewAnomaly | null>(null);

  const countries = ["ALL", "PL", "US", "GB", "DE", "FR", "ES", "IT", "BR", "JP"];

  useEffect(() => {
    loadDashboardData();
  }, [platform, country]);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      // Load rating snapshots
      const ratingsResponse = await fetch(
        `/api/admin/store/ratings?platform=${platform}&country=${country}&days=30`
      );
      if (ratingsResponse.ok) {
        setRatingData(await ratingsResponse.json());
      }

      // Load anomalies
      const anomaliesResponse = await fetch(
        `/api/admin/store/anomalies?platform=${platform}&country=${country}&status=new,investigating`
      );
      if (anomaliesResponse.ok) {
        setAnomalies(await anomaliesResponse.json());
      }
    } catch (error) {
      console.error("Failed to load dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const latestSnapshot = ratingData.length > 0 ? ratingData[ratingData.length - 1] : null;
  const previousSnapshot = ratingData.length > 1 ? ratingData[ratingData.length - 2] : null;
  const ratingTrend = latestSnapshot && previousSnapshot 
    ? latestSnapshot.avgRating - previousSnapshot.avgRating 
    : 0;

  const criticalAnomalies = anomalies.filter(a => a.severity === "critical").length;
  const highAnomalies = anomalies.filter(a => a.severity === "high").length;

  const resolveAnomaly = async (anomalyId: string, status: "resolved" | "false_positive") => {
    try {
      await fetch(`/api/admin/store/anomalies/${anomalyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      
      setSelectedAnomaly(null);
      loadDashboardData();
    } catch (error) {
      console.error("Failed to update anomaly:", error);
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Reputation & Ratings Dashboard
      </Typography>
      <Typography variant="body2" color="text.secondary" paragraph>
        Monitor app store ratings, trends, and review anomalies
      </Typography>

      {/* Filters */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={4}>
              <FormControl fullWidth>
                <InputLabel>Platform</InputLabel>
                <Select
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value as "android" | "ios")}
                  label="Platform"
                >
                  <MenuItem value="android">Android (Google Play)</MenuItem>
                  <MenuItem value="ios">iOS (App Store)</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} md={4}>
              <FormControl fullWidth>
                <InputLabel>Country</InputLabel>
                <Select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  label="Country"
                >
                  {countries.map((c) => (
                    <MenuItem key={c} value={c}>{c}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} md={4}>
              <Button
                fullWidth
                variant="outlined"
                onClick={loadDashboardData}
                disabled={loading}
              >
                Refresh Data
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {loading && <LinearProgress />}

      {/* Alert Banner for Critical Anomalies */}
      {criticalAnomalies > 0 && (
        <Alert severity="error" sx={{ mb: 3 }} icon={<WarningIcon />}>
          <Typography variant="subtitle2">
            {criticalAnomalies} critical anomal{criticalAnomalies > 1 ? "ies" : "y"} detected!
          </Typography>
        </Alert>
      )}

      {/* Key Metrics */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {/* Average Rating */}
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Average Rating
              </Typography>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <StarIcon color="warning" />
                <Typography variant="h4">
                  {latestSnapshot?.avgRating.toFixed(2) || "N/A"}
                </Typography>
                {ratingTrend !== 0 && (
                  <Chip
                    size="small"
                    label={`${ratingTrend > 0 ? "+" : ""}${ratingTrend.toFixed(2)}`}
                    color={ratingTrend > 0 ? "success" : "error"}
                    icon={ratingTrend > 0 ? <TrendingUpIcon /> : <TrendingDownIcon />}
                  />
                )}
              </Box>
              <Typography variant="caption" color="text.secondary">
                {latestSnapshot?.totalRatings.toLocaleString() || 0} total ratings
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Active Anomalies */}
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Active Anomalies
              </Typography>
              <Typography variant="h4">
                {anomalies.length}
              </Typography>
              <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
                {criticalAnomalies > 0 && (
                  <Chip size="small" label={`${criticalAnomalies} Critical`} color="error" />
                )}
                {highAnomalies > 0 && (
                  <Chip size="small" label={`${highAnomalies} High`} color="warning" />
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* 5-Star Percentage */}
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                5-Star Percentage
              </Typography>
              <Typography variant="h4">
                {latestSnapshot
                  ? ((latestSnapshot.ratingsBreakdown["5"] / latestSnapshot.totalRatings) * 100).toFixed(1)
                  : "0"}%
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {latestSnapshot?.ratingsBreakdown["5"].toLocaleString() || 0} reviews
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* 1-Star Percentage */}
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                1-Star Percentage
              </Typography>
              <Typography variant="h4">
                {latestSnapshot
                  ? ((latestSnapshot.ratingsBreakdown["1"] / latestSnapshot.totalRatings) * 100).toFixed(1)
                  : "0"}%
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {latestSnapshot?.ratingsBreakdown["1"].toLocaleString() || 0} reviews
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Rating Breakdown */}
      {latestSnapshot && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Rating Breakdown
            </Typography>
            <Box>
              {[5, 4, 3, 2, 1].map((stars) => {
                const count = latestSnapshot.ratingsBreakdown[stars.toString() as "1"];
                const percentage = (count / latestSnapshot.totalRatings) * 100;
                return (
                  <Box key={stars} sx={{ display: "flex", alignItems: "center", mb: 1 }}>
                    <Typography sx={{ minWidth: 80 }}>
                      {stars} <StarIcon fontSize="small" sx={{ verticalAlign: "middle" }} />
                    </Typography>
                    <LinearProgress
                      variant="determinate"
                      value={percentage}
                      sx={{ flexGrow: 1, mr: 2, height: 10, borderRadius: 5 }}
                    />
                    <Typography sx={{ minWidth: 80 }}>
                      {count.toLocaleString()} ({percentage.toFixed(1)}%)
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Anomalies Table */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Review Anomalies
          </Typography>
          
          {anomalies.length === 0 ? (
            <Box sx={{ textAlign: "center", py: 3 }}>
              <CheckCircleIcon color="success" sx={{ fontSize: 48, mb: 2 }} />
              <Typography color="text.secondary">
                No active anomalies detected
              </Typography>
            </Box>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Detected</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Severity</TableCell>
                  <TableCell>Country</TableCell>
                  <TableCell>Rating Change</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {anomalies.map((anomaly) => (
                  <TableRow key={anomaly.id}>
                    <TableCell>
                      {new Date(anomaly.detectedAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>{anomaly.anomalyType.replace(/_/g, " ")}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={anomaly.severity}
                        color={
                          anomaly.severity === "critical" ? "error" :
                          anomaly.severity === "high" ? "warning" :
                          anomaly.severity === "medium" ? "info" : "default"
                        }
                      />
                    </TableCell>
                    <TableCell>{anomaly.country}</TableCell>
                    <TableCell>
                      {anomaly.metrics.previousAvg.toFixed(2)} → {anomaly.metrics.currentAvg.toFixed(2)}
                      <Typography variant="caption" display="block" color="error">
                        ({anomaly.metrics.delta.toFixed(2)})
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip size="small" label={anomaly.status} />
                    </TableCell>
                    <TableCell>
                      <Button
                        size="small"
                        onClick={() => setSelectedAnomaly(anomaly)}
                      >
                        Details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Anomaly Details Dialog */}
      <Dialog
        open={!!selectedAnomaly}
        onClose={() => setSelectedAnomaly(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Anomaly Details
          <IconButton
            onClick={() => setSelectedAnomaly(null)}
            sx={{ position: "absolute", right: 8, top: 8 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {selectedAnomaly && (
            <Box>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="subtitle2">Type</Typography>
                  <Typography>{selectedAnomaly.anomalyType.replace(/_/g, " ")}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="subtitle2">Severity</Typography>
                  <Chip label={selectedAnomaly.severity} color={
                    selectedAnomaly.severity === "critical" ? "error" : "warning"
                  } />
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="subtitle2">Platform</Typography>
                  <Typography>{selectedAnomaly.platform}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="subtitle2">Country</Typography>
                  <Typography>{selectedAnomaly.country}</Typography>
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="subtitle2">Rating Change</Typography>
                  <Typography>
                    {selectedAnomaly.metrics.previousAvg.toFixed(2)} → {selectedAnomaly.metrics.currentAvg.toFixed(2)}
                    ({selectedAnomaly.metrics.delta > 0 ? "+" : ""}{selectedAnomaly.metrics.delta.toFixed(2)})
                  </Typography>
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="subtitle2">Time Window</Typography>
                  <Typography>{selectedAnomaly.metrics.timeWindowHours.toFixed(1)} hours</Typography>
                </Grid>
              </Grid>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedAnomaly(null)}>
            Cancel
          </Button>
          <Button
            onClick={() => selectedAnomaly && resolveAnomaly(selectedAnomaly.id, "false_positive")}
            color="warning"
          >
            Mark False Positive
          </Button>
          <Button
            onClick={() => selectedAnomaly && resolveAnomaly(selectedAnomaly.id, "resolved")}
            color="success"
            variant="contained"
          >
            Mark Resolved
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default ReputationDashboard;
