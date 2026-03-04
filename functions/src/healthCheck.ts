/**
 * Health Check — Minimal Gen2 Boot Verification
 *
 * This function does NOT require Stripe secrets.
 * It is used to verify that the Cloud Run container boots cleanly.
 *
 * PACK 4.1 BOOT ISOLATION: This endpoint bypasses Stripe enforcement.
 */

import { onRequest } from './runtime';

/**
 * GET /healthCheck
 *
 * Returns 200 if the container is alive and Firebase Admin initialized.
 * No secrets required — pure liveness probe.
 */
export const healthCheck = onRequest({}, (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true';
  const isCloudRun = !!process.env.K_SERVICE;

  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: isCloudRun ? 'cloud_run' : isEmulator ? 'emulator' : 'local',
    nodeVersion: process.version,
    uptime: process.uptime(),
    region: process.env.FUNCTION_REGION || 'europe-west1',
  });
});









