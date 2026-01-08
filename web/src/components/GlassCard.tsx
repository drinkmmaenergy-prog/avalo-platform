'use client';

import React from 'react';

/**
 * Glass Card Component
 * Glassmorphism card with backdrop blur, white tint (0.15 opacity), and shadow
 * Reference: rgba(255,255,255,0.15) background with rgba(0,0,0,0.2) shadow
 */

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
}

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  className = '',
}) => {
  return (
    <div
      className={`
        backdrop-blur-md
        bg-white/15
        dark:bg-white/10
        border border-white/30
        rounded-xl
        p-6
        shadow-[0_4px_12px_rgba(0,0,0,0.2)]
        hover:shadow-[0_6px_16px_rgba(0,0,0,0.25)]
        transition-all
        duration-300
        ${className}
      `.trim().replace(/\s+/g, ' ')}
    >
      {children}
    </div>
  );
};