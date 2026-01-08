/**
 * Avalo Automatic Rollback System
 * Handles Firebase Hosting rollback on critical failures
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { ROLLBACK_CONFIG, THRESHOLDS } from './config';
import { sendAlert } from './alerts';

const execAsync = promisify(exec);

export interface RollbackTrigger {
  reason: string;
  failedEndpoints: string[];
  consecutiveFailures: number;
  slowResponses: number;
  timestamp: string;
}

export interface RollbackResult {
  success: boolean;
  timestamp: string;
  trigger: RollbackTrigger;
  output?: string;
  error?: string;
  backupInfo?: string;
  rollbackVersion?: string;
}

// Track rollback history
const rollbackHistory: RollbackResult[] = [];

/**
 * Check if rollback conditions are met
 */
export function shouldTriggerRollback(
  consecutiveFailures: number,
  slowResponses: number,
  failedEndpoints: string[],
  has5xxErrors: boolean
): { should: boolean; reason: string } {
  // Rule 1: ≥3 endpoints fail consecutively
  if (consecutiveFailures >= THRESHOLDS.consecutiveFailuresForRollback) {
    return {
      should: true,
      reason: `${consecutiveFailures} consecutive failures detected across endpoints`
    };
  }

  // Rule 2: Response time >3s for 3 checks in a row
  if (slowResponses >= THRESHOLDS.slowResponseChecksForRollback) {
    return {
      should: true,
      reason: `${slowResponses} consecutive slow responses (>3s) detected`
    };
  }

  // Rule 3: 5xx response detected
  if (has5xxErrors) {
    return {
      should: true,
      reason: '5xx server error detected'
    };
  }

  return { should: false, reason: '' };
}

/**
 * Execute Firebase hosting rollback
 */
export async function executeRollback(trigger: RollbackTrigger): Promise<RollbackResult> {
  console.log('\n🚨 INITIATING AUTOMATIC ROLLBACK 🚨');
  console.log('Reason:', trigger.reason);
  console.log('Failed endpoints:', trigger.failedEndpoints.join(', '));

  const result: RollbackResult = {
    success: false,
    timestamp: new Date().toISOString(),
    trigger
  };

  if (!ROLLBACK_CONFIG.enabled) {
    result.error = 'Rollback is disabled in configuration';
    console.log('⚠️  Rollback disabled in configuration');
    
    await sendAlert({
      timestamp: result.timestamp,
      severity: 'warning',
      title: 'Rollback Skipped (Disabled)',
      message: 'Automatic rollback was triggered but is disabled in configuration',
      metrics: {
        failureCount: trigger.consecutiveFailures
      }
    });
    
    return result;
  }

  if (ROLLBACK_CONFIG.requireManualApproval) {
    result.error = 'Manual approval required for rollback';
    console.log('⚠️  Manual approval required - rollback not executed');
    
    await sendAlert({
      timestamp: result.timestamp,
      severity: 'critical',
      title: 'Rollback Approval Required',
      message: `${trigger.reason}\n\nManual approval required to proceed with rollback.`,
      metrics: {
        failureCount: trigger.consecutiveFailures
      }
    });
    
    return result;
  }

  try {
    // Step 1: Backup current deployment info (optional)
    if (ROLLBACK_CONFIG.backupBeforeRollback) {
      console.log('📦 Creating backup record...');
      const backupInfo = await getCurrentDeploymentInfo();
      result.backupInfo = backupInfo;
    }

    // Step 2: Execute Firebase hosting rollback
    console.log('🔄 Executing Firebase hosting rollback...');
    const rollbackCommand = `firebase hosting:rollback --project ${ROLLBACK_CONFIG.firebaseProject} --non-interactive`;
    
    const { stdout, stderr } = await execAsync(rollbackCommand, {
      timeout: 60000 // 1 minute timeout
    });

    result.output = stdout;
    result.success = true;

    // Extract version info from output
    const versionMatch = stdout.match(/Rolled back to version: (\S+)/);
    if (versionMatch) {
      result.rollbackVersion = versionMatch[1];
    }

    console.log('✅ Rollback completed successfully');
    console.log('Output:', stdout);

    if (stderr) {
      console.log('Stderr:', stderr);
    }

    // Send success alert
    await sendAlert({
      timestamp: result.timestamp,
      severity: 'success',
      title: 'Automatic Rollback Successful',
      message: `Successfully rolled back deployment due to: ${trigger.reason}`,
      rollbackResult: `Rolled back to previous version${result.rollbackVersion ? `: ${result.rollbackVersion}` : ''}`,
      metrics: {
        failureCount: trigger.consecutiveFailures
      }
    });

  } catch (error: any) {
    result.success = false;
    result.error = error.message;
    
    console.error('❌ Rollback failed:', error.message);
    
    // Send failure alert
    await sendAlert({
      timestamp: result.timestamp,
      severity: 'critical',
      title: 'Automatic Rollback Failed',
      message: `Failed to rollback deployment: ${error.message}`,
      errorDetails: error.stack || error.message,
      metrics: {
        failureCount: trigger.consecutiveFailures
      }
    });
  }

  // Record rollback in history
  rollbackHistory.push(result);

  return result;
}

