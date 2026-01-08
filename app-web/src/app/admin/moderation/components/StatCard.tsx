import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: {
    value: string;
    isPositive: boolean;
  };
  subtitle?: string;
}

export function StatCard({ title, value, icon: Icon, trend, subtitle }: StatCardProps) {
  return (
    <div className="bg-[#1A1A1A] rounded-xl border-2 border-[#D4AF37] p-6 hover:border-[#40E0D0] transition-all duration-300 hover:shadow-lg hover:shadow-[#D4AF37]/20">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-400 mb-2">{title}</p>
          <p className="text-3xl font-bold text-white mb-1">{value}</p>
          {subtitle && (
            <p className="text-xs text-gray-500">{subtitle}</p>
          )}
          {trend && (
            <div className="mt-2 flex items-center gap-1">
              <span
                className={`text-xs font-semibold ${
                  trend.isPositive ? 'text-green-400' : 'text-red-400'
                }`}
              >
                {trend.isPositive ? '↑' : '↓'} {trend.value}
              </span>
              <span className="text-xs text-gray-500">vs last period</span>
            </div>
          )}
        </div>
        <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-[#40E0D0] to-[#D4AF37] flex items-center justify-center">
          <Icon className="w-6 h-6 text-[#0F0F0F]" />
        </div>
      </div>
    </div>
  );
}