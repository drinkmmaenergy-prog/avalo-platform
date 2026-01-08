/**
 * PACK 357 — ASO Performance Tab
 * View performance metrics and comparisons
 */

import React from 'react';
import { Box, Typography, Paper, Grid } from '@mui/material';

export default function PerformanceTab() {
  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Performance Metrics
      </Typography>
      
      <Grid container spacing={3}>
        <Grid item xs={12} md={6} lg={3}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle2" color="textSecondary">
              Store CVR
            </Typography>
            <Typography variant="h4">
              --
            </Typography>
          </Paper>
        </Grid>
        
        <Grid item xs={12} md={6} lg={3}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle2" color="textSecondary">
              Install → Register
            </Typography>
            <Typography variant="h4">
              --
            </Typography>
          </Paper>
        </Grid>
        
        <Grid item xs={12} md={6} lg={3}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle2" color="textSecondary">
              Verify → Pay
            </Typography>
            <Typography variant="h4">
              --
            </Typography>
          </Paper>
        </Grid>
        
        <Grid item xs={12} md={6} lg={3}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle2" color="textSecondary">
              Revenue / Install
            </Typography>
            <Typography variant="h4">
              --
            </Typography>
          </Paper>
        </Grid>
      </Grid>
      
      {/* TODO: Add charts and detailed metrics */}
    </Box>
  );
}
