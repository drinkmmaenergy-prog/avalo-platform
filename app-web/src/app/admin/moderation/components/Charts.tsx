'use client';

import { useMemo } from 'react';

/**
 * Lightweight chart components for Analytics Dashboard
 * Premium dark theme with turquoise and gold accents
 */

interface BarChartProps {
  data: { label: string; value: number; color?: string }[];
  title?: string;
}

export function BarChart({ data, title }: BarChartProps) {
  const maxValue = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="w-full h-full flex flex-col">
      {title && <h4 className="text-sm font-medium text-white/80 mb-4">{title}</h4>}
      <div className="flex-1 flex items-end gap-3 px-2">
        {data.map((item, idx) => (
          <div key={idx} className="flex-1 flex flex-col items-center gap-2">
            <div className="w-full flex flex-col items-center justify-end h-48">
              <div className="text-xs font-bold text-[#D4AF37] mb-1">{item.value}</div>
              <div
                className="w-full rounded-t-lg transition-all duration-500 hover:opacity-80"
                style={{
                  height: `${(item.value / maxValue) * 100}%`,
                  background: item.color || `linear-gradient(to top, #40E0D0, #2A9D8F)`,
                  minHeight: item.value > 0 ? '8px' : '0px',
                }}
              />
            </div>
            <div className="text-xs text-white/70 text-center font-medium max-w-full truncate px-1">
              {item.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface PieChartProps {
  data: { label: string; value: number; color: string }[];
  title?: string;
}

export function PieChart({ data, title }: PieChartProps) {
  const total = data.reduce((sum, item) => sum + item.value, 0);

  const segments = useMemo(() => {
    let currentAngle = -90; // Start from top
    return data.map((item) => {
      const percentage = total > 0 ? (item.value / total) * 100 : 0;
      const angle = (percentage / 100) * 360;
      const segment = {
        ...item,
        percentage,
        startAngle: currentAngle,
        endAngle: currentAngle + angle,
      };
      currentAngle += angle;
      return segment;
    });
  }, [data, total]);

  const createArc = (cx: number, cy: number, r: number, startAngle: number, endAngle: number) => {
    const start = polarToCartesian(cx, cy, r, endAngle);
    const end = polarToCartesian(cx, cy, r, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
    return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y} Z`;
  };

  const polarToCartesian = (cx: number, cy: number, radius: number, angleInDegrees: number) => {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
    return {
      x: cx + radius * Math.cos(angleInRadians),
      y: cy + radius * Math.sin(angleInRadians),
    };
  };

  return (
    <div className="w-full h-full flex flex-col">
      {title && <h4 className="text-sm font-medium text-white/80 mb-4">{title}</h4>}
      <div className="flex-1 flex items-center justify-center gap-8">
        <svg width="200" height="200" viewBox="0 0 200 200" className="drop-shadow-lg">
          {segments.map((segment, idx) => (
            <g key={idx}>
              <path
                d={createArc(100, 100, 80, segment.startAngle, segment.endAngle)}
                fill={segment.color}
                className="transition-opacity duration-200 hover:opacity-80 cursor-pointer"
              />
            </g>
          ))}
          <circle cx="100" cy="100" r="45" fill="#1A1A1A" />
          <text
            x="100"
            y="95"
            textAnchor="middle"
            fill="#D4AF37"
            className="text-xl font-bold"
          >
            {total}
          </text>
          <text
            x="100"
            y="110"
            textAnchor="middle"
            fill="#ffffff80"
            className="text-xs"
          >
            Total
          </text>
        </svg>
        <div className="flex flex-col gap-2">
          {segments.map((segment, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded-sm"
                style={{ backgroundColor: segment.color }}
              />
              <div className="text-sm text-white/80">
                {segment.label}: <span className="font-bold text-[#D4AF37]">{segment.value}</span>
                <span className="text-xs text-white/60 ml-1">
                  ({segment.percentage.toFixed(1)}%)
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface LineChartProps {
  data: { label: string; value: number }[];
  title?: string;
}

export function LineChart({ data, title }: LineChartProps) {
  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const width = 600;
  const height = 200;
  const padding = 40;

  const points = data.map((item, idx) => {
    const x = padding + (idx / (data.length - 1 || 1)) * (width - 2 * padding);
    const y = height - padding - (item.value / maxValue) * (height - 2 * padding);
    return { x, y, value: item.value };
  });

  const pathData = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  return (
    <div className="w-full h-full flex flex-col">
      {title && <h4 className="text-sm font-medium text-white/80 mb-4">{title}</h4>}
      <div className="flex-1 flex items-center justify-center">
        <svg width={width} height={height} className="drop-shadow-lg">
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => (
            <line
              key={idx}
              x1={padding}
              y1={height - padding - ratio * (height - 2 * padding)}
              x2={width - padding}
              y2={height - padding - ratio * (height - 2 * padding)}
              stroke="#ffffff20"
              strokeWidth="1"
            />
          ))}

          {/* Line path */}
          <path
            d={pathData}
            fill="none"
            stroke="#40E0D0"
            strokeWidth="3"
            className="transition-all duration-300"
          />

          {/* Gradient area */}
          <defs>
            <linearGradient id="areaGradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#40E0D0" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#40E0D0" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d={`${pathData} L ${width - padding} ${height - padding} L ${padding} ${height - padding} Z`}
            fill="url(#areaGradient)"
          />

          {/* Data points */}
          {points.map((point, idx) => (
            <g key={idx}>
              <circle
                cx={point.x}
                cy={point.y}
                r="5"
                fill="#D4AF37"
                className="transition-all duration-200 hover:r-7 cursor-pointer"
              />
              <text
                x={point.x}
                y={point.y - 12}
                textAnchor="middle"
                fill="#D4AF37"
                className="text-xs font-bold"
              >
                {point.value}
              </text>
            </g>
          ))}

          {/* X-axis labels */}
          {data.map((item, idx) => {
            const x = padding + (idx / (data.length - 1 || 1)) * (width - 2 * padding);
            return (
              <text
                key={idx}
                x={x}
                y={height - padding + 20}
                textAnchor="middle"
                fill="#ffffff80"
                className="text-xs"
              >
                {item.label}
              </text>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  color?: string;
}

export function StatCard({ title, value, subtitle, icon, color = '#D4AF37' }: StatCardProps) {
  return (
    <div className="bg-[#1A1A1A] rounded-xl p-6 border border-[#D4AF37]/20 hover:border-[#D4AF37]/40 transition-all duration-300">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-white/70">{title}</h3>
        {icon && <div style={{ color }}>{icon}</div>}
      </div>
      <div className="text-3xl font-bold" style={{ color }}>
        {value}
      </div>
      {subtitle && <div className="text-xs text-white/50 mt-1">{subtitle}</div>}
    </div>
  );
}

interface AlertCardProps {
  title: string;
  count: number;
  color: 'red' | 'amber' | 'yellow';
  icon?: React.ReactNode;
}

export function AlertCard({ title, count, color, icon }: AlertCardProps) {
  const colorMap = {
    red: { bg: '#FF0000', text: '#FF0000', border: '#FF0000' },
    amber: { bg: '#FFA500', text: '#FFA500', border: '#FFA500' },
    yellow: { bg: '#FFD700', text: '#FFD700', border: '#FFD700' },
  };

  const colors = colorMap[color];

  return (
    <div
      className="bg-[#1A1A1A] rounded-xl p-6 border-2 hover:shadow-lg transition-all duration-300 cursor-pointer"
      style={{ borderColor: `${colors.border}40` }}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-white/70">{title}</h3>
        {icon && <div style={{ color: colors.text }}>{icon}</div>}
      </div>
      <div className="flex items-center gap-2">
        <div className="text-4xl font-bold" style={{ color: colors.text }}>
          {count}
        </div>
        {count > 0 && (
          <div
            className="ml-auto px-3 py-1 rounded-full text-xs font-bold animate-pulse"
            style={{ backgroundColor: `${colors.bg}20`, color: colors.text }}
          >
            ALERT
          </div>
        )}
      </div>
    </div>
  );
}