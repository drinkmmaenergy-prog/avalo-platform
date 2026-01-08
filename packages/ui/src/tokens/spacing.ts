/**
 * Avalo Design System - Spacing Tokens
 * Shared spacing scale for iOS, Android, and Web (in pixels)
 */

export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  9: 36,
  10: 40,
  12: 48,
  14: 56,
  16: 64,
  20: 80,
  24: 96,
  28: 112,
  32: 128,
  36: 144,
  40: 160,
  48: 192,
  56: 224,
  64: 256,
} as const;

// Border radius values
export const borderRadius = {
  none: 0,
  sm: 8,
  base: 12,
  md: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  full: 9999,
} as const;

export type SpacingToken = typeof spacing;
export type BorderRadiusToken = typeof borderRadius;

