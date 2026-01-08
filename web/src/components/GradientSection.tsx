'use client';

import React from 'react';

/**
 * Gradient Section Component
 * Animated gradient background section with 40s hue shift loop
 * Reference: linear-gradient(135deg, #FF6B00 0%, #FF3C8E 40%, #7B2EFF 100%)
 */

interface GradientSectionProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary';
  animate?: boolean;
  className?: string;
}

export const GradientSection: React.FC<GradientSectionProps> = ({
  children,
  variant = 'primary',
  animate = true,
  className = '',
}) => {
  const gradientClass = variant === 'primary' ? 'gradient-primary' : 'gradient-secondary';
  const animateClass = animate ? 'animate-gradient-shift' : '';

  return (
    <section 
      className={`
        relative
        ${gradientClass}
        ${animateClass}
        overflow-hidden
        ${className}
      `.trim().replace(/\s+/g, ' ')}
    >
      {/* Animated gradient overlay */}
      {animate && (
        <div className="absolute inset-0 bg-gradient-to-br from-transparent via-white/5 to-transparent animate-gradient-drift" />
      )}
      
      {/* Content */}
      <div className="relative z-10">
        {children}
      </div>
    </section>
  );
};