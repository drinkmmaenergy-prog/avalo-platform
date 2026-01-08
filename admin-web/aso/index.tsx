/**
 * PACK 357 — ASO Dashboard
 * 
 * Main admin interface for ASO management
 */

import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Typography, 
  Tab, 
  Tabs, 
  Paper,
  Alert 
} from '@mui/material';
import VariantsTab from './VariantsTab';
import PerformanceTab from './PerformanceTab';
import OptimizationTab from './OptimizationTab';
import ReviewsTab from './ReviewsTab';
import BenchmarksTab from './BenchmarksTab';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`aso-tabpanel-${index}`}
      aria-labelledby={`aso-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

export default function ASODashboard() {
  const [currentTab, setCurrentTab] = useState(0);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setCurrentTab(newValue);
  };

  return (
    <Box sx={{ width: '100%' }}>
      <Typography variant="h4" gutterBottom>
        ASO & Store Conversion Engine
      </Typography>
      
      <Alert severity="info" sx={{ mb: 3 }}>
        PACK 357: Optimize store conversion rates across Apple App Store and Google Play.
        All changes comply with A/B testing rules and anti-fraud protection.
      </Alert>

      <Paper sx={{ width: '100%', mb: 2 }}>
        <Tabs
          value={currentTab}
          onChange={handleTabChange}
          indicatorColor="primary"
          textColor="primary"
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab label="Variants" id="aso-tab-0" />
          <Tab label="Performance" id="aso-tab-1" />
          <Tab label="Optimization" id="aso-tab-2" />
          <Tab label="Reviews" id="aso-tab-3" />
          <Tab label="Benchmarks" id="aso-tab-4" />
        </Tabs>
      </Paper>

      <TabPanel value={currentTab} index={0}>
        <VariantsTab />
      </TabPanel>

      <TabPanel value={currentTab} index={1}>
        <PerformanceTab />
      </TabPanel>

      <TabPanel value={currentTab} index={2}>
        <OptimizationTab />
      </TabPanel>

      <TabPanel value={currentTab} index={3}>
        <ReviewsTab />
      </TabPanel>

      <TabPanel value={currentTab} index={4}>
        <BenchmarksTab />
      </TabPanel>
    </Box>
  );
}
