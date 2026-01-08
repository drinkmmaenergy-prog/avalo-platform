/**
 * PACK 357 — Benchmarks Tab
 * Configure ASO performance benchmarks
 */

import React from 'react';
import { Box, Typography } from '@mui/material';

export default function BenchmarksTab() {
  return (
    <Box>
      <Typography variant="h6">Performance Benchmarks</Typography>
      <Typography variant="body2" color="textSecondary">
        Set minimum acceptable metrics for store CVR, pay rate, and revenue per install.
      </Typography>
      {/* TODO: Display benchmarks configuration */}
    </Box>
  );
}
