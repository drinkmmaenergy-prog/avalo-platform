/**
 * Code Splitting Configuration and Dynamic Imports
 * Lazy load heavy components to improve initial bundle size
 */

import dynamic from 'next/dynamic';

/**
 * Chat Interface - Heavy component with real-time features
 */
export const ChatInterface = dynamic(
  () => import('@/components/chat/ChatInterface'),
  {
    loading: () => <div className="flex items-center justify-center h-full">Loading chat...</div>,
    ssr: false
  }
);

/**
 * Creator Dashboard - Analytics and charts
 */
export const CreatorDashboard = dynamic(
  () => import('@/components/creator/Dashboard'),
  {
    loading: () => <div className="flex items-center justify-center h-full">Loading dashboard...</div>,
    ssr: true
  }
);

/**
 * WebRTC Call UI - Video/audio calling interface
 */
export const CallInterface = dynamic(
  () => import('@/components/calls/CallInterface'),
  {
    loading: () => <div className="flex items-center justify-center h-full">Initializing call...</div>,
    ssr: false
  }
);

/**
 * Reels Player - Video playback with vertical swipe
 */
export const ReelsPlayer = dynamic(
  () => import('@/components/feed/ReelsPlayer'),
  {
    loading: () => <div className="flex items-center justify-center h-full">Loading reels...</div>,
    ssr: false
  }
);

/**
 * Stories Viewer - Story carousel with auto-advance
 */
export const StoriesViewer = dynamic(
  () => import('@/components/feed/StoriesViewer'),
  {
    loading: () => <div className="flex items-center justify-center h-full">Loading stories...</div>,
    ssr: false
  }
);

/**
 * AI Companion Chat - AI conversation interface
 */
export const AICompanionChat = dynamic(
  () => import('@/components/ai/CompanionChat'),
  {
    loading: () => <div className="flex items-center justify-center h-full">Loading AI companion...</div>,
    ssr: false
  }
);

/**
 * Event Details - Maps and ticket purchase
 */
export const EventDetails = dynamic(
  () => import('@/components/events/EventDetails'),
  {
    loading: () => <div className="flex items-center justify-center h-full">Loading event...</div>,
    ssr: true
  }
);

/**
 * Digital Store - Product grid and purchase flow
 */
export const DigitalStore = dynamic(
  () => import('@/components/store/StoreGrid'),
  {
    loading: () => <div className="flex items-center justify-center h-full">Loading store...</div>,
    ssr: true
  }
);

/**
 * Post Scheduler - Calendar view for content planning
 */
export const PostScheduler = dynamic(
  () => import('@/components/creator/PostScheduler'),
  {
    loading: () => <div className="flex items-center justify-center h-full">Loading scheduler...</div>,
    ssr: false
  }
);

/**
 * Analytics Charts - Data visualization
 */
export const AnalyticsCharts = dynamic(
  () => import('@/components/creator/AnalyticsCharts'),
  {
    loading: () => <div className="flex items-center justify-center h-full">Loading analytics...</div>,
    ssr: false
  }
);

/**
 * Media Upload - File upload with preview
 */
export const MediaUpload = dynamic(
  () => import('@/components/upload/MediaUpload'),
  {
    loading: () => <div className="flex items-center justify-center h-full">Loading uploader...</div>,
    ssr: false
  }
);

/**
 * Token Purchase Modal - Stripe payment flow
 */
export const TokenPurchaseModal = dynamic(
  () => import('@/components/wallet/TokenPurchaseModal'),
  {
    loading: () => <div className="flex items-center justify-center">Loading payment...</div>,
    ssr: false
  }
);

/**
 * Virtual Event Room - Multi-peer WebRTC interface
 */
export const VirtualEventRoom = dynamic(
  () => import('@/components/events/VirtualEventRoom'),
  {
    loading: () => <div className="flex items-center justify-center h-full">Joining event...</div>,
    ssr: false
  }
);

/**
 * Profile Editor - Profile customization
 */
export const ProfileEditor = dynamic(
  () => import('@/components/profile/ProfileEditor'),
  {
    loading: () => <div className="flex items-center justify-center h-full">Loading editor...</div>,
    ssr: false
  }
);

/**
 * Settings Panel - App configuration
 */
export const SettingsPanel = dynamic(
  () => import('@/components/settings/SettingsPanel'),
  {
    loading: () => <div className="flex items-center justify-center h-full">Loading settings...</div>,
    ssr: false
  }
);

// Export all for convenience
export default {
  ChatInterface,
  CreatorDashboard,
  CallInterface,
  ReelsPlayer,
  StoriesViewer,
  AICompanionChat,
  EventDetails,
  DigitalStore,
  PostScheduler,
  AnalyticsCharts,
  MediaUpload,
  TokenPurchaseModal,
  VirtualEventRoom,
  ProfileEditor,
  SettingsPanel
};

