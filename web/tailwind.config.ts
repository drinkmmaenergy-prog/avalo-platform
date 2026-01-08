import type { Config } from 'tailwindcss';
import { colors } from '../packages/ui/src/tokens/colors';
import { typography } from '../packages/ui/src/tokens/typography';
import { spacing, borderRadius } from '../packages/ui/src/tokens/spacing';
import { shadows } from '../packages/ui/src/tokens/shadows';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          start: colors.primary.start,
          middle: colors.primary.middle,
          end: colors.primary.end,
          DEFAULT: colors.primary.middle,
        },
        secondary: {
          start: colors.secondary.start,
          middle: colors.secondary.middle,
          end: colors.secondary.end,
          DEFAULT: colors.secondary.middle,
        },
        background: {
          light: colors.background.light,
          dark: colors.background.dark,
          'light-secondary': colors.background.lightSecondary,
          'dark-secondary': colors.background.darkSecondary,
          'light-tertiary': colors.background.lightTertiary,
          'dark-tertiary': colors.background.darkTertiary,
        },
        text: {
          light: colors.text.light,
          dark: colors.text.dark,
          'light-secondary': colors.text.lightSecondary,
          'dark-secondary': colors.text.darkSecondary,
          'light-tertiary': colors.text.lightTertiary,
          'dark-tertiary': colors.text.darkTertiary,
        },
        success: colors.success,
        warning: colors.warning,
        error: colors.error,
        info: colors.info,
      },
      fontFamily: {
        sans: [typography.fontFamily.web],
        mono: [typography.fontFamily.mono],
      },
      fontSize: {
        xs: [`${typography.fontSize.xs}px`, { lineHeight: `${typography.fontSize.xs * 1.5}px` }],
        sm: [`${typography.fontSize.sm}px`, { lineHeight: `${typography.fontSize.sm * 1.5}px` }],
        base: [`${typography.fontSize.base}px`, { lineHeight: `${typography.fontSize.base * 1.5}px` }],
        lg: [`${typography.fontSize.lg}px`, { lineHeight: `${typography.fontSize.lg * 1.5}px` }],
        xl: [`${typography.fontSize.xl}px`, { lineHeight: `${typography.fontSize.xl * 1.5}px` }],
        '2xl': [`${typography.fontSize['2xl']}px`, { lineHeight: `${typography.fontSize['2xl'] * 1.2}px` }],
        '3xl': [`${typography.fontSize['3xl']}px`, { lineHeight: `${typography.fontSize['3xl'] * 1.2}px` }],
        '4xl': [`${typography.fontSize['4xl']}px`, { lineHeight: `${typography.fontSize['4xl'] * 1.2}px` }],
        '5xl': [`${typography.fontSize['5xl']}px`, { lineHeight: `${typography.fontSize['5xl'] * 1.2}px` }],
        '6xl': [`${typography.fontSize['6xl']}px`, { lineHeight: `${typography.fontSize['6xl'] * 1.2}px` }],
      },
      spacing: Object.fromEntries(
        Object.entries(spacing).map(([key, value]) => [key, `${value}px`])
      ),
      borderRadius: Object.fromEntries(
        Object.entries(borderRadius).map(([key, value]) => [key, `${value}px`])
      ),
      boxShadow: {
        ...shadows.web,
        'glow-primary-light': shadows.glow.primary.light,
        'glow-primary-dark': shadows.glow.primary.dark,
        'glow-secondary-light': shadows.glow.secondary.light,
        'glow-secondary-dark': shadows.glow.secondary.dark,
      },
      backgroundImage: {
        'gradient-primary': `linear-gradient(135deg, ${colors.primary.start}, ${colors.primary.middle}, ${colors.primary.end})`,
        'gradient-secondary': `linear-gradient(135deg, ${colors.secondary.start}, ${colors.secondary.middle}, ${colors.secondary.end})`,
      },
    },
  },
  plugins: [],
};

export default config;