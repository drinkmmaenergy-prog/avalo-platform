/**
 * PACK 44 — Dev Mode Sync Status Badge
 * 
 * Shows pending sync operations count in development mode only.
 * NOT visible in production builds.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getPendingOpsCount } from '../services/backSyncService';

interface DevSyncStatusBadgeProps {
  userId: string;
}

export const DevSyncStatusBadge: React.FC<DevSyncStatusBadgeProps> = ({ userId }) => {
  const [pendingOps, setPendingOps] = useState<number>(0);
  
  useEffect(() => {
    // Only run in development mode
    if (!__DEV__) {
      return;
    }
    
    // Update pending ops count
    const updateCount = async () => {
      try {
        const count = await getPendingOpsCount(userId);
        setPendingOps(count);
      } catch (error) {
        console.error('[DevSyncStatusBadge] Error getting pending ops count:', error);
      }
    };
    
    // Initial update
    updateCount();
    
    // Update every 5 seconds
    const interval = setInterval(updateCount, 5000);
    
    return () => clearInterval(interval);
  }, [userId]);
  
  // Don't render in production
  if (!__DEV__) {
    return null;
  }
  
  return (
    <View style={styles.container}>
      <Text style={styles.text}>
        Sync: {pendingOps} pending
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginLeft: 8,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
  },
});

export default DevSyncStatusBadge;
