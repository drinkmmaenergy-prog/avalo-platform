/**
 * PACK 357 — Reviews Tab
 * Manage review requests and sentiment
 */

import React from 'react';
import { Box,Typography } from '@mui/material';

export default function ReviewsTab() {
  return (
    <Box>
      <Typography variant="h6">Review Management</Typography>
      <Typography variant="body2" color="textSecondary">
        Monitor review requests, completion rates, and sentiment analysis.
      </Typography>
      {/* TODO: Display reviews stats and history */}
    </Box>
  );
}
