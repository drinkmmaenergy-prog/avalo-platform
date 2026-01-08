import { app } from 'electron';
import { createHash } from 'crypto';
import { store } from '../main';
import { networkInterfaces, cpus, arch, platform, release } from 'os';

interface DeviceFingerprint {
  deviceId: string;
  hardwareId: string;
  timestamp: number;
  platform: string;
  arch: string;
  cpuModel: string;
  cpuCores: number;
  totalMemory: number;
  networkMacs: string[];
  osRelease: string;
  appVersion: string;
}

function generateHardwareId(): string {
  const components: string[] = [];

  components.push(platform());
  components.push(arch());
  components.push(release());

  const cpuInfo = cpus();
  if (cpuInfo.length > 0) {
    components.push(cpuInfo[0].model);
    components.push(cpuInfo.length.toString());
  }

  const nets = networkInterfaces();
  const macs: string[] = [];
  Object.values(nets).forEach(netArray => {
    if (netArray) {
      netArray.forEach(net => {
        if (net.mac && net.mac !== '00:00:00:00:00:00') {
          macs.push(net.mac);
        }
      });
    }
  });

  if (macs.length > 0) {
    macs.sort();
    components.push(macs[0]);
  }

  const combined = components.join('|');
  return createHash('sha256').update(combined).digest('hex');
}

function generateDeviceId(): string {
  const existingId = store.get('deviceId') as string;
  if (existingId) {
    return existingId;
  }

  const newDeviceId = createHash('sha256')
    .update(generateHardwareId() + Date.now().toString())
    .digest('hex');

  store.set('deviceId', newDeviceId);
  return newDeviceId;
}

export function initializeDeviceFingerprint(): DeviceFingerprint {
  const cpuInfo = cpus();
  const nets = networkInterfaces();
  const macs: string[] = [];

  Object.values(nets).forEach(netArray => {
    if (netArray) {
      netArray.forEach(net => {
        if (net.mac && net.mac !== '00:00:00:00:00:00') {
          macs.push(net.mac);
        }
      });
    }
  });

  const fingerprint: DeviceFingerprint = {
    deviceId: generateDeviceId(),
    hardwareId: generateHardwareId(),
    timestamp: Date.now(),
    platform: platform(),
    arch: arch(),
    cpuModel: cpuInfo.length > 0 ? cpuInfo[0].model : 'Unknown',
    cpuCores: cpuInfo.length,
    totalMemory: require('os').totalmem(),
    networkMacs: macs,
    osRelease: release(),
    appVersion: app.getVersion()
  };

  store.set('deviceFingerprint', fingerprint);
  store.set('deviceLastSeen', Date.now());

  return fingerprint;
}

export function getDeviceFingerprint(): DeviceFingerprint | null {
  return store.get('deviceFingerprint') as DeviceFingerprint | null;
}

export function validateDeviceFingerprint(): boolean {
  const stored = getDeviceFingerprint();
  if (!stored) {
    return false;
  }

  const currentHardwareId = generateHardwareId();
  return stored.hardwareId === currentHardwareId;
}

export function updateDeviceActivity(): void {
  store.set('deviceLastSeen', Date.now());
}

export function getDeviceId(): string {
  return generateDeviceId();
}

export function isDeviceTrusted(): boolean {
  const fingerprint = getDeviceFingerprint();
  if (!fingerprint) {
    return false;
  }

  const lastSeen = store.get('deviceLastSeen') as number;
  if (!lastSeen) {
    return false;
  }

  const daysSinceLastSeen = (Date.now() - lastSeen) / (1000 * 60 * 60 * 24);
  return daysSinceLastSeen < 30 && validateDeviceFingerprint();
}

export function getDeviceRiskScore(): number {
  let score = 0;

  if (!validateDeviceFingerprint()) {
    score += 50;
  }

  const lastSeen = store.get('deviceLastSeen') as number;
  if (lastSeen) {
    const daysSinceLastSeen = (Date.now() - lastSeen) / (1000 * 60 * 60 * 24);
    if (daysSinceLastSeen > 30) {
      score += 20;
    } else if (daysSinceLastSeen > 7) {
      score += 10;
    }
  } else {
    score += 30;
  }

  const securityEvents = store.get('recent_security_events', []) as any[];
  if (securityEvents.length > 10) {
    score += 20;
  } else if (securityEvents.length > 5) {
    score += 10;
  }

  return Math.min(score, 100);
}