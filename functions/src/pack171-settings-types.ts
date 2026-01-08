/**
 * PACK 171 - Unified Global Settings & Privacy Center
 * Type definitions for privacy-first settings management
 */

export enum PermissionType {
  CAMERA = 'camera',
  MICROPHONE = 'microphone',
  STORAGE = 'storage',
  LOCATION = 'location',
  BIOMETRICS = 'biometrics',
  CONTACTS = 'contacts',
}

export enum VisibilityLevel {
  PUBLIC = 'public',
  FRIENDS = 'friends',
  PRIVATE = 'private',
}

export enum ConsentPurpose {
  DATA_PROCESSING = 'data_processing',
  ANALYTICS = 'analytics',
  MARKETING = 'marketing',
  THIRD_PARTY_SHARING = 'third_party_sharing',
  LOCATION_TRACKING = 'location_tracking',
  PAYMENT_PROCESSING = 'payment_processing',
  CONTENT_PERSONALIZATION = 'content_personalization',
}

export enum DataRequestType {
  EXPORT = 'export',
  DELETION = 'deletion',
  CORRECTION = 'correction',
  TAKEDOWN = 'takedown',
  LEGAL_EVIDENCE = 'legal_evidence',
}

export enum NotificationType {
  PUSH = 'push',
  EMAIL = 'email',
  SMS = 'sms',
  IN_APP = 'in_app',
}

export interface AccountSettings {
  email: string;
  phone?: string;
  socialLogins: {
    google?: boolean;
    apple?: boolean;
    facebook?: boolean;
  };
  twoFactorEnabled: boolean;
  passwordLastChanged: Date;
}

export interface PrivacySettings {
  posts: VisibilityLevel;
  reels: VisibilityLevel;
  stories: VisibilityLevel;
  clubs: VisibilityLevel;
  purchases: VisibilityLevel;
  events: VisibilityLevel;
  reviews: VisibilityLevel;
  incognitoMode: boolean;
  showOnlineStatus: boolean;
  allowMessageRequests: boolean;
  searchable: boolean;
}

export interface SecuritySettings {
  twoFactorEnabled: boolean;
  biometricLockEnabled: boolean;
  appLockEnabled: boolean;
  endToEndEncryptionEnabled: boolean;
  loginDevices: SessionDevice[];
  suspiciousLoginAlerts: boolean;
}

export interface NotificationSettings {
  pushNotifications: {
    enabled: boolean;
    messages: boolean;
    likes: boolean;
    comments: boolean;
    followers: boolean;
    events: boolean;
    payments: boolean;
  };
  emailNotifications: {
    enabled: boolean;
    digest: 'daily' | 'weekly' | 'never';
    marketing: boolean;
  };
  smsNotifications: {
    enabled: boolean;
    securityAlerts: boolean;
    paymentAlerts: boolean;
  };
  quietHours: {
    enabled: boolean;
    startTime: string;
    endTime: string;
  };
}

export interface PaymentSettings {
  spendingLimits: {
    enabled: boolean;
    dailyLimit?: number;
    weeklyLimit?: number;
    monthlyLimit?: number;
  };
  autoLockOnLimit: boolean;
  safePurchaseMode: boolean;
  payoutSchedule: 'weekly' | 'biweekly' | 'monthly';
  payoutMethod?: {
    type: 'bank' | 'paypal' | 'stripe';
    details: Record<string, any>;
  };
  receiptSettings: {
    emailReceipts: boolean;
    detailedHistory: boolean;
  };
}

export interface LocationSettings {
  cityVisibility: VisibilityLevel;
  tempShareSessions: TempShareSession[];
  passportMode: {
    enabled: boolean;
    city?: string;
    country?: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
  };
  preciseLocationEnabled: boolean;
}

export interface BlockReportSettings {
  blockedUsers: string[];
  reportHistory: Report[];
  mutedUsers: string[];
  restrictedUsers: string[];
}

export interface DataRightsSettings {
  exportRequests: DataRequest[];
  deletionRequests: DataRequest[];
  lastExportDate?: Date;
  dataRetentionPeriod: number;
  autoDeleteInactive: boolean;
}

