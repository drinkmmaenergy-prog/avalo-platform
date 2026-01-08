/**
 * PACK 317 — Mobile Hardening Utilities
 * 
 * Security checks for React Native/Expo mobile apps:
 * - Production build verification
 * - Debug mode detection
 * - Screen blur for sensitive content
 * - Device attestation
 */

// ============================================================================
// BUILD VERIFICATION
// ============================================================================

export interface MobileBuildInfo {
  isProduction: boolean;
  debugMode: boolean;
  crashReportingEnabled: boolean;
  secureStorage: boolean;
  issues: string[];
}

/**
 * Verify mobile app build configuration
 */
export function verifyMobileBuild(params: {
  __DEV__: boolean;
  expoConfig?: any;
  buildType?: string;
}): MobileBuildInfo {
  const issues: string[] = [];

  // Check if in development mode
  const debugMode = params.__DEV__ || params.buildType === 'debug';

  if (debugMode) {
    issues.push('APP_IN_DEBUG_MODE');
  }

  // Verify crash reporting is enabled
  const crashReportingEnabled = !!params.expoConfig?.extra?.sentryDsn;

  if (!crashReportingEnabled) {
    issues.push('CRASH_REPORTING_DISABLED');
  }

  return {
    isProduction: !debugMode,
    debugMode,
    crashReportingEnabled,
    secureStorage: true, // Assume expo-secure-store is used
    issues,
  };
}

// ============================================================================
// SCREEN SECURITY
// ============================================================================

/**
 * List of screens that should be blurred in app switcher
 */
export const SENSITIVE_SCREENS = [
  '/wallet',
  '/wallet/balance',
  '/wallet/payout',
  '/settings/security',
  '/settings/verification',
  '/admin',
  '/earnings',
  '/payout-requests',
];

/**
 * Check if screen requires blur protection
 */
export function shouldBlurScreen(routeName: string): boolean {
  return SENSITIVE_SCREENS.some(screen => 
    routeName.startsWith(screen)
  );
}

// ============================================================================
// MOBILE SECURITY CHECKLIST
// ============================================================================

export interface MobileSecurityChecklist {
  minOSVersions: {
    ios: string;
    android: number;
  };
  requiredPermissions: string[];
  forbiddenInProduction: string[];
  securityFeatures: {
    sslPinning: boolean;
    jailbreakDetection: boolean;
    screenBlur: boolean;
    secureStorage: boolean;
  };
}

/**
 * Get mobile security checklist
 */
export function getMobileSecurityChecklist(): MobileSecurityChecklist {
  return {
    minOSVersions: {
      ios: '13.0', // iOS 13+
      android: 23, // Android 6.0+
    },
    requiredPermissions: [
      'CAMERA', // For verification photos
      'NOTIFICATIONS', // For push notifications
      'LOCATION', // For geolocation features (optional)
    ],
    forbiddenInProduction: [
      '__DEV__',
      'EXPO_DEBUG',
      'REACT_NATIVE_DEBUGGER',
      'FLIPPER_ENABLED',
    ],
    securityFeatures: {
      sslPinning: false, // Optional for PACK 317
      jailbreakDetection: false, // Optional for PACK 317
      screenBlur: true, // Required for sensitive screens
      secureStorage: true, // Required for tokens/keys
    },
  };
}

// ============================================================================
// DEVICE ATTESTATION (Stub for future implementation)
// ============================================================================

export interface DeviceAttestationResult {
  valid: boolean;
  deviceId: string;
  platform: 'ios' | 'android';
  trustScore: number;
  flags: string[];
}

/**
 * Verify device attestation (stub for future SafetyNet/DeviceCheck integration)
 */
export async function verifyDeviceAttestation(params: {
  deviceId: string;
  platform: 'ios' | 'android';
  attestationToken?: string;
}): Promise<DeviceAttestationResult> {
  // Stub implementation - real attestation requires platform-specific SDKs
  return {
    valid: true,
    deviceId: params.deviceId,
    platform: params.platform,
    trustScore: 100,
    flags: [],
  };
}

// ============================================================================
// PRODUCTION READINESS CHECKS
// ============================================================================

export interface MobileProductionReadiness {
  ready: boolean;
  platform: 'ios' | 'android';
  checks: {
    minOSVersion: boolean;
    debugDisabled: boolean;
    crashReportingEnabled: boolean;
    analyticsEnabled: boolean;
    secureStorageEnabled: boolean;
    productionAPIEndpoints: boolean;
  };
  issues: string[];
}

/**
 * Check if mobile app is production-ready
 */
export function checkMobileProductionReadiness(params: {
  platform: 'ios' | 'android';
  osVersion: string;
  buildType: string;
  config: any;
}): MobileProductionReadiness {
  const issues: string[] = [];
  const checklist = getMobileSecurityChecklist();

  // Check OS version
  const minOSVersion = params.platform === 'ios' 
    ? parseFloat(params.osVersion) >= parseFloat(checklist.minOSVersions.ios)
    : parseInt(params.osVersion) >= checklist.minOSVersions.android;

  if (!minOSVersion) {
    issues.push(`OS_VERSION_TOO_OLD: ${params.osVersion}`);
  }

  // Check debug mode
  const debugDisabled = params.buildType === 'release' || params.buildType === 'production';

  if (!debugDisabled) {
    issues.push('DEBUG_MODE_ENABLED');
  }

  // Check crash reporting
  const crashReportingEnabled = !!params.config?.extra?.sentryDsn;

  if (!crashReportingEnabled) {
    issues.push('CRASH_REPORTING_DISABLED');
  }

  // Check analytics
  const analyticsEnabled = !!params.config?.extra?.firebaseConfig;

  if (!analyticsEnabled) {
    issues.push('ANALYTICS_DISABLED');
  }

  // Check secure storage
  const secureStorageEnabled = !!params.config?.plugins?.find((p: any) => 
    p === 'expo-secure-store' || p?.[0] === 'expo-secure-store'
  );

  if (!secureStorageEnabled) {
    issues.push('SECURE_STORAGE_NOT_CONFIGURED');
  }

  // Check API endpoints
  const productionAPIEndpoints = params.config?.extra?.apiUrl?.includes('production') ||
                                  params.config?.extra?.firebaseConfig?.projectId?.includes('prod');

  if (!productionAPIEndpoints) {
    issues.push('NON_PRODUCTION_API_ENDPOINTS');
  }

  return {
    ready: issues.length === 0,
    platform: params.platform,
    checks: {
      minOSVersion,
      debugDisabled,
      crashReportingEnabled,
      analyticsEnabled,
      secureStorageEnabled,
      productionAPIEndpoints,
    },
    issues,
  };
}