/**
 * Get current deployment information for backup
 */
async function getCurrentDeploymentInfo(): Promise<string> {
  try {
    const { stdout } = await execAsync(
      `firebase hosting:channel:list --project ${ROLLBACK_CONFIG.firebaseProject}`,
      { timeout: 30000 }
    );
    return stdout;
  } catch (error: any) {
    console.log('Could not retrieve deployment info:', error.message);
    return 'Unable to retrieve deployment info';
  }
}

/**
 * Get rollback history
 */
export function getRollbackHistory(): RollbackResult[] {
  return [...rollbackHistory];
}

/**
 * Check if recent rollback was performed (within last hour)
 */
export function hasRecentRollback(withinMinutes: number = 60): boolean {
  if (rollbackHistory.length === 0) return false;

  const lastRollback = rollbackHistory[rollbackHistory.length - 1];
  const lastRollbackTime = new Date(lastRollback.timestamp).getTime();
  const now = Date.now();
  const threshold = withinMinutes * 60 * 1000; // Convert to milliseconds

  return (now - lastRollbackTime) < threshold;
}

/**
 * Force manual rollback (for CLI use)
 */
export async function forceRollback(reason: string): Promise<RollbackResult> {
  console.log('\n⚠️  MANUAL ROLLBACK INITIATED ⚠️');
  
  const trigger: RollbackTrigger = {
    reason: `Manual rollback: ${reason}`,
    failedEndpoints: [],
    consecutiveFailures: 0,
    slowResponses: 0,
    timestamp: new Date().toISOString()
  };

  // Temporarily enable rollback and disable manual approval for forced rollback
  const originalEnabled = ROLLBACK_CONFIG.enabled;
  const originalManualApproval = ROLLBACK_CONFIG.requireManualApproval;
  
  ROLLBACK_CONFIG.enabled = true;
  ROLLBACK_CONFIG.requireManualApproval = false;

  const result = await executeRollback(trigger);

  // Restore original settings
  ROLLBACK_CONFIG.enabled = originalEnabled;
  ROLLBACK_CONFIG.requireManualApproval = originalManualApproval;

  return result;
}

/**
 * Validate rollback - check if services are restored
 */
export async function validateRollback(endpoints: string[]): Promise<{
  success: boolean;
  healthyEndpoints: number;
  totalEndpoints: number;
  details: string;
}> {
  console.log('\n🔍 Validating rollback...');
  
  let healthyCount = 0;
  const results: string[] = [];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });

      const isHealthy = response.ok;
      if (isHealthy) healthyCount++;

      results.push(`${endpoint}: ${isHealthy ? '✅' : '❌'} (${response.status})`);
    } catch (error: any) {
      results.push(`${endpoint}: ❌ (${error.message})`);
    }
  }

  const success = healthyCount >= Math.ceil(endpoints.length * 0.7); // 70% threshold
  
  return {
    success,
    healthyEndpoints: healthyCount,
    totalEndpoints: endpoints.length,
    details: results.join('\n')
  };
}