export interface UserSettings {
  userId: string;
  account: AccountSettings;
  privacy: PrivacySettings;
  security: SecuritySettings;
  notifications: NotificationSettings;
  payments: PaymentSettings;
  location: LocationSettings;
  blockReport: BlockReportSettings;
  dataRights: DataRightsSettings;
  updatedAt: Date;
  createdAt: Date;
}

export interface PermissionControl {
  userId: string;
  permissions: {
    [key in PermissionType]: {
      granted: boolean;
      grantedAt?: Date;
      revokedAt?: Date;
      lastRequestedAt: Date;
      purpose: string;
    };
  };
  updatedAt: Date;
}

export interface ConsentLog {
  id: string;
  userId: string;
  purpose: ConsentPurpose;
  granted: boolean;
  grantedAt: Date;
  revokedAt?: Date;
  deviceId: string;
  deviceInfo: {
    platform: string;
    osVersion: string;
    appVersion: string;
  };
  ipAddress: string;
  userAgent: string;
  explanation: string;
  featureUsing: string;
}

export interface SessionDevice {
  id: string;
  userId: string;
  deviceId: string;
  deviceName: string;
  deviceType: 'mobile' | 'tablet' | 'desktop' | 'web';
  platform: string;
  osVersion: string;
  appVersion: string;
  ipAddress: string;
  location?: {
    city: string;
    country: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
  };
  lastActive: Date;
  loginAt: Date;
  isCurrentDevice: boolean;
  trusted: boolean;
}

export interface TempShareSession {
  id: string;
  userId: string;
  recipientId: string;
  startedAt: Date;
  expiresAt: Date;
  active: boolean;
  location: {
    lat: number;
    lng: number;
    accuracy: number;
  };
  purpose: string;
}

export interface Report {
  id: string;
  reporterId: string;
  reportedUserId: string;
  reportedContentId?: string;
  reason: string;
  details: string;
  status: 'pending' | 'reviewing' | 'resolved' | 'dismissed';
  createdAt: Date;
  resolvedAt?: Date;
  resolution?: string;
}

export interface DataRequest {
  id: string;
  userId: string;
  type: DataRequestType;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: Date;
  completedAt?: Date;
  downloadUrl?: string;
  expiresAt?: Date;
  format?: 'json' | 'csv' | 'pdf';
  includeMediaFiles?: boolean;
  error?: string;
}

export interface SettingsUpdateRequest {
  userId: string;
  category: 'account' | 'privacy' | 'security' | 'notifications' | 'payments' | 'location' | 'blockReport' | 'dataRights';
  updates: Record<string, any>;
  timestamp: Date;
}

export interface ConsentUpdateRequest {
  userId: string;
  purpose: ConsentPurpose;
  granted: boolean;
  deviceInfo: {
    platform: string;
    osVersion: string;
    appVersion: string;
  };
  explanation: string;
  featureUsing: string;
}

export interface SessionManagementRequest {
  userId: string;
  action: 'terminate' | 'terminate_all' | 'trust' | 'untrust';
  sessionId?: string;
  reason?: string;
}

export interface DataExportRequest {
  userId: string;
  format: 'json' | 'csv' | 'pdf';
  includeMediaFiles: boolean;
  includeMessages: boolean;
  includePurchases: boolean;
  includeAnalytics: boolean;
}

export interface DataDeletionRequest {
  userId: string;
  confirmationCode: string;
  deleteImmediately: boolean;
  reason?: string;
}

export interface SettingsAuditLog {
  id: string;
  userId: string;
  action: 'create' | 'update' | 'delete' | 'export' | 'consent_update' | 'session_terminate';
  category?: string;
  field?: string;
  oldValue?: any;
  newValue?: any;
  deviceId: string;
  ipAddress: string;
  timestamp: Date;
  reason?: string;
}

export interface PrivacyViolationAlert {
  id: string;
  userId: string;
  violationType: 'unauthorized_access' | 'suspicious_activity' | 'data_breach' | 'privacy_settings_bypass';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  detectedAt: Date;
  resolved: boolean;
  resolvedAt?: Date;
  actionTaken?: string;
}