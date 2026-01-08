interface BadgeProps {
  children: React.ReactNode;
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  size?: 'sm' | 'md' | 'lg';
}

const variantStyles = {
  success: 'bg-green-500/10 text-green-400 border-green-500/30',
  warning: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  danger: 'bg-red-500/10 text-red-400 border-red-500/30',
  info: 'bg-[#40E0D0]/10 text-[#40E0D0] border-[#40E0D0]/30',
  neutral: 'bg-gray-500/10 text-gray-400 border-gray-500/30',
};

const sizeStyles = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-3 py-1 text-sm',
  lg: 'px-4 py-1.5 text-base',
};

export function Badge({ children, variant = 'neutral', size = 'md' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold border ${variantStyles[variant]} ${sizeStyles[size]}`}
    >
      {children}
    </span>
  );
}