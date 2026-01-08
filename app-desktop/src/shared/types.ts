export interface DesktopFile {
  id: string;
  name: string;
  size: number;
  type: string;
  path?: string;
  preview?: string;
  status: 'queued' | 'uploading' | 'completed' | 'failed';
  progress: number;
  error?: string;
}

export interface BatchUploadConfig {
  batchId: string;
  files: DesktopFile[];
  totalSize: number;
  uploadedSize: number;
  status: 'preparing' | 'uploading' | 'completed' | 'failed';
  startTime: number;
  endTime?: number;
}

export interface VideoEditConfig {
  projectId: string;
  clips: VideoClip[];
  timeline: TimelineItem[];
  settings: VideoSettings;
}

export interface VideoClip {
  id: string;
  filePath: string;
  duration: number;
  thumbnail?: string;
  startTime: number;
  endTime: number;
}

export interface TimelineItem {
  id: string;
  type: 'video' | 'audio' | 'text' | 'overlay';
  clipId?: string;
  startTime: number;
  duration: number;
  track: number;
  properties: Record<string, any>;
}

export interface VideoSettings {
  resolution: '1920x1080' | '1280x720' | '720x1280' | '1080x1920';
  fps: 24 | 30 | 60;
  bitrate: number;
  format: 'mp4' | 'webm' | 'mov';
  codec: 'h264' | 'h265' | 'vp9';
}

export interface DesktopAccount {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  avatar?: string;
  role: 'creator' | 'moderator' | 'viewer';
  isActive: boolean;
  lastUsed: number;
  permissions: string[];
}

export interface SplitViewConfig {
  id: string;
  layout: 'horizontal' | 'vertical' | 'quad';
  panels: SplitViewPanel[];
}

export interface SplitViewPanel {
  id: string;
  type: 'feed' | 'chat' | 'analytics' | 'moderation' | 'event';
  url: string;
  title: string;
  position: { x: number; y: number; width: number; height: number };
}

export interface VirtualEventControls {
  eventId: string;
  isHost: boolean;
  participants: EventParticipant[];
  settings: EventSettings;
}

export interface EventParticipant {
  userId: string;
  username: string;
  avatar?: string;
  role: 'host' | 'speaker' | 'attendee';
  audioEnabled: boolean;
  videoEnabled: boolean;
  handRaised: boolean;
  isMuted: boolean;
}

export interface EventSettings {
  maxParticipants: number;
  allowScreenShare: boolean;
  allowChat: boolean;
  recordingEnabled: boolean;
  waitingRoomEnabled: boolean;
}

export interface UploadProgress {
  uploadId: string;
  fileName: string;
  progress: number;
  speed: number;
  eta: number;
  status: 'uploading' | 'processing' | 'completed' | 'failed';
}

export interface DesktopNotification {
  id: string;
  title: string;
  body: string;
  icon?: string;
  timestamp: number;
  read: boolean;
  actions?: NotificationAction[];
}

export interface NotificationAction {
  id: string;
  label: string;
  action: string;
}

export interface OfflineQueueItem {
  id: string;
  type: 'upload' | 'message' | 'post' | 'comment' | 'like' | 'tip' | 'subscription';
  data: any;
  timestamp: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  retryCount: number;
  error?: string;
}

export interface DesktopSettings {
  notifications: {
    enabled: boolean;
    sound: boolean;
    showPreview: boolean;
  };
  uploads: {
    autoRetry: boolean;
    maxConcurrent: number;
    chunkSize: number;
  };
  performance: {
    hardwareAcceleration: boolean;
    gpuRendering: boolean;
  };
  privacy: {
    clearCacheOnExit: boolean;
    savePasswords: boolean;
  };
}