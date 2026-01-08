/**
 * PACK 348 — Admin Ranking Control Panel
 * 
 * Real-time algorithm steering interface for Discovery, Feed, Swipe, and AI ranking
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Typography,
  Tabs,
  Tab,
  Slider,
  Button,
  TextField,
  Select,
  MenuItem,
  Card,
  CardContent,
  Grid,
  Switch,
  FormControlLabel,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Alert,
} from '@mui/material';
import { ExpandMore, Save, History, Science } from '@mui/icons-material';
import { doc, getDoc, setDoc, collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface RankingEngineConfig {
  discovery: {
    distanceWeight: number;
    activityWeight: number;
    ratingWeight: number;
    earningsWeight: number;
    refundPenaltyWeight: number;
    mismatchPenaltyWeight: number;
  };
  feed: {
    recencyWeight: number;
    engagementWeight: number;
    viralWeight: number;
    boostWeight: number;
  };
  swipe: {
    attractivenessWeight: number;
    responseTimeWeight: number;
    activityWeight: number;
    reportPenaltyWeight: number;
  };
  ai: {
    ratingWeight: number;
    voiceUsageWeight: number;
    chatUsageWeight: number;
    abusePenaltyWeight: number;
  };
  decay: {
    inactivityDecayPerDay: number;
    refundDecayPerEvent: number;
  };
}

interface SafetyPenaltyConfig {
  refundRatioThreshold: number;
  refundRatioPenalty: number;
  mismatchRateThreshold: number;
  mismatchRatePenalty: number;
  panicUsageThreshold: number;
  panicUsagePenalty: number;
  blockingRateThreshold: number;
  blockingRatePenalty: number;
  reportFrequencyThreshold: number;
  reportFrequencyPenalty: number;
  enableAutoSuppression: boolean;
}

export default function RankingControlPanel() {
  const [activeTab, setActiveTab] = useState(0);
  const [config, setConfig] = useState<RankingEngineConfig | null>(null);
  const [safetyConfig, setSafetyConfig] = useState<SafetyPenaltyConfig | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string>('global');
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  // Load configuration
  useEffect(() => {
    loadConfig();
    loadSafetyConfig();
    loadAuditLogs();
  }, [selectedCountry]);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const configRef = doc(db, 'system', 'rankingEngine');
      const configSnap = await getDoc(configRef);
      
      if (configSnap.exists()) {
        setConfig(configSnap.data() as RankingEngineConfig);
      }
    } catch (error) {
      console.error('Error loading config:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSafetyConfig = async () => {
    try {
      const safetyRef = doc(db, 'system', 'safetyPenalties');
      const safetySnap = await getDoc(safetyRef);
      
      if (safetySnap.exists()) {
        setSafetyConfig(safetySnap.data() as SafetyPenaltyConfig);
      }
    } catch (error) {
      console.error('Error loading safety config:', error);
    }
  };

  const loadAuditLogs = async () => {
    try {
      const logsRef = collection(db, 'system', 'rankingAuditLogs', 'logs');
      const logsQuery = query(logsRef, orderBy('timestamp', 'desc'), limit(20));
      const logsSnap = await getDocs(logsQuery);
      
      setAuditLogs(logsSnap.docs.map(doc => doc.data()));
    } catch (error) {
      console.error('Error loading audit logs:', error);
    }
  };

  const handleSaveConfig = async () => {
    if (!config) return;

    try {
      setLoading(true);
      const configRef = doc(db, 'system', 'rankingEngine');
      await setDoc(configRef, config);

      // Log audit
      const auditRef = doc(collection(db, 'system', 'rankingAuditLogs', 'logs'));
      await setDoc(auditRef, {
        timestamp: Date.now(),
        adminId: 'current-admin-id', // Would get from auth
        adminEmail: 'admin@avalo.com',
        action: 'update_global',
        after: config,
        reversible: true,
      });

      setSaveMessage('✅ Configuration saved successfully');
      setTimeout(() => setSaveMessage(''), 3000);
      await loadAuditLogs();
    } catch (error) {
      console.error('Error saving config:', error);
      setSaveMessage('❌ Error saving configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSafetyConfig = async () => {
    if (!safetyConfig) return;

    try {
      setLoading(true);
      const safetyRef = doc(db, 'system', 'safetyPenalties');
      await setDoc(safetyRef, safetyConfig);

      setSaveMessage('✅ Safety configuration saved successfully');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (error) {
      console.error('Error saving safety config:', error);
      setSaveMessage('❌ Error saving safety configuration');
    } finally {
      setLoading(false);
    }
  };

  const updateWeight = (category: keyof RankingEngineConfig, key: string, value: number) => {
    if (!config) return;

    setConfig({
      ...config,
      [category]: {
        ...config[category],
        [key]: value,
      },
    });
  };

  const renderWeightSlider = (
    label: string,
    category: keyof RankingEngineConfig,
    key: string,
    value: number,
    max: number = 1.0,
    step: number = 0.01
  ) => (
    <Box sx={{ mb: 3 }}>
      <Typography variant="body2" gutterBottom>
        {label}: {(value * 100).toFixed(0)}%
      </Typography>
      <Slider
        value={value}
        onChange={(_, newValue) => updateWeight(category, key, newValue as number)}
        min={0}
        max={max}
        step={step}
        marks={[
          { value: 0, label: '0%' },
          { value: max / 2, label: `${((max / 2) * 100).toFixed(0)}%` },
          { value: max, label: `${(max * 100).toFixed(0)}%` },
        ]}
      />
    </Box>
  );

  if (!config || !safetyConfig) {
    return (
      <Container>
        <Typography>Loading ranking configuration...</Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Typography variant="h3" gutterBottom>
        🎛️ Ranking Control Panel
      </Typography>
      <Typography variant="subtitle1" color="text.secondary" gutterBottom>
        Real-Time Algorithm Governance for Discovery, Feed, Swipe & AI
      </Typography>

      {saveMessage && (
        <Alert severity={saveMessage.includes('✅') ? 'success' : 'error'} sx={{ mb: 2 }}>
          {saveMessage}
        </Alert>
      )}

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
          <Tab label="🔍 Discovery" />
          <Tab label="📱 Feed" />
          <Tab label="💫 Swipe" />
          <Tab label="🤖 AI Companions" />
          <Tab label="🛡️ Safety" />
          <Tab label="🌍 Countries" />
          <Tab label="🧪 A/B Tests" />
          <Tab label="📊 Audit Log" />
        </Tabs>
      </Box>

      {/* Discovery Tab */}
      {activeTab === 0 && (
        <Card>
          <CardContent>
            <Typography variant="h5" gutterBottom>
              Discovery Ranking Weights
            </Typography>
            {renderWeightSlider('Distance Weight', 'discovery', 'distanceWeight', config.discovery.distanceWeight)}
            {renderWeightSlider('Activity Weight', 'discovery', 'activityWeight', config.discovery.activityWeight)}
            {renderWeightSlider('Rating Weight', 'discovery', 'ratingWeight', config.discovery.ratingWeight)}
            {renderWeightSlider('Earnings Weight', 'discovery', 'earningsWeight', config.discovery.earningsWeight)}
            {renderWeightSlider('Refund Penalty Weight', 'discovery', 'refundPenaltyWeight', config.discovery.refundPenaltyWeight)}
            {renderWeightSlider('Mismatch Penalty Weight', 'discovery', 'mismatchPenaltyWeight', config.discovery.mismatchPenaltyWeight)}
            <Button variant="contained" startIcon={<Save />} onClick={handleSaveConfig} disabled={loading}>
              Save Discovery Config
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Feed Tab */}
      {activeTab === 1 && (
        <Card>
          <CardContent>
            <Typography variant="h5" gutterBottom>
              Feed Ranking Weights
            </Typography>
            {renderWeightSlider('Recency Weight', 'feed', 'recencyWeight', config.feed.recencyWeight)}
            {renderWeightSlider('Engagement Weight', 'feed', 'engagementWeight', config.feed.engagementWeight)}
            {renderWeightSlider('Viral Weight', 'feed', 'viralWeight', config.feed.viralWeight)}
            {renderWeightSlider('Boost Weight', 'feed', 'boostWeight', config.feed.boostWeight)}
            <Button variant="contained" startIcon={<Save />} onClick={handleSaveConfig} disabled={loading}>
              Save Feed Config
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Swipe Tab */}
      {activeTab === 2 && (
        <Card>
          <CardContent>
            <Typography variant="h5" gutterBottom>
              Swipe Ranking Weights
            </Typography>
            {renderWeightSlider('Attractiveness Weight', 'swipe', 'attractivenessWeight', config.swipe.attractivenessWeight)}
            {renderWeightSlider('Response Time Weight', 'swipe', 'responseTimeWeight', config.swipe.responseTimeWeight)}
            {renderWeightSlider('Activity Weight', 'swipe', 'activityWeight', config.swipe.activityWeight)}
            {renderWeightSlider('Report Penalty Weight', 'swipe', 'reportPenaltyWeight', config.swipe.reportPenaltyWeight)}
            <Button variant="contained" startIcon={<Save />} onClick={handleSaveConfig} disabled={loading}>
              Save Swipe Config
            </Button>
          </CardContent>
        </Card>
      )}

      {/* AI Tab */}
      {activeTab === 3 && (
        <Card>
          <CardContent>
            <Typography variant="h5" gutterBottom>
              AI Companion Ranking Weights
            </Typography>
            {renderWeightSlider('Rating Weight', 'ai', 'ratingWeight', config.ai.ratingWeight)}
            {renderWeightSlider('Voice Usage Weight', 'ai', 'voiceUsageWeight', config.ai.voiceUsageWeight)}
            {renderWeightSlider('Chat Usage Weight', 'ai', 'chatUsageWeight', config.ai.chatUsageWeight)}
            {renderWeightSlider('Abuse Penalty Weight', 'ai', 'abusePenaltyWeight', config.ai.abusePenaltyWeight)}
            <Button variant="contained" startIcon={<Save />} onClick={handleSaveConfig} disabled={loading}>
              Save AI Config
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Safety Tab */}
      {activeTab === 4 && (
        <Card>
          <CardContent>
            <Typography variant="h5" gutterBottom>
              Safety-Aware Ranking Suppressors
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Refund Ratio Threshold"
                  type="number"
                  value={safetyConfig.refundRatioThreshold}
                  onChange={(e) => setSafetyConfig({...safetyConfig, refundRatioThreshold: parseFloat(e.target.value)})}
                  inputProps={{ step: 0.01, min: 0, max: 1 }}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Refund Ratio Penalty"
                  type="number"
                  value={safetyConfig.refundRatioPenalty}
                  onChange={(e) => setSafetyConfig({...safetyConfig, refundRatioPenalty: parseFloat(e.target.value)})}
                  inputProps={{ step: 0.01, min: 0, max: 1 }}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Report Frequency Threshold"
                  type="number"
                  value={safetyConfig.reportFrequencyThreshold}
                  onChange={(e) => setSafetyConfig({...safetyConfig, reportFrequencyThreshold: parseInt(e.target.value)})}
                  inputProps={{ min: 0 }}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Report Frequency Penalty"
                  type="number"
                  value={safetyConfig.reportFrequencyPenalty}
                  onChange={(e) => setSafetyConfig({...safetyConfig, reportFrequencyPenalty: parseFloat(e.target.value)})}
                  inputProps={{ step: 0.01, min: 0, max: 1 }}
                />
              </Grid>
              <Grid item xs={12}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={safetyConfig.enableAutoSuppression}
                      onChange={(e) => setSafetyConfig({...safetyConfig, enableAutoSuppression: e.target.checked})}
                    />
                  }
                  label="Enable Auto-Suppression for Dangerous Accounts"
                />
              </Grid>
            </Grid>
            <Box sx={{ mt: 3 }}>
              <Button variant="contained" startIcon={<Save />} onClick={handleSaveSafetyConfig} disabled={loading}>
                Save Safety Config
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Audit Log Tab */}
      {activeTab === 7 && (
        <Card>
          <CardContent>
            <Typography variant="h5" gutterBottom>
              <History /> Audit Log
            </Typography>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Timestamp</TableCell>
                  <TableCell>Admin</TableCell>
                  <TableCell>Action</TableCell>
                  <TableCell>Country</TableCell>
                  <TableCell>Reversible</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {auditLogs.map((log, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{new Date(log.timestamp).toLocaleString()}</TableCell>
                    <TableCell>{log.adminEmail}</TableCell>
                    <TableCell>{log.action}</TableCell>
                    <TableCell>{log.countryCode || 'Global'}</TableCell>
                    <TableCell>{log.reversible ? '✅' : '❌'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </Container>
  );
}
