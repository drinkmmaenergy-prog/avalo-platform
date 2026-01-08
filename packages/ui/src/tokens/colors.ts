/**
 * Avalo Design System - Color Tokens
 * Shared color palette for iOS, Android, and Web
 */

export const colors = {
  // Primary gradient: #FF6B00 → #FF3C8E → #7B2EFF (reference design)
  primary: {
    start: '#FF6B00',     // Vibrant orange
    middle: '#FF3C8E',    // Hot pink
    end: '#7B2EFF',       // Vivid purple
    gradient: ['#FF6B00', '#FF3C8E', '#7B2EFF'],
  },

  // Secondary gradient: lighter variant for accents
  secondary: {
    start: '#FFC14F',     // Light orange
    middle: '#FF5AA5',    // Soft pink
    end: '#8B4FFF',       // Light purple
    gradient: ['#FFC14F', '#FF5AA5', '#8B4FFF'],
  },

  // Background colors
  background: {
    light: '#FFFFFF',
    dark: '#0E0E10',
    lightSecondary: '#F5F5F7',
    darkSecondary: '#1C1C1E',
    lightTertiary: '#EFEFF4',
    darkTertiary: '#2C2C2E',
  },

  // Text colors
  text: {
    light: '#111111',
    dark: '#FFFFFF',
    lightSecondary: '#3C3C43',
    darkSecondary: '#EBEBF5',
    lightTertiary: '#8E8E93',
    darkTertiary: '#A1A1A6',
  },

  // Surface colors (cards, modals)
  surface: {
    light: '#FFFFFF',
    dark: '#1C1C1E',
    lightElevated: '#FFFFFF',
    darkElevated: '#2C2C2E',
  },

  // Glass effect colors (glassmorphism with backdrop blur)
  glass: {
    light: 'rgba(255, 255, 255, 0.15)',        // White tint with 0.15 opacity
    dark: 'rgba(28, 28, 30, 0.15)',
    lightBorder: 'rgba(255, 255, 255, 0.3)',   // Subtle white border
    darkBorder: 'rgba(255, 255, 255, 0.2)',
    shadow: 'rgba(0, 0, 0, 0.2)',              // Card shadow
  },

  // Semantic colors
  success: '#34C759',
  warning: '#FF9500',
  error: '#FF3B30',
  info: '#007AFF',

  // Border colors
  border: {
    light: '#E5E5EA',
    dark: '#38383A',
    lightStrong: '#C6C6C8',
    darkStrong: '#48484A',
  },

  // Overlay colors
  overlay: {
    light: 'rgba(0, 0, 0, 0.3)',
    dark: 'rgba(0, 0, 0, 0.5)',
  },
} as const;

export type ColorToken = typeof colors